"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type MicError = "denied" | "unavailable" | "unsupported" | "insecure";

function pickMime(): string {
  const prefs = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return "";
  return prefs.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
}

/**
 * Microphone recording held entirely in browser memory.
 * - Tracks are stopped the instant recording ends (mic indicator goes off).
 * - Chunks are cleared after the Blob is assembled.
 * - An AnalyserNode drives the waveform; it never records anything itself.
 */
export function useRecorder() {
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tickRef = useRef<number | null>(null);
  const resolveRef = useRef<((b: Blob | null) => void) | null>(null);
  const startedAt = useRef(0);

  const teardown = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => () => {
    // Unmount: stop everything and drop audio.
    try {
      recRef.current?.state === "recording" && recRef.current.stop();
    } catch { /* noop */ }
    chunksRef.current = [];
    teardown();
  }, [teardown]);

  const start = useCallback(
    async (maxSeconds: number, onAutoStop: (b: Blob | null) => void): Promise<MicError | null> => {
      if (typeof window === "undefined") return "unsupported";
      if (!window.isSecureContext) return "insecure";
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return "unsupported";

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (e) {
        const name = (e as DOMException)?.name;
        if (name === "NotAllowedError" || name === "SecurityError") return "denied";
        return "unavailable";
      }
      streamRef.current = stream;

      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        an.smoothingTimeConstant = 0.85;
        src.connect(an);
        ctxRef.current = ctx;
        analyserRef.current = an;
      } catch {
        /* waveform is decorative; recording still works */
      }

      const mime = pickMime();
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
      chunksRef.current = [];
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      rec.onstop = () => {
        const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: rec.mimeType || mime || "audio/webm" }) : null;
        chunksRef.current = [];
        teardown();
        const r = resolveRef.current;
        resolveRef.current = null;
        (r ?? onAutoStop)(blob);
      };
      rec.start(1000);
      recRef.current = rec;
      startedAt.current = performance.now();
      setElapsed(0);
      setRecording(true);
      tickRef.current = window.setInterval(() => {
        const s = (performance.now() - startedAt.current) / 1000;
        setElapsed(s);
        if (s >= maxSeconds && rec.state === "recording") rec.stop();
      }, 200);
      return null;
    },
    [teardown],
  );

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const rec = recRef.current;
        if (!rec || rec.state !== "recording") return resolve(null);
        resolveRef.current = resolve;
        rec.stop();
      }),
    [],
  );

  /** Abort and discard everything recorded so far. */
  const cancel = useCallback(() => {
    resolveRef.current = () => {};
    try {
      recRef.current?.state === "recording" && recRef.current.stop();
    } catch { /* noop */ }
    chunksRef.current = [];
    teardown();
  }, [teardown]);

  return { start, stop, cancel, elapsed, recording, analyser: analyserRef };
}
