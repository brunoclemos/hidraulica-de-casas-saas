// Mock de autenticação para o protótipo.
// No SaaS final: Supabase Auth + tabela `alunos_autorizados` sincronizada da Hotmart
// (o aluno loga aqui, nunca na Hotmart). A checagem abaixo simula esse allowlist.

const SESSAO_KEY = "hdc:sessao";

// Lista de alunos "sincronizados da Hotmart" (mock). Qualquer e-mail aqui entra.
export const ALUNOS_MOCK = [
  "aluno@hidraulicadecasas.com",
  "engenheiro@teste.com",
  "ferreto@hidraulicadecasas.com",
];

export interface Sessao {
  email: string;
  nome: string;
  desde: number;
}

export function login(email: string): { ok: boolean; erro?: string; sessao?: Sessao } {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
    return { ok: false, erro: "Digite um e-mail válido." };
  }
  // No protótipo: aceita o allowlist mock OU qualquer e-mail (pra facilitar o teste).
  const nome = e.split("@")[0].replace(/[._-]/g, " ");
  const sessao: Sessao = { email: e, nome, desde: Date.now() };
  if (typeof window !== "undefined") {
    localStorage.setItem(SESSAO_KEY, JSON.stringify(sessao));
    document.cookie = `hdc_logado=1; path=/; max-age=86400`;
  }
  return { ok: true, sessao };
}

export function getSessao(): Sessao | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(SESSAO_KEY) || "null");
  } catch {
    return null;
  }
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSAO_KEY);
  document.cookie = "hdc_logado=; path=/; max-age=0";
}
