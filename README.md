# Speak. Release. Gone.

A privacy-first voice emotional-release app. Open it, press **SPEAK**, say what's on your mind, optionally get a short reply, and leave lighter. No feed, no audience, no account, no permanent voice recording.

> Build a relief loop, not a dopamine loop.

Full design (A–K, data inventory, privacy and safety architecture, roadmap, KPIs): **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## What actually works in this MVP

| Area | Status |
|---|---|
| Landing page, Speak flow, Insights, Settings, Privacy, Support | ✅ Real, responsive, mobile-first, light/dark, keyboard + screen-reader friendly |
| Voice recording | ✅ Real (`MediaRecorder`), 30 s / 2 min / 5 min, auto-stop, live waveform |
| "No reply" release | ✅ Audio never leaves the device |
| Ephemeral server sessions | ✅ In-memory, AES-256-GCM per-session key, TTL sweeper, verified deletion receipts |
| Speech-to-text | ✅ Real adapters: OpenAI-compatible (OpenAI / Groq / self-hosted Whisper) and Sarvam |
| AI reflection (4 modes) | ✅ Real adapters: Anthropic and OpenAI-compatible (incl. self-hosted vLLM/Ollama) |
| Safety layer | ✅ Multilingual (EN / Hindi / Hinglish / Gujarati) detector + India resources (Tele-MANAS 14416, 112) |
| Mood before/after, private insights | ✅ On-device only, opt-in |
| Rate limiting, CSP, security headers, content-free logs | ✅ |
| Demo mode | ✅ Mock providers, **visibly labelled** in the UI; refused unless `DEMO_MODE=true` |
| Accounts, subscriptions, B2B | 📐 Schema in `db/schema.sql`, design in docs; not wired |

## Quick start

```bash
npm install
cp .env.example .env.local      # starts in DEMO_MODE with mock providers
npm run dev                     # http://localhost:3000
```

Microphone access requires a secure context: `localhost` works; anything else must be HTTPS.

### Use real providers

```bash
# .env.local
DEMO_MODE=false

# Speech-to-text — pick one
STT_PROVIDER=openai-compatible
STT_BASE_URL=https://api.openai.com/v1      # or http://localhost:8000/v1 for self-hosted Whisper
STT_API_KEY=sk-...
STT_MODEL=whisper-1

# STT_PROVIDER=sarvam                       # strong on Indic + code-mixed speech
# STT_BASE_URL=https://api.sarvam.ai
# STT_API_KEY=...
# STT_MODEL=saarika:v2.5                    # verify current model name in Sarvam docs

# Replies — pick one
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-haiku-4-5-20251001

# LLM_PROVIDER=openai-compatible
# LLM_BASE_URL=http://localhost:11434/v1    # e.g. Ollama
# LLM_MODEL=llama3.1
```

`GET /api/health` shows which providers are active (no secrets). The Privacy page names them to users.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build and server |
| `npm test` | Unit + integration tests (41) |
| `npm run typecheck` | Strict TypeScript check |

### What the tests cover
- **store** — encryption at rest in memory, verified deletion zero-fills key + ciphertext, idempotent delete, TTL expiry and sweeping, reflection caps, malformed IDs.
- **safety** — ordinary venting and idioms stay `none` ("this traffic is killing me"); explicit risk in English / Hinglish / Devanagari / Gujarati is `high`; negation downgrades to `elevated`.
- **privacy-infra** — logger drops content, IPs and session IDs; rate limiter never holds raw IPs; prompt-injection delimiters neutralised; emoji / dependency language stripped.
- **providers** — real HTTP round-trips against a local server: request shape, auth headers, `store:false`, and errors that never carry provider bodies.

## Project structure

```
src/
  app/
    page.tsx                 landing
    speak/                   the session (home + full flow)
    insights/ settings/ privacy/ safety/
    api/
      session/route.ts               POST   create ephemeral session
      session/[id]/audio/route.ts    POST   audio → STT → safety → encrypted transcript
      session/[id]/reflect/route.ts  POST   transcript → LLM → reply
      session/[id]/route.ts          DELETE wipe + verify → receipt
      health/route.ts                GET    provider status
  components/                SpeakFlow (state machine), useRecorder, Waveform, MoodScale, SafetyCard, …
  lib/
    session/store.ts         ephemeral encrypted store  ← the core privacy guarantee
    providers/stt.ts llm.ts  provider abstraction + adapters
    safety/                  detector + crisis resources
    ai/prompts.ts            mode prompts, safety override, output filter
    ratelimit.ts log.ts http.ts config.ts
    client/                  browser API client + on-device storage
db/schema.sql                Phase 7+ schema (never stores content)
docs/ARCHITECTURE.md
tests/
```

## Deployment

**Must be a single long-running Node process** (the ephemeral store is in memory). Good fits: a VM or container (Fly.io, Railway, Render, AWS ECS/Lightsail, a DigitalOcean droplet) behind HTTPS.

```bash
npm ci && npm run build
NODE_ENV=production PORT=3000 npm start
```

Checklist before going live:
1. `DEMO_MODE=false`, real providers configured, secrets set only as server env vars.
2. HTTPS everywhere (HSTS header is already sent).
3. Run **one** instance, or move the store to Redis per `docs/ARCHITECTURE.md §H.5`.
4. Disable request-body logging at your proxy/host; disable core dumps (`ulimit -c 0`).
5. Put zero-data-retention / no-training terms in place with your STT and LLM vendors, and re-read their current policies.
6. Re-verify crisis numbers in `src/lib/safety/resources.ts`.
7. Ensure your proxy sets `x-forwarded-for` (rate limiting uses it, HMAC'd).

**Serverless (Vercel / Lambda) is not suitable as-is**: separate invocations don't share memory, so a session created in one may be missing in the next. Use Redis-backed sessions first.

## Honest limitations

- Provider retention is governed by vendor contracts; this code cannot prove what a third party does. The UI says so.
- The safety detector is lexical and conservative — a first line, not a clinical tool. It only runs when the user asks for a reply.
- Session TTL message in the UI assumes the default 15 minutes.
- Pro gating, reminders, accounts and B2B are designed but not implemented.
