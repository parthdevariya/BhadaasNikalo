/**
 * LLM provider abstraction.
 *
 * Integration points (LLM_PROVIDER):
 *  - "anthropic": Anthropic Messages API. Set LLM_MODEL (e.g. a Claude Haiku model
 *       for low cost/latency).
 *  - "openai-compatible": POST {base}/chat/completions — OpenAI, Azure, or a
 *       self-hosted vLLM / Ollama / llama.cpp server.
 *  - "mock": DEMO ONLY, refuses to run unless DEMO_MODE=true.
 *
 * Implementations must never log prompts, replies or provider error bodies.
 */
import { config } from "../config";
import { ProviderError } from "./stt";
import type { ReflectMode } from "../ai/prompts";

export interface LlmInput {
  system: string;
  user: string;
  maxTokens: number;
  /** Only used by the mock to vary output. */
  mode?: ReflectMode;
}

export interface LlmProvider {
  readonly name: string;
  complete(input: LlmInput): Promise<string>;
}

export class AnthropicLlm implements LlmProvider {
  readonly name = "anthropic";
  constructor(private apiKey: string, private model: string, private baseUrl = "https://api.anthropic.com") {}

  async complete({ system, user, maxTokens }: LlmInput): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          temperature: 0.6,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new ProviderError("llm_http_error", res.status);
      const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      return (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("llm_network_error");
    }
  }
}

export class OpenAICompatibleLlm implements LlmProvider {
  readonly name = "openai-compatible";
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}

  async complete({ system, user, maxTokens }: LlmInput): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          temperature: 0.6,
          store: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new ProviderError("llm_http_error", res.status);
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return (json.choices?.[0]?.message?.content ?? "").trim();
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("llm_network_error");
    }
  }
}

/** DEMO ONLY — canned replies, does not read the transcript. */
export class MockLlm implements LlmProvider {
  readonly name = "mock";
  async complete({ mode, system }: LlmInput): Promise<string> {
    if (system.includes("SAFETY OVERRIDE")) {
      return "That sounds incredibly heavy to carry. You don't have to hold it alone — please consider reaching out to someone you trust, or to Tele-MANAS on 14416, right now.";
    }
    switch (mode) {
      case "perspective":
        return "That sounds draining. One thing worth holding onto: not being noticed isn't the same as not mattering — the effort was real even if nobody named it.";
      case "think":
        return "That sounds exhausting. If it helps to think it through: what's the one thing you most wish someone at work understood? And is there one person who might?";
      case "calm":
        return "You got it out. Let your shoulders drop. Breathe in for four… and out for six. Once more. Nothing needs solving in the next minute.";
      default:
        return "Sounds like today was really heavy. You don't need to solve it right now. You got it out.";
    }
  }
}

export function getLlmProvider(): LlmProvider {
  const { provider, baseUrl, apiKey, model } = config.llm;
  if (provider === "anthropic") {
    if (!apiKey || !model) throw new ProviderError("llm_not_configured");
    return new AnthropicLlm(apiKey, model);
  }
  if (provider === "openai-compatible") {
    if (!model || (!apiKey && !baseUrl.includes("localhost"))) throw new ProviderError("llm_not_configured");
    return new OpenAICompatibleLlm(baseUrl, apiKey, model);
  }
  if (provider === "mock" && config.demoMode) return new MockLlm();
  throw new ProviderError("llm_not_configured");
}
