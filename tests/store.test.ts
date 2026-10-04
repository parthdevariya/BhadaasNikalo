import { describe, expect, it } from "vitest";
import { EphemeralStore } from "@/lib/session/store";

function makeStore(ttlMs = 1000) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const store = new EphemeralStore(ttlMs, clock.now, 0);
  return { store, clock };
}

describe("EphemeralStore", () => {
  it("creates unguessable 128-bit ids", () => {
    const { store } = makeStore();
    const a = store.create();
    const b = store.create();
    expect(a.id).not.toEqual(b.id);
    expect(EphemeralStore.isValidId(a.id)).toBe(true);
    expect(Buffer.from(a.id, "base64url").length).toBe(16);
  });

  it("encrypts transcripts at rest in memory and decrypts round-trip", () => {
    const { store } = makeStore();
    const { id } = store.create();
    const secret = "मुझे आज बहुت गुस्सा आया — my boss again";
    store.setTranscript(id, secret, "hi", "none");
    // The plaintext must not appear anywhere in the store's internal state.
    const internal = (store as unknown as { sessions: Map<string, { transcript: { data: Buffer } }> }).sessions.get(id)!;
    expect(internal.transcript.data.toString("utf8")).not.toContain("boss");
    expect(store.readTranscript(id)).toBe(secret);
  });

  it("destroy() wipes key + ciphertext and verifies removal", () => {
    const { store } = makeStore();
    const { id } = store.create();
    store.setTranscript(id, "something private", "en", "none");
    const internal = (store as unknown as { sessions: Map<string, { key: Buffer; transcript: { data: Buffer } }> }).sessions.get(id)!;
    const keyRef = internal.key;
    const dataRef = internal.transcript.data;

    const receipt = store.destroy(id);
    expect(receipt).toMatchObject({ deleted: true, verified: true });
    expect(store.get(id)).toBeNull();
    expect(store.readTranscript(id)).toBeNull();
    expect(keyRef.every((b) => b === 0)).toBe(true);
    expect(dataRef.every((b) => b === 0)).toBe(true);
  });

  it("destroy() is idempotent", () => {
    const { store } = makeStore();
    const { id } = store.create();
    store.destroy(id);
    expect(store.destroy(id)).toMatchObject({ deleted: true, verified: true });
  });

  it("rejects malformed ids without throwing", () => {
    const { store } = makeStore();
    expect(store.get("../../etc/passwd")).toBeNull();
    expect(store.destroy("nope")).toMatchObject({ verified: false });
  });

  it("expires sessions after TTL even if the client never deletes", () => {
    const { store, clock } = makeStore(1000);
    const { id } = store.create();
    store.setTranscript(id, "text", null, "none");
    clock.advance(999);
    expect(store.get(id)).not.toBeNull();
    clock.advance(2);
    expect(store.get(id)).toBeNull();
    expect(store.size()).toBe(0);
  });

  it("sweep() removes all expired sessions", () => {
    const { store, clock } = makeStore(1000);
    store.create();
    store.create();
    clock.advance(1001);
    const fresh = store.create();
    expect(store.sweep()).toBe(2);
    expect(store.size()).toBe(1);
    expect(store.get(fresh.id)).not.toBeNull();
  });

  it("caps reflections per session", () => {
    const { store } = makeStore();
    const { id } = store.create();
    expect(store.reserveReflection(id, 2)).toBe(true);
    expect(store.reserveReflection(id, 2)).toBe(true);
    expect(store.reserveReflection(id, 2)).toBe(false);
  });
});
