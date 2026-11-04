"use client";

// Microphone recorder that emits ~5s chunks. Each chunk is hashed client-side
// before upload; the server re-verifies the hash and chains it, so the audio
// evidence trail is tamper-evident end to end (see lib/escalate.ts).

import { useCallback, useMemo, useRef, useState } from "react";
import { bufToBase64, sha256Hex } from "./hash";

export interface RecorderChunk {
  seq: number;
  ts: number;
  mime: string;
  base64: string;
  hash: string;
}

export function useRecorder(onChunk: (chunk: RecorderChunk) => void) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seqRef = useRef(0);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  const start = useCallback(async (): Promise<boolean> => {
    if (recorderRef.current) return true; // already recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      seqRef.current = 0;

      const handle = async (blob: Blob) => {
        if (blob.size === 0) return;
        const buf = await blob.arrayBuffer();
        const chunk: RecorderChunk = {
          seq: seqRef.current++,
          ts: Date.now(),
          mime: recorder.mimeType || "audio/webm",
          base64: bufToBase64(buf),
          hash: await sha256Hex(buf),
        };
        onChunkRef.current(chunk);
      };

      recorder.ondataavailable = (event) => {
        void handle(event.data);
      };
      recorder.start(5000); // 5-second chunks — near-live for the guardian view
      setRecording(true);
      return true;
    } catch {
      setRecording(false);
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // final dataavailable still fires through onChunk
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Memoised so consumers can safely use this object in effect dependencies.
  return useMemo(() => ({ start, stop, recording }), [start, stop, recording]);
}
