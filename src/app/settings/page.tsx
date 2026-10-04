"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { applyTheme } from "@/components/ThemeApplier";
import { DEFAULT_PREFS, loadPrefs, savePrefs, wipeLocal, type Prefs } from "@/lib/client/local";

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)} />;
}

function Choice<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="pills" role="radiogroup" aria-label={label} style={{ justifyContent: "flex-start" }}>
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={value === o.v} className="pill" onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [p, setP] = useState<Prefs>(DEFAULT_PREFS);
  const [wiped, setWiped] = useState(false);
  useEffect(() => setP(loadPrefs()), []);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...p, ...patch };
    setP(next);
    savePrefs(next);
    if (patch.theme) applyTheme(patch.theme);
    setWiped(false);
  };

  return (
    <AppShell title="Settings">
      <div className="stack" style={{ ["--gap" as string]: "22px" }}>
        <ul className="list">
          <li>
            <h3>Default session length</h3>
            <Choice label="Default session length" value={p.seconds} onChange={(v) => update({ seconds: v })} options={[{ v: 30, label: "30 sec" }, { v: 120, label: "2 min" }, { v: 300, label: "5 min" }]} />
          </li>
          <li>
            <h3>AI preference</h3>
            <p className="faint" style={{ marginBottom: 10 }}>Which response is highlighted first. You always choose; nothing is sent unless you do.</p>
            <Choice label="AI preference" value={p.aiDefault} onChange={(v) => update({ aiDefault: v })} options={[{ v: "listen", label: "Just listen" }, { v: "perspective", label: "Perspective" }, { v: "think", label: "Think" }, { v: "calm", label: "Calm down" }]} />
          </li>
          <li>
            <h3>Language</h3>
            <p className="faint" style={{ marginBottom: 10 }}>Speak naturally — English, Hindi, Gujarati or a mix are detected automatically. Set a hint only if detection struggles.</p>
            <Choice label="Language hint" value={p.langHint} onChange={(v) => update({ langHint: v })} options={[{ v: "", label: "Automatic" }, { v: "en", label: "English" }, { v: "hi", label: "हिन्दी" }, { v: "gu", label: "ગુજરાતી" }]} />
          </li>
          <li className="row">
            <div>
              <h3 style={{ marginBottom: 2 }}>Ask how I feel</h3>
              <p className="faint">Optional 1–10 check before and after.</p>
            </div>
            <span className="spacer" />
            <Switch label="Ask how I feel" on={p.askMood} onChange={(v) => update({ askMood: v })} />
          </li>
          <li>
            <h3>Appearance</h3>
            <Choice label="Appearance" value={p.theme} onChange={(v) => update({ theme: v })} options={[{ v: "system", label: "System" }, { v: "light", label: "Light" }, { v: "dark", label: "Dark" }]} />
          </li>
        </ul>

        <ul className="list" aria-label="Privacy and data">
          <li className="row">
            <div>
              <h3 style={{ marginBottom: 2 }}>Private insights</h3>
              <p className="faint">Keep the date, length and mood numbers of each release on this device only. Never your words.</p>
            </div>
            <span className="spacer" />
            <Switch label="Private insights" on={p.keepInsights} onChange={(v) => update({ keepInsights: v })} />
          </li>
          <li>
            <h3>Data &amp; deletion</h3>
            <p className="faint" style={{ marginBottom: 10 }}>Removes your settings and any mood history from this device. There is nothing about you on our servers to delete.</p>
            <button
              className="btn"
              onClick={() => {
                if (!window.confirm("Erase all settings and history on this device?")) return;
                wipeLocal();
                setP(DEFAULT_PREFS);
                applyTheme("system");
                setWiped(true);
              }}
            >
              Erase everything on this device
            </button>
            {wiped && <p role="status" className="faint" style={{ marginTop: 8 }}>Erased.</p>}
          </li>
          <li><Link href="/privacy">How privacy works →</Link></li>
          <li><Link href="/safety">Safety &amp; support →</Link></li>
        </ul>

        <ul className="list" aria-label="Coming later">
          <li>
            <h3>Reminders <span className="tag">Coming soon</span></h3>
            <p className="faint">Optional gentle morning or night check-ins. Off by default, never more than once a day.</p>
          </li>
          <li>
            <h3>Pro <span className="tag">Coming soon</span></h3>
            <p className="faint">Longer sessions, more replies and cross-device insights, about ₹149–199/month. Paid by you — never by advertisers.</p>
          </li>
          <li>
            <h3>About</h3>
            <p className="faint">Speak. Release. Gone. — a private room to say it and leave lighter. Not therapy, not emergency care. Version 0.1 (MVP).</p>
          </li>
        </ul>
      </div>
    </AppShell>
  );
}
