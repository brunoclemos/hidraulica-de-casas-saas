// GET /api/admin/dados (Bearer token) -> agregados prontos pro painel:
// cards, uso por ferramenta (30d) e tabela por aluno (logins/tempo/projetos).

import { json, verificarToken } from "../_utils.js";

export async function onRequestGet({ request, env }) {
  const admin = await verificarToken(request, env.AUTH_SECRET);
  if (!admin) return json({ erro: "não autorizado" }, 401);

  const [usuarios, uso, cards] = await Promise.all([
    env.DB.prepare(
      `SELECT u.email, u.nome, u.primeiro_acesso, u.ultimo_acesso,
        (SELECT COUNT(*) FROM acessos a WHERE a.email = u.email AND a.tipo='login'
           AND a.criado_em >= datetime('now','-30 days')) AS logins30,
        (SELECT COUNT(*) FROM acessos a WHERE a.email = u.email AND a.tipo='ping'
           AND a.criado_em >= datetime('now','-30 days')) AS tempo_min30,
        (SELECT COUNT(*) FROM projetos p WHERE p.email = u.email) AS projetos
       FROM usuarios u ORDER BY u.ultimo_acesso DESC LIMIT 2000`
    ).all(),
    env.DB.prepare(
      `SELECT detalhe AS slug, COUNT(*) AS n FROM eventos
       WHERE tipo='modulo_aberto' AND detalhe IS NOT NULL
         AND criado_em >= datetime('now','-30 days')
       GROUP BY detalhe ORDER BY n DESC`
    ).all(),
    env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM usuarios) AS total_alunos,
        (SELECT COUNT(DISTINCT email) FROM acessos WHERE criado_em >= datetime('now','-7 days')) AS ativos7d,
        (SELECT COUNT(*) FROM acessos WHERE tipo='login' AND date(criado_em) = date('now')) AS logins_hoje,
        (SELECT COUNT(*) FROM acessos WHERE tipo='ping' AND criado_em >= datetime('now','-7 days')) AS tempo_min7d`
    ).first(),
  ]);

  return json({
    cards,
    uso: uso.results || [],
    usuarios: usuarios.results || [],
  });
}
