// /api/projetos — sincronização do "Meus Projetos".
//  GET  ?email=...            -> lista os projetos do e-mail
//  POST {op:'upsert', email, projeto{...}} | {op:'excluir', id}

import { json, emailValido } from "./_utils.js";

export async function onRequestGet({ request, env }) {
  const email = (new URL(request.url).searchParams.get("email") || "").trim().toLowerCase();
  if (!emailValido(email)) return json({ erro: "email inválido" }, 400);
  const { results } = await env.DB.prepare(
    `SELECT id, modulo, cliente, nome, inputs, criado_em, atualizado_em FROM projetos WHERE email = ?1`
  ).bind(email).all();
  return json(
    (results || []).map((r) => ({
      id: r.id,
      modulo: r.modulo,
      cliente: r.cliente || undefined,
      nome: r.nome,
      inputs: JSON.parse(r.inputs),
      criadoEm: Number(r.criado_em),
      atualizadoEm: Number(r.atualizado_em),
    }))
  );
}

export async function onRequestPost({ request, env }) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "json inválido" }, 400);
  }

  if (corpo.op === "excluir") {
    const id = String(corpo.id || "").slice(0, 80);
    if (!id) return json({ erro: "id obrigatório" }, 400);
    await env.DB.prepare(`DELETE FROM projetos WHERE id = ?1`).bind(id).run();
    return new Response(null, { status: 204 });
  }

  if (corpo.op === "upsert") {
    const email = String(corpo.email || "").trim().toLowerCase();
    const p = corpo.projeto || {};
    if (!emailValido(email) || !p.id || !p.modulo) return json({ erro: "dados inválidos" }, 400);
    const inputs = JSON.stringify(p.inputs ?? {});
    if (inputs.length > 200_000) return json({ erro: "projeto grande demais" }, 413);
    const cliente = String(p.cliente || "").slice(0, 120);
    await env.DB.prepare(
      `INSERT INTO projetos (id, email, modulo, cliente, nome, inputs, criado_em, atualizado_em)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(id) DO UPDATE SET cliente = ?4, nome = ?5, inputs = ?6, atualizado_em = ?8`
    ).bind(
      String(p.id).slice(0, 80), email, String(p.modulo).slice(0, 60), cliente,
      String(p.nome || "Sem nome").slice(0, 200), inputs,
      Number(p.criadoEm) || Date.now(), Number(p.atualizadoEm) || Date.now()
    ).run();
    return new Response(null, { status: 204 });
  }

  return json({ erro: "op desconhecida" }, 400);
}
