# Speak. Release. Gone. — Architecture & MVP Plan

> Principle: **build a relief loop, not a dopamine loop.**
> Rule: **no privacy claim ships unless the code below actually enforces it.**

This document answers A–K from the brief, plus the mandatory pre-build questions (where voice data exists, for how long, how deletion works, risks, mitigations).

---

## 0. Data inventory — what can technically exist

Every piece of data the system could touch, where it lives in **this** MVP, and its lifetime.

| Data | Exists? | Where | Max lifetime | Persisted to disk? |
|---|---|---|---|---|
| Raw audio (mic) | Yes | Browser memory (MediaRecorder Blob) | If the user picks **"No reply"**: discarded on device, **never uploaded**. Otherwise until upload completes; references dropped immediately | No |
| Audio in transit | Yes | TLS between browser → our server → STT provider | Request duration | No |
| Audio on our server | Yes | Node process memory (Buffer) inside the request handler | Request duration (seconds). Buffer is zero-filled after STT returns | **No** — never written to disk, temp dir, or object storage |
| Audio at STT provider | Yes, if a cloud STT is configured | Provider infrastructure | **Provider-dependent** — see §H.4 | Provider-dependent |
| Transcript | Yes | Server memory, **AES-256-GCM encrypted** in the ephemeral session store | Until session end, or TTL (default 15 min), whichever first | No |
| Transcript in browser | **No** by default | — | — | — |
| AI prompt / response | Yes, if user asks for a reflection | Server memory (prompt built per request); response sent to browser and held in React state | Prompt: request duration. Response: until the tab leaves the session screen | No |
| AI prompt at LLM provider | Yes, if cloud LLM configured | Provider | Provider-dependent — see §H.4 | Provider-dependent |
| Safety flag | Yes | Session memory (`risk: none|elevated|high`) | Same as session | No |
| Session ID | Yes | Random 128-bit, server memory + browser state | Same as session | No |
| Session encryption key | Yes | Per-session random key, server memory only | Same as session; key buffer zero-filled on delete | No |
| IP address | Yes (unavoidable for TCP) | Rate-limiter memory, **stored only as salted HMAC** with a daily-rotating in-memory salt | 1 min window; salt rotates every 24h and is never persisted | No |
| Device identifiers | **No** | We do not fingerprint, set tracking cookies, or read device IDs | — | — |
| WebRTC/TURN metadata | **No** | MVP uses HTTPS upload, not WebRTC (see §F rationale) | — | — |
| Server logs | Yes | stdout via `lib/log.ts` | Host log retention | Yes (host) — **contain no content**: only event name, session-free route, status, duration, error code |
| Error logs | Yes | Same logger | Same | Error *messages* are replaced with error *codes*; provider error bodies are never logged (they can echo input) |
| Analytics | Minimal, first-party, opt-in | Browser `localStorage` only in MVP (counts, durations, mood) | Until user deletes | On device only |
| Private insights (derived) | Opt-in | Browser `localStorage` (MVP); Postgres (Phase 7, accounts) | Until user deletes | On device in MVP |
| Backups | **No content** | Only the Phase-7 Postgres tables are backed up; they never contain audio/transcripts | Backup policy | — |
| Third-party API logs | Possible | STT/LLM vendors | Vendor contract | See §H.4 |
| CDN / reverse-proxy logs | Possible | Hosting provider (Vercel/Cloudflare/etc.) | Host policy | Request lines only — **we never put content in URLs**; audio and text travel only in POST bodies |

Consequence for copy: the app may say **"Your temporary session data has been deleted from our servers"** only after `DELETE /api/session/:id` returns `verified: true`. It may *not* say "nothing is ever stored anywhere" — provider retention is a contract, not something our code proves. The Privacy screen states this plainly.

---

## A. Product architecture

```
┌──────────────────────────── Browser (Next.js client) ────────────────────────────┐
│ Landing  ·  /speak flow (state machine)  ·  /insights  ·  /settings  ·  /privacy │
│ MediaRecorder → Blob ──POST (TLS)──►            local-only: prefs, mood history  │
└───────────────────────────────────────────┬──────────────────────────────────────┘
                                            │ HTTPS, same-origin, no cookies
┌───────────────────────────── Next.js route handlers (Node) ──────────────────────┐
│ /api/session          create ephemeral session (no identity)                     │
│ /api/session/:id/audio  audio → STT provider → safety scan → encrypt transcript  │
│ /api/session/:id/reflect  decrypt → LLM provider (mode prompt) → reply           │
│ /api/session/:id  DELETE  wipe key + ciphertext, verify, return receipt          │
│ /api/health                                                                       │
│                                                                                   │
│ lib/session/store  (encrypted, TTL-swept, in-memory)                              │
│ lib/providers/stt  (openai-compatible | sarvam | mock)                            │
│ lib/providers/llm  (anthropic | openai-compatible | mock)                         │
│ lib/safety  (fast multilingual detector + resources)                              │
│ lib/ratelimit (HMAC'd IP, in-memory)   lib/log (content-free logger)              │
└───────────────────────────────────────────────────────────────────────────────────┘
        │                                   │
   STT vendor (ZDR)                    LLM vendor (ZDR)          Postgres: Phase 7 only,
                                                                 never content
```

