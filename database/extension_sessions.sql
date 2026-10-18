-- Isolated browser extension sessions; existing NOVAI/Precify sessions unchanged.
CREATE TABLE IF NOT EXISTS extension_sessions (
 id UUID PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 auth_version INTEGER NOT NULL, generation INTEGER NOT NULL DEFAULT 0,
 refresh_hash TEXT NOT NULL, previous_hash TEXT, rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS extension_sessions_user ON extension_sessions(user_id);
CREATE TABLE IF NOT EXISTS extension_used_refresh (
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '7 days'),
 token_hash TEXT PRIMARY KEY, session_id UUID NOT NULL REFERENCES extension_sessions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS extension_oauth (
 state_hash TEXT PRIMARY KEY, session_id UUID NOT NULL REFERENCES extension_sessions(id) ON DELETE CASCADE,
 verifier TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS extension_refresh_expiry ON extension_used_refresh(expires_at);
