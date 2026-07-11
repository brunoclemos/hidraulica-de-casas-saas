// "Meus Projetos" — localStorage como cache local + sincronização com /api/projetos
// (Pages Function + banco D1, mesma origem). A API síncrona continua a mesma (os
// módulos não mudam): toda escrita local dispara uma replicação fire-and-forget pro
// banco, e `sincronizarProjetos()` (chamada no layout, após o login) puxa os projetos
// do e-mail e mescla — o aluno troca de aparelho e os cálculos estão lá. Sem a API
// (ex.: GitHub Pages), é 100% localStorage, sem quebrar nada.

import { getSessao } from "./auth";
import { registrarEvento } from "./telemetria";

export interface Projeto<T = unknown> {
  id: string;
  modulo: string;
  nome: string;
  inputs: T;
  criadoEm: number;
  atualizadoEm: number;
}

const KEY = "hdc:projetos";

function read(): Projeto[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(list: Projeto[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

// ---------------------------------------------------------------------------
// Replicação remota (fire-and-forget; nunca bloqueia a UI)
// ---------------------------------------------------------------------------

function apiPost(body: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  void fetch("/api/projetos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

function pushRemoto(p: Projeto) {
  const s = getSessao();
  if (!s) return;
  apiPost({ op: "upsert", email: s.email, projeto: p });
}

function excluirRemoto(id: string) {
  apiPost({ op: "excluir", id });
}

/**
 * Puxa os projetos do e-mail logado e mescla com o cache local (id a id; o mais
 * recente por `atualizadoEm` vence). Projetos que só existem localmente sobem.
 * Chamar após o login (o layout faz isso). Retorna o nº de projetos após a mescla.
 */
export async function sincronizarProjetos(): Promise<number> {
  const s = getSessao();
  if (!s || typeof window === "undefined") return read().length;

  let remotos: Projeto[];
  try {
    const res = await fetch(`/api/projetos?email=${encodeURIComponent(s.email)}`);
    if (!res.ok) return read().length;
    remotos = (await res.json()) as Projeto[];
  } catch {
    return read().length;
  }

  const locais = new Map(read().map((p) => [p.id, p]));

  // remoto → local (novo ou mais recente vence)
  for (const r of remotos) {
    const l = locais.get(r.id);
    if (!l || r.atualizadoEm > l.atualizadoEm) locais.set(r.id, r);
  }
  // local sem remoto (ou local mais novo) → sobe
  const idsRemotos = new Map(remotos.map((r) => [r.id, r.atualizadoEm] as [string, number]));
  const listaLocais = Array.from(locais.values());
  for (const l of listaLocais) {
    const remotoTs = idsRemotos.get(l.id);
    if (remotoTs === undefined || l.atualizadoEm > remotoTs) pushRemoto(l);
  }

  const lista = listaLocais.sort((a, b) => b.atualizadoEm - a.atualizadoEm);
  write(lista);
  return lista.length;
}

// ---------------------------------------------------------------------------
// API síncrona usada pelos módulos (inalterada)
// ---------------------------------------------------------------------------

export function listarProjetos(modulo?: string): Projeto[] {
  const all = read().sort((a, b) => b.atualizadoEm - a.atualizadoEm);
  return modulo ? all.filter((p) => p.modulo === modulo) : all;
}

export function salvarProjeto<T>(p: {
  id?: string;
  modulo: string;
  nome: string;
  inputs: T;
}): Projeto<T> {
  const list = read();
  const agora = Date.now();
  let salvo: Projeto<T>;
  const idx = p.id ? list.findIndex((x) => x.id === p.id) : -1;
  if (p.id && idx >= 0) {
    list[idx] = { ...list[idx], nome: p.nome, inputs: p.inputs, atualizadoEm: agora };
    write(list);
    salvo = list[idx] as Projeto<T>;
  } else {
    salvo = {
      id: `p_${agora.toString(36)}_${Math.floor(performance.now()).toString(36)}`,
      modulo: p.modulo,
      nome: p.nome,
      inputs: p.inputs,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    write([salvo, ...list]);
  }
  pushRemoto(salvo as Projeto);
  const s = getSessao();
  if (s) registrarEvento(s.email, "projeto_salvo", p.modulo);
  return salvo;
}

export function excluirProjeto(id: string) {
  write(read().filter((p) => p.id !== id));
  excluirRemoto(id);
}

export function tempoRelativo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "agora";
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}
