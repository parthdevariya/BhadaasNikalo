import Link from "next/link";

const FAQ = [
  ["Is my voice recorded and saved?", "Your voice is recorded in your browser so you can finish speaking. If you choose “No reply”, it's discarded on your device and never sent. If you ask for a reply, it's sent once, turned into text, and the audio is erased from our server's memory straight away. We never write it to disk."],
  ["Do I need an account?", "No. Open it, speak, leave. No name, email or phone number."],
  ["Is this therapy?", "No. It's a private place to let something out. It doesn't diagnose or treat anything, and it isn't emergency care. If you're struggling, we'll point you to people who can help."],
  ["Can I speak Hindi, Gujarati or Hinglish?", "Yes. Speak however you naturally speak — mixed languages included. Replies come back in the language you used."],
  ["What happens if I close the app halfway?", "Your device asks us to erase the session immediately. If that message never arrives, the session erases itself automatically after a short time limit."],
  ["How do you make money?", "A paid plan for longer sessions and more replies, and wellness programmes for organisations. Employers never see what anyone says — only anonymous totals. We don't monetise your words."],
] as const;

export default function Landing() {
  return (
    <div className="wide land">
      <header>
        <span className="brand">Speak. Release. <b>Gone.</b></span>
        <nav className="row" aria-label="Site" style={{ gap: 16 }}>
          <Link href="/privacy" className="faint">Privacy</Link>
          <Link href="/speak" className="btn primary" style={{ minHeight: 40, padding: "8px 18px" }}>Speak now</Link>
        </nav>
      </header>

      <main id="main">
        <section className="hero">
          <h1 aria-label="Speak. Release. Gone.">
            <span>SPEAK.</span>
            <span>RELEASE.</span>
            <span>GONE.</span>
          </h1>
          <p>
            Say what&rsquo;s on your mind.
            <br />
            No post. No audience. No permanent voice recording.
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
            <Link href="/speak" className="btn primary" style={{ padding: "16px 30px", fontSize: 18 }}>🎙&nbsp; Speak now</Link>
            <a href="#privacy" className="btn">How privacy works</a>
          </div>
        </section>

        <section className="section" aria-labelledby="what">
          <p className="eyebrow">What is it?</p>
          <h2 id="what">A room where you can say it, and leave lighter.</h2>
          <div className="grid2">
            <p className="muted" style={{ fontSize: 19 }}>
              Some things don&rsquo;t need a post, a chat, or an explanation. They just need to be said out loud. Press
              one button, speak for thirty seconds or five minutes, and let it go.
            </p>
            <ul className="not-list" aria-label="What it is not">
              <li>feed</li><li>followers</li><li>likes</li><li>comments</li><li>profiles</li><li>streaks</li><li>ads</li>
            </ul>
          </div>
        </section>

        <section className="section" aria-labelledby="how">
          <p className="eyebrow">How it works</p>
          <h2 id="how">Three steps. One tap to begin.</h2>
          <div className="grid3">
            {[
              ["1", "Speak", "Tap SPEAK and say whatever is on your mind — rant, worry, idea, or something good."],
              ["2", "Release", "Stop when you're done. Ask for a short reply if you want one. Or don't."],
              ["3", "Gone", "Close the session. Your temporary data is erased, and we tell you honestly when it is."],
            ].map(([n, t, d]) => (
              <div key={n} className="card">
                <div className="step-n">{n}</div>
                <h3 style={{ fontSize: 24, marginBottom: 6 }}>{t}</h3>
                <p className="muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="privacy" aria-labelledby="priv">
          <p className="eyebrow">Privacy by design</p>
          <h2 id="priv">We built it so there&rsquo;s nothing to leak.</h2>
          <div className="grid3">
            <div className="card calm"><h3 style={{ fontSize: 20, marginBottom: 6 }}>No reply? Nothing sent.</h3><p className="muted">If you just want to say it, your recording never leaves your phone.</p></div>
            <div className="card"><h3 style={{ fontSize: 20, marginBottom: 6 }}>Never on disk</h3><p className="muted">If you ask for a reply, audio is processed in memory and erased immediately. Text is encrypted with a key that is destroyed when you finish.</p></div>
            <div className="card"><h3 style={{ fontSize: 20, marginBottom: 6 }}>Honest receipts</h3><p className="muted">We only say &ldquo;deleted&rdquo; after we&rsquo;ve checked. No account, no ad trackers, and logs that never contain your words.</p></div>
          </div>
          <p style={{ marginTop: 18 }}><Link href="/privacy">Read exactly what happens to your data →</Link></p>
        </section>

        <section className="section" aria-labelledby="ai">
          <p className="eyebrow">AI, only when you want it</p>
          <h2 id="ai">It listens first. It never lectures.</h2>
          <div className="grid2">
            <div className="card">
              <p className="faint" style={{ marginBottom: 8 }}>You said: &ldquo;I hate everything about today.&rdquo;</p>
              <p className="reply">Sounds like today was really heavy. You don&rsquo;t need to solve it right now. You got it out.</p>
            </div>
            <div className="stack muted" style={{ ["--gap" as string]: "10px" }}>
              <p><strong style={{ color: "var(--ink)" }}>Just listen</strong> — the default. A short, kind acknowledgement.</p>
              <p><strong style={{ color: "var(--ink)" }}>Give me perspective</strong> — one gentle other way to see it.</p>
              <p><strong style={{ color: "var(--ink)" }}>Help me think</strong> — a question, or a small next step.</p>
              <p><strong style={{ color: "var(--ink)" }}>Help me calm down</strong> — one minute of slowing down.</p>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="diff">
          <p className="eyebrow">Why it feels different</p>
          <h2 id="diff">A relief loop, not a dopamine loop.</h2>
          <p className="muted" style={{ fontSize: 19, maxWidth: "52ch" }}>
            Voice. Release. Anonymity. Things that disappear. Most apps want you to stay. This one wants you to leave —
            lighter than when you came in.
          </p>
        </section>

        <section className="section faq" aria-labelledby="faq">
          <p className="eyebrow">FAQ</p>
          <h2 id="faq">Questions</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>

        <section className="section center" aria-labelledby="cta">
          <h2 id="cta" style={{ margin: "0 auto 24px" }}>Something on your mind?</h2>
          <Link href="/speak" className="btn primary" style={{ padding: "16px 34px", fontSize: 18 }}>🎙&nbsp; Speak now</Link>
        </section>
      </main>

      <footer className="foot">
        <span>Speak. Release. Gone. — not therapy, not emergency care.</span>
        <span className="row" style={{ gap: 16 }}>
          <Link href="/privacy">Privacy</Link>
          <Link href="/safety">Support · 14416</Link>
        </span>
      </footer>
    </div>
  );
}
