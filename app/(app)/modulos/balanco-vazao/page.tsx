"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  calcular,
  minSeg,
  Inputs,
  Anel,
  Material,
  DN_TABELA,
} from "@/lib/calc/balanco-vazao";
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

const MODULO = "balanco-vazao";

type Form = Inputs;

const PADRAO: Form = {
  a1: { material: "CPVC", dnExterno: 22, rugosidade: 0.006, comprimentoTotal: 27.37, comprimentoReal: 15.52 },
  a2: { material: "CPVC", dnExterno: 22, rugosidade: 0.006, comprimentoTotal: 44.05, comprimentoReal: 31.9 },
  temperatura: 40,
  vazaoTotal: 6,
  tempoAlvoAnel2: 1,
};

const opcoesMaterial: { value: Material; label: string }[] = [
  { value: "CPVC", label: "CPVC" },
  { value: "PVC", label: "PVC" },
];

const num = (x: number, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : "—");

export default function BalancoVazao() {
  const [f, setF] = useState<Form>(PADRAO);

  const setAnel = (qual: "a1" | "a2", patch: Partial<Anel>) =>
    setF((p) => ({ ...p, [qual]: { ...p[qual], ...patch } }));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // ---- estado de salvamento ("Meus Projetos") ----
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [clientesSug, setClientesSug] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [estado, setEstado] = useState<EstadoSalvo>("nao-salvo");
  const [salvoEm, setSalvoEm] = useState<number | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const snapshot = useRef<string>("");

  const refresh = () => {
    setProjetos(listarProjetos(MODULO));
    setClientesSug(nomesClientes());
  };
  useEffect(() => { refresh(); }, []);

  // deep-link: /modulos/<slug>?projeto=<id> reabre o cálculo (vindo da tela de Clientes)
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
  function carregar(p: Projeto) {
    setF(p.inputs as Form); setProjetoId(p.id); setCliente(p.cliente ?? ""); setNome(p.nome); snapshot.current = JSON.stringify(p.inputs); setSalvoEm(p.atualizadoEm); setEstado("salvo");
  }
  function novo() {
    setF(PADRAO); setProjetoId(null); setCliente(""); setNome(""); snapshot.current = ""; setSalvoEm(null); setEstado("nao-salvo");
  }

  const r = useMemo(() => calcular(f), [f]);
  const somaOk = Math.abs(r.soma - f.vazaoTotal) < 0.05;

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/modulos/circuladores" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Cálculo de Circuladores
          </Link>
          <h1 className="mt-1 font-display text-xl font-bold text-zinc-100">
            Balanço de Vazão — Anel 1 × Anel 2
          </h1>
          <p className="text-sm text-zinc-400">
            Divide a vazão do tronco entre dois anéis em paralelo (perda de carga igual) e mostra o
            tempo de recirculação de cada um.
          </p>
        </div>
        <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
      </div>

      {/* DADOS DE ENTRADA — anéis lado a lado */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(["a1", "a2"] as const).map((qual, i) => {
          const anel = f[qual];
          const opcoesDN = DN_TABELA[anel.material].map((d) => ({ value: d.externo, label: d.rotulo }));
          return (
            <div key={qual} className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
              <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-amber">
                Anel {i + 1}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Material"
                  value={anel.material}
                  onChange={(v) => {
                    const material = v as Material;
                    const dn = DN_TABELA[material][0].externo;
                    const existe = DN_TABELA[material].some((d) => d.externo === anel.dnExterno);
                    setAnel(qual, { material, dnExterno: existe ? anel.dnExterno : dn });
                  }}
                  options={opcoesMaterial}
                />
                <SelectField
                  label="DN externo"
                  value={anel.dnExterno}
                  onChange={(v) => setAnel(qual, { dnExterno: Number(v) })}
                  options={opcoesDN}
                />
                <NumberField
                  label="Compr. total"
                  value={anel.comprimentoTotal}
                  onChange={(v) => setAnel(qual, { comprimentoTotal: v })}
                  unit="m"
                  step={0.1}
                  hint="Real + equivalente"
                />
                <NumberField
                  label="Compr. real"
                  value={anel.comprimentoReal}
                  onChange={(v) => setAnel(qual, { comprimentoReal: v })}
                  unit="m"
                  step={0.1}
                  hint="Só tubo (p/ o tempo)"
                />
                <NumberField
                  label="Rugosidade"
                  value={anel.rugosidade}
                  onChange={(v) => setAnel(qual, { rugosidade: v })}
                  unit="mm"
                  step={0.001}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* PARÂMETROS COMPARTILHADOS */}
      <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Temp. da água" value={f.temperatura} onChange={(v) => set("temperatura", v)} unit="°C" hint="Define a viscosidade" />
          <NumberField label="Vazão total do tronco" value={f.vazaoTotal} onChange={(v) => set("vazaoTotal", v)} unit="L/min" step={0.1} />
        </div>
      </div>

      {/* RESULTADO — divisão */}
      <div className="rounded-2xl border border-amber/30 bg-ink-800 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Resultado — divisão de vazão
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-ink-700 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400">Anel 1</div>
            <div className="mt-0.5 font-display text-2xl font-bold text-amber">{num(r.q1)} <span className="text-sm">L/min</span></div>
            <div className="mt-1 text-[12px] text-zinc-400">Recircula em <b className="text-zinc-200">{minSeg(r.tempo1Seg)}</b></div>
            <div className="text-[11px] text-zinc-500">Volume {num(r.volume1)} L</div>
          </div>
          <div className="rounded-2xl bg-ink-700 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400">Anel 2</div>
            <div className="mt-0.5 font-display text-2xl font-bold text-amber">{num(r.q2)} <span className="text-sm">L/min</span></div>
            <div className="mt-1 text-[12px] text-zinc-400">Recircula em <b className="text-zinc-200">{minSeg(r.tempo2Seg)}</b></div>
            <div className="text-[11px] text-zinc-500">Volume {num(r.volume2)} L</div>
          </div>
        </div>
        <div className={`mt-3 rounded-lg px-3 py-2 text-[12px] ${somaOk ? "bg-ink-700 text-zinc-400" : "bg-red-500/10 text-red-300"}`}>
          Verificação: soma dos anéis = {num(r.soma)} L/min {somaOk ? "(confere com a vazão total)" : `(≠ ${num(f.vazaoTotal)} informada)`}
        </div>
      </div>

      {/* MODO INVERSO */}
      <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
        <h3 className="mb-1 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Precisa de um tempo máximo no Anel 2?
        </h3>
        <p className="mb-3 text-[12px] text-zinc-500">
          Informe o tempo máximo de recirculação desejado no Anel 2 e veja a vazão total necessária
          (mantendo os dois anéis equilibrados).
        </p>
        <div className="max-w-[200px]">
          <NumberField label="Tempo máximo no Anel 2" value={f.tempoAlvoAnel2} onChange={(v) => set("tempoAlvoAnel2", v)} unit="min" step={0.5} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-ink-700 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400">Vazão nec. Anel 1</div>
            <div className="mt-0.5 font-display text-lg font-bold text-amber">{num(r.q1Nec)} L/min</div>
          </div>
          <div className="rounded-2xl bg-ink-700 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400">Vazão nec. Anel 2</div>
            <div className="mt-0.5 font-display text-lg font-bold text-amber">{num(r.q2Nec)} L/min</div>
          </div>
          <div className="rounded-2xl bg-ink-700 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400">Vazão total nec.</div>
            <div className="mt-0.5 font-display text-lg font-bold text-amber">{num(r.qTotalNec)} L/min</div>
          </div>
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
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cálculo (ex.: Anel 01)" className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber/60" />
          </div>
          {projetoId && (<button onClick={novo} className="rounded-xl border border-ink-600 px-3 py-2.5 text-sm text-zinc-400">Novo</button>)}
          <button onClick={salvar} className="rounded-xl bg-amber px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-95">{projetoId ? "Atualizar" : "Salvar projeto"}</button>
        </div>
      </div>
    </div>
  );
}
