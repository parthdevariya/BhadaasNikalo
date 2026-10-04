import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { clientIp, err, json, limiter, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { store } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create an anonymous, ephemeral session. No identity, no cookies. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return err("bad_origin", 403);
  if (!limiter.check(clientIp(req))) return err("rate_limited", 429);

  const s = store.create();
  log.info("session_created", { route: "session", count: store.size() });
  return json({
    id: s.id,
    expiresAt: s.expiresAt,
    maxSeconds: config.maxSessionSeconds,
    demo: config.demoMode && (config.stt.provider === "mock" || config.llm.provider === "mock"),
  });
}
