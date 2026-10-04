"use client";
/**
 * The whole session as one state machine.
 *
 *  idle ─SPEAK─► recording ─STOP/auto─► released
 *                                         ├─ "I'm done"  ─► (audio discarded on device) ─► after ─► goodbye
 *                                         └─ pick AI mode ─► processing ─► reply ─► after ─► closing(DELETE) ─► goodbye
 *
 * Privacy property worth noticing: audio leaves the device ONLY if the user
 * asks for a reply. "I'm done" discards it locally and nothing is uploaded.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, destroyWithRetry, type Risk } from "@/lib/client/api";
import { addRelease, DEFAULT_PREFS, loadPrefs, loadReleases, summarize, today, type Prefs } from "@/lib/client/local";
import { MicIcon } from "./Nav";
import { MoodScale } from "./MoodScale";
import { SafetyCard } from "./SafetyCard";
import { useRecorder, type MicError } from "./useRecorder";
import { Waveform } from "./Waveform";

type Mode = "listen" | "perspective" | "think" | "calm";
type Intent = "bhadass" | "letitout" | "clear" | "idea" | "good";
type Phase = "idle" | "recording" | "released" | "processing" | "reply" | "after" | "closing" | "goodbye" | "error";
type Deletion = "never-left" | "deleted" | "unconfirmed";
type ErrKind = MicError | "offline" | "network" | "processing" | "ai" | "expired" | "empty" | "rate" | "not-configured";

const LENGTHS: { s: Prefs["seconds"]; label: string }[] = [
  { s: 30, label: "30 sec" },
  { s: 120, label: "2 min" },
  { s: 300, label: "5 min" },
];
const MODES: { m: Mode; label: string; hint: string }[] = [
  { m: "listen", label: "Just listen", hint: "A short, kind acknowledgement. No advice." },
  { m: "perspective", label: "Give me perspective", hint: "One gentle other way to see it." },
  { m: "think", label: "Help me think", hint: "A question or a small next step." },
  { m: "calm", label: "Help me calm down", hint: "A minute of slowing down." },
];
const INTENTS: { i: Intent; label: string }[] = [
  { i: "bhadass", label: "Bhadass" },
  { i: "letitout", label: "Let it out" },
  { i: "clear", label: "Clear my head" },
  { i: "idea", label: "An idea" },
  { i: "good", label: "Something good" },
];

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning.";
  if (h < 17) return "Good afternoon.";
  return "Good evening.";
}

function mmss(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const ERR_COPY: Record<ErrKind, { title: string; body: string; retry: boolean }> = {
  denied: { title: "We need your microphone", body: "Microphone access is blocked for this site. Allow it in your browser's site settings, then try again. We only listen while the timer runs.", retry: true },
  unavailable: { title: "No microphone found", body: "We couldn't reach a microphone. Check it's connected and not in use by another app.", retry: true },
  unsupported: { title: "This browser can't record", body: "Please try a recent version of Chrome, Safari, Firefox or Edge.", retry: false },
  insecure: { title: "Needs a secure connection", body: "Recording only works over HTTPS. Please open the secure version of this site.", retry: false },
  offline: { title: "You're offline", body: "You still said it — that part counts. A reply needs a connection; your recording was discarded on this device.", retry: false },
  network: { title: "Couldn't reach us", body: "Something went wrong on the way. Your recording was discarded on this device.", retry: true },
  processing: { title: "We couldn't process that", body: "Something went wrong while listening back. You still said it.", retry: true },
  ai: { title: "No reply right now", body: "The reflection service is unavailable. You still got it out — that's the part that matters.", retry: false },
  expired: { title: "That session timed out", body: "For your privacy, sessions are erased automatically after a short while.", retry: true },
  empty: { title: "We didn't catch any words", body: "It might have been too quiet, or very short. That's okay — try again whenever you like.", retry: true },
  rate: { title: "Let's take a breath", body: "Too many sessions in a short time. Please wait a minute and try again.", retry: true },
  "not-configured": { title: "Replies aren't set up", body: "This server has no speech or AI provider configured. You can still speak and release without a reply.", retry: false },
};

function toErr(e: unknown): ErrKind {
  if (!(e instanceof ApiError)) return "processing";
  switch (e.code) {
    case "offline": return "offline";
    case "network": return "network";
    case "session_expired": return "expired";
    case "rate_limited": return "rate";
    case "ai_unavailable": case "llm_unavailable": return "ai";
    case "stt_not_configured": return "not-configured";
    default: return "processing";
  }
}

export function SpeakFlow() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState<Prefs["seconds"]>(120);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [before, setBefore] = useState<number | null>(null);
  const [after, setAfter] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("listen");
  const [reply, setReply] = useState<string | null>(null);
  const [risk, setRisk] = useState<Risk>("none");
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<ErrKind | null>(null);
  const [deletion, setDeletion] = useState<Deletion>("never-left");
  const [demo, setDemo] = useState(false);
  const [spoken, setSpoken] = useState(0);
  const [summary, setSummary] = useState<ReturnType<typeof summarize> | null>(null);
  const [greet, setGreet] = useState("Hello.");

  const blobRef = useRef<Blob | null>(null);
  const sessionRef = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rec = useRecorder();

  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    setSeconds(p.seconds);
    setMode(p.aiDefault);
    setGreet(greeting());
    if (p.keepInsights) setSummary(summarize(loadReleases()));
    api.health().then((h) => setDemo(h.demo)).catch(() => {});
  }, []);

  // Move focus to each new screen's heading for screen-reader users (not on first load).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [phase]);

  // If the tab closes mid-session, ask the server to delete; TTL is the backstop.
  useEffect(() => {
    const onHide = () => {
      if (sessionRef.current) api.destroyOnUnload(sessionRef.current);
      blobRef.current = null;
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
    };
  }, []);

  const discardAudio = () => {
    blobRef.current = null;
  };

  const onRecorded = useCallback((blob: Blob | null) => {
    blobRef.current = blob;
    setPhase("released");
  }, []);

  const startRecording = async () => {
    setError(null);
    setReply(null);
    setRisk("none");
    setAfter(null);
    setDeletion("never-left");
    sessionRef.current = null;
    const err = await rec.start(seconds, onRecorded);
    if (err) {
      setError(err);
      setPhase("error");
      return;
    }
    setPhase("recording");
  };

  const stopRecording = async () => {
    const elapsed = rec.elapsed;
    const blob = await rec.stop();
    setSpoken(Math.round(elapsed));
    onRecorded(blob);
  };

  // auto-stop path sets spoken too
  useEffect(() => {
    if (phase === "released" && spoken === 0) setSpoken(Math.round(rec.elapsed));
  }, [phase, spoken, rec.elapsed]);

  const askForReply = async (m: Mode) => {
    setMode(m);
    setPhase("processing");
    setError(null);
    try {
      if (!sessionRef.current) {
        const blob = blobRef.current;
        if (!blob || blob.size < 500) {
          discardAudio();
          setError("empty");
          setPhase("error");
          return;
        }
        if (!navigator.onLine) throw new ApiError("offline", 0);
        const s = await api.create();
        sessionRef.current = s.id;
        setDemo(s.demo);
        setDeletion("unconfirmed"); // from here on, data exists server-side until verified
        const up = await api.upload(s.id, blob, prefs.langHint || null);
        discardAudio(); // the device copy is no longer needed either way
        if (up.empty) {
          await closeServerSession();
          setError("empty");
          setPhase("error");
          return;
        }
        setRisk(up.risk);
      }
      const r = await api.reflect(sessionRef.current!, m, intent);
      setReply(r.reply);
      setRisk(r.risk);
      setRemaining(r.remaining);
      setPhase("reply");
    } catch (e) {
      discardAudio();
      const kind = toErr(e);
      if (kind === "ai" && sessionRef.current) {
        // Speech was processed but no reply: still show safety if needed, then let them finish.
        setReply(null);
        setError("ai");
        setPhase("reply");
        return;
      }
      await closeServerSession();
      setError(kind);
      setPhase("error");
    }
  };

  const closeServerSession = async (): Promise<Deletion> => {
    const id = sessionRef.current;
    if (!id) return "never-left";
    const result = await destroyWithRetry(id);
    sessionRef.current = null;
    const d: Deletion = result === "deleted" ? "deleted" : "unconfirmed";
    setDeletion(d);
    return d;
  };

  const finish = () => {
    discardAudio();
    if (prefs.askMood && before !== null) setPhase("after");
    else void close();
  };

  const close = async () => {
    setPhase("closing");
    discardAudio();
    const d = await closeServerSession();
    if (d === "never-left") setDeletion("never-left");
    addRelease({ day: today(), seconds: spoken, before: before ?? undefined, after: after ?? undefined, ai: reply !== null });
    setPhase("goodbye");
  };

  const reset = () => {
    setPhase("idle");
    setIntent(null);
    setBefore(null);
    setAfter(null);
    setReply(null);
    setRisk("none");
    setSpoken(0);
    setError(null);
    if (prefs.keepInsights) setSummary(summarize(loadReleases()));
  };

  const delta = useMemo(() => (before !== null && after !== null ? after - before : null), [before, after]);

  // ─────────────────────────── screens ───────────────────────────

  const DemoBanner = demo ? (
    <p className="banner" role="note">
      Demo mode — replies are sample text and your audio is not transcribed.
    </p>
  ) : null;

  if (phase === "recording") {
    const left = seconds - rec.elapsed;
    return (
      <div className="rec fade">
        <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 34 }}>
          <span className="rec-dot" aria-hidden="true" />
          Let it out.
        </h1>
        <Waveform analyser={rec.analyser} />
        <div>
          <div className="timer" aria-live="off">{mmss(rec.elapsed)}</div>
          <p className="faint" aria-live="polite">
            {left <= 10 ? `${Math.ceil(left)} seconds left` : `up to ${LENGTHS.find((l) => l.s === seconds)?.label}`}
          </p>
        </div>
        <button className="stop" onClick={stopRecording} aria-label="Stop recording">
          <i />
        </button>
        <p className="faint">Your voice stays on this device unless you ask for a reply.</p>
        <button className="btn ghost" onClick={() => { rec.cancel(); discardAudio(); reset(); }}>
          Cancel and discard
        </button>
      </div>
    );
  }

  if (phase === "released") {
    return (
      <div className="stack fade" style={{ ["--gap" as string]: "22px", paddingTop: 24 }}>
        {DemoBanner}
        <div>
          <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 40 }}>You got it out.</h1>
          <p className="muted" style={{ marginTop: 10 }}>
            {spoken > 0 ? `${mmss(spoken)} said. ` : ""}Want a response, or are you done?
          </p>
        </div>
        <div role="group" aria-label="Choose a response" className="stack" style={{ ["--gap" as string]: "10px" }}>
          {MODES.map(({ m, label, hint }) => (
            <button key={m} className={`btn block mode-btn ${m === mode ? "primary" : ""}`} onClick={() => askForReply(m)}>
              <span>{label}{m === "listen" && <span className="sr-only"> (default)</span>}</span>
              <small>{hint}</small>
            </button>
          ))}
        </div>
        <button className="btn block ghost" onClick={finish} style={{ border: "1px solid var(--line)" }}>
          No reply — I&rsquo;m done
        </button>
        <p className="faint center">
          &ldquo;No reply&rdquo; means your recording never leaves this device. A reply sends it to be transcribed, then erased.{" "}
          <Link href="/privacy">How?</Link>
        </p>
      </div>
    );
  }

  if (phase === "processing") {
    return (
      <div className="rec fade" aria-busy="true">
        <div className="spinner" aria-hidden="true" />
        <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 28 }}>Listening back…</h1>
        <p className="faint">Your words are held temporarily and erased when you&rsquo;re done.</p>
      </div>
    );
  }

  if (phase === "reply") {
    return (
      <div className="stack fade" style={{ ["--gap" as string]: "20px", paddingTop: 24 }}>
        {DemoBanner}
        <h1 ref={headingRef} tabIndex={-1} className="sr-only">Response</h1>
        {risk === "high" && <SafetyCard />}
        {reply ? (
          <div className="card" aria-live="polite">
            <p className="faint" style={{ marginBottom: 8 }}>{MODES.find((x) => x.m === mode)?.label}</p>
            <p className="reply">{reply}</p>
          </div>
        ) : (
          <div className="card soft">
            <p className="reply" style={{ fontSize: 20 }}>{ERR_COPY.ai.title}</p>
            <p className="muted" style={{ marginTop: 8 }}>{ERR_COPY.ai.body}</p>
          </div>
        )}
        {risk === "elevated" && (
          <p className="faint">
            If things feel heavier than usual, talking to someone can help. <Link href="/safety">Support options</Link>
          </p>
        )}
        {reply && remaining > 0 && (
          <div>
            <p className="faint" style={{ marginBottom: 8 }}>Try another way</p>
            <div className="pills">
              {MODES.filter((x) => x.m !== mode).map(({ m, label }) => (
                <button key={m} className="pill" onClick={() => askForReply(m)}>{label}</button>
              ))}
            </div>
          </div>
        )}
        <button className="btn block primary" onClick={finish}>I&rsquo;m done</button>
      </div>
    );
  }

  if (phase === "after") {
    return (
      <div className="stack fade" style={{ ["--gap" as string]: "24px", paddingTop: 32 }}>
        <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 34 }}>How do you feel now?</h1>
        <MoodScale label="Right now, from 1 to 10" value={after} onChange={setAfter} />
        <div className="row">
          <button className="btn ghost" onClick={() => { setAfter(null); void close(); }}>Skip</button>
          <span className="spacer" />
          <button className="btn primary" disabled={after === null} onClick={() => void close()}>Continue</button>
        </div>
      </div>
    );
  }

  if (phase === "closing") {
    return (
      <div className="rec fade" aria-busy="true">
        <div className="spinner" aria-hidden="true" />
        <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 26 }}>Closing the door…</h1>
      </div>
    );
  }

  if (phase === "goodbye") {
    return (
      <div className="stack fade" style={{ ["--gap" as string]: "26px", paddingTop: 40 }}>
        <div>
          <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 40 }}>
            You said it.
            <br />
            <span className="muted">You don&rsquo;t need to carry it anymore.</span>
          </h1>
        </div>

        {delta !== null && (
          <div className="card soft">
            <p className="faint">Before {before} · After {after}</p>
            <p style={{ marginTop: 6 }}>
              {delta > 0 ? "Looks like getting it out helped." : delta === 0 ? "Sometimes it just needs saying. That's enough." : "Some days it takes more than one go. That's okay."}
            </p>
          </div>
        )}

        <DeletionReceipt state={deletion} />

        <p className="faint center">Session complete.</p>
        <div className="row">
          <Link className="btn ghost" href="/">Leave</Link>
          <span className="spacer" />
          <button className="btn" onClick={reset}>Say something else</button>
        </div>
      </div>
    );
  }

  if (phase === "error" && error) {
    const c = ERR_COPY[error];
    return (
      <div className="stack fade" style={{ ["--gap" as string]: "18px", paddingTop: 40 }}>
        <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 32 }}>{c.title}</h1>
        <p className="muted">{c.body}</p>
        <DeletionReceipt state={deletion} />
        <div className="row">
          <button className="btn ghost" onClick={reset}>Back</button>
          <span className="spacer" />
          {c.retry && <button className="btn primary" onClick={() => { reset(); void startRecording(); }}>Try again</button>}
        </div>
      </div>
    );
  }

  // ─── idle / home ───
  return (
    <div className="fade" style={{ paddingTop: 16 }}>
      {DemoBanner}
      <div className="center" style={{ marginTop: 20 }}>
        <p className="muted">{greet}</p>
        <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "clamp(34px, 9vw, 44px)", marginTop: 6 }}>
          What&rsquo;s on your mind?
        </h1>
        <p className="muted" style={{ marginTop: 12 }}>
          You don&rsquo;t have to post it.
          <br />
          You don&rsquo;t have to explain it.
          <br />
          Just say it.
        </p>
      </div>

      <div className="speak-wrap">
        <button className="speak" onClick={startRecording} aria-label={`Speak — start recording for up to ${LENGTHS.find((l) => l.s === seconds)?.label}`}>
          <MicIcon />
          <span>SPEAK</span>
        </button>
      </div>

      <div className="pills" role="radiogroup" aria-label="Session length">
        {LENGTHS.map(({ s, label }) => (
          <button key={s} role="radio" aria-checked={seconds === s} className="pill" onClick={() => setSeconds(s)}>
            {label}
          </button>
        ))}
      </div>

      <div className="stack" style={{ marginTop: 32, ["--gap" as string]: "6px" }}>
        {prefs.askMood && (
          <details className="opt">
            <summary>How are you feeling right now? {before !== null && <span className="tag">{before}/10</span>}</summary>
            <div style={{ padding: "8px 0 4px" }}>
              <MoodScale label="Optional — from 1 to 10" value={before} onChange={setBefore} />
            </div>
          </details>
        )}
        <details className="opt">
          <summary>What kind of thing is it? {intent && <span className="tag">{INTENTS.find((x) => x.i === intent)?.label}</span>}</summary>
          <div className="pills" style={{ justifyContent: "flex-start", padding: "10px 0 4px" }}>
            {INTENTS.map(({ i, label }) => (
              <button key={i} className="pill" aria-pressed={intent === i} onClick={() => setIntent(intent === i ? null : i)}>
                {label}
              </button>
            ))}
          </div>
        </details>
      </div>

      {summary && summary.thisWeek > 0 && (
        <section className="card soft" style={{ marginTop: 28 }} aria-label="Recent private activity">
          <p className="faint" style={{ marginBottom: 6 }}>Only on this device</p>
          <p>
            {summary.thisWeek} release{summary.thisWeek === 1 ? "" : "s"} this week
            {summary.avgDelta !== null && <> · average mood {summary.avgDelta >= 0 ? "+" : ""}{summary.avgDelta}</>}
          </p>
          <Link href="/insights" className="faint">How am I doing? →</Link>
        </section>
      )}
    </div>
  );
}

function DeletionReceipt({ state }: { state: Deletion }) {
  if (state === "never-left") {
    return (
      <div className="card calm" role="status">
        <p><strong>Nothing was sent.</strong> Your recording stayed on this device and has been discarded.</p>
      </div>
    );
  }
  if (state === "deleted") {
    return (
      <div className="card calm" role="status">
        <p><strong>Your temporary session data has been deleted</strong> from our servers.</p>
        <p className="faint" style={{ marginTop: 6 }}>
          Speech and AI partners process it under their own retention terms. <Link href="/privacy">Details</Link>
        </p>
      </div>
    );
  }
  return (
    <div className="card warn" role="status">
      <p><strong>We couldn&rsquo;t confirm deletion yet.</strong></p>
      <p className="muted" style={{ marginTop: 6 }}>
        We tried several times. Your session is set to erase itself automatically within 15 minutes, even if we never hear back from your device.
      </p>
    </div>
  );
}
