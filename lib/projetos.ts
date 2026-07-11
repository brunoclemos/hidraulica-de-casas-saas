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
  cliente?: string; // "pasta do cliente" — agrupa cálculos de qualquer módulo. Vazio = avulso.
  nome: string;
  inputs: T;
  criadoEm: number;
  atualizadoEm: number;
}

// Uma "pasta" na tela de Clientes: um cliente distinto + quantos cálculos tem e quando mexeu por último.
export interface PastaCliente {
  cliente: string; // "" = cálculos sem cliente ("Sem cliente")
  qtd: number;
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

const normCliente = (c?: string) => (c || "").trim();

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
  cliente?: string;
  nome: string;
  inputs: T;
}): Projeto<T> {
  const list = read();
  const agora = Date.now();
  const cliente = normCliente(p.cliente) || undefined;
  let salvo: Projeto<T>;
  const idx = p.id ? list.findIndex((x) => x.id === p.id) : -1;
  if (p.id && idx >= 0) {
    list[idx] = { ...list[idx], cliente, nome: p.nome, inputs: p.inputs, atualizadoEm: agora };
    write(list);
    salvo = list[idx] as Projeto<T>;
  } else {
    salvo = {
      id: `p_${agora.toString(36)}_${Math.floor(performance.now()).toString(36)}`,
      modulo: p.modulo,
      cliente,
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

/** Um projeto por id (para o deep-link `?projeto=id` reabrir o cálculo no módulo certo). */
export function buscarProjeto(id: string): Projeto | null {
  return read().find((p) => p.id === id) ?? null;
}

/** Nomes de cliente já usados, únicos e ordenados — alimenta o autocomplete (datalist). */
export function nomesClientes(): string[] {
  const set = new Set<string>();
  for (const p of read()) {
    const c = normCliente(p.cliente);
    if (c) set.add(c);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Pastas por cliente (agregado), mais recentes primeiro. Inclui a pasta "" (sem cliente) se houver. */
export function listarClientes(): PastaCliente[] {
  const map = new Map<string, PastaCliente>();
  for (const p of read()) {
    const cliente = normCliente(p.cliente);
    const atual = map.get(cliente) ?? { cliente, qtd: 0, atualizadoEm: 0 };
    atual.qtd += 1;
    if (p.atualizadoEm > atual.atualizadoEm) atual.atualizadoEm = p.atualizadoEm;
    map.set(cliente, atual);
  }
  return Array.from(map.values()).sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

/** Cálculos de uma pasta (todos os módulos), mais recentes primeiro. `""` = os sem cliente. */
export function listarPorCliente(cliente: string): Projeto[] {
  const alvo = normCliente(cliente);
  return read()
    .filter((p) => normCliente(p.cliente) === alvo)
    .sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

/**
 * Renomeia uma pasta: reetiqueta todos os cálculos daquele cliente e replica cada um.
 * Renomear para "" esvazia o cliente (vira avulso). Retorna quantos foram afetados.
 */
export function renomearCliente(de: string, para: string): number {
  const origem = normCliente(de);
  const destino = normCliente(para);
  if (origem === destino) return 0;
  const agora = Date.now();
  const list = read();
  const afetados: Projeto[] = [];
  for (const p of list) {
    if (normCliente(p.cliente) === origem) {
      p.cliente = destino || undefined;
      p.atualizadoEm = agora;
      afetados.push(p);
    }
  }
  if (afetados.length) {
    write(list);
    for (const p of afetados) pushRemoto(p);
  }
  return afetados.length;
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
