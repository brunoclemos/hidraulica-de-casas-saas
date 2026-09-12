// Perfil do escritório impresso no memorial (logo, responsável técnico, CREA).
//
// Mesmo desenho do lib/projetos.ts: localStorage é cache e o D1 é a fonte que
// sobrevive à troca de aparelho. Sem a API (GitHub Pages não tem Functions) a tela
// continua funcionando só com o cache, sem quebrar nada.

import { getSessao } from "./auth";

export interface Perfil {
  empresa: string;
  responsavel: string;
  crea: string;
  telefone: string;
  contato: string; // e-mail ou site que sai no documento
  cidade: string;
  logo: string; // data URL; "" = sem logo
}

export const PERFIL_VAZIO: Perfil = {
  empresa: "",
  responsavel: "",
  crea: "",
  telefone: "",
  contato: "",
  cidade: "",
  logo: "",
};

// Teto do data URL da logo. O D1 aguenta bem mais, mas a logo viaja em todo
// carregamento de perfil e entra embutida em cada PDF gerado.
export const LIMITE_LOGO = 150_000;

const KEY = "hdc:perfil";

export function perfilLocal(): Perfil {
  if (typeof window === "undefined") return PERFIL_VAZIO;
  try {
    return { ...PERFIL_VAZIO, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return PERFIL_VAZIO;
  }
}

export function perfilPreenchido(p: Perfil): boolean {
  return p.empresa.trim() !== "" || p.responsavel.trim() !== "";
}

export async function carregarPerfil(): Promise<Perfil> {
  const s = getSessao();
  if (!s || typeof window === "undefined") return perfilLocal();
  try {
    const res = await fetch(`/api/perfil?email=${encodeURIComponent(s.email)}`);
    if (!res.ok) return perfilLocal();
    const remoto = (await res.json()) as Partial<Perfil>;
    const p = { ...PERFIL_VAZIO, ...remoto };
    localStorage.setItem(KEY, JSON.stringify(p));
    return p;
  } catch {
    return perfilLocal();
  }
}

/** Grava local (imediato) e replica no D1. Lança se a API recusar, para a tela avisar. */
export async function salvarPerfil(p: Perfil): Promise<void> {
  localStorage.setItem(KEY, JSON.stringify(p));
  const s = getSessao();
  if (!s) return;
  const res = await fetch("/api/perfil", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: s.email, perfil: p }),
  });
  // GitHub Pages não tem Functions: 404/405 ali é esperado e o cache local basta.
  if (!res.ok && res.status !== 404 && res.status !== 405) {
    throw new Error(`perfil não salvou no servidor (${res.status})`);
  }
}
