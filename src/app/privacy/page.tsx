import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { ProviderDisclosure } from "@/components/ProviderDisclosure";

export const metadata: Metadata = { title: "How privacy works — Speak. Release. Gone." };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="card">
    <h2 style={{ fontSize: 22, marginBottom: 10 }}>{title}</h2>
    <div className="muted stack" style={{ ["--gap" as string]: "8px" }}>{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <AppShell title="How privacy works">
      <div className="stack" style={{ ["--gap" as string]: "16px" }}>
        <p className="muted">
          Plain language, no fine print. We only describe what the system actually does.
        </p>

        <Section title="If you choose “No reply”">
          <p>Your recording stays in your browser&rsquo;s memory and is discarded when you finish. Nothing is uploaded. We never hear it.</p>
        </Section>

        <Section title="What we temporarily process (only if you ask for a reply)">
          <p>• Your recording is sent once over an encrypted connection, turned into text, and the audio is erased from our server&rsquo;s memory immediately after. It is never written to disk.</p>
          <p>• The text is kept encrypted in memory, with a key unique to your session, only so a reply can be written.</p>
          <p>• A reply is generated and shown to you. We don&rsquo;t save it.</p>
        </Section>

        <Section title="What we delete, and when">
          <p>• When you finish, we erase the session and its key, then check it&rsquo;s gone. You&rsquo;ll only see &ldquo;deleted&rdquo; if that check passed.</p>
          <p>• If you close the tab or lose connection, the session erases itself automatically after a short time limit (15 minutes by default).</p>
          <p>• There is no database of what people say. There are no backups of it, because it is never stored.</p>
        </Section>

        <Section title="What we collect">
          <p>• No account, name, email or phone number is needed.</p>
          <p>• Our server logs record technical events only (for example &ldquo;a session was deleted, 120 ms&rdquo;) — never your words, your recording or your IP address.</p>
          <p>• To prevent abuse, we briefly keep a one-way scrambled form of your connection address for one minute. It can&rsquo;t be turned back into the address.</p>
          <p>• Your settings, and your mood numbers if you turn on private insights, are saved on this device only. You can wipe them from Settings.</p>
          <p>• No ad trackers, no analytics SDKs, no third-party fonts or scripts.</p>
        </Section>

        <Section title="Partners who process your words">
          <ProviderDisclosure />
        </Section>

        <Section title="What we never do">
          <p>We never sell or share your voice, your words, or your emotional patterns. We never show ads based on what you say. There is no feed, no audience, no public profile. We don&rsquo;t monetise your words.</p>
        </Section>

        <Section title="What we can’t control">
          <p>Your device, browser extensions and network are outside our reach. If someone else uses this device, they may see your settings or mood history if you turned it on.</p>
        </Section>
      </div>
    </AppShell>
  );
}
