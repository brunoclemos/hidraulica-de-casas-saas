// POST /api/telemetria — registra login, ping (tempo na plataforma) ou evento de uso.
// Chamado pelo app do aluno (fire-and-forget). Grava e responde 204.

import { json, emailValido } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "json inválido" }, 400);
  }
  const acao = String(corpo.acao || "");
  const email = String(corpo.email || "").trim().toLowerCase();
  if (!emailValido(email)) return json({ erro: "email inválido" }, 400);
  const sessao = String(corpo.sessao || "").slice(0, 64) || "sem-sessao";

  if (acao === "login") {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO usuarios (email, ultimo_acesso) VALUES (?1, datetime('now'))
         ON CONFLICT(email) DO UPDATE SET ultimo_acesso = datetime('now')`
      ).bind(email),
      env.DB.prepare(`INSERT INTO acessos (email, sessao, tipo) VALUES (?1, ?2, 'login')`).bind(email, sessao),
    ]);
    return new Response(null, { status: 204 });
  }
  if (acao === "ping") {
    await env.DB.prepare(`INSERT INTO acessos (email, sessao, tipo) VALUES (?1, ?2, 'ping')`)
      .bind(email, sessao).run();
    return new Response(null, { status: 204 });
  }
  if (acao === "evento") {
    const tipo = String(corpo.tipo || "").slice(0, 60);
    if (!tipo) return json({ erro: "tipo obrigatório" }, 400);
    const detalhe = corpo.detalhe ? String(corpo.detalhe).slice(0, 120) : null;
    await env.DB.prepare(`INSERT INTO eventos (email, tipo, detalhe) VALUES (?1, ?2, ?3)`)
      .bind(email, tipo, detalhe).run();
    return new Response(null, { status: 204 });
  }
  return json({ erro: "acao desconhecida" }, 400);
}
