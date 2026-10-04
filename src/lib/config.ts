/**
 * Server-only configuration. Never import this from a client component:
 * it reads secrets from process.env.
 */
if (typeof window !== "undefined") {
  throw new Error("lib/config is server-only");
}

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

export type SttProviderName = "openai-compatible" | "sarvam" | "mock";
export type LlmProviderName = "anthropic" | "openai-compatible" | "mock";

export const config = {
  demoMode: bool("DEMO_MODE"),
  sessionTtlSeconds: int("SESSION_TTL_SECONDS", 900, 60, 3600),
  maxAudioBytes: int("MAX_AUDIO_BYTES", 6 * 1024 * 1024, 64 * 1024, 25 * 1024 * 1024),
  maxSessionSeconds: int("MAX_SESSION_SECONDS", 300, 30, 600),
  maxReflectionsPerSession: int("MAX_REFLECTIONS_PER_SESSION", 3, 0, 10),
  rateLimitPerMinute: int("RATE_LIMIT_PER_MINUTE", 20, 1, 1000),
  country: process.env.SAFETY_COUNTRY ?? "IN",

  stt: {
    provider: (process.env.STT_PROVIDER ?? "mock") as SttProviderName,
    baseUrl: process.env.STT_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.STT_API_KEY ?? "",
    model: process.env.STT_MODEL ?? "whisper-1",
  },
  llm: {
    provider: (process.env.LLM_PROVIDER ?? "mock") as LlmProviderName,
    baseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY ?? "",
    model: process.env.LLM_MODEL ?? "",
  },
} as const;
