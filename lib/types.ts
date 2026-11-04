// Saheli — shared domain types.

export type IncidentStatus =
  | "verifying" // trigger fired, 30s check-in window running
  | "escalated" // no confirmation -> guardians alerted, recording live
  | "resolved_safe" // user confirmed safe after escalation
  | "resolved_false_alarm"; // user confirmed safe during verify window

export type TriggerMode = "voice" | "button";

export type EventKind =
  | "created"
  | "location"
  | "safe_confirmed"
  | "escalated"
  | "alert_dispatched"
  | "audio_chunk"
  | "resolved"
  | "evidence_sealed";

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  ts: number;
}

export interface IncidentEvent {
  id: string;
  ts: number;
  kind: EventKind;
  detail?: string;
  data?: Record<string, unknown>;
}

export interface AudioChunk {
  seq: number;
  ts: number;
  mime: string;
  /** base64 payload (demo scale). Production path: object storage (Supabase Storage / S3). */
  data: string;
  /** sha256 of the base64 payload, computed client-side and re-verified server-side. */
  hash: string;
  prevHash: string; // "SAHELI_GENESIS" for the first chunk
}

export interface AlertRecord {
  channel: "sms" | "voice";
  to: string;
  provider: "twilio" | "simulated";
  sid?: string;
  ts: number;
  error?: string;
}

export interface Incident {
  id: string;
  createdAt: number;
  status: IncidentStatus;
  verifyDeadline: number;
  trigger: TriggerMode;
  lastLocation?: GeoPoint;
  events: IncidentEvent[];
  audio: AudioChunk[];
  /** chained hash head = sha256(prevHead + chunk.hash); "SAHELI_GENESIS" before first chunk */
  chainHead: string;
  /** sealed when the incident resolves */
  finalHash?: string;
  alerts: AlertRecord[];
}

/** Shape returned by the evidence endpoint: the full tamper-evident manifest. */
export interface EvidenceManifest {
  incidentId: string;
  createdAt: number;
  resolvedAt?: number;
  outcome: IncidentStatus;
  trigger: TriggerMode;
  chainValid: boolean;
  chainHead: string;
  finalHash?: string;
  chunks: Array<Pick<AudioChunk, "seq" | "ts" | "hash" | "prevHash" | "mime">>;
  timeline: IncidentEvent[];
  alerts: AlertRecord[];
  locations: GeoPoint[];
}

export const VERIFY_WINDOW_SECONDS = 30;
export const AUDIO_CHUNK_SECONDS = 5;
