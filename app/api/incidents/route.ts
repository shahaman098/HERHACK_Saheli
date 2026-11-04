import { NextResponse } from "next/server";
import { createIncident, listIncidents } from "@/lib/store";
import { sweepDeadlines } from "@/lib/escalate";
import { serializeIncident } from "@/lib/serialize";
import type { GeoPoint, TriggerMode } from "@/lib/types";
import { VERIFY_WINDOW_SECONDS } from "@/lib/types";

export async function POST(request: Request) {
  let body: { trigger?: TriggerMode; location?: GeoPoint; verifySeconds?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const trigger: TriggerMode = body.trigger === "voice" ? "voice" : "button";
  // verifySeconds is clamped — it exists so we can demo the full escalation
  // in seconds during testing; production always uses the 30s default.
  const verifySeconds = Math.min(Math.max(body.verifySeconds ?? VERIFY_WINDOW_SECONDS, 3), 120);
  const location = body.location;

  const incident = createIncident({
    trigger,
    verifyDeadline: Date.now() + verifySeconds * 1000,
    location,
  });

  return NextResponse.json(
    { incident: serializeIncident(incident) },
    { status: 201 },
  );
}

export async function GET() {
  // Sweep first so guardians observe escalations within one poll cycle even
  // if the arming device went offline mid-incident.
  sweepDeadlines();
  return NextResponse.json({
    incidents: listIncidents().map((i) => serializeIncident(i)),
    now: Date.now(),
  });
}
