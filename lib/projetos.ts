// "Meus Projetos" — persistência local para o protótipo.
// No SaaS final isto vira a tabela `projetos` no Supabase (inputs/outputs em jsonb).

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
  if (p.id) {
    const idx = list.findIndex((x) => x.id === p.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], nome: p.nome, inputs: p.inputs, atualizadoEm: agora };
      write(list);
      return list[idx] as Projeto<T>;
    }
  }
  const novo: Projeto<T> = {
    id: `p_${agora.toString(36)}_${Math.floor(performance.now()).toString(36)}`,
    modulo: p.modulo,
    nome: p.nome,
    inputs: p.inputs,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  write([novo, ...list]);
  return novo;
}

export function excluirProjeto(id: string) {
  write(read().filter((p) => p.id !== id));
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
