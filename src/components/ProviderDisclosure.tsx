"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

const NAMES: Record<string, string> = {
  "openai-compatible": "an OpenAI-compatible service (configured by the operator)",
  sarvam: "Sarvam AI",
  anthropic: "Anthropic (Claude)",
  mock: "none — demo mode, nothing is sent anywhere",
  not_configured: "not configured",
};

/** Names the providers this server is actually configured to use. */
export function ProviderDisclosure() {
  const [h, setH] = useState<{ stt: string; llm: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.health().then(setH).catch(() => setFailed(true));
  }, []);

  return (
    <>
      <p>
        Turning speech into text, and writing a reply, are done by specialist services. Their own terms govern how long
        they keep data; we choose settings and agreements that exclude training on your content and minimise retention.
        We can&rsquo;t verify their systems from ours, so we don&rsquo;t claim &ldquo;nothing is stored anywhere&rdquo;.
      </p>
      {h ? (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>Speech to text: {NAMES[h.stt] ?? h.stt}</li>
          <li>Replies: {NAMES[h.llm] ?? h.llm}</li>
        </ul>
      ) : (
        <p className="faint">{failed ? "Couldn't load the current configuration." : "Loading current configuration…"}</p>
      )}
    </>
  );
}
