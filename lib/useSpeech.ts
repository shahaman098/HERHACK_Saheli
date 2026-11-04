"use client";

// Voice trigger + voice check-in confirmation via the Web Speech API.
//
// Why Web Speech API for v1: zero API keys, zero model downloads, runs in
// Chrome/Edge. The dedicated wake-word engine (Picovoice Porcupine, free
// tier, fully on-device) is the round-2 upgrade path and is documented in
// README.md. Known limitation: the Web Speech API on Android Chrome can take
// exclusive control of the microphone — on mobile the visible panic button
// is the primary trigger (by design: two independent triggers).

import { useCallback, useEffect, useRef } from "react";

export type SpeechMode = "off" | "wake" | "confirm";

const WAKE_MATCHERS = ["saheli", "sahli", "suheli", "sa heli", "sahli"];
const CONFIRM_MATCHERS = ["i'm safe", "im safe", "i am safe", "i m safe", "i'm saif", "main safe"];

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function matches(transcript: string, matchers: string[]): boolean {
  const t = transcript.toLowerCase();
  return matchers.some((m) => t.includes(m));
}

export function useSpeech(opts: {
  mode: SpeechMode;
  onWakePhrase?: () => void;
  onConfirmPhrase?: () => void;
  onMicError?: (reason: string) => void;
}) {
  const { mode, onWakePhrase, onConfirmPhrase, onMicError } = opts;
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantActiveRef = useRef(false);
  // Latest callbacks without re-creating the recognizer.
  const cbRef = useRef({ onWakePhrase, onConfirmPhrase, onMicError });
  cbRef.current = { onWakePhrase, onConfirmPhrase, onMicError };
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const build = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const recognition = new Ctor();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript ?? "";
      if (modeRef.current === "wake" && matches(transcript, WAKE_MATCHERS)) {
        cbRef.current.onWakePhrase?.();
      }
      if (modeRef.current === "confirm" && matches(transcript, CONFIRM_MATCHERS)) {
        cbRef.current.onConfirmPhrase?.();
      }
    };
    recognition.onend = () => {
      if (wantActiveRef.current && modeRef.current !== "off") {
        try {
          recognition.start(); // Chrome ends continuous sessions periodically
        } catch {
          /* already started — ignore */
        }
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantActiveRef.current = false;
        cbRef.current.onMicError?.("microphone permission denied");
      } else if (event.error === "network") {
        cbRef.current.onMicError?.("speech service unreachable (offline?)");
      }
    };
    return recognition;
  }, []);

  useEffect(() => {
    if (mode === "off") {
      wantActiveRef.current = false;
      recognitionRef.current?.stop();
      return;
    }
    if (!recognitionRef.current) recognitionRef.current = build();
    const recognition = recognitionRef.current;
    if (!recognition) {
      cbRef.current.onMicError?.("speech recognition unsupported in this browser");
      return;
    }
    wantActiveRef.current = true;
    try {
      recognition.start();
    } catch {
      /* start() throws if already running — fine */
    }
    return () => {
      wantActiveRef.current = false;
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    };
  }, [mode, build]);

  const supported = typeof window !== "undefined" && getRecognitionCtor() !== null;
  return { supported };
}
