-- Esquema mínimo para cadastro NOVAI + OAuth Mercado Livre em modo token-only.
-- Não cria tabelas de anúncios, pedidos, mensagens, campanhas ou métricas.

CREATE TABLE IF NOT EXISTS usuarios (
    id BIGSERIAL PRIMARY KEY,
    usuario TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    modo_automatico BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verifier (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    state TEXT NOT NULL UNIQUE,
    code_verifier TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verifier_user_id_idx ON verifier(user_id);

CREATE TABLE IF NOT EXISTS contas_mercado_livre (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
    acess_token TEXT NOT NULL,
    refresh_token TEXT,
    expiracao_token TIMESTAMP NOT NULL,
    id_ml BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contas_mercado_livre IS
    'Credenciais OAuth. No modo token-only, não dispara coleta de dados da conta.';
