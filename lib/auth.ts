// Autenticação de alunos.
// Em produção: valida o e-mail contra a lista de compradores (planilha sincronizada da
// Hotmart) via webhook n8n. A URL do webhook vem de NEXT_PUBLIC_VALIDAR_ALUNO_URL.
// Sem essa env (ex.: ambiente de dev), cai em modo mock: aceita qualquer e-mail válido.

const SESSAO_KEY = "hdc:sessao";
const VALIDAR_URL = process.env.NEXT_PUBLIC_VALIDAR_ALUNO_URL || "";

// Acesso interno (dono, dev, cliente, testers): entram sempre, sem precisar estar na
// lista de compradores da Hotmart. Para adicionar alguém, inclua o e-mail (minúsculo) aqui.
const ACESSO_INTERNO = new Set<string>([
  "brunoclemos1997@gmail.com",
  "contato@ferretoengenharia.com.br",
]);

export interface Sessao {
  email: string;
  nome: string;
  desde: number;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function criarSessao(email: string): Sessao {
  const nome = email.split("@")[0].replace(/[._-]/g, " ");
  const sessao: Sessao = { email, nome, desde: Date.now() };
  if (typeof window !== "undefined") {
    localStorage.setItem(SESSAO_KEY, JSON.stringify(sessao));
    document.cookie = `hdc_logado=1; path=/; max-age=86400`;
  }
  return sessao;
}

export async function login(email: string): Promise<{ ok: boolean; erro?: string; sessao?: Sessao }> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) {
    return { ok: false, erro: "Digite um e-mail válido." };
  }

  // Acesso interno (dono/dev/cliente/testers): entra sempre.
  if (ACESSO_INTERNO.has(e)) {
    return { ok: true, sessao: criarSessao(e) };
  }

  // Sem webhook configurado (dev): aceita qualquer e-mail válido.
  if (!VALIDAR_URL) {
    return { ok: true, sessao: criarSessao(e) };
  }

  // Produção: valida contra a lista de alunos (webhook n8n).
  try {
    const res = await fetch(VALIDAR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e }),
    });
    if (!res.ok) {
      return { ok: false, erro: "Não foi possível validar agora. Tente novamente em instantes." };
    }
    const data = (await res.json()) as { isAluno?: boolean };
    if (!data.isAluno) {
      return {
        ok: false,
        erro: "E-mail não encontrado na lista de alunos. Use o mesmo e-mail da compra do curso.",
      };
    }
    return { ok: true, sessao: criarSessao(e) };
  } catch {
    return { ok: false, erro: "Falha de conexão ao validar. Verifique a internet e tente de novo." };
  }
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
