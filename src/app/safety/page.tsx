import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SafetyCard } from "@/components/SafetyCard";

export const metadata: Metadata = { title: "Support — Speak. Release. Gone." };

export default function SafetyPage() {
  return (
    <AppShell title="Support">
      <div className="stack" style={{ ["--gap" as string]: "20px" }}>
        <SafetyCard />
        <div className="card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>What this app is — and isn&rsquo;t</h2>
          <p className="muted">
            Speak. Release. Gone. is a private place to say what&rsquo;s on your mind. It isn&rsquo;t therapy, a
            diagnosis, or emergency care, and no one here is monitoring sessions or can send help. If you&rsquo;re in
            danger, please call the emergency number above or reach someone near you.
          </p>
        </div>
        <div className="card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>How safety works with privacy</h2>
          <p className="muted">
            When you ask for a reply, your words are checked — only in memory, for that moment — for signs that you
            might be in danger. If so, we show these resources before anything else. We keep no record of what was
            detected after your session is erased. If you choose &ldquo;No reply&rdquo;, nothing is sent, so no check
            happens — these numbers are always one tap away from every screen.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
