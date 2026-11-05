import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getIncident } from "@/lib/store";
import type { EvidenceManifest } from "@/lib/types";
import { sweepDeadlines } from "@/lib/escalate";

type Params = { params: Promise<{ id: string }> };

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function sha256Base64Payload(base64: string): string {
  return createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");
}

/**
 * GET the tamper-evident evidence manifest for an incident.
 *
 * Verification is strict and re-derived from genesis on every read:
 *   1. each chunk's stored hash must equal sha256(base64 payload)
 *   2. chunk seq must be dense 0..n-1 in order
 *   3. each chunk's prevHash must equal the head derived so far
 *   4. the final head must equal the incident's stored chainHead
 * Any mismatch marks chainValid=false — which is itself the tamper signal.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  sweepDeadlines();
  const incident = getIncident(id);
  if (!incident) {
    return NextResponse.json({ error: "incident not found" }, { status: 404 });
  }

  let valid = true;
  let head = "SAHELI_GENESIS";
  incident.audio.forEach((chunk, index) => {
    if (chunk.seq !== index) valid = false;
    if (chunk.prevHash !== head) valid = false;
    if (sha256Base64Payload(chunk.data) !== chunk.hash) valid = false;
    head = sha256(`${head}${chunk.hash}`);
  });
  if (incident.chainHead !== head) valid = false;

  const resolvedEvent = incident.events.find((e) => e.kind === "resolved");

  const manifest: EvidenceManifest = {
    incidentId: incident.id,
    createdAt: incident.createdAt,
    resolvedAt: resolvedEvent?.ts,
    outcome: incident.status,
    trigger: incident.trigger,
    chainValid: valid,
    chainHead: incident.chainHead,
    finalHash: incident.finalHash,
    chunks: incident.audio.map((c) => ({
      seq: c.seq,
      ts: c.ts,
      hash: c.hash,
      prevHash: c.prevHash,
      mime: c.mime,
    })),
    timeline: incident.events,
    alerts: incident.alerts,
    locations: incident.events
      .filter((e) => e.kind === "location")
      .map((e) => e.data as unknown as EvidenceManifest["locations"][number]),
  };

  return NextResponse.json({
    manifest,
    // Full payloads (demo scale) so the evidence page can replay the recording.
    audio: incident.audio,
  });
}
