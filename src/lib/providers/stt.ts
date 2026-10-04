/**
 * Speech-to-text provider abstraction.
 *
 * Integration points (pick one with STT_PROVIDER):
 *  - "openai-compatible": any server exposing POST {base}/audio/transcriptions
 *       (OpenAI Whisper API, Groq, Azure OpenAI, or a SELF-HOSTED
 *        faster-whisper / whisper.cpp server — the most private option).
 *  - "sarvam": Sarvam AI speech-to-text, strong on Indic + code-mixed speech.
 *       Verify endpoint/model names against Sarvam's current docs before launch.
 *  - "mock": DEMO ONLY. Refuses to run unless DEMO_MODE=true. The UI shows a
 *       demo banner whenever this is active.
 *
 * Rules for implementations:
 *  - Never log the audio, the response body, or provider error messages
 *    (they can echo content). Throw ProviderError with a code only.
 *  - Never ask the provider to store or train on data (send opt-out headers
 *    where the provider supports them; ZDR is a contract matter).
 */
import { config } from "../config";

export interface SttInput {
  audio: Buffer;
  mimeType: string;
  languageHint?: string | null;
}

export interface SttResult {
  text: string;
  language: string | null;
}

export interface SttProvider {
  readonly name: string;
  transcribe(input: SttInput): Promise<SttResult>;
}

export class ProviderError extends Error {
  constructor(public code: string, public status?: number) {
    super(code);
    this.name = "ProviderError";
  }
}

function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "mp4";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

/** Copy into a fresh ArrayBuffer for Blob; caller zero-fills both afterwards. */
function toBlob(audio: Buffer, mimeType: string): { blob: Blob; scratch: Uint8Array } {
  const scratch = new Uint8Array(audio.length);
  scratch.set(audio);
  return { blob: new Blob([scratch], { type: mimeType }), scratch };
}

export class OpenAICompatibleStt implements SttProvider {
  readonly name = "openai-compatible";
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}

  async transcribe({ audio, mimeType, languageHint }: SttInput): Promise<SttResult> {
    const { blob, scratch } = toBlob(audio, mimeType);
    try {
      const form = new FormData();
      form.append("file", blob, `speech.${extFor(mimeType)}`);
      form.append("model", this.model);
      form.append("response_format", "verbose_json");
      // No forced language: auto-detect handles Hindi/Gujarati/English/code-mixed.
      if (languageHint && /^[a-z]{2}$/.test(languageHint)) form.append("language", languageHint);

      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new ProviderError("stt_http_error", res.status);
      const json = (await res.json()) as { text?: string; language?: string };
      return { text: (json.text ?? "").trim(), language: json.language ?? null };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("stt_network_error");
    } finally {
      scratch.fill(0);
    }
  }
}

export class SarvamStt implements SttProvider {
  readonly name = "sarvam";
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}

  async transcribe({ audio, mimeType, languageHint }: SttInput): Promise<SttResult> {
    const { blob, scratch } = toBlob(audio, mimeType);
    try {
      const form = new FormData();
      form.append("file", blob, `speech.${extFor(mimeType)}`);
      form.append("model", this.model);
      // "unknown" asks Sarvam to auto-detect; a hint like "hi-IN"/"gu-IN" narrows it.
      form.append("language_code", languageHint && /^[a-z]{2}-IN$/.test(languageHint) ? languageHint : "unknown");

      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/speech-to-text`, {
        method: "POST",
        headers: { "api-subscription-key": this.apiKey },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new ProviderError("stt_http_error", res.status);
      const json = (await res.json()) as { transcript?: string; language_code?: string };
      return { text: (json.transcript ?? "").trim(), language: json.language_code ?? null };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("stt_network_error");
    } finally {
      scratch.fill(0);
    }
  }
}

/** DEMO ONLY — does not listen to the audio at all. */
export class MockStt implements SttProvider {
  readonly name = "mock";
  async transcribe({ audio }: SttInput): Promise<SttResult> {
    if (audio.length < 1000) return { text: "", language: null };
    return {
      text: "[demo transcript] Today was a lot. Work kept piling up and I felt like nobody noticed how hard I was trying.",
      language: "en",
    };
  }
}

export function getSttProvider(): SttProvider {
  const { provider, baseUrl, apiKey, model } = config.stt;
  if (provider === "openai-compatible") {
    if (!apiKey && !baseUrl.includes("localhost")) throw new ProviderError("stt_not_configured");
    return new OpenAICompatibleStt(baseUrl, apiKey, model);
  }
  if (provider === "sarvam") {
    if (!apiKey) throw new ProviderError("stt_not_configured");
    return new SarvamStt(baseUrl === "https://api.openai.com/v1" ? "https://api.sarvam.ai" : baseUrl, apiKey, model === "whisper-1" ? "saarika:v2.5" : model);
  }
  if (provider === "mock" && config.demoMode) return new MockStt();
  throw new ProviderError("stt_not_configured");
}
