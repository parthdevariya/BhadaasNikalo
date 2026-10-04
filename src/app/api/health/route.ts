import { config } from "@/lib/config";
import { json } from "@/lib/http";
import { getLlmProvider } from "@/lib/providers/llm";
import { getSttProvider } from "@/lib/providers/stt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function probe(fn: () => { name: string }): string {
  try {
    return fn().name;
  } catch {
    return "not_configured";
  }
}

/** Public, secret-free status. The Privacy page uses this to name the active providers. */
export async function GET() {
  return json({
    ok: true,
    demo: config.demoMode,
    stt: probe(getSttProvider),
    llm: probe(getLlmProvider),
    ttlSeconds: config.sessionTtlSeconds,
    maxSessionSeconds: config.maxSessionSeconds,
  });
}
