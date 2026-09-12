-- Perfil do escritório para o memorial de cálculo em PDF.
--
-- Cada aluno é um engenheiro que emite documento para o cliente final da obra, com
-- a própria marca. Fica no D1 e não no localStorage porque logo e CREA se configuram
-- uma vez e não podem sumir ao trocar de aparelho ou limpar o navegador.

CREATE TABLE IF NOT EXISTS perfis (
  email TEXT PRIMARY KEY,
  empresa TEXT,
  responsavel TEXT,
  crea TEXT,
  telefone TEXT,
  contato TEXT,                    -- e-mail/site impresso no documento (pode diferir do login)
  cidade TEXT,
  logo TEXT,                       -- data URL PNG/JPEG, redimensionada no navegador (teto 150 KB)
  atualizado_em INTEGER NOT NULL
);
