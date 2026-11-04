import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mutateIncident } from "@/lib/store";
import { appendAudioChunk } from "@/lib/escalate";
import type { GeoPoint } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * POST events onto an incident:
 *  - { kind: "location", data: { lat, lng, accuracy?, ts? } }
 *  - { kind: "audio_chunk", data: { seq, ts, mime, data(base64), hash } }
 *    Chunks join a tamper-evident hash chain; a bad hash or out-of-order seq
 *    is rejected with 409 (that rejection is itself evidence of tampering).
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  let body: { kind?: string; data?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (body.kind === "location") {
    const existing = mutateIncident(id, () => {});
    if (!existing) {
      return NextResponse.json({ error: "incident not found" }, { status: 404 });
    }
    if (existing.status === "resolved_safe" || existing.status === "resolved_false_alarm") {
      // Sealed incident: no more tracking — privacy by default after resolution.
      return NextResponse.json({ error: "incident sealed" }, { status: 409 });
    }
    const d = body.data ?? {};
    const lat = Number(d.lat);
    const lng = Number(d.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
    }
    const point: GeoPoint = {
      lat,
      lng,
      accuracy: Number.isFinite(Number(d.accuracy)) ? Number(d.accuracy) : undefined,
      ts: Number(d.ts) || Date.now(),
    };
    const incident = mutateIncident(id, (inc) => {
      inc.lastLocation = point;
      inc.events.push({
        id: randomUUID(),
        ts: point.ts,
        kind: "location",
        detail: `Location update (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`,
        data: { ...point },
      });
    });
    if (!incident) {
      return NextResponse.json({ error: "incident not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "audio_chunk") {
    const existing = mutateIncident(id, () => {});
    if (!existing) {
      return NextResponse.json({ error: "incident not found" }, { status: 404 });
    }
    if (existing.status === "resolved_safe" || existing.status === "resolved_false_alarm") {
      // Evidence chain is sealed once resolved; a late final MediaRecorder chunk
      // racing the confirm_safe PATCH is expected to land here. That tail is
      // intentionally excluded from evidence.
      return NextResponse.json({ error: "incident sealed" }, { status: 409 });
    }
    const d = body.data ?? {};
    const chunk = {
      seq: Number(d.seq),
      ts: Number(d.ts) || Date.now(),
      mime: typeof d.mime === "string" ? d.mime : "audio/webm",
      data: typeof d.data === "string" ? d.data : "",
      hash: typeof d.hash === "string" ? d.hash : "",
    };
    if (!Number.isInteger(chunk.seq) || !chunk.data || !chunk.hash) {
      return NextResponse.json({ error: "invalid audio chunk" }, { status: 400 });
    }
    let result: { ok: boolean; error?: string } = { ok: false, error: "not found" };
    const incident = mutateIncident(id, (inc) => {
      result = appendAudioChunk(inc, chunk);
    });
    if (!incident) {
      return NextResponse.json({ error: "incident not found" }, { status: 404 });
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ ok: true, chainHead: incident.chainHead });
  }

  return NextResponse.json({ error: "unknown event kind" }, { status: 400 });
}
