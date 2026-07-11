-- Schema do banco D1 (Cloudflare) da ferramenta Hidráulica de Casas.
-- Aplicar com: npx wrangler d1 execute hidraulica-db --remote --file db/schema.sql
--
-- Segurança: o banco NUNCA é acessado direto pelo navegador — só pelas Pages
-- Functions (/functions/api/*). Leitura de PII e ações de admin exigem token
-- assinado (login com senha; hash PBKDF2 na tabela admins).

CREATE TABLE IF NOT EXISTS usuarios (
  email TEXT PRIMARY KEY,
  nome TEXT,
  primeiro_acesso TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acesso TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS acessos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  sessao TEXT NOT NULL,
  tipo TEXT NOT NULL,              -- 'login' | 'ping' (1/min com aba visível)
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS acessos_email_idx ON acessos (email, criado_em DESC);
CREATE INDEX IF NOT EXISTS acessos_criado_idx ON acessos (criado_em DESC);

CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  tipo TEXT NOT NULL,              -- 'modulo_aberto' | 'projeto_salvo' | ...
  detalhe TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS eventos_email_idx ON eventos (email, criado_em DESC);
CREATE INDEX IF NOT EXISTS eventos_tipo_idx ON eventos (tipo, detalhe);

CREATE TABLE IF NOT EXISTS projetos (
  id TEXT PRIMARY KEY,             -- mesmo id do localStorage (p_...)
  email TEXT NOT NULL,
  modulo TEXT NOT NULL,
  cliente TEXT,                    -- "pasta do cliente"; agrupa cálculos de qualquer módulo (NULL = avulso)
  nome TEXT NOT NULL,
  inputs TEXT NOT NULL,            -- JSON serializado
  criado_em INTEGER NOT NULL,      -- epoch ms (paridade com o app)
  atualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS projetos_email_idx ON projetos (email, modulo);
CREATE INDEX IF NOT EXISTS projetos_cliente_idx ON projetos (email, cliente);

CREATE TABLE IF NOT EXISTS admins (
  email TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL               -- PBKDF2-SHA256 100k iterações (base64)
);
