/**
 * Ephemeral, encrypted, in-memory session store.
 *
 * Guarantees (enforced here and covered by tests):
 *  - Nothing is written to disk. There is no persistence layer.
 *  - Transcripts are AES-256-GCM encrypted with a per-session key.
 *  - destroy() zero-fills key + ciphertext, removes the entry, and VERIFIES
 *    removal before reporting success.
 *  - A sweeper destroys sessions past their TTL even if the client never
 *    calls DELETE (tab closed, network lost, deletion request failed).
 *
 * Limitation: single process. See docs/ARCHITECTURE.md §H.5 for scaling.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import type { RiskLevel } from "../safety/detect";

interface Sealed {
  iv: Buffer;
  tag: Buffer;
  data: Buffer;
}

interface Session {
  id: string;
  key: Buffer;
  transcript: Sealed | null;
  language: string | null;
  risk: RiskLevel;
  reflections: number;
  createdAt: number;
  expiresAt: number;
}

export interface SessionView {
  id: string;
  expiresAt: number;
  hasTranscript: boolean;
  language: string | null;
  risk: RiskLevel;
  reflections: number;
}

export interface DeletionReceipt {
  deleted: boolean;
  verified: boolean;
  at: number;
}

const ID_RE = /^[A-Za-z0-9_-]{22}$/;

function seal(key: Buffer, plaintext: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), data };
}

function open(key: Buffer, s: Sealed): string {
  const decipher = createDecipheriv("aes-256-gcm", key, s.iv);
  decipher.setAuthTag(s.tag);
  return Buffer.concat([decipher.update(s.data), decipher.final()]).toString("utf8");
}

function wipe(s: Sealed | null) {
  if (!s) return;
  s.data.fill(0);
  s.iv.fill(0);
  s.tag.fill(0);
}

export class EphemeralStore {
  private sessions = new Map<string, Session>();
  private timer: NodeJS.Timeout | null = null;
  /** Count of deletions that could not be verified. Exposed for the KPI "deletion failures". */
  public deletionFailures = 0;

  constructor(
    private ttlMs: number,
    private now: () => number = Date.now,
    sweepEveryMs = 30_000,
  ) {
    if (sweepEveryMs > 0) {
      this.timer = setInterval(() => this.sweep(), sweepEveryMs);
      this.timer.unref?.();
    }
  }

  static isValidId(id: string): boolean {
    return ID_RE.test(id);
  }

  create(): SessionView {
    const id = randomBytes(16).toString("base64url"); // 22 chars, 128 bits
    const t = this.now();
    const s: Session = {
      id,
      key: randomBytes(32),
      transcript: null,
      language: null,
      risk: "none",
      reflections: 0,
      createdAt: t,
      expiresAt: t + this.ttlMs,
    };
    this.sessions.set(id, s);
    return this.view(s);
  }

  private live(id: string): Session | null {
    if (!EphemeralStore.isValidId(id)) return null;
    const s = this.sessions.get(id);
    if (!s) return null;
    if (this.now() >= s.expiresAt) {
      this.destroy(id);
      return null;
    }
    return s;
  }

  get(id: string): SessionView | null {
    const s = this.live(id);
    return s ? this.view(s) : null;
  }

  setTranscript(id: string, text: string, language: string | null, risk: RiskLevel): boolean {
    const s = this.live(id);
    if (!s) return false;
    wipe(s.transcript);
    s.transcript = seal(s.key, text);
    s.language = language;
    s.risk = risk;
    return true;
  }

  /** Decrypts for the duration of a single reflection call. Caller must not retain it. */
  readTranscript(id: string): string | null {
    const s = this.live(id);
    if (!s || !s.transcript) return null;
    return open(s.key, s.transcript);
  }

  /** Atomically reserves a reflection slot. Returns false when the cap is reached. */
  reserveReflection(id: string, max: number): boolean {
    const s = this.live(id);
    if (!s || s.reflections >= max) return false;
    s.reflections += 1;
    return true;
  }

  destroy(id: string): DeletionReceipt {
    const at = this.now();
    if (!EphemeralStore.isValidId(id)) return { deleted: false, verified: false, at };
    const s = this.sessions.get(id);
    if (!s) {
      // Idempotent: already gone (deleted earlier, or TTL-swept). That is verified absence.
      return { deleted: true, verified: true, at };
    }
    try {
      wipe(s.transcript);
      s.transcript = null;
      s.key.fill(0);
      this.sessions.delete(id);
    } catch {
      // fall through to verification
    }
    const verified = !this.sessions.has(id) && isZero(s.key);
    if (!verified) this.deletionFailures += 1;
    return { deleted: verified, verified, at };
  }

  sweep(): number {
    const t = this.now();
    let n = 0;
    for (const [id, s] of this.sessions) {
      if (t >= s.expiresAt) {
        this.destroy(id);
        n++;
      }
    }
    return n;
  }

  size(): number {
    return this.sessions.size;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private view(s: Session): SessionView {
    return {
      id: s.id,
      expiresAt: s.expiresAt,
      hasTranscript: s.transcript !== null,
      language: s.language,
      risk: s.risk,
      reflections: s.reflections,
    };
  }
}

function isZero(b: Buffer): boolean {
  const zero = Buffer.alloc(b.length);
  return timingSafeEqual(b, zero);
}
