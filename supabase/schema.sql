-- Schema da ferramenta Hidráulica de Casas (painel admin + histórico persistente).
-- Rodar uma vez no SQL Editor do projeto Supabase (ou via Management API).
--
-- Modelo de segurança:
--  * Alunos usam a ANON key (sem conta): podem só INSERIR telemetria e ler/gravar
--    projetos. NUNCA conseguem ler usuarios/acessos/eventos (PII protegida).
--  * Admins (Bruno + Ferreto) têm conta real (Supabase Auth e-mail+senha) e são os
--    únicos "authenticated" — todas as leituras do painel exigem esse papel.
--  * Signups públicos devem ficar DESABILITADOS no painel do Supabase.

-- =============================== TABELAS ===================================

create table if not exists usuarios (
  email text primary key,
  nome text,
  primeiro_acesso timestamptz not null default now(),
  ultimo_acesso timestamptz not null default now()
);

create table if not exists acessos (
  id bigint generated always as identity primary key,
  email text not null,
  sessao text not null,          -- id aleatório por sessão de navegação
  tipo text not null,            -- 'login' | 'ping' (ping = 1/min com aba visível)
  criado_em timestamptz not null default now()
);
create index if not exists acessos_email_idx on acessos (email, criado_em desc);
create index if not exists acessos_criado_idx on acessos (criado_em desc);

create table if not exists eventos (
  id bigint generated always as identity primary key,
  email text not null,
  tipo text not null,            -- 'modulo_aberto' | 'projeto_salvo' | ...
  detalhe text,                  -- ex.: slug do módulo
  criado_em timestamptz not null default now()
);
create index if not exists eventos_email_idx on eventos (email, criado_em desc);
create index if not exists eventos_tipo_idx on eventos (tipo, detalhe);

create table if not exists projetos (
  id text primary key,           -- mesmo id do localStorage (p_...)
  email text not null,
  modulo text not null,
  nome text not null,
  inputs jsonb not null,
  criado_em bigint not null,     -- epoch ms (paridade com o app)
  atualizado_em bigint not null
);
create index if not exists projetos_email_idx on projetos (email, modulo);

-- Config lida só por admin autenticado (ex.: URL+segredo do webhook de adicionar aluno)
create table if not exists config (
  chave text primary key,
  valor text not null
);

-- ================================= RLS =====================================

alter table usuarios enable row level security;
alter table acessos  enable row level security;
alter table eventos  enable row level security;
alter table projetos enable row level security;
alter table config   enable row level security;

-- Alunos (anon): gravam telemetria, não leem nada de PII.
create policy anon_upsert_usuarios on usuarios for insert to anon with check (true);
create policy anon_update_usuarios on usuarios for update to anon using (true) with check (true);
create policy anon_insert_acessos  on acessos  for insert to anon with check (true);
create policy anon_insert_eventos  on eventos  for insert to anon with check (true);

-- Projetos: aluno lê/grava (chaveado por e-mail no app; conteúdo = cálculos, baixa sensibilidade).
create policy anon_all_projetos on projetos for all to anon using (true) with check (true);

-- Admins (authenticated): leitura total para o painel.
create policy admin_select_usuarios on usuarios for select to authenticated using (true);
create policy admin_select_acessos  on acessos  for select to authenticated using (true);
create policy admin_select_eventos  on eventos  for select to authenticated using (true);
create policy admin_select_projetos on projetos for select to authenticated using (true);
create policy admin_select_config   on config   for select to authenticated using (true);
