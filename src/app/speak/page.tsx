import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SpeakFlow } from "@/components/SpeakFlow";

export const metadata: Metadata = { title: "Speak — Speak. Release. Gone." };

export default function SpeakPage() {
  return (
    <AppShell>
      <SpeakFlow />
    </AppShell>
  );
}