Key decisions
- **No account for the core loop.** Session IDs are random and unlinkable.
- **No database in the core loop.** Postgres arrives with accounts/subscriptions (Phase 7) and never receives content. Schema is in `db/schema.sql`.
- **Single server process holds ephemeral state.** Horizontal scaling: swap the store for Redis with per-session encryption (key held only in the API node's memory is not enough across nodes — see §H.5).

## B. User journey

1. Land → "SPEAK. RELEASE. GONE." → **Speak now**.
2. `/speak`: greeting, "What's on your mind?", big **SPEAK** button, duration pills (30s · 2m · 5m). Mood check and mode chips are *collapsed and optional* — one tap starts recording.
3. Recording: "Let it out.", breathing waveform, countdown, **STOP**, "Your voice is being processed temporarily."
4. Processing (transcribing) — calm loader.
5. Released: "You got it out." Choice of AI response: **Just listen** (default, highlighted) · Give me perspective · Help me think · Help me calm down · **No reply, I'm done**.
   **The upload happens only now, and only if a reply is chosen.** "No reply" discards the clip in the browser; the goodbye receipt says "Nothing was sent." This is the strongest privacy property in the product: the most common use (just venting) involves zero server contact with content.
6. (If chosen) short reflection. User may switch mode once more.
7. Mood after (optional, 1–10) → private delta.
8. Goodbye ritual: "You said it. You don't need to carry it anymore." → deletion receipt (honest status).
9. Leave. No feed, no "come back" bait.

Safety branch: if the safety scan returns `high`, a calm support card appears **before** any AI reply, with Tele-MANAS / 112 and "this app isn't emergency care"; the user can still continue.

## C. Screen list

| Route | Screen | Notes |
|---|---|---|
| `/` | Landing | Hero, 7 sections, FAQ |
| `/speak` | Home + full session flow | idle → (mood/mode) → recording → processing → released → reflecting → mood-after → goodbye; plus error states |
| `/insights` | "How am I doing?" | On-device derived metrics only, opt-in |
| `/settings` | Settings | AI preference, default length, language hint, notifications (planned), subscription (planned), safety, about, delete local data |
| `/privacy` | How privacy works | What we collect · process temporarily · delete · never sell |
| `/safety` | Support resources | Always reachable |

Error states (all in `/speak`): mic permission denied, mic unavailable/unsupported, network offline, AI unavailable (graceful — release still "counts"), session expired, processing failure, **deletion failure** (no false claim; automatic retries; TTL fallback disclosed).

## D. Data model

### D.1 Ephemeral session (memory only) — `lib/session/store.ts`

| Field | Why it's needed |
|---|---|
| `id` (128-bit random, base64url) | Address the session; unguessable so no auth is needed |
| `key` (32-byte Buffer) | Per-session AES-256-GCM key; destroying it makes ciphertext unrecoverable |
| `transcript` ({iv, tag, data}) \| null | Encrypted text so a reflection can be generated after recording |
| `language` | Detected language, so the reply comes in the same language |
| `risk` (`none`/`elevated`/`high`) | Show support resources and constrain the AI; no text excerpt stored |
| `reflections` (int) | Cap AI calls per session (cost + abuse) |
| `createdAt`, `expiresAt` | TTL deletion |

No user ID, no IP, no device ID, no audio.

### D.2 Optional account (Phase 7) — `db/schema.sql`
`accounts(id uuid, email_hash, created_at, deleted_at)` — email stored as a keyed hash for login lookup; magic-link login, no passwords.

### D.3 Subscription (Phase 7)
`subscriptions(account_id, plan, status, provider, provider_ref, current_period_end)` — exactly what Razorpay/Stripe need, nothing about usage content.

### D.4 Minimal analytics
`daily_counters(day, event, count)` — aggregated server-side counters only, **no user or session ID**. In MVP: not wired; local metrics only.

### D.5 Derived private insights (opt-in)
`insight_points(account_id, day, sessions, minutes, mood_before_avg, mood_after_avg, themes text[])` — `themes` is a closed vocabulary (`work`, `family`, `health`, `money`, `relationships`, `self`, `other`) produced transiently by the LLM; never free text. MVP keeps the equivalent per-session record in `localStorage`.

## E. API architecture

| Method & path | Body | Returns | Notes |
|---|---|---|---|
| `POST /api/session` | `{}` | `{id, expiresAt, maxSeconds, demo}` | Rate-limited |
| `POST /api/session/:id/audio` | raw audio body (`audio/webm`/`ogg`/`mp4`/`wav`), `x-session-lang-hint` optional | `{ok, durationMs, language, risk, empty}` | ≤ 6 MB; never echoes transcript |
| `POST /api/session/:id/reflect` | `{mode}` | `{reply, risk}` | max 3 per session |
| `DELETE /api/session/:id` | — | `{deleted, verified, at}` | Idempotent; `verified` is checked after wipe |
| `GET /api/health` | — | `{ok, demo, stt, llm}` | No secrets |

All JSON errors: `{error: CODE}` with stable codes (`rate_limited`, `not_found`, `too_large`, `stt_failed`, `llm_unavailable`, …). Never include provider messages.

Security headers (in `next.config.mjs`): strict CSP (self only + `blob:` for media), `Permissions-Policy: microphone=(self)`, HSTS, `Referrer-Policy: no-referrer`, `X-Content-Type-Options`, frame denial.

## F. Voice-processing architecture

**Why HTTPS upload, not WebRTC, for the MVP:** WebRTC needs STUN/TURN servers which see IP/session metadata and would add another party to the data inventory. A 30 s–5 min clip uploaded once over TLS has fewer moving parts and a provable lifetime. Streaming (WebSocket → streaming STT) is Phase 4b for live captions/real-time safety.

Flow:
1. `getUserMedia({audio: {echoCancellation, noiseSuppression}})` → `MediaRecorder` (opus/webm, mp4 on Safari) at 32 kbps → ~1.2 MB for 5 min.
2. Timer auto-stops at the chosen length. Tracks are stopped immediately (mic light off).
3. Blob is POSTed; client drops all references (`chunks.length = 0`, `blob = null`).
4. Server reads the body into a Buffer (size-capped while streaming), calls STT, then **`buffer.fill(0)`** in a `finally` block.
5. Transcript → safety scan → AES-GCM encrypt → store. Plain transcript variable goes out of scope.

Multilingual: STT is called **without a forced language** (auto-detect) so English, Hindi, Gujarati, Hinglish and code-mixed speech work without a picker. Optional language hint from Settings. Recommended STT for India: Sarvam (`saarika`, strong on code-mixed Indic) or Whisper-large-v3 (self-hosted via an OpenAI-compatible server for full control). The reply is generated in the same language/script the user used.

## G. AI architecture

- `LLMProvider.complete({system, user, maxTokens})` interface; implementations: Anthropic Messages API, any OpenAI-compatible endpoint (OpenAI, Azure, self-hosted vLLM/Ollama), and a **Mock** that is only available when `DEMO_MODE=true` and labels itself in the UI.
- One shared **base system prompt** (calm, brief, no diagnosis, no dependency language, no "I'm always here", no emojis, same language as user, ≤ 70 words) + a **mode prompt**:
  - *Just listen*: acknowledge, reflect feeling, no advice, no questions required.
  - *Perspective*: one gentle reframe, one alternative view.
  - *Help me think*: 2–3 clarifying questions or one small next step.
  - *Calm down*: one simple grounding/breathing suggestion, short sentences.
- If `risk=high`, the safety prompt overrides the mode: warm acknowledgement, encourage reaching a trusted person / helpline; no method discussion; no "you'll be fine".
- Transcript is wrapped in delimiters and the model is told it is content to respond to, not instructions (prompt-injection hygiene).
- Output post-filter: strip emojis, trim to limit, block dependency phrases.
- Cost control: reflections capped at 3/session; Pro gate is a config flag.

## H. Privacy architecture

1. **Ephemeral by construction:** no code path writes audio or transcripts to disk, DB, or logs. A test asserts the logger refuses content-like keys.
2. **Encryption at rest in memory:** each transcript encrypted with a per-session key; deleting the key = crypto-shredding even if a heap fragment survives.
3. **Deletion:** `destroy(id)` zero-fills key and ciphertext buffers, removes the map entry, then re-checks `has(id) === false` → `verified`. A sweeper runs every 30 s and destroys expired sessions (TTL default 15 min, max 60). Client retries `DELETE` with backoff (3 tries); if all fail, UI says: "We couldn't confirm deletion yet. Your session will be erased automatically within 15 minutes." — never "deleted".
4. **Third-party providers** — the honest part:
   - Use vendors' zero-data-retention / no-training settings (e.g., Anthropic: API data is not used for training by default and ZDR is available by agreement; OpenAI: API data not used for training by default, ZDR on request; Sarvam: confirm in DPA). **Verify current terms before launch** — they change.
   - The UI Privacy screen names the configured providers (from `/api/health`) and says their retention is governed by their terms.
   - The strongest option: self-host Whisper and an open LLM → then "never leaves our infrastructure" becomes a true claim.
5. **Scaling caveat:** in-memory store is single-instance. For multiple instances use Redis with `EXPIRE`, AOF/RDB persistence **disabled**, TLS, and envelope-encryption with keys held by the API process — or sticky sessions.
6. **No third-party scripts:** fonts are self-hosted at build time via `next/font`; no analytics SDKs; CSP blocks external hosts.
7. **DPDP Act 2023 (India):** minimal collection, purpose limitation, consent for insights, easy erasure. Phase 7 adds a consent log and grievance contact.
8. **Auditability:** data inventory (§0) is versioned in repo; `npm test` includes privacy invariants; a future `/transparency` page can publish deletion-failure counts.

## I. Safety architecture

- **Detection runs on the transcript in memory**, synchronously, before any reply. Two tiers:
  1. Fast lexical detector (English + Hindi/Hinglish romanised + Devanagari + Gujarati) with negation-aware scoring → `none | elevated | high`. Ordinary sadness ("I'm so tired of this week") stays `none`.
  2. (Phase 4b, planned) LLM classifier call with a constrained JSON output, layered on the lexical tier. Not in this MVP.
- **Response:** `high` → support card (not a modal wall): "It sounds like you're carrying something really heavy. You don't have to handle it alone." + Tele-MANAS **14416** (24×7, free, multilingual) and **112** for emergencies, "This app isn't emergency care." `elevated` → AI reply leans toward suggesting a trusted person, gentle resources link shown.
- **Trade-off, stated plainly:** detection only runs when words are processed (i.e., a reply was requested). "No reply" sessions are never seen, so cannot be checked. Mitigation: a "Need support?" link sits in the header of every app screen and the landing footer shows 14416.
- **Storage:** only the enum lives in the session; nothing is retained after deletion. No human review queue, no permanent flags. This is a deliberate trade-off: we cannot do follow-up, so the in-moment response must be good.
- Resources live in `lib/safety/resources.ts` keyed by country so other regions can be added. Verify numbers periodically.

## J. Monetization architecture

| Tier | Price (indicative) | Includes |
|---|---|---|
| Free | ₹0 | 30 s & 2 min sessions, Just Listen (limited/day), mood before/after, on-device insights |
| Pro | ₹149–199/mo | 5 min sessions, all AI modes, more reflections, cross-device derived insights (account) |
| Pro+AI test | ₹249–299/mo | Higher AI limits if cost/user requires |
| B2B | per seat/month | Anonymous access codes; employer dashboard shows **only aggregates with k-anonymity (k ≥ 10)** and differential noise; never per-person data |

Entitlements are resolved server-side from a signed token (Phase 7); the MVP has `FREE_MAX_SECONDS` and `PRO_*` config switches. Payments via Razorpay (UPI) — webhook only updates `subscriptions`.

B2B architecture: org issues pool codes → employees redeem anonymously (no email to employer) → daily aggregate counters per org with suppression below k → dashboard.

## K. Roadmap

| Phase | Deliverable | Status in this repo |
|---|---|---|
| 1 | Clickable UI | ✅ |
| 2 | Real voice recording | ✅ MediaRecorder |
| 3 | Ephemeral processing | ✅ encrypted store, TTL, verified delete |
| 4 | AI reflection | ✅ provider abstraction + 3 real adapters + labelled demo mock |
| 5 | Mood tracking | ✅ on-device |
| 6 | Privacy controls | ✅ privacy page, local-data wipe, provider disclosure |
| 7 | Accounts + subscription | 📐 schema + integration points only |
| 8 | B2B | 📐 design only |

### KPI dashboard (Phase 7, computed from aggregate counters only)
Activation (landing → first SPEAK), first-session completion, sessions/user/week (account users only), avg duration, mood delta, D1/D7/D30 (account users; anonymous users measured via aggregate cohort counters, not IDs), AI usage, Free→Pro, MRR, AI cost/user, gross margin, B2B revenue, privacy complaints, **deletion failures** (counter incremented in `destroy()` failure path).

## Known risks & mitigations

| Risk | Mitigation |
|---|---|
| Provider retains audio/text | ZDR contracts; disclose providers; self-host option |
| Host logs request bodies | Disable body logging; content only in POST bodies; no content in URLs/headers |
| Process crash dumps heap | Disable core dumps (`ulimit -c 0`); transcripts encrypted with per-session key |
| Browser extensions read the page | Out of our control; transcript never rendered in DOM by default |
| Shared device: someone sees mood history | Local data is opt-in and deletable in one tap |
| Lexical safety false negatives/positives | Conservative thresholds, optional LLM classifier, resources always reachable from footer |
| Abuse/cost attacks | IP-HMAC rate limit, size caps, reflection caps |
