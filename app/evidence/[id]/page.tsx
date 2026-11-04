"use client";

// Tamper-evident evidence pack. The server re-verifies the whole chain on
// every read (strict re-derivation from genesis) — this page renders the
// verdict, never re-implements it.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EventTimeline } from "@/components/EventTimeline";
import type { AudioChunk, EvidenceManifest } from "@/lib/types";

interface EvidenceResponse {
  manifest: EvidenceManifest;
  audio: AudioChunk[];
}

export default function EvidencePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<EvidenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [playIndex, setPlayIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/incidents/${id}/evidence`, { cache: "no-store" });
        if (!res.ok) {
          setError(res.status === 404 ? "Incident not found" : "Failed to load evidence");
          return;
        }
        setData((await res.json()) as EvidenceResponse);
      } catch {
        setError("Failed to load evidence");
      }
    })();
  }, [id]);

  // Sequential playback: chunk N 'ended' -> chunk N+1 (simulates the full recording).
  const playFrom = useCallback(
    (index: number) => {
      const audio = audioRef.current;
      const chunk = data?.audio[index];
      if (!audio || !chunk) return;
      setPlayIndex(index);
      audio.src = `data:${chunk.mime};base64,${chunk.data}`;
      void audio.play();
    },
    [data],
  );

  const download = useCallback(() => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `saheli-evidence-${id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, id]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <p className="text-white/60">{error}</p>
        <Link href="/" className="mt-4 inline-block text-fuchsia-200 underline underline-offset-4">
          ← Home
        </Link>
      </main>
    );
  }

  if (!data) {
    return <main className="mx-auto max-w-xl px-6 py-16 text-white/50">Loading evidence…</main>;
  }

  const { manifest } = data;
  const outcomeLabel =
    manifest.outcome === "resolved_safe"
      ? "Confirmed safe after escalation"
      : manifest.outcome === "resolved_false_alarm"
        ? "False alarm — absorbed at check-in"
        : manifest.outcome === "escalated"
          ? "Ongoing — escalated"
          : "Ongoing — check-in running";

  return (
    <main className="mx-auto max-w-3xl px-6 pb-20 pt-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Saheli
        </Link>
        <span className="text-sm text-white/50">Evidence pack</span>
      </header>

      <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Incident {manifest.incidentId.slice(0, 8)}</h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              manifest.chainValid
                ? "bg-emerald-400/15 text-emerald-200"
                : "bg-red-400/20 text-red-200"
            }`}
          >
            {manifest.chainValid ? "✓ Chain verified intact" : "✗ CHAIN BROKEN — evidence tampered"}
          </span>
        </div>
        <p className="mt-2 text-sm text-white/60">
          {outcomeLabel} · triggered by {manifest.trigger} ·{" "}
          {new Date(manifest.createdAt).toLocaleString()}
        </p>
        {manifest.finalHash ? (
          <div className="mt-4 rounded-xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wider text-white/40">Sealed evidence hash</p>
            <p className="mt-1 break-all font-mono text-sm text-amber-200">{manifest.finalHash}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(manifest.finalHash ?? "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15"
              >
                {copied ? "Copied ✓" : "Copy hash"}
              </button>
              <button
                onClick={download}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15"
              >
                Download evidence JSON
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/40">
              This hash commits to every audio chunk, location ping and event in order.
              Re-deriving the chain from these chunks reproduces it exactly — any edit to
              any chunk breaks verification. Production roadmap: anchor this hash on a
              public blockchain (Base) for timestamping independent of this server.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-white/50">
            Incident still open — the hash seals when it resolves.
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
            Event timeline
          </h2>
          <EventTimeline events={manifest.timeline} max={40} />
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
              Audio evidence ({manifest.chunks.length} chunks)
            </h2>
            <audio ref={audioRef} onEnded={() => {
              if (playIndex !== null && playIndex + 1 < data.audio.length) {
                playFrom(playIndex + 1);
              } else {
                setPlayIndex(null);
              }
            }} className="hidden" />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => playFrom(0)}
                className="rounded-lg bg-fuchsia-500/80 px-3 py-1.5 text-xs font-semibold hover:bg-fuchsia-500"
              >
                ▶ Play full recording
              </button>
              {manifest.chunks.map((chunk, index) => (
                <button
                  key={chunk.seq}
                  onClick={() => playFrom(index)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs ${
                    playIndex === index ? "bg-fuchsia-500/60" : "bg-white/10 hover:bg-white/15"
                  }`}
                  title={chunk.hash}
                >
                  #{chunk.seq}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-1.5 font-mono text-[11px] leading-relaxed text-white/50">
              {manifest.chunks.slice(0, 4).map((chunk) => (
                <p key={chunk.seq} className="truncate">
                  #{chunk.seq} {chunk.hash.slice(0, 24)}… ← prev {chunk.prevHash.slice(0, 12)}…
                </p>
              ))}
              {manifest.chunks.length > 4 ? (
                <p className="text-white/30">…{manifest.chunks.length - 4} more chunks</p>
              ) : null}
              {manifest.chunks.length === 0 ? <p>No audio was captured.</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
              Guardian alerts
            </h2>
            {manifest.alerts.length === 0 ? (
              <p className="text-sm text-white/40">None were dispatched.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {manifest.alerts.map((alert, index) => (
                  <li key={index} className="flex items-center justify-between gap-2">
                    <span>
                      {alert.channel === "sms" ? "SMS" : "Voice call"} → {alert.to}
                      {alert.error ? ` — FAILED: ${alert.error}` : ""}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        alert.provider === "twilio"
                          ? "bg-emerald-400/20 text-emerald-200"
                          : "bg-amber-400/20 text-amber-200"
                      }`}
                    >
                      {alert.provider === "twilio" ? "SENT" : "SIMULATED"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
              Location trail ({manifest.locations.length})
            </h2>
            {manifest.locations.length === 0 ? (
              <p className="text-sm text-white/40">No location was shared.</p>
            ) : (
              <ul className="space-y-1 font-mono text-xs text-white/60">
                {manifest.locations.map((point, index) => (
                  <li key={index}>
                    {new Date(point.ts).toLocaleTimeString()} — {point.lat.toFixed(5)},{" "}
                    {point.lng.toFixed(5)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
