"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { loadPrefs, loadReleases, savePrefs, summarize, type Summary } from "@/lib/client/local";

export default function InsightsPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    const p = loadPrefs();
    setEnabled(p.keepInsights);
    if (p.keepInsights) setS(summarize(loadReleases()));
  }, []);

  if (enabled === null) return <AppShell title="How am I doing?"><div className="spinner" aria-label="Loading" /></AppShell>;

  if (!enabled) {
    return (
      <AppShell title="How am I doing?">
        <div className="card stack" style={{ ["--gap" as string]: "14px" }}>
          <p>Private insights are off.</p>
          <p className="muted">
            If you turn them on, this device will remember only the date, length, and your before/after mood number for
            each release — never what you said. Nothing goes to our servers.
          </p>
          <button
            className="btn primary"
            onClick={() => {
              savePrefs({ ...loadPrefs(), keepInsights: true });
              setEnabled(true);
              setS(summarize(loadReleases()));
            }}
          >
            Turn on, on this device only
          </button>
        </div>
      </AppShell>
    );
  }

  const max = Math.max(1, ...(s?.last7.map((d) => d.count) ?? [1]));

  return (
    <AppShell title="How am I doing?">
      {!s || s.thisWeek === 0 ? (
        <div className="card">
          <p>Nothing here yet this week.</p>
          <p className="muted" style={{ marginTop: 8 }}>
            Whenever something&rsquo;s on your mind, <Link href="/speak">say it</Link>. There&rsquo;s no streak to keep.
          </p>
        </div>
      ) : (
        <div className="stack" style={{ ["--gap" as string]: "16px" }}>
          <div className="card">
            <p className="display" style={{ fontSize: 28 }}>
              You used Speak {s.thisWeek} time{s.thisWeek === 1 ? "" : "s"} this week.
            </p>
            <p className="muted" style={{ marginTop: 6 }}>{s.minutesThisWeek} minute{s.minutesThisWeek === 1 ? "" : "s"} of letting it out.</p>
          </div>
          {s.pairs > 0 && (
            <div className="card">
              <p>
                Your mood improved after {s.improved} of your last {s.pairs} session{s.pairs === 1 ? "" : "s"} where you checked in.
              </p>
              {s.avgDelta !== null && (
                <p className="muted" style={{ marginTop: 6 }}>
                  Average change: {s.avgDelta >= 0 ? "+" : ""}
                  {s.avgDelta}
                </p>
              )}
            </div>
          )}
          <figure className="card" style={{ margin: 0 }}>
            <figcaption className="faint" style={{ marginBottom: 12 }}>Last 7 days</figcaption>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, alignItems: "end", height: 100 }} role="img" aria-label={`Releases per day: ${s.last7.map((d) => d.count).join(", ")}`}>
              {s.last7.map((d) => (
                <div key={d.day} style={{ height: `${Math.max(6, (d.count / max) * 100)}%`, background: d.count ? "var(--accent)" : "var(--line)", borderRadius: 6, opacity: d.count ? 0.85 : 1 }} />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginTop: 6 }} aria-hidden="true">
              {s.last7.map((d) => (
                <span key={d.day} className="faint center" style={{ fontSize: 12 }}>
                  {new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}
                </span>
              ))}
            </div>
          </figure>
          <p className="faint">
            Stored only on this device. Topic insights (like &ldquo;work came up often&rdquo;) need an opt-in account and
            are planned — they&rsquo;ll be built from short labels, never from saved words.
          </p>
        </div>
      )}
    </AppShell>
  );
}
