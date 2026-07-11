// POST /api/admin/login {email, senha} -> {token} (12h)
// Senhas na tabela admins (PBKDF2-SHA256 100k + salt). Sem conta = 401.

import { json, emailValido, hashSenha, gerarToken } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "json inválido" }, 400);
  }
  const email = String(corpo.email || "").trim().toLowerCase();
  const senha = String(corpo.senha || "");
  if (!emailValido(email) || !senha) return json({ erro: "credenciais inválidas" }, 401);

  const row = await env.DB.prepare(`SELECT salt, hash FROM admins WHERE email = ?1`).bind(email).first();
  if (!row) return json({ erro: "credenciais inválidas" }, 401);

  const hash = await hashSenha(senha, row.salt);
  if (hash !== row.hash) return json({ erro: "credenciais inválidas" }, 401);

  const token = await gerarToken(email, env.AUTH_SECRET);
  return json({ token, email });
}
