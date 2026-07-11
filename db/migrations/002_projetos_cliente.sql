-- Migração: pasta por cliente em "Meus Projetos".
-- Adiciona a coluna `cliente` (agrupa cálculos de qualquer módulo sob um mesmo cliente/obra)
-- e o índice de leitura por pasta. Aditiva: cálculos existentes ficam com cliente NULL (avulsos).
--
-- Aplicar no banco remoto:
--   npx wrangler d1 execute hidraulica-db --remote --file db/migrations/002_projetos_cliente.sql

ALTER TABLE projetos ADD COLUMN cliente TEXT;
CREATE INDEX IF NOT EXISTS projetos_cliente_idx ON projetos (email, cliente);
