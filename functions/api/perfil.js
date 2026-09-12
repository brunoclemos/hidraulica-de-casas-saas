// /api/perfil — perfil do escritório que personaliza o memorial de cálculo.
//  GET  ?email=...          -> perfil do e-mail (campos vazios se nunca configurou)
//  POST {email, perfil{...}} -> upsert
//
// Mesmo modelo de acesso do /api/projetos: e-mail na query/corpo, sem token. O token
// assinado do _utils.js é só das rotas de admin, que leem dados de terceiros.

import { json, emailValido } from "./_utils.js";

// Paridade com LIMITE_LOGO de lib/perfil.ts. O navegador já redimensiona a logo;
// aqui é o cinto de segurança contra um POST montado à mão.
const LIMITE_LOGO = 150_000;

export async function onRequestGet({ request, env }) {
  const email = (new URL(request.url).searchParams.get("email") || "").trim().toLowerCase();
  if (!emailValido(email)) return json({ erro: "email inválido" }, 400);
  const r = await env.DB.prepare(
    `SELECT empresa, responsavel, crea, telefone, contato, cidade, logo FROM perfis WHERE email = ?1`
  ).bind(email).first();
  // O cliente dá spread disto sobre PERFIL_VAZIO: coluna NULL tem que chegar como "".
  return json({
    empresa: r?.empresa || "",
    responsavel: r?.responsavel || "",
    crea: r?.crea || "",
    telefone: r?.telefone || "",
    contato: r?.contato || "",
    cidade: r?.cidade || "",
    logo: r?.logo || "",
  });
}

export async function onRequestPost({ request, env }) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "json inválido" }, 400);
  }

  const email = String(corpo.email || "").trim().toLowerCase();
  if (!emailValido(email)) return json({ erro: "email inválido" }, 400);

  const p = corpo.perfil;
  if (!p || typeof p !== "object") return json({ erro: "perfil obrigatório" }, 400);

  const logo = String(p.logo || "");
  if (logo.length > LIMITE_LOGO) return json({ erro: "logo grande demais" }, 413);
  if (logo !== "" && !logo.startsWith("data:image/")) {
    return json({ erro: "logo precisa ser um data URL de imagem" }, 400);
  }

  const texto = (v, max) => String(v || "").trim().slice(0, max);
  const agora = Date.now();

  await env.DB.prepare(
    `INSERT INTO perfis (email, empresa, responsavel, crea, telefone, contato, cidade, logo, atualizado_em)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT(email) DO UPDATE SET
       empresa = ?2, responsavel = ?3, crea = ?4, telefone = ?5,
       contato = ?6, cidade = ?7, logo = ?8, atualizado_em = ?9`
  ).bind(
    email,
    texto(p.empresa, 120),
    texto(p.responsavel, 120),
    texto(p.crea, 60),
    texto(p.telefone, 40),
    texto(p.contato, 160),
    texto(p.cidade, 120),
    logo,
    agora
  ).run();

  return new Response(null, { status: 204 });
}
