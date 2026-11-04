// Saheli — guardian alert adapter.
//
// Two honest modes:
//  1. "twilio"    — when TWILIO_* env vars are set, real SMS + voice calls are
//                   placed through the Twilio REST API (no SDK needed).
//  2. "simulated" — otherwise, the dispatch is recorded and clearly labelled
//                   SIMULATED in the UI and evidence manifest. We never
//                   pretend a simulated alert went out.

import type { AlertRecord, Incident } from "./types";

export interface AlertsConfig {
  twilioConfigured: boolean;
  smsTo?: string;
  voiceTo?: string;
  guardianName?: string;
}

export function alertsConfig(): AlertsConfig {
  const configured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
  return {
    twilioConfigured: configured,
    smsTo: process.env.TWILIO_SMS_TO,
    voiceTo: process.env.TWILIO_VOICE_TO ?? process.env.TWILIO_SMS_TO,
    guardianName: process.env.GUARDIAN_NAME,
  };
}

function basicAuth(sid: string, token: string): string {
  return Buffer.from(`${sid}:${token}`).toString("base64");
}

async function twilioRequest(
  sid: string,
  token: string,
  form: Record<string, string>,
  kind: "sms" | "voice",
): Promise<{ sid?: string; error?: string }> {
  const endpoint =
    kind === "sms"
      ? `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
      : `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(sid, token)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) return { error: json.message ?? `HTTP ${res.status}` };
    return { sid: json.sid };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function alertMessage(incident: Incident, guardianName?: string): string {
  const loc = incident.lastLocation;
  const where = loc
    ? `Last location: https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}`
    : "Location unavailable";
  const who = guardianName ? `Hi ${guardianName} — ` : "";
  return (
    `${who}SAHELI EMERGENCY. A person you protect triggered a panic alert ` +
    `and did not confirm they were safe within the check-in window. ` +
    `${where}. Live audio may be streaming in the guardian dashboard. ` +
    `If you can, call them now. (Incident ${incident.id.slice(0, 8)})`
  );
}

/**
 * Dispatch guardian alerts for an escalated incident. Appends AlertRecords
 * (and matching events) to the incident. Safe to call once — guards itself.
 */
export async function dispatchAlerts(incident: Incident): Promise<void> {
  const config = alertsConfig();
  const message = alertMessage(incident, config.guardianName);

  if (!config.twilioConfigured) {
    incident.alerts.push({
      channel: "sms",
      to: config.smsTo ?? "guardian (unset)",
      provider: "simulated",
      ts: Date.now(),
    });
    incident.alerts.push({
      channel: "voice",
      to: config.voiceTo ?? "guardian (unset)",
      provider: "simulated",
      ts: Date.now(),
    });
    incident.events.push({
      id: crypto.randomUUID(),
      ts: Date.now(),
      kind: "alert_dispatched",
      detail:
        "SIMULATED dispatch (SMS + voice call) — set TWILIO_* env vars for real delivery",
      data: { provider: "simulated", message },
    });
    return;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;

  if (config.smsTo) {
    const res = await twilioRequest(
      sid,
      token,
      { From: from, To: config.smsTo, Body: message },
      "sms",
    );
    incident.alerts.push({
      channel: "sms",
      to: config.smsTo,
      provider: "twilio",
      ts: Date.now(),
      sid: res.sid,
      error: res.error,
    });
    incident.events.push({
      id: crypto.randomUUID(),
      ts: Date.now(),
      kind: "alert_dispatched",
      detail: res.error ? `SMS failed: ${res.error}` : `SMS sent to guardian`,
      data: { provider: "twilio", channel: "sms", ...res },
    });
  }

  if (config.voiceTo) {
    const twiml = `<Response><Say voice="Polly.Aditi" loop="3">${message.replace(
      /[<>&]/g,
      " ",
    )}</Say></Response>`;
    const res = await twilioRequest(
      sid,
      token,
      { From: from, To: config.voiceTo, Twiml: twiml },
      "voice",
    );
    incident.alerts.push({
      channel: "voice",
      to: config.voiceTo,
      provider: "twilio",
      ts: Date.now(),
      sid: res.sid,
      error: res.error,
    });
    incident.events.push({
      id: crypto.randomUUID(),
      ts: Date.now(),
      kind: "alert_dispatched",
      detail: res.error
        ? `Voice call failed: ${res.error}`
        : `Voice call placed to guardian`,
      data: { provider: "twilio", channel: "voice", ...res },
    });
  }
}
