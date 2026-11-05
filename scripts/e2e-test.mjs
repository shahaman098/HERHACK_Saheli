// Saheli end-to-end API test — drives a full incident lifecycle against a
// running server (default http://localhost:3210):
//
//   1. create incident (4s verify window) with location
//   2. chain two audio chunks
//   3. reject a bad-hash chunk (tamper attempt) and an out-of-order seq
//   4. observe automatic escalation + (simulated) guardian alerts
//   5. confirm safe -> evidence seals, chain re-verification passes
//
// Usage: node scripts/e2e-test.mjs [baseUrl]

import { createHash } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3210";
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function assert(cond, label) {
  if (!cond) {
    console.error(`✗ FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1. create incident -----------------------------------------------------
let res = await fetch(`${BASE}/api/incidents`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    trigger: "voice",
    verifySeconds: 4,
    location: { lat: 28.3822, lng: 77.3122, accuracy: 12, ts: Date.now() }, // Faridabad
  }),
});
assert(res.status === 201, "incident created (201)");
let { incident } = await res.json();
assert(incident.status === "verifying", "status = verifying");
assert(incident.chainHead === "SAHELI_GENESIS", "chain head starts at genesis");

// --- 2. chain audio chunks ---------------------------------------------------
// NOTE: the hash is over the DECODED bytes (matching the real client, which
// hashes the raw ArrayBuffer before base64-encoding it).
const chunkText = (i) => Buffer.from(`fake-audio-payload-${i}`).toString("base64");
for (const seq of [0, 1]) {
  const data = chunkText(seq);
  const rawHash = sha256(Buffer.from(data, "base64"));
  res = await fetch(`${BASE}/api/incidents/${incident.id}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "audio_chunk",
      data: { seq, ts: Date.now(), mime: "audio/webm", data, hash: rawHash },
    }),
  });
  assert(res.status === 200, `audio chunk #${seq} accepted & chained`);
}
let list = await (await fetch(`${BASE}/api/incidents`)).json();
assert(list.incidents[0].audio.length === 2, "two chunks stored");

// --- 3. tamper / order rejections --------------------------------------------
const forged = Buffer.from("forged-payload").toString("base64");
res = await fetch(`${BASE}/api/incidents/${incident.id}/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "audio_chunk",
    data: { seq: 2, ts: Date.now(), mime: "audio/webm", data: forged, hash: sha256("different") },
  }),
});
assert(res.status === 409, "bad-hash chunk rejected (409)");

res = await fetch(`${BASE}/api/incidents/${incident.id}/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "audio_chunk",
    data: { seq: 7, ts: Date.now(), mime: "audio/webm", data: forged, hash: sha256(forged) },
  }),
});
assert(res.status === 409, "out-of-order seq rejected (409)");

// --- 4. escalation after silent verify window --------------------------------
await sleep(5200);
({ incident } = await (await fetch(`${BASE}/api/incidents/${incident.id}`)).json());
assert(incident.status === "escalated", "auto-escalated after silent check-in");
assert(incident.alerts.length === 2, "guardian alerts dispatched (sms + voice)");
assert(
  incident.alerts.every((a) => a.provider === "simulated"),
  "alerts honestly labelled SIMULATED (no Twilio env)",
);
assert(
  incident.events.some((e) => e.kind === "alert_dispatched"),
  "alert event recorded in timeline",
);

// --- 5. confirm safe -> seal -> verify chain ----------------------------------
res = await fetch(`${BASE}/api/incidents/${incident.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "confirm_safe" }),
});
({ incident } = (await res.json()));
assert(incident.status === "resolved_safe", "resolved safe after escalation");
assert(typeof incident.finalHash === "string" && incident.finalHash.length === 64, "evidence sealed with final hash");

// post-resolution privacy: further events rejected
res = await fetch(`${BASE}/api/incidents/${incident.id}/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "location",
    data: { lat: 28.4, lng: 77.3, ts: Date.now() },
  }),
});
assert(res.status === 409, "location rejected after seal (privacy)");

res = await fetch(`${BASE}/api/incidents/${incident.id}/evidence`);
const { manifest } = await res.json();
assert(manifest.chainValid === true, "evidence chain re-verified intact");
assert(manifest.chunks.length === 2, "manifest lists both chunks");
assert(manifest.locations.length >= 1, "location trail present");

// --- 6. measured metrics ------------------------------------------------------
const stats = await (await fetch(`${BASE}/api/stats`)).json();
assert(stats.totalIncidents >= 1, "stats: incidents counted from live store");
assert(stats.escalations >= 1, "stats: escalations counted");
assert(
  stats.escalations >= 1 && stats.medianEscalationLatencyMs !== null,
  "stats: trigger→alert latency measured",
);
assert(stats.audioChunksChained >= 2, "stats: hash-chained audio chunks counted");
assert(stats.falseAlarmsAbsorbed + stats.escalations >= 1, "stats: outcomes recorded");

console.log(
  `\n${process.exitCode ? "SOME CHECKS FAILED" : "ALL CHECKS PASSED"} — finalHash ${manifest.finalHash?.slice(0, 16)}…`,
);
