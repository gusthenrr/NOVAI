-- Additive migration: existing NOVAI accounts and Mercado Livre OAuth are preserved.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_policy_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS precify_email_actions (
  token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('reset','verify')), email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS novai_notification_receipts (
  key_hash TEXT PRIMARY KEY, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS precify_plans (
  code TEXT PRIMARY KEY CHECK (code IN ('free','plus','pro')),
  name TEXT NOT NULL, monthly_cents INTEGER NOT NULL CHECK(monthly_cents >= 0),
  annual_cents INTEGER NOT NULL CHECK(annual_cents >= 0),
  monthly_search_limit INTEGER, trial_days INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO precify_plans(code,name,monthly_cents,annual_cents,monthly_search_limit,trial_days)
VALUES ('free','Grátis',0,0,10,0),('plus','Plus',3190,27990,NULL,0),('pro','Pro',3490,29990,NULL,7)
ON CONFLICT(code) DO NOTHING;

CREATE TABLE IF NOT EXISTS precify_accounts (
  user_id BIGINT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  trial_started_at TIMESTAMPTZ, trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS precify_sessions (
  token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS precify_sessions_user_idx ON precify_sessions(user_id);
CREATE TABLE IF NOT EXISTS precify_consents (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL, version TEXT NOT NULL, accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,purpose,version)
);
CREATE TABLE IF NOT EXISTS precify_oauth (
  state TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ticket_hash TEXT UNIQUE NOT NULL, code_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ, consumed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS precify_monthly_usage (
  user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  month DATE NOT NULL, searches INTEGER NOT NULL DEFAULT 0 CHECK(searches >= 0),
  PRIMARY KEY(user_id,month)
);
CREATE TABLE IF NOT EXISTS precify_imports (
  id UUID PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  request_key UUID NOT NULL, url_hash TEXT NOT NULL, month DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS precify_subscriptions (
  id UUID PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES precify_plans(code),
  cycle TEXT NOT NULL CHECK(cycle IN ('monthly','annual')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), currency TEXT NOT NULL DEFAULT 'BRL',
  provider TEXT NOT NULL DEFAULT 'mercado_pago', provider_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_payment_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS precify_subscriptions_user_idx ON precify_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS precify_payments (
  provider_id TEXT PRIMARY KEY, subscription_id UUID NOT NULL REFERENCES precify_subscriptions(id),
  amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL,
  paid_at TIMESTAMPTZ, period_end TIMESTAMPTZ, provider_updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS precify_billing_events (
  id BIGSERIAL PRIMARY KEY, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL,
  request_id TEXT NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'received',
  UNIQUE(resource_type,resource_id,request_id)
);
CREATE TABLE IF NOT EXISTS precify_auth_limits (
  key_hash TEXT NOT NULL, bucket TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(key_hash,bucket)
);

-- Trial checkout uses an individual MP plan, whose hosted form collects the card.
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS provider_plan_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS precify_subscriptions_provider_plan_idx ON precify_subscriptions(provider_plan_id);
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMPTZ;
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS provider_plan_closed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS billing_consent_version TEXT;
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS billing_consent_at TIMESTAMPTZ;

-- Only hashed, short-lived, single-use Socket.IO connection tickets are stored.
CREATE TABLE IF NOT EXISTS precify_socket_tickets (
  ticket_hash TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL REFERENCES precify_sessions(token_hash) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS precify_socket_tickets_expiry_idx ON precify_socket_tickets(expires_at);

-- Claim leases prevent duplicate reconcilers across workers/deploys.
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS reconcile_after TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
ALTER TABLE precify_subscriptions ADD COLUMN IF NOT EXISTS reconcile_error TEXT;
CREATE INDEX IF NOT EXISTS precify_reconcile_due ON precify_subscriptions(reconcile_after);
