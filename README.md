# Saheli — the voice-activated AI guardian

> Every women-safety app fails at the same moment: the panic. Unlocking a phone and
> tapping an app is the first thing that stops working. Saheli activates with your
> voice, verifies real emergencies before escalating, and seals tamper-evident
> evidence afterwards.

**Built for HERHACK 2026** (Echelon Institute of Technology, Faridabad · IEEE WIE) —
AI Track + Women Safety Special Award.

---

## The problem, verified

| Fact | Source |
|---|---|
| Faridabad: **205 crimes against women per 100,000 women — 3rd worst of 53 Indian cities** (+217% vs national avg 64.6) | NCRB, Crime in India 2024, Table 3B |
| 40% of women across 31 cities feel unsafe; **Faridabad ranks bottom-tier** | NARI 2025, National Commission for Women |
| One state emergency line logged **~15.9 lakh blank calls vs ~5 lakh genuine** in a year — alerting infrastructure drowns in noise | The Hindu, 2025 (Namma 112) |
| Delhi Police's safety app had "no takers" even after a celebrity relaunch — **adoption, not features, is the failure** | Times of India, 2018 (Himmat Plus) |
| Unlocking + navigating a phone under stress is exactly what fails in real emergencies | CHI EA 2019, *"Personal Safety App Effectiveness"*, DOI 10.1145/3290607.3312781 |

Existing apps alert. None of them (a) work without unlock-and-tap, (b) resist false
alarms, or (c) build the victim-side evidence chain — the state's own eSakshya
standard (2024) covers **police-side** evidence only. Saheli attacks all three gaps.

## What it does

```
"Hey Saheli"  ─┐
               ├─► 30s CHECK-IN ──silence──► GUARDIANS ALERTED
   PANIC BUTTON┘       │                        (call + SMS + live location + live audio)
                       │                                 │
                  "I'm safe"                       recording continues
                       │                                 │
                 FALSE ALARM ABSORBED ────────►  EVIDENCE PACK SEALED
                 (no one disturbed, but          (SHA-256 hash chain, court-ready)
                  incident documented)
```

- **Two independent triggers** — voice wake-word ("Hey Saheli", Web Speech API) and a
  visible panic button. No unlock, no navigation.
- **Anti-false-alarm verification** — a 30-second check-in stands between trigger and
  escalation. Silence escalates; "I'm safe" (button *or voice*) absorbs the alarm
  quietly while still documenting it. This is the direct answer to the blank-call
  floods that erode every emergency line.
- **Live guardian dashboard** — escalations show a live map, streaming audio (5s
  chunks), the full event timeline, and every alert with an honest SENT/SIMULATED
  label.
- **Tamper-evident evidence** — every audio chunk is SHA-256-hashed client-side,
  re-verified server-side, and chained (`head = sha256(prevHead + chunkHash)`). The
  chain seals on resolution; the evidence page re-derives and re-verifies it on every
  read. A forged chunk is rejected with HTTP 409 — and that rejection is itself recorded.
- **Measured, not claimed** — the landing page shows live metrics from the store:
  median trigger→guardian-alert latency, false alarms absorbed at check-in,
  escalations dispatched, audio chunks hash-chained. The evidence pack shows the
  measured alert latency per incident.
- **Responder-ready guardian view** — audible alarm on new escalations (WebAudio,
  opt-in), turn-by-turn navigation deep link to the person's live location.
- **Installable PWA** — manifest + icon; `Add to Home Screen` works on Android/Chrome.
- **Privacy by default** — tracking and capture stop the moment an incident resolves;
  the API hard-rejects further events on sealed incidents.

## Quickstart

```bash
npm install
npm run dev        # http://localhost:3000
```

| Page | Role |
|---|---|
| `/` | Landing — the problem, the flow, honest scope |
| `/arm` | User: arm → wake-word listening → check-in → escalation → evidence |
| `/guardian` | Guardian: live incidents, map, audio, timeline, alerts |
| `/evidence/<incident-id>` | Tamper-evident evidence pack |

**Demo flow (60 seconds):** open `/arm` in one window and `/guardian` beside it →
**Arm Saheli** → press **PANIC** → watch the check-in countdown → let it lapse →
guardian view shows the escalation, simulated alerts, live audio → press
**I'm safe now** → open the evidence pack → *Chain verified intact*.

### Two-device demo (user on phone, guardian on laptop)

Mic, speech and geolocation need a secure context. Options:

1. Same Wi-Fi: `npm run dev:lan` → open `http://<mac-ip>:3000` (Chrome treats some
   LAN setups as insecure — if the mic is blocked, use option 2).
2. HTTPS tunnel (recommended): `npx ngrok http 3000` or `npx cloudflared --url
   http://localhost:3000` → open the https URL on both devices.

