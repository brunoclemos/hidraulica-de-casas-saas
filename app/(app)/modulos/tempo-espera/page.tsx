"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { calcular, minSeg, Trecho, DN_CPVC } from "@/lib/calc/tempo-espera";
import { NumberField, SelectField } from "@/components/Fields";
import { SaveBadge, EstadoSalvo } from "@/components/SaveBadge";
import {
  listarProjetos,
  salvarProjeto,
  excluirProjeto,
  buscarProjeto,
  nomesClientes,
  tempoRelativo,
  Projeto,
} from "@/lib/projetos";
import { ClienteField } from "@/components/ClienteField";

const MODULO = "tempo-espera";

interface Form {
  trechos: Trecho[];
}

function trechoPadrao(nome: string, dn: number, dist: number): Trecho {
  return { nome, vazao: 12, pontos: 1, dnExterno: dn, distancia: dist };
}

const PADRAO: Form = {
  trechos: [
    trechoPadrao("Trecho 01", 35, 5),
    trechoPadrao("Trecho 02", 22, 15),
  ],
};

const opcoesDN = DN_CPVC.map((d) => ({ value: d.externo, label: d.rotulo }));
const num = (x: number, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : "—");

export default function TempoEspera() {
  const [f, setF] = useState<Form>(PADRAO);

  const patch = (idx: number, p: Partial<Trecho>) =>
    setF((s) => ({ ...s, trechos: s.trechos.map((t, i) => (i === idx ? { ...t, ...p } : t)) }));
  const add = () =>
    setF((s) => ({ ...s, trechos: [...s.trechos, trechoPadrao(`Trecho ${String(s.trechos.length + 1).padStart(2, "0")}`, 22, 5)] }));
  const remove = (idx: number) => setF((s) => ({ ...s, trechos: s.trechos.filter((_, i) => i !== idx) }));

  // ---- salvamento ----
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [clientesSug, setClientesSug] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [estado, setEstado] = useState<EstadoSalvo>("nao-salvo");
  const [salvoEm, setSalvoEm] = useState<number | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const snapshot = useRef<string>("");
  const refresh = () => { setProjetos(listarProjetos(MODULO)); setClientesSug(nomesClientes()); };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("projeto");
    if (!pid) return;
    const p = buscarProjeto(pid);
    if (p && p.modulo === MODULO) carregar(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const atual = JSON.stringify(f);
    if (projetoId && atual === snapshot.current) setEstado("salvo");
    else if (projetoId || atual !== JSON.stringify(PADRAO)) setEstado("nao-salvo");
  }, [f, projetoId]);
  function salvar() {
    setEstado("salvando");
    const p = salvarProjeto<Form>({ id: projetoId ?? undefined, modulo: MODULO, cliente: cliente.trim() || undefined, nome: nome.trim() || "Sem nome", inputs: f });
    setProjetoId(p.id); setNome(p.nome); snapshot.current = JSON.stringify(f); setSalvoEm(p.atualizadoEm); setEstado("salvo"); refresh();
  }
  function salvarComoNovo() {
    setEstado("salvando");
    const p = salvarProjeto<Form>({ id: undefined, modulo: MODULO, cliente: cliente.trim() || undefined, nome: nome.trim() || "Sem nome", inputs: f });
    setProjetoId(p.id); setNome(p.nome); snapshot.current = JSON.stringify(f); setSalvoEm(p.atualizadoEm); setEstado("salvo"); refresh();
  }
  function carregar(p: Projeto) { setF(p.inputs as Form); setProjetoId(p.id); setCliente(p.cliente ?? ""); setNome(p.nome); snapshot.current = JSON.stringify(p.inputs); setSalvoEm(p.atualizadoEm); setEstado("salvo"); }
  function novo() { setF(PADRAO); setProjetoId(null); setCliente(""); setNome(""); snapshot.current = ""; setSalvoEm(null); setEstado("nao-salvo"); }

  const r = useMemo(() => calcular(f.trechos), [f]);

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/modulos/circuladores" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Cálculo de Circuladores
          </Link>
          <h1 className="mt-1 font-display text-xl font-bold text-zinc-100">
            Tempo de Espera (Purga)
          </h1>
          <p className="text-sm text-zinc-400">
            Tempo até a água quente chegar ao ponto. Some vários trechos em série — o total é
            recalculado conforme você adiciona.
          </p>
        </div>
        <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
      </div>

      {/* TRECHOS */}
      <div className="space-y-3">
        {r.trechos.map((tr, idx) => {
          const t = f.trechos[idx];
          return (
            <div key={idx} className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={t.nome}
                  onChange={(e) => patch(idx, { nome: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-100 outline-none focus:border-amber/60"
                />
                {f.trechos.length > 1 && (
                  <button onClick={() => remove(idx)} className="shrink-0 rounded-lg border border-ink-600 px-2.5 py-2 text-xs text-zinc-500 hover:text-red-400">
                    remover
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberField label="Vazão" value={t.vazao} onChange={(v) => patch(idx, { vazao: v })} unit="L/min" step={0.1} />
                <NumberField label="Pontos simult." value={t.pontos} onChange={(v) => patch(idx, { pontos: Math.max(1, v) })} step={1} min={1} />
                <SelectField label="DN CPVC" value={t.dnExterno} onChange={(v) => patch(idx, { dnExterno: Number(v) })} options={opcoesDN} />
                <NumberField label="Distância" value={t.distancia} onChange={(v) => patch(idx, { distancia: v })} unit="m" step={0.1} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                <Mini l="Velocidade" v={`${num(tr.velocidade)} m/s`} />
                <Mini l="Tempo do trecho" v={minSeg(tr.tempoSeg)} />
                <Mini l="Volume" v={`${num(tr.volume)} L`} />
              </div>
            </div>
          );
        })}

        <button
          onClick={add}
          className="w-full rounded-2xl border border-dashed border-amber/50 py-3 text-sm font-bold text-amber hover:border-amber hover:bg-amber/5"
        >
          + Adicionar mais um trecho
        </button>
      </div>

      {/* RESULTADO (total) — depois do preenchimento */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-amber/40 bg-amber-deep/20 p-4">
          <div className="text-[11px] uppercase tracking-wider text-zinc-300">Tempo total de espera</div>
          <div className="mt-0.5 font-display text-3xl font-bold text-amber">{minSeg(r.tempoTotalSeg)}</div>
          <div className="text-[11px] text-zinc-400">{num(r.tempoTotalSeg, 1)} s · {f.trechos.length} trecho(s)</div>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400">Volume total (desperdício)</div>
          <div className="mt-0.5 font-display text-3xl font-bold text-zinc-100">{num(r.volumeTotal)} L</div>
          <div className="text-[11px] text-zinc-500">Água fria descartada até chegar a quente</div>
        </div>
      </div>

      {/* MEUS PROJETOS */}
      <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">Meus projetos</h3>
        {projetos.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum cálculo salvo ainda. Dê um nome e toque em “Salvar projeto”.</p>
        ) : (
          <ul className="space-y-2">
            {projetos.map((p) => (
              <li key={p.id} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${p.id === projetoId ? "border-amber/50 bg-amber/5" : "border-ink-600"}`}>
                <button onClick={() => carregar(p)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium text-zinc-100">{p.nome}</div>
                  <div className="text-[11px] text-zinc-500">salvo {tempoRelativo(p.atualizadoEm)}</div>
                </button>
                <button onClick={() => { excluirProjeto(p.id); if (p.id === projetoId) novo(); refresh(); }} className="ml-3 text-xs text-zinc-500 hover:text-red-400">excluir</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* BARRA STICKY */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-0">
            <ClienteField value={cliente} onChange={setCliente} sugestoes={clientesSug} className="w-28 shrink-0 sm:w-40" />
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cálculo (ex.: Espera)" className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber/60" />
          </div>
          {projetoId && (<button onClick={salvarComoNovo} className="rounded-xl border border-ink-600 px-3 py-2.5 text-sm text-zinc-400">Salvar como novo</button>)}
          <button onClick={salvar} className="rounded-xl bg-amber px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-95">{projetoId ? "Atualizar" : "Salvar projeto"}</button>
        </div>
      </div>
    </div>
  );
}

function Mini({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-lg bg-ink-700 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">{l}</div>
      <div className="font-semibold text-zinc-100">{v}</div>
    </div>
  );
}
