// POST /api/admin/membros (Bearer token) {email, nome?} -> adiciona o aluno na
// planilha de compradores via webhook n8n. O segredo do webhook fica em env do
// servidor (nunca chega ao navegador).

import { json, emailValido, verificarToken } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  const admin = await verificarToken(request, env.AUTH_SECRET);
  if (!admin) return json({ erro: "não autorizado" }, 401);

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "json inválido" }, 400);
  }
  const email = String(corpo.email || "").trim().toLowerCase();
  const nome = String(corpo.nome || "").slice(0, 120);
  if (!emailValido(email)) return json({ erro: "email inválido" }, 400);

  if (!env.N8N_ADD_ALUNO_URL) {
    return json({ erro: "webhook de adicionar aluno ainda não configurado" }, 501);
  }

  const res = await fetch(env.N8N_ADD_ALUNO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.N8N_ADD_ALUNO_SECRET ? { "x-hdc-secret": env.N8N_ADD_ALUNO_SECRET } : {}),
    },
    body: JSON.stringify({ email, nome, adicionadoPor: admin }),
  });
  if (!res.ok) return json({ erro: "falha no webhook" }, 502);
  const corpoWebhook = await res.json().catch(() => ({}));
  return json({ ok: true, jaExiste: Boolean(corpoWebhook.jaExiste) });
}
