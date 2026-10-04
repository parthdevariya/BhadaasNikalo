import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnthropicLlm, OpenAICompatibleLlm } from "@/lib/providers/llm";
import { OpenAICompatibleStt, ProviderError } from "@/lib/providers/stt";

interface Captured {
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}

let server: Server;
let base = "";
let last: Captured | null = null;
let nextStatus = 200;
let nextBody: unknown = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      last = { url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("latin1") };
      res.writeHead(nextStatus, { "content-type": "application/json" });
      res.end(JSON.stringify(nextBody));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("OpenAI-compatible STT adapter", () => {
  it("sends multipart audio with auto language detection and parses the result", async () => {
    nextStatus = 200;
    nextBody = { text: " aaj ka din bahut lamba tha ", language: "hindi" };
    const stt = new OpenAICompatibleStt(`${base}/v1`, "sk-test", "whisper-1");
    const audio = Buffer.alloc(2048, 7);
    const r = await stt.transcribe({ audio, mimeType: "audio/webm" });
    expect(r).toEqual({ text: "aaj ka din bahut lamba tha", language: "hindi" });
    expect(last!.url).toBe("/v1/audio/transcriptions");
    expect(last!.headers.authorization).toBe("Bearer sk-test");
    expect(last!.body).toContain('name="model"');
    expect(last!.body).not.toContain('name="language"');
  });

  it("throws a code-only error that never carries the provider's body", async () => {
    nextStatus = 500;
    nextBody = { error: "could not decode: user said <private words>" };
    const stt = new OpenAICompatibleStt(`${base}/v1`, "k", "m");
    const err = await stt.transcribe({ audio: Buffer.alloc(10), mimeType: "audio/webm" }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe("stt_http_error");
    expect(String(err.message)).not.toContain("private");
  });
});

describe("LLM adapters", () => {
  it("Anthropic adapter sends system + user and reads text blocks", async () => {
    nextStatus = 200;
    nextBody = { content: [{ type: "text", text: "You got it out." }] };
    const llm = new AnthropicLlm("ak", "claude-test", base);
    const out = await llm.complete({ system: "SYS", user: "<said>x</said>", maxTokens: 50 });
    expect(out).toBe("You got it out.");
    expect(last!.url).toBe("/v1/messages");
    expect(last!.headers["x-api-key"]).toBe("ak");
    const body = JSON.parse(last!.body);
    expect(body).toMatchObject({ model: "claude-test", system: "SYS", max_tokens: 50 });
  });

  it("OpenAI-compatible adapter asks the provider not to store the completion", async () => {
    nextStatus = 200;
    nextBody = { choices: [{ message: { content: "Okay." } }] };
    const llm = new OpenAICompatibleLlm(base, "k", "m");
    await llm.complete({ system: "S", user: "U", maxTokens: 10 });
    expect(JSON.parse(last!.body).store).toBe(false);
  });
});
