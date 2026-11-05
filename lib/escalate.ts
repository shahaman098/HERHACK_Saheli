// Saheli — escalation state machine (server-side).
//
// The verify window is the anti-false-alarm core: a trigger alone is NOT an
// emergency. Only silence through the 30-second check-in escalates. The sweep
// runs on every store read so escalation timing does not depend on the
// arming device staying online.

import { createHash, randomUUID } from "node:crypto";
import type { Incident } from "./types";
import { allIncidents, getIncident, mutateIncident } from "./store";
import { dispatchAlerts } from "./alerts";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Hash raw bytes — the client hashes the ArrayBuffer before base64-encoding,
 * so byte-level verification must decode before hashing. */
export function sha256Bytes(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Advance every incident whose verify window elapsed without confirmation. */
export function sweepDeadlines(): void {
  const now = Date.now();
  for (const incident of allIncidents()) {
    if (incident.status === "verifying" && now >= incident.verifyDeadline) {
      escalate(incident.id);
    }
  }
}

/** Escalate a verifying incident: alert guardians, seal nothing yet. */
export function escalate(id: string): Incident | undefined {
  let escalated: Incident | undefined;
  mutateIncident(id, (incident) => {
    if (incident.status !== "verifying") return;
    incident.status = "escalated";
    incident.events.push({
      id: randomUUID(),
      ts: Date.now(),
      kind: "escalated",
      detail: "Check-in window elapsed with no confirmation — guardians alerted",
    });
    escalated = incident;
  });
  if (escalated) {
    // Alerts dispatch outside the mutation lock (they await network I/O).
    void dispatchAlerts(escalated);
  }
  return escalated;
}

/** Chain a verified audio chunk into the tamper-evident hash chain. */
export function appendAudioChunk(
  incident: Incident,
  chunk: { seq: number; ts: number; mime: string; data: string; hash: string },
): { ok: boolean; error?: string } {
  const expectedSeq = incident.audio.length;
  if (chunk.seq !== expectedSeq) {
    return { ok: false, error: `expected seq ${expectedSeq}, got ${chunk.seq}` };
  }
  // Server re-verifies the client hash over the RAW bytes — the client cannot
  // mint a false hash, and base64-transport differences cannot fake one either.
  const raw = Buffer.from(chunk.data, "base64");
  if (sha256Bytes(raw) !== chunk.hash) {
    return { ok: false, error: "chunk hash mismatch" };
  }
  const prevHash = incident.chainHead;
  incident.audio.push({ ...chunk, prevHash });
  incident.chainHead = sha256(`${prevHash}${chunk.hash}`);
  incident.events.push({
    id: randomUUID(),
    ts: chunk.ts,
    kind: "audio_chunk",
    detail: `Audio chunk #${chunk.seq} chained`,
    data: { hash: chunk.hash, prevHash },
  });
  return { ok: true };
}

/** Seal the evidence chain when the incident resolves. */
export function sealEvidence(incident: Incident, outcome: string): string {
  const finalHash = sha256(
    `${incident.chainHead}|${outcome}|${Date.now()}`,
  );
  incident.finalHash = finalHash;
  incident.events.push({
    id: randomUUID(),
    ts: Date.now(),
    kind: "evidence_sealed",
    detail: "Evidence chain sealed",
    data: { finalHash },
  });
  return finalHash;
}
