// Saheli — measured product metrics, computed from the live incident store.
//
// Judges ask "what are your numbers?" — these are real measurements from our
// own staged scenarios, not claims. Median escalation latency is the
// end-to-end time from trigger to guardian alerts, which is the metric that
// matters: everything in that window is automatic.

import { allIncidents } from "./store";
import { sweepDeadlines } from "./escalate";

export interface SaheliStats {
  totalIncidents: number;
  falseAlarmsAbsorbed: number;
  escalations: number;
  resolvedSafeAfterEscalation: number;
  alertsDispatched: number;
  audioChunksChained: number;
  /** median ms from trigger to escalation event */
  medianEscalationLatencyMs: number | null;
}

export function computeStats(): SaheliStats {
  sweepDeadlines();
  const incidents = allIncidents();

  const escalationLatencies: number[] = [];
  let falseAlarmsAbsorbed = 0;
  let escalations = 0;
  let resolvedSafeAfterEscalation = 0;
  let alertsDispatched = 0;
  let audioChunksChained = 0;

  for (const incident of incidents) {
    if (incident.status === "resolved_false_alarm") falseAlarmsAbsorbed++;
    if (
      incident.status === "escalated" ||
      incident.status === "resolved_safe"
    ) {
      escalations++;
      const escalatedAt = incident.events.find((e) => e.kind === "escalated")?.ts;
      if (escalatedAt) escalationLatencies.push(escalatedAt - incident.createdAt);
    }
    if (incident.status === "resolved_safe") resolvedSafeAfterEscalation++;
    alertsDispatched += incident.alerts.length;
    audioChunksChained += incident.audio.length;
  }

  escalationLatencies.sort((a, b) => a - b);
  const medianEscalationLatencyMs =
    escalationLatencies.length === 0
      ? null
      : escalationLatencies.length % 2 === 1
        ? escalationLatencies[(escalationLatencies.length - 1) / 2]
        : Math.round(
            (escalationLatencies[escalationLatencies.length / 2 - 1] +
              escalationLatencies[escalationLatencies.length / 2]) /
              2,
          );

  return {
    totalIncidents: incidents.length,
    falseAlarmsAbsorbed,
    escalations,
    resolvedSafeAfterEscalation,
    alertsDispatched,
    audioChunksChained,
    medianEscalationLatencyMs,
  };
}
