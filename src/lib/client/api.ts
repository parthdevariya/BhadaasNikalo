"use client";
/** Thin client for the session API. Holds no state of its own. */

export class ApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, cache: "no-store", credentials: "omit" });
  } catch {
    throw new ApiError(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "network", 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const code = (body as { error?: string } | null)?.error ?? "unknown";
    throw Object.assign(new ApiError(code, res.status), { body });
  }
  return body as T;
}

export interface CreatedSession {
  id: string;
  expiresAt: number;
  maxSeconds: number;
  demo: boolean;
}
export type Risk = "none" | "elevated" | "high";

export const api = {
  create: () => call<CreatedSession>("/api/session", { method: "POST" }),

  upload: (id: string, audio: Blob, langHint?: string | null) =>
    call<{ ok: true; empty: boolean; language: string | null; risk: Risk }>(`/api/session/${id}/audio`, {
      method: "POST",
      body: audio,
      headers: {
        "content-type": audio.type || "audio/webm",
        ...(langHint ? { "x-lang-hint": langHint } : {}),
      },
    }),

  reflect: (id: string, mode: string, intent?: string | null) =>
    call<{ reply: string; risk: Risk; remaining: number }>(`/api/session/${id}/reflect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, ...(intent ? { intent } : {}) }),
    }),

  destroy: (id: string) =>
    call<{ deleted: boolean; verified: boolean; at: number }>(`/api/session/${id}`, { method: "DELETE" }),

  /** Fire-and-forget deletion that survives page unload. */
  destroyOnUnload: (id: string) => {
    try {
      void fetch(`/api/session/${id}`, { method: "DELETE", keepalive: true, credentials: "omit" });
    } catch {
      /* TTL sweeper is the backstop */
    }
  },

  health: () => call<{ ok: boolean; demo: boolean; stt: string; llm: string; ttlSeconds: number }>("/api/health", { method: "GET" }),
};

/** Delete with exponential backoff. Resolves to the final verified state. */
export async function destroyWithRetry(id: string, tries = 3): Promise<"deleted" | "unconfirmed"> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await api.destroy(id);
      if (r.verified) return "deleted";
    } catch (e) {
      // 400 invalid_id means there is nothing to delete under that id.
      if (e instanceof ApiError && e.status === 400) return "deleted";
    }
    await new Promise((r) => setTimeout(r, 600 * 2 ** i));
  }
  return "unconfirmed";
}
