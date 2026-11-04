import type { IncidentEvent } from "@/lib/types";

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

const KIND_LABEL: Record<IncidentEvent["kind"], string> = {
  created: "Trigger",
  location: "Location",
  audio_chunk: "Audio evidence",
  safe_confirmed: "Safe confirmed",
  escalated: "Escalated",
  alert_dispatched: "Guardian alert",
  resolved: "Resolved",
  evidence_sealed: "Evidence sealed",
};

const KIND_COLOR: Record<IncidentEvent["kind"], string> = {
  created: "bg-white/70",
  location: "bg-sky-300",
  audio_chunk: "bg-violet-300",
  safe_confirmed: "bg-emerald-300",
  escalated: "bg-red-400",
  alert_dispatched: "bg-red-300",
  resolved: "bg-emerald-300",
  evidence_sealed: "bg-amber-300",
};

export function EventTimeline({
  events,
  max = 12,
  className = "",
}: {
  events: IncidentEvent[];
  max?: number;
  className?: string;
}) {
  const recent = events.slice(-max).reverse();
  return (
    <ol className={`space-y-2 text-sm ${className}`}>
      {recent.map((event) => (
        <li key={event.id} className="flex gap-2.5 items-start">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_COLOR[event.kind]}`}
            aria-hidden
          />
          <span className="text-white/90">
            <span className="font-medium">{KIND_LABEL[event.kind]}</span>
            {event.detail ? <span className="text-white/60"> — {event.detail}</span> : null}
            <span className="ml-2 text-white/40 tabular-nums">{time(event.ts)}</span>
          </span>
        </li>
      ))}
      {recent.length === 0 ? <li className="text-white/40">No events yet</li> : null}
    </ol>
  );
}
