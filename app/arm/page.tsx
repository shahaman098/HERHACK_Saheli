"use client";

// Saheli arming page — the user-side state machine:
//   idle → armed (wake-word listening) → verifying (30s check-in)
//        → escalated (guardians alerted, recording live) → resolved
//
// Design rule: two independent triggers (voice + visible button) and one
// server-authoritative state machine. The client renders state; the server
// owns it.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeech } from "@/lib/useSpeech";
import { useRecorder, type RecorderChunk } from "@/lib/useRecorder";
import { VERIFY_WINDOW_SECONDS, type Incident } from "@/lib/types";

type Phase = "idle" | "armed" | "verifying" | "escalated" | "resolved";

const POLL_ACTIVE_MS = 1500;
const LOCATION_PING_MS = 15000;

export default function ArmPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [incident, setIncident] = useState<Incident | null>(null);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [locationOn, setLocationOn] = useState(false);
  const [countdown, setCountdown] = useState(VERIFY_WINDOW_SECONDS);
  const [busy, setBusy] = useState(false);

  const incidentIdRef = useRef<string | null>(null);
  const deadlineRef = useRef<number>(0); // local-clock deadline
  const lastPingRef = useRef(0);
  const watchRef = useRef<number | null>(null);

  // ---------- server helpers ----------

  const postLocation = useCallback(async (id: string, position: GeolocationPosition) => {
    await fetch(`/api/incidents/${id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "location",
        data: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          ts: Date.now(),
        },
      }),
    }).catch(() => undefined);
  }, []);

  const onChunk = useCallback(async (chunk: RecorderChunk) => {
    const id = incidentIdRef.current;
    if (!id) return;
    const post = (seq: number) =>
      fetch(`/api/incidents/${id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "audio_chunk",
          data: { seq, ts: chunk.ts, mime: chunk.mime, data: chunk.base64, hash: chunk.hash },
        }),
      }).catch(() => undefined);
    let res = await post(chunk.seq);
    // If the server's chain expects a different sequence (e.g. a rejected chunk
    // shifted the head), resync once to the server's authoritative seq.
    if (res && res.status === 409) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const match = body?.error?.match(/expected seq (\d+)/);
      if (match) {
        await post(Number(match[1]));
      }
    }
  }, []);

  const recorder = useRecorder(onChunk);

  const pollIncident = useCallback(async () => {
    const id = incidentIdRef.current;
    if (!id) return;
    try {
      const res = await fetch(`/api/incidents/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { incident: Incident; now: number };
      setIncident(data.incident);
      if (data.incident.status === "escalated" && phase !== "escalated") {
        setPhase("escalated");
      }
      if (data.incident.status === "resolved_safe" || data.incident.status === "resolved_false_alarm") {
        recorder.stop();
        stopLocationWatch();
        setPhase("resolved");
      }
    } catch {
      /* transient network error — next tick retries */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, recorder]);

  // ---------- location ----------

  const startLocationWatch = useCallback(() => {
    if (!("geolocation" in navigator) || watchRef.current !== null) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocationOn(true);
        const id = incidentIdRef.current;
        const now = Date.now();
        if (id && now - lastPingRef.current >= LOCATION_PING_MS) {
          lastPingRef.current = now;
          void postLocation(id, position);
        }
      },
      () => setLocationOn(false),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }, [postLocation]);

  const stopLocationWatch = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }, []);

  // ---------- triggers ----------

  const trigger = useCallback(
    async (mode: "voice" | "button") => {
      if (incidentIdRef.current) return; // idempotent — voice can double-fire
      setBusy(true);
      try {
        const position = await new Promise<GeolocationPosition | null>((resolve) => {
          if (!("geolocation" in navigator)) return resolve(null);
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
            enableHighAccuracy: true,
            timeout: 4000,
          });
        });

        const res = await fetch("/api/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger: mode,
            verifySeconds: VERIFY_WINDOW_SECONDS,
            location: position
              ? {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                  ts: Date.now(),
                }
              : undefined,
          }),
        });
        const data = (await res.json()) as { incident: Incident; now: number };
        incidentIdRef.current = data.incident.id;
        // Align the countdown with the server clock.
        const offset = data.now - Date.now();
        deadlineRef.current = data.incident.verifyDeadline - offset;
        setIncident(data.incident);
        setCountdown(VERIFY_WINDOW_SECONDS);
        setPhase("verifying");

        await recorder.start();
        startLocationWatch();
        if (position) {
          lastPingRef.current = Date.now();
          void postLocation(data.incident.id, position);
        }
      } finally {
        setBusy(false);
      }
    },
    [postLocation, recorder, startLocationWatch],
  );

  // voice wake-word → trigger
  const speech = useSpeech({
    mode:
      phase === "armed" ? "wake" : phase === "verifying" ? "confirm" : "off",
    onWakePhrase: () => void trigger("voice"),
    onConfirmPhrase: () => void confirmSafe(),
    onMicError: (reason) => setMicNotice(reason),
  });

  const confirmSafe = useCallback(async () => {
    const id = incidentIdRef.current;
    if (!id || busy) return;
    setBusy(true);
    try {
      recorder.stop(); // stop capture first so no chunk races the seal
      const res = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_safe" }),
      });
      if (res.ok) {
        const data = (await res.json()) as { incident: Incident };
        setIncident(data.incident);
        recorder.stop();
        stopLocationWatch();
        setPhase("resolved");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, recorder, stopLocationWatch]);

  const escalateNow = useCallback(async () => {
    const id = incidentIdRef.current;
    if (!id || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "escalate_now" }),
      });
      if (res.ok) {
        const data = (await res.json()) as { incident: Incident };
        setIncident(data.incident);
        setPhase("escalated");
      }
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const arm = useCallback(() => {
    setMicNotice(null);
    setPhase("armed");
  }, []);

  const reset = useCallback(() => {
    incidentIdRef.current = null;
    setIncident(null);
    setPhase("idle");
    setLocationOn(false);
  }, []);

  // ---------- effects ----------

  // Adopt an in-flight incident after reload/close (server kept it alive).
  useEffect(() => {
    if (phase !== "idle") return;
    void (async () => {
      try {
        const res = await fetch("/api/incidents", { cache: "no-store" });
        const data = (await res.json()) as { incidents: Incident[]; now: number };
        const active = data.incidents.find(
          (i) => i.status === "verifying" || i.status === "escalated",
        );
        if (active) {
          incidentIdRef.current = active.id;
          const offset = data.now - Date.now();
          deadlineRef.current = active.verifyDeadline - offset;
          setIncident(active);
          setPhase(active.status === "verifying" ? "verifying" : "escalated");
          void recorder.start();
          startLocationWatch();
        }
      } catch {
        /* first load before server warm — fine */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown while verifying.
  useEffect(() => {
    if (phase !== "verifying") return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setCountdown(remaining);
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  // Poll while an incident is live.
  useEffect(() => {
    if (phase !== "verifying" && phase !== "escalated") return;
    const timer = setInterval(() => void pollIncident(), POLL_ACTIVE_MS);
    return () => clearInterval(timer);
  }, [phase, pollIncident]);

  // ---------- render ----------

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 pb-12 pt-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Saheli
        </Link>
        <span className="text-sm text-white/50">I need protection</span>
      </header>

      {micNotice ? (
        <div className="mb-6 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">
          Voice {micNotice}. The <strong>panic button below still protects you</strong> —
          every other layer works identically.
        </div>
      ) : null}

      {phase === "idle" ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 p-10">
            <ShieldIcon className="h-20 w-20 text-fuchsia-200" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Arm your guardian</h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">
              Saheli will listen for your wake-word <strong>“Hey Saheli”</strong>. If a
              trigger fires, you get a 30-second check-in — silence alerts your
              guardians with your location and live audio.
            </p>
          </div>
          <button
            onClick={arm}
            className="rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-10 py-4 text-lg font-semibold shadow-lg shadow-fuchsia-500/25 transition hover:brightness-110"
          >
            Arm Saheli
          </button>
        </section>
      ) : null}

      {phase === "armed" ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-10 text-center">
          <div className="flex items-center gap-3 text-emerald-200">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            </span>
            <span className="text-sm font-medium">Listening for “Hey Saheli”</span>
          </div>

          <button
            onClick={() => void trigger("button")}
            disabled={busy}
            className="flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-full bg-gradient-to-b from-red-500 to-rose-600 text-lg font-bold shadow-2xl shadow-red-500/30 transition active:scale-95 disabled:opacity-60"
          >
            <SirenIcon className="h-9 w-9" />
            PANIC
          </button>
          <p className="text-xs text-white/40">
            Demo control: trigger the same flow without speaking.
          </p>
          <p className="text-xs text-white/40">
            {locationOn ? "Location: live" : "Location: unavailable (trigger still works)"}
          </p>
        </section>
      ) : null}

      {phase === "verifying" ? (
        <section className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-[#140b26]/95 px-6 text-center backdrop-blur">
          <CountdownRing remaining={countdown} total={VERIFY_WINDOW_SECONDS} />
          <h1 className="text-3xl font-semibold">Are you safe?</h1>
          <p className="max-w-xs text-sm text-white/60">
            Confirm within {countdown}s — or guardians are alerted with your location.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => void confirmSafe()}
              disabled={busy}
              className="rounded-2xl bg-emerald-500 px-8 py-4 text-lg font-semibold text-emerald-950 shadow-lg transition hover:brightness-110 disabled:opacity-60"
            >
              I’m safe
            </button>
            <button
              onClick={() => void escalateNow()}
              disabled={busy}
              className="rounded-2xl bg-gradient-to-b from-red-500 to-rose-600 px-8 py-4 text-lg font-semibold shadow-lg transition hover:brightness-110 disabled:opacity-60"
            >
              Escalate now
            </button>
          </div>
          <p className="text-xs text-white/40">
            …or just say <strong>“I’m safe”</strong>. Audio is being recorded as
            evidence either way.
          </p>
        </section>
      ) : null}

      {phase === "escalated" ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div className="rounded-full border border-red-400/40 bg-red-500/15 p-8">
            <SirenIcon className="h-14 w-14 text-red-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-red-200">Guardians alerted</h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">
              Your guardians received your location and can hear live audio.
              Recording and location sharing continue until you confirm you’re safe.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/70">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />
            </span>
            Recording live · {recorder.recording ? "streaming" : "reconnecting…"}
            {locationOn ? " · location live" : ""}
          </div>
          <button
            onClick={() => void confirmSafe()}
            disabled={busy}
            className="rounded-2xl bg-emerald-500 px-8 py-4 text-lg font-semibold text-emerald-950 shadow-lg transition hover:brightness-110 disabled:opacity-60"
          >
            I’m safe now — stop alerts
          </button>
          <Link href="/guardian" className="text-sm text-fuchsia-200 underline underline-offset-4">
            Open the guardian view (demo)
          </Link>
        </section>
      ) : null}

      {phase === "resolved" && incident ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 p-8">
            <CheckIcon className="h-14 w-14 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">
              {incident.status === "resolved_false_alarm"
                ? "False alarm — absorbed quietly"
                : "You’re marked safe"}
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">
              {incident.status === "resolved_false_alarm"
                ? "No guardians were disturbed. The check-in window did exactly its job — and the incident was still documented, quietly."
                : "Guardians have been notified that you are safe. The evidence trail was sealed before standing down."}
            </p>
          </div>
          <div className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
            <p className="text-xs uppercase tracking-wider text-white/40">Evidence</p>
            <p className="mt-1 break-all font-mono text-xs text-amber-200">
              {incident.finalHash ?? incident.chainHead}
            </p>
            <Link
              href={`/evidence/${incident.id}`}
              className="mt-3 inline-block text-sm text-fuchsia-200 underline underline-offset-4"
            >
              Open the tamper-evident evidence pack →
            </Link>
          </div>
          <button
            onClick={reset}
            className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold transition hover:bg-white/10"
          >
            Arm again
          </button>
        </section>
      ) : null}
    </main>
  );
}

function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const progress = remaining / total;
  const color = remaining <= 10 ? "#f87171" : remaining <= 20 ? "#fbbf24" : "#34d399";
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-250 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-4xl font-semibold tabular-nums">
        {remaining}
      </div>
    </div>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 12l2 2 3.5-4" />
    </svg>
  );
}

function SirenIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a6 6 0 00-6 6v4h12v-4a6 6 0 00-6-6z" />
      <path strokeLinecap="round" d="M4 20h16M9 10h.01M15 10h.01M12 2v1.5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.5 2.5 4.5-5.5" />
    </svg>
  );
}
