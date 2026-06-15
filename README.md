# Hidráulica de Casas · Ferramentas (SaaS)

Transforma as planilhas de dimensionamento do curso **Hidráulica de Casas** (Módulo 04)
em uma ferramenta web única, com a identidade da marca, login de aluno e histórico de cálculos.

## Status

Protótipo de referência com o **1º módulo completo**: `Tempo de Recirculação & Perda Térmica`.
Os demais módulos aparecem no dashboard como "em breve".

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (tokens da marca: `ink #21211F`, `amber #FABA0D`)
- Framer Motion (animações)
- Cálculo 100% no cliente (instantâneo); persistência local no protótipo

## Rodar

```bash
npm install
npm run dev      # http://localhost:3000
```

Login: qualquer e-mail válido entra (mock). No protótipo, "Meus Projetos" salva no `localStorage`.

## O que é mock (vira real no SaaS)

- **Auth** (`lib/auth.ts`) → Supabase Auth + tabela `alunos_autorizados` sincronizada da Hotmart.
- **Meus Projetos** (`lib/projetos.ts`) → tabela `projetos` no Supabase (`inputs`/`outputs` em jsonb).

## Correção de bug embutida

O motor (`lib/calc/recirculacao.ts`) já usa as fórmulas de resfriamento **corrigidas**
(decaem para a temperatura ambiente, não para a temperatura final) — o bug que existia
na aba `Solos` da planilha original (`C41/F41/C44/F44`).

## Estrutura

```
app/
  login/                      tela de login
  (app)/layout.tsx            shell (header + marquee de normas)
  (app)/dashboard/            grid de módulos
  (app)/modulos/recirculacao/ a calculadora completa
components/                   Brand, PipeFlow (água correndo), SaveBadge, Fields, Marquee
lib/calc/                     tables.ts (CPVC/Caleffi/solos) + recirculacao.ts (motor)
lib/auth.ts, lib/projetos.ts  mocks (Supabase no futuro)
public/brand/                 logos e ícone do brandbook
```
