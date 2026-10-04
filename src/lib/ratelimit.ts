/**
 * In-memory fixed-window rate limiter keyed by an HMAC of the client IP.
 * The raw IP is never stored. The HMAC salt is random per process and rotates
 * every 24h, so keys cannot be linked across days or reversed.
 */
import { createHmac, randomBytes } from "node:crypto";

export class RateLimiter {
  private salt = randomBytes(32);
  private saltAt: number;
  private hits = new Map<string, { n: number; reset: number }>();

  constructor(private limit: number, private windowMs = 60_000, private now: () => number = Date.now) {
    this.saltAt = now();
  }

  private key(ip: string): string {
    const t = this.now();
    if (t - this.saltAt > 86_400_000) {
      this.salt.fill(0);
      this.salt = randomBytes(32);
      this.saltAt = t;
      this.hits.clear();
    }
    return createHmac("sha256", this.salt).update(ip).digest("base64url").slice(0, 22);
  }

  /** Returns true if the request is allowed. */
  check(ip: string, cost = 1): boolean {
    const k = this.key(ip || "unknown");
    const t = this.now();
    let e = this.hits.get(k);
    if (!e || t >= e.reset) {
      e = { n: 0, reset: t + this.windowMs };
      this.hits.set(k, e);
    }
    if (this.hits.size > 50_000) this.prune(t);
    if (e.n + cost > this.limit) return false;
    e.n += cost;
    return true;
  }

  private prune(t: number) {
    for (const [k, e] of this.hits) if (t >= e.reset) this.hits.delete(k);
  }

  /** Test helper: expose whether a raw IP string is present anywhere in memory. */
  _containsRaw(ip: string): boolean {
    return [...this.hits.keys()].some((k) => k.includes(ip));
  }
}
