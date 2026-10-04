/**
 * Content-free logger.
 *
 * The only way the app writes logs. It accepts an ALLOWLIST of metadata
 * fields with primitive values; anything else is dropped. This makes it
 * structurally impossible to log a transcript, prompt, AI reply, audio,
 * IP address or session ID through this module.
 */

const ALLOWED_FIELDS = new Set([
  "route",
  "status",
  "code",
  "ms",
  "bytes",
  "provider",
  "mode",
  "risk",
  "language",
  "attempt",
  "count",
]);

const MAX_VALUE_LEN = 64;

export type LogFields = Record<string, string | number | boolean | undefined>;

export function sanitize(fields: LogFields): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(k) || v === undefined) continue;
    if (typeof v === "string") {
      // Short, code-like strings only. Anything sentence-like is dropped.
      if (v.length > MAX_VALUE_LEN || /\s/.test(v)) continue;
      out[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

type Level = "info" | "warn" | "error";

function emit(level: Level, event: string, fields: LogFields = {}) {
  if (process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...sanitize(fields) });
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  info: (event: string, f?: LogFields) => emit("info", event, f),
  warn: (event: string, f?: LogFields) => emit("warn", event, f),
  error: (event: string, f?: LogFields) => emit("error", event, f),
};
