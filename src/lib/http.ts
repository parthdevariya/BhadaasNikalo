import { NextRequest, NextResponse } from "next/server";
import { config } from "./config";
import { RateLimiter } from "./ratelimit";

const g = globalThis as unknown as { __srgLimiter?: RateLimiter };
export const limiter: RateLimiter = g.__srgLimiter ?? (g.__srgLimiter = new RateLimiter(config.rateLimitPerMinute));

const NO_STORE = {
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
};

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function err(code: string, status: number): NextResponse {
  return json({ error: code }, status);
}

/** Best-effort client IP. Used ONLY as input to the HMAC'd rate limiter. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Same-origin check for state-changing requests (defence in depth vs. CSRF-ish abuse). */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients; still rate-limited
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * Reads the request body into a Buffer, aborting as soon as `max` bytes are
 * exceeded. Nothing is written to disk.
 */
export async function readCapped(req: NextRequest, max: number): Promise<Buffer | "too_large" | "empty"> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > max) return "too_large";
  if (!req.body) return "empty";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      for (const c of chunks) c.fill(0);
      return "too_large";
    }
    chunks.push(value);
  }
  if (total === 0) return "empty";
  const buf = Buffer.concat(chunks, total);
  for (const c of chunks) c.fill(0);
  return buf;
}
