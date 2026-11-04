"use client";

// Guardian dashboard — the responder side. Polls every 2s (WebSockets via
// Supabase Realtime is the production path, documented in README).

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EventTimeline } from "@/components/EventTimeline";
import type { Incident } from "@/lib/types";

const POLL_MS = 2000;

/** Short urgency tone via WebAudio — no audio assets needed. */
function playAlertTone(times = 3): void {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      const start = ctx.currentTime + i * 0.45;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    }
    setTimeout(() => void ctx.close(), times * 450 + 500);
  } catch {
    /* audio unavailable — visual alarm still works */
  }
}

export default function GuardianPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const [connected, setConnected] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const lastEscalatedIdRef = useRef<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/incidents", { cache: "no-store" });
      const data = (await res.json()) as { incidents: Incident[]; now: number };
      setIncidents(data.incidents);
      setNow(data.now);
      setConnected(true);

      // Audible alarm on a NEW escalation (never re-alarm the same incident).
      const escalated = data.incidents.find((i) => i.status === "escalated");
      if (
        escalated &&
        escalated.id !== lastEscalatedIdRef.current &&
        soundOnRef.current
      ) {
        playAlertTone();
      }
      lastEscalatedIdRef.current = escalated?.id ?? null;
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  const active = incidents.filter(
    (i) => i.status === "verifying" || i.status === "escalated",
  );
  const past = incidents.filter(
    (i) => i.status === "resolved_safe" || i.status === "resolved_false_alarm",
  );

  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Saheli
        </Link>
        <span className="flex items-center gap-3 text-sm text-white/50">
          <button
            onClick={() => {
              setSoundOn((s) => !s);
              if (!soundOn) playAlertTone(1); // user gesture unlocks WebAudio
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              soundOn
                ? "bg-emerald-400/15 text-emerald-200"
                : "bg-white/10 text-white/60 hover:bg-white/15"
            }`}
          >
            {soundOn ? "🔔 Alarm sound ON" : "🔕 Alarm sound OFF"}
          </button>
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
            />
            {connected ? "Live" : "Reconnecting…"} · I protect someone
          </span>
        </span>
      </header>

      <h1 className="text-2xl font-semibold">Guardian dashboard</h1>
      <p className="mt-1 text-sm text-white/50">
        Alerts you can trust: a trigger only appears here as an emergency after the
        30-second check-in passes in silence — or when the person escalates immediately.
      </p>

      {active.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/50">
          No active incidents. All quiet.
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {active.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} now={now} />
          ))}
        </div>
      )}

      {past.length > 0 ? (
        <>
          <h2 className="mt-12 text-sm font-semibold uppercase tracking-wider text-white/50">
            Resolved
          </h2>
          <div className="mt-4 space-y-3">
            {past.slice(0, 5).map((incident) => (
              <div
                key={incident.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4"
              >
                <div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      incident.status === "resolved_safe"
                        ? "bg-emerald-400/15 text-emerald-200"
                        : "bg-white/10 text-white/70"
                    }`}
                  >
                    {incident.status === "resolved_safe" ? "SAFE — confirmed after escalation" : "FALSE ALARM — absorbed at check-in"}
                  </span>
                  <span className="ml-3 text-xs text-white/40">
                    {new Date(incident.createdAt).toLocaleString()}
                  </span>
                </div>
                <Link
                  href={`/evidence/${incident.id}`}
                  className="text-sm text-fuchsia-200 underline underline-offset-4"
                >
                  Evidence pack
                </Link>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

function IncidentCard({ incident, now }: { incident: Incident; now: number }) {
  const escalated = incident.status === "escalated";
  const remaining = Math.max(0, Math.ceil((incident.verifyDeadline - now) / 1000));
  const latestChunk = incident.audio[incident.audio.length - 1];

  return (
    <article
      className={`overflow-hidden rounded-2xl border ${
        escalated
          ? "border-red-400/40 bg-red-500/[0.08]"
          : "border-amber-300/30 bg-amber-300/[0.06]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          {escalated ? (
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-400" />
            </span>
          ) : null}
          <h2
            className={`text-lg font-semibold ${escalated ? "text-red-200" : "text-amber-200"}`}
          >
            {escalated ? "EMERGENCY — person needs help" : `Check-in running (${remaining}s)`}
          </h2>
        </div>
        <span className="text-xs text-white/40">
          triggered by {incident.trigger} · {new Date(incident.createdAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="grid gap-6 px-6 py-5 md:grid-cols-2">
        {/* Left column: location + alerts */}
        <div className="space-y-4">
          {incident.lastLocation ? (
            <>
              <iframe
                title="Live location map"
                className="h-52 w-full rounded-xl border border-white/10"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                  incident.lastLocation.lng - 0.004
                },${incident.lastLocation.lat - 0.0025},${
                  incident.lastLocation.lng + 0.004
                },${incident.lastLocation.lat + 0.0025}&layer=mapnik&marker=${
                  incident.lastLocation.lat
                },${incident.lastLocation.lng}`}
              />
              <p className="text-xs text-white/40">
                {incident.lastLocation.lat.toFixed(5)}, {incident.lastLocation.lng.toFixed(5)}
                {incident.lastLocation.accuracy
                  ? ` · ±${Math.round(incident.lastLocation.accuracy)}m`
                  : ""}
              </p>
              <a
                className="inline-block rounded-lg bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15"
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps?q=${incident.lastLocation.lat},${incident.lastLocation.lng}`}
              >
                🧭 Turn-by-turn to their location
              </a>
            </>
          ) : (
            <p className="text-sm text-white/50">Location not shared yet.</p>
          )}

          {incident.alerts.length > 0 ? (
            <div className="space-y-2">
              {incident.alerts.map((alert, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-xs"
                >
                  <span>
                    {alert.channel === "sms" ? "SMS" : "Voice call"} → {alert.to}
                    {alert.error ? ` — FAILED: ${alert.error}` : ""}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-semibold ${
                      alert.provider === "twilio"
                        ? "bg-emerald-400/20 text-emerald-200"
                        : "bg-amber-400/20 text-amber-200"
                    }`}
                  >
                    {alert.provider === "twilio" ? "SENT" : "SIMULATED"}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Right column: live audio + timeline */}
        <div className="space-y-4">
          <div className="rounded-xl bg-black/25 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
              {escalated ? "Live audio (5s delay)" : "Audio capturing"}
            </p>
            {latestChunk ? (
              <audio
                key={latestChunk.hash}
                controls
                className="w-full"
                src={`data:${latestChunk.mime};base64,${latestChunk.data}`}
              />
            ) : (
              <p className="text-sm text-white/40">Waiting for first audio chunk…</p>
            )}
            <p className="mt-2 text-xs text-white/40">
              {incident.audio.length} chunk{incident.audio.length === 1 ? "" : "s"} received ·
              each verified & hash-chained server-side
            </p>
          </div>
          <div className="rounded-xl bg-black/20 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
              Timeline
            </p>
            <EventTimeline events={incident.events} max={8} />
          </div>
        </div>
      </div>
    </article>
  );
}
