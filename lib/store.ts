// Saheli — server-side incident store.
//
// v1 (this hackathon build): a single-process in-memory store. In `next dev`
// and `next start` one Node process serves every client, so user + guardian
// devices share state over the polling API. This is an honest, deliberate
// demo-scale choice — the production path (Supabase Postgres + Realtime +
// Storage) is documented in README.md and stubbed behind the same interface.

import { randomUUID } from "node:crypto";
import type { Incident } from "./types";

interface StoreShape {
  incidents: Map<string, Incident>;
}

// Persist across Next.js dev-server hot reloads by hanging off globalThis.
const globalStore = globalThis as unknown as { __saheliStore?: StoreShape };

function store(): StoreShape {
  if (!globalStore.__saheliStore) {
    globalStore.__saheliStore = { incidents: new Map() };
  }
  return globalStore.__saheliStore;
}

export function createIncident(input: {
  trigger: Incident["trigger"];
  verifyDeadline: number;
  location?: Incident["lastLocation"];
}): Incident {
  const incident: Incident = {
    id: randomUUID(),
    createdAt: Date.now(),
    status: "verifying",
    verifyDeadline: input.verifyDeadline,
    trigger: input.trigger,
    lastLocation: input.location,
    events: [
      {
        id: randomUUID(),
        ts: Date.now(),
        kind: "created",
        detail: `Trigger via ${input.trigger}`,
        data: { location: input.location ?? null },
      },
      // The trigger-time position is evidence like any later ping, so it
      // belongs in the location trail too.
      ...(input.location
        ? [
            {
              id: randomUUID(),
              ts: input.location.ts,
              kind: "location" as const,
              detail: `Location at trigger (${input.location.lat.toFixed(5)}, ${input.location.lng.toFixed(5)})`,
              data: { ...input.location },
            },
          ]
        : []),
    ],
    audio: [],
    chainHead: "SAHELI_GENESIS",
    alerts: [],
  };
  store().incidents.set(incident.id, incident);
  return incident;
}

export function getIncident(id: string): Incident | undefined {
  return store().incidents.get(id);
}

/** Raw read with NO deadline sweep — for internal sweeps to avoid recursion. */
export function allIncidents(): Incident[] {
  return Array.from(store().incidents.values());
}

export function listIncidents(): Incident[] {
  // NOTE: deadline escalation runs in the API layer (see escalate.sweepDeadlines)
  // so the store stays a pure data layer with no service imports.
  return allIncidents().sort((a, b) => b.createdAt - a.createdAt);
}

export function mutateIncident(
  id: string,
  fn: (incident: Incident) => void,
): Incident | undefined {
  const incident = store().incidents.get(id);
  if (!incident) return undefined;
  fn(incident);
  return incident;
}