### Real SMS + voice calls (optional, ~10 minutes)

Guardian alerts run through an adapter (`lib/alerts.ts`). Without credentials they
are **honestly labelled SIMULATED** — never shown as real dispatches. To go live:

```bash
# .env.local — never commit this file
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
TWILIO_SMS_TO=+91xxxxxxxxxx      # guardian phone
TWILIO_VOICE_TO=+91xxxxxxxxxx    # defaults to SMS_TO
GUARDIAN_NAME=Anu                # used in the alert message
```

Twilio trial note: verify the guardian number in the Twilio console first.

## Architecture

```
┌───────────────────────┐        ┌──────────────────────────────┐
│ /arm  (user PWA)      │        │ /guardian (responder)        │
│  Web Speech wake-word │        │  2s polling · map · audio    │
│  MediaRecorder 5s     │        └──────────────┬───────────────┘
│  geolocation watch    │                       │ poll /api/incidents
└──────────┬────────────┘                       │
           │ POST trigger / chunks / location   │
           ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Next.js route handlers (server-authoritative state)         │
│  POST /api/incidents            create + verify deadline    │
│  GET  /api/incidents            list (sweep escalations)    │
│  GET/PATCH /api/incidents/[id]  read · confirm_safe · escalate_now │
│  POST /api/incidents/[id]/events  location · audio chunks   │
│  GET  /api/incidents/[id]/evidence  manifest + chain verify │
├─────────────────────────────────────────────────────────────┤
│ escalate.ts — verify-window sweep · hash-chain · sealing    │
│ alerts.ts   — Twilio REST adapter / honest SIMULATED mode   │
│ store.ts    — v1: in-process store (single Node server)     │
└─────────────────────────────────────────────────────────────┘
```

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
Web Speech API · MediaRecorder + Web Crypto · OpenStreetMap embeds · Twilio REST
(no SDK) · no database in v1.

### Why the evidence chain matters

India's new criminal regime (BNS §78 stalking; BSA electronic-evidence rules;
police-side eSakshya, 2024) made digital evidence central — but the **victim side**
of that chain is still an empty folder of screenshots. Saheli produces, from the
moment of trigger:

- an ordered, hash-chained audio record (any edit breaks verification),
- a location trail with timestamps,
- the full decision timeline (trigger → check-in → escalation → resolution),

…sealed into one hash a court, a college, or a family can verify. The documented
round-2 step: anchor that final hash on a public chain (Base Sepolia) so the
timestamp does not depend on this server at all.

### Production path for the store

v1 uses a single-process in-memory store — honest and sufficient for the
hackathon demo (one Node server serves both roles). Production: Supabase
(Postgres + Realtime + Storage) behind the same `lib/store.ts` interface —
no application-code changes, only the adapter.

## Testing

```bash
npm run build && npx next start -p 3210 &
node scripts/e2e-test.mjs http://localhost:3210
```

18 checks covering: creation, chunk chaining, **forged-chunk rejection**,
**out-of-order rejection**, automatic escalation on a silent window, alert
dispatch + honest labelling, resolution, evidence sealing, chain
re-verification, and the post-resolution privacy guard.

## Honest limitations

- Guardian alerts are simulated unless Twilio credentials are configured; simulated
  alerts are labelled as such everywhere they appear.
- Wake-word uses the Web Speech API (Chrome/Edge, needs internet). On Android,
  speech recognition can take exclusive mic access — the panic button is the
  primary mobile trigger. The round-2 upgrade is Picovoice Porcupine (on-device,
  free tier).
- The in-memory store is single-process (see production path above).
- No police/112 integration — escalation reaches chosen guardians. That integration
  requires institutional partnership and is a roadmap item, not a claim.
- Voice check-in works in quiet environments; staged-scenario false-trigger rates
  are measured, not asserted.

## AI-usage documentation (required by HERHACK rules)

| Tool | What it contributed | What we verified ourselves |
|---|---|---|
| ZCode (AI pair-programmer) | Scaffold, boilerplate, first-pass implementations of every module | Every file reviewed and edited by the team; the full lifecycle is proven by `scripts/e2e-test.mjs` (18 assertions) which we designed and ran; bugs it introduced (a recursion in the escalation sweep, a route-export error) were caught by our build + E2E loop and fixed by hand |
| Chrome Web Speech API / MediaRecorder / Web Crypto | Platform primitives (not AI) | Behaviour verified manually across trigger/confirm flows |
| OpenStreetMap embeds | Map tiles | Manual verification of marker accuracy |

No AI-generated content appears in the pitch deck or the demo video; the problem
statistics above are cited to their primary sources.

## Team

- *(fill in team members before submission)*

## Licence

MIT
