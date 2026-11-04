import Link from "next/link";
import { computeStats } from "@/lib/stats";

// Metrics are read from the live store on every request — measured numbers,
// not baked-in claims.
export const dynamic = "force-dynamic";

const STATS = [
  {
    value: "205 / 100k",
    label: "crimes against women in Faridabad — 3rd worst of 53 Indian cities",
    source: "NCRB Crime in India 2024, Table 3B",
  },
  {
    value: "40%",
    label: "of women across 31 cities feel unsafe or not so safe; Faridabad ranks bottom-tier",
    source: "NARI 2025, National Commission for Women",
  },
  {
    value: "3 : 1",
    label: "blank vs genuine calls flooding one state emergency line — alerts alone don't work",
    source: "The Hindu, 2025 (Namma 112)",
  },
];

const STEPS = [
  {
    title: "1 · Trigger by voice",
    body: "Say “Hey Saheli”. No unlock, no tapping — the step published research (CHI 2019) shows fails first in a real panic. A visible panic button is the second, independent trigger.",
  },
  {
    title: "2 · Verify, then escalate",
    body: "A 30-second check-in asks you to confirm. Silence — or “escalate now” — alerts guardians by call and SMS with live location. False alarms are absorbed, not broadcast: the fix for 3:1 blank-call floods.",
  },
  {
    title: "3 · Prove what happened",
    body: "Audio and location evidence streams to guardians and seals into a SHA-256 hash chain — tamper-evident, court-ready, aligned with India's BNS/eSakshya evidence regime.",
  },
];

export default function Home() {
  const stats = computeStats();
  const latency =
    stats.medianEscalationLatencyMs === null
      ? null
      : `${(stats.medianEscalationLatencyMs / 1000).toFixed(1)}s`;

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-16">
      {/* Hero */}
      <div className="flex flex-col items-start gap-6">
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-fuchsia-200">
          Built for HERHACK 2026 · AI Track · Women Safety
        </span>
        <h1 className="text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Saheli
          <span className="block bg-gradient-to-r from-fuchsia-300 via-violet-300 to-sky-300 bg-clip-text text-2xl font-normal text-transparent sm:text-3xl">
            the voice-activated guardian for the moment everything else fails
          </span>
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-white/70">
          Every women-safety app fails at the same moment — the panic. Unlocking a phone
          and tapping an app is the first thing that stops working. Saheli listens for a
          wake-word, verifies real emergencies before escalating, and hands you
          court-ready evidence afterwards.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/arm"
            className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-6 py-3.5 text-base font-semibold shadow-lg shadow-fuchsia-500/25 transition hover:brightness-110"
          >
            Arm Saheli (user)
          </Link>
          <Link
            href="/guardian"
            className="rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-base font-semibold transition hover:bg-white/10"
          >
            Guardian dashboard
          </Link>
        </div>
      </div>

      {/* Measured prototype metrics (live from the store — staged scenarios) */}
      {stats.totalIncidents > 0 ? (
        <section className="mt-16">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
            Measured on this build (staged scenarios, live store)
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="text-3xl font-semibold text-sky-200">{latency ?? "—"}</div>
              <p className="mt-2 text-sm text-white/70">median trigger→guardian-alert latency</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="text-3xl font-semibold text-emerald-200">
                {stats.falseAlarmsAbsorbed}
              </div>
              <p className="mt-2 text-sm text-white/70">false alarms absorbed at check-in</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="text-3xl font-semibold text-red-200">{stats.escalations}</div>
              <p className="mt-2 text-sm text-white/70">escalations with guardian alerts</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="text-3xl font-semibold text-amber-200">
                {stats.audioChunksChained}
              </div>
              <p className="mt-2 text-sm text-white/70">audio chunks hash-chained</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Verified problem stats */}
      <section className="mt-16">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          The problem, verified
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {STATS.map((stat) => (
            <div
              key={stat.value}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
            >
              <div className="text-3xl font-semibold text-fuchsia-200">{stat.value}</div>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{stat.label}</p>
              <p className="mt-3 text-xs text-white/40">Source: {stat.source}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-16">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          How it works
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.title}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
            >
              <h3 className="font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Honest scope note */}
      <section className="mt-16 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
        <h2 className="text-sm font-semibold text-amber-200">
          What this build is — and isn't (honest scope)
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
          <li>
            Working end-to-end prototype: voice + button triggers, verification window,
            guardian escalation, live location/audio, tamper-evident evidence chain.
          </li>
          <li>
            Guardian alerts are <strong>simulated</strong> until Twilio credentials are
            configured — never shown as real dispatches.
          </li>
          <li>
            No police/112 integration yet — escalation is to chosen guardians; that
            integration is the documented roadmap, not a claim.
          </li>
        </ul>
      </section>

      <footer className="mt-16 text-sm text-white/40">
        Saheli · HERHACK 2026 · Team submission · Evidence design aligned with BNS §78
        record-keeping needs.
      </footer>
    </main>
  );
}
