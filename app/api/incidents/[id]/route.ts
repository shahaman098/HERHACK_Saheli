import { NextResponse } from "next/server";
import { getIncident, mutateIncident } from "@/lib/store";
import { escalate, sealEvidence, sweepDeadlines } from "@/lib/escalate";
import { randomUUID } from "node:crypto";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  sweepDeadlines(); // server-authoritative escalation on every read
  const incident = getIncident(id);
  if (!incident) {
    return NextResponse.json({ error: "incident not found" }, { status: 404 });
  }
  return NextResponse.json({
    incident: { ...incident, audio: incident.audio.slice(-4) },
    now: Date.now(),
  });
}

/**
 * PATCH actions:
 *  - { action: "confirm_safe" }  — during verify window -> resolved_false_alarm;
 *                                  after escalation -> resolved_safe. Either way
 *                                  recording stops and the evidence chain seals.
 *  - { action: "escalate_now" }  — user skips the wait (they KNOW it is an
 *                                  emergency and cannot wait 30s).
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  sweepDeadlines(); // a late confirm_safe must resolve the ESCALATION, not swallow it
  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (body.action === "escalate_now") {
    const escalated = escalate(id);
    if (!escalated && !getIncident(id)) {
      return NextResponse.json({ error: "incident not found" }, { status: 404 });
    }
    return NextResponse.json({
      incident: { ...getIncident(id)!, audio: getIncident(id)!.audio.slice(-4) },
      now: Date.now(),
    });
  }

  if (body.action === "confirm_safe") {
    const incident = mutateIncident(id, (inc) => {
      if (inc.status !== "verifying" && inc.status !== "escalated") return;
      const wasEscalated = inc.status === "escalated";
      inc.status = wasEscalated ? "resolved_safe" : "resolved_false_alarm";
      inc.events.push({
        id: randomUUID(),
        ts: Date.now(),
        kind: "resolved",
        detail: wasEscalated
          ? "User confirmed safe after escalation"
          : "User confirmed safe inside the check-in window (false alarm absorbed)",
      });
      sealEvidence(inc, inc.status);
    });
    if (!incident) {
      return NextResponse.json({ error: "incident not found" }, { status: 404 });
    }
    return NextResponse.json({
      incident: { ...incident, audio: incident.audio.slice(-4) },
      now: Date.now(),
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
