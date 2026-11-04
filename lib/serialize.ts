import type { Incident } from "./types";

/** Client-facing shape: base64 audio is trimmed to the most recent chunks. */
export function serializeIncident(incident: Incident, audioTail = 4): Incident {
  return { ...incident, audio: incident.audio.slice(-audioTail) };
}
