import { NextRequest } from "next/server";
import { z } from "zod";
import { buildPrompt, isIntent, isReflectMode, postProcess } from "@/lib/ai/prompts";
import { config } from "@/lib/config";
import { clientIp, err, json, limiter, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { getLlmProvider } from "@/lib/providers/llm";
import { ProviderError } from "@/lib/providers/stt";
import { store } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  mode: z.string().refine(isReflectMode),
  intent: z.string().refine(isIntent).optional(),
});

const FALLBACK_HIGH =
  "That sounds really heavy to carry. You don't have to handle it alone — please reach out to someone you trust, or use one of the numbers below.";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const started = Date.now();
  if (!sameOrigin(req)) return err("bad_origin", 403);
  if (!limiter.check(clientIp(req))) return err("rate_limited", 429);

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return err("invalid_request", 400);
  }
  const mode = parsed.mode as Parameters<typeof buildPrompt>[0];

  const session = store.get(params.id);
  if (!session) return err("session_expired", 404);
  if (!session.hasTranscript) return err("nothing_to_reflect", 409);
  if (!store.reserveReflection(params.id, config.maxReflectionsPerSession)) return err("reflection_limit", 429);

  let transcript = store.readTranscript(params.id);
  if (!transcript) return err("session_expired", 404);

  try {
    const llm = getLlmProvider();
    const { system, user } = buildPrompt(mode, transcript, session.risk, parsed.intent as Parameters<typeof buildPrompt>[3]);
    transcript = null; // drop our reference; prompt strings go out of scope at return
    const raw = await llm.complete({ system, user, maxTokens: 220, mode });
    const reply = postProcess(raw) || (session.risk === "high" ? FALLBACK_HIGH : "");
    if (!reply) return err("ai_unavailable", 502);

    log.info("reflection_done", { route: "reflect", mode, provider: llm.name, risk: session.risk, ms: Date.now() - started });
    return json({ reply, risk: session.risk, remaining: config.maxReflectionsPerSession - session.reflections - 1 });
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : "ai_unavailable";
    log.error("reflection_failed", { route: "reflect", code, ms: Date.now() - started });
    // In a high-risk session we still return a safe human message rather than an error.
    if (session.risk === "high") return json({ reply: FALLBACK_HIGH, risk: "high", remaining: 0 });
    return err("ai_unavailable", 502);
  }
}
