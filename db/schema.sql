-- ════════════════════════════════════════════════════════════════════
--  Speak. Release. Gone. — PostgreSQL schema (Phase 7+: accounts,
--  subscriptions, opt-in insights, aggregate analytics).
--
--  NOT used by the MVP core loop. The core loop has no database.
--
--  INVARIANT: no table here stores audio, transcripts, prompts, AI replies,
--  or free-text derived from them. Reviewers: reject any migration that does.
-- ════════════════════════════════════════════════════════════════════

-- 1. Optional account ------------------------------------------------
CREATE TABLE accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- opaque internal id
  email_hmac  bytea NOT NULL UNIQUE,  -- HMAC-SHA256(email, server key): lets magic-link
                                      -- login find the account without storing the email
                                      -- in plaintext. Email itself lives only in the
                                      -- transactional-mail provider for delivery.
  created_at  timestamptz NOT NULL DEFAULT now(),
  insights_opt_in boolean NOT NULL DEFAULT false,  -- explicit consent (DPDP Act)
  consent_at  timestamptz,                         -- when consent was given
  deleted_at  timestamptz                          -- soft-delete marker; hard-delete job
                                                   -- purges within 30 days
);

-- 2. Subscription ----------------------------------------------------
CREATE TABLE subscriptions (
  account_id   uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  plan         text NOT NULL CHECK (plan IN ('free','pro','pro_ai','b2b')),
  status       text NOT NULL CHECK (status IN ('active','past_due','cancelled')),
  provider     text NOT NULL CHECK (provider IN ('razorpay','stripe')),
  provider_ref text NOT NULL,          -- subscription id at the payment provider
  current_period_end timestamptz NOT NULL  -- for entitlement checks without calling provider
);

-- 3. Derived private insights (opt-in only) --------------------------
-- One row per account per day. Closed vocabulary themes; never free text.
CREATE TYPE theme AS ENUM ('work','family','relationships','health','money','study','self','other');

CREATE TABLE insight_days (
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  day             date NOT NULL,           -- day granularity only, no timestamps
  sessions        smallint NOT NULL DEFAULT 0,
  seconds_spoken  integer  NOT NULL DEFAULT 0,
  mood_before_sum smallint,                -- sums + counts allow averages without
  mood_after_sum  smallint,                --   storing each session
  mood_pairs      smallint NOT NULL DEFAULT 0,
  themes          theme[]  NOT NULL DEFAULT '{}',
  PRIMARY KEY (account_id, day)
);

-- 4. Aggregate analytics (no user or session identifiers) ------------
CREATE TABLE daily_counters (
  day    date NOT NULL,
  event  text NOT NULL CHECK (event ~ '^[a-z_]{3,40}$'),  -- e.g. session_started
  org_id uuid,                                             -- B2B only; NULL for consumers
  count  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, org_id)
);

-- 5. B2B (Phase 8) -----------------------------------------------------
CREATE TABLE orgs (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  seats integer NOT NULL,
  k_anonymity smallint NOT NULL DEFAULT 10  -- dashboards suppress any cell below k
);
-- Employees redeem a pooled code; no employee identity is linked to the org.
CREATE TABLE org_codes (
  code_hmac bytea PRIMARY KEY,
  org_id    uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  redeemed  integer NOT NULL DEFAULT 0
);
