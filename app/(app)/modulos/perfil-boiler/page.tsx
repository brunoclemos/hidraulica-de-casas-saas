"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { calcular, Inputs } from "@/lib/calc/perfil-boiler";
import { NumberField, Stepper, Accordion } from "@/components/Fields";
import { LineChart, Serie } from "@/components/LineChart";
import { SaveBadge, EstadoSalvo } from "@/components/SaveBadge";
import {
  listarProjetos,
  salvarProjeto,
  excluirProjeto,
  tempoRelativo,
  Projeto,
} from "@/lib/projetos";

const MODULO = "perfil-boiler";

interface Form {
  tSetPoint: number;
  histerese: number;
  volume: number;
  tInicial: number;
  tFria: number;
  tMistura: number;
  nBanhos: number;
  vazaoDucha: number;
  coefPerdas: number;
  duracao: number;
  gasKcalh: number;
  gasRendimento: number;
  eletKW: number;
}

const PADRAO: Form = {
  tSetPoint: 50,
  histerese: 5,
  volume: 1000,
  tInicial: 50,
  tFria: 19.6,
  tMistura: 41,
  nBanhos: 2,
  vazaoDucha: 12,
  coefPerdas: 0.1,
  duracao: 60,
  gasKcalh: 14500,
  gasRendimento: 0.86,
  eletKW: 4,
};

function toInputs(f: Form): Inputs {
  return { ...f };
}

const COR_GAS = "#FABA0D";
const COR_ELET = "#60a5fa";

export default function PerfilBoiler() {
  const [f, setF] = useState<Form>(PADRAO);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // --- estado de salvamento ("Meus Projetos") ---
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [estado, setEstado] = useState<EstadoSalvo>("nao-salvo");
  const [salvoEm, setSalvoEm] = useState<number | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const snapshot = useRef<string>("");

  const refresh = () => setProjetos(listarProjetos(MODULO));
  useEffect(() => {
    refresh();
  }, []);

  // marca "não salvo" sempre que os inputs divergem do último snapshot salvo
  useEffect(() => {
    const atual = JSON.stringify(f);
    if (projetoId && atual === snapshot.current) {
      setEstado("salvo");
    } else if (projetoId || atual !== JSON.stringify(PADRAO)) {
      setEstado("nao-salvo");
    }
  }, [f, projetoId]);

  function salvar() {
    setEstado("salvando");
    const p = salvarProjeto<Form>({
      id: projetoId ?? undefined,
      modulo: MODULO,
      nome: nome.trim() || "Sem nome",
      inputs: f,
    });
    setProjetoId(p.id);
    setNome(p.nome);
    snapshot.current = JSON.stringify(f);
    setSalvoEm(p.atualizadoEm);
    setEstado("salvo");
    refresh();
  }

  function carregar(p: Projeto) {
    setF(p.inputs as Form);
    setProjetoId(p.id);
    setNome(p.nome);
    snapshot.current = JSON.stringify(p.inputs);
    setSalvoEm(p.atualizadoEm);
    setEstado("salvo");
  }

  function novo() {
    setF(PADRAO);
    setProjetoId(null);
    setNome("");
    snapshot.current = "";
    setSalvoEm(null);
    setEstado("nao-salvo");
  }

  // --- cálculo ao vivo ---
  const r = useMemo(() => calcular(toInputs(f)), [f]);
  const { derivados: d, gas, eletrico, validacao } = r;

  // --- eixos do gráfico ---
  const chart = useMemo(() => {
    const allY = [...gas.linhas.map((l) => l.tBoiler), ...eletrico.linhas.map((l) => l.tBoiler)];
    const lo = Math.min(...allY, d.tAciona, f.tMistura, f.tFria);
    const hi = Math.max(...allY, d.tAciona, f.tMistura, f.tSetPoint);
    const pad = Math.max(1, (hi - lo) * 0.08);
    const series: Serie[] = [
      { nome: "Apoio a gás", cor: COR_GAS, pontos: gas.linhas.map((l) => l.tBoiler) },
      { nome: "Apoio elétrico", cor: COR_ELET, pontos: eletrico.linhas.map((l) => l.tBoiler) },
    ];
    return { series, yMin: Math.floor(lo - pad), yMax: Math.ceil(hi + pad) };
  }, [gas, eletrico, d, f]);

  // --- veredito herói (melhor caso = gás, por ter mais potência de apoio) ---
  const heroi = useMemo(() => {
    const melhor = gas; // gás é o apoio mais forte; veredito-herói usa o gás
    if (melhor.confortoMantido) {
      return { titulo: "Conforto mantido", valor: "Banhos OK", bom: true };
    }
    return {
      titulo: "Água esfria no minuto",
      valor: `${melhor.minutoBanhoFrio} min`,
      bom: false,
    };
  }, [gas]);

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Ferramentas
          </Link>
          <h1 className="mt-1 font-display text-xl font-bold text-zinc-100">
            Perfil Térmico do Boiler
          </h1>
          <p className="text-sm text-zinc-400">
            Minuto a minuto: o boiler segura os banhos simultâneos? Apoio a gás × elétrico.
          </p>
        </div>
        <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
      </div>

      {/* aviso de validação física TF < TM < TQ */}
      {!validacao.ok && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {validacao.mensagem}
        </div>
      )}

      {/* FORM */}
      <div className="space-y-4">
        <Accordion title="Boiler & banhos" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Set point (TQ)"
              value={f.tSetPoint}
              onChange={(v) => set("tSetPoint", v)}
              unit="°C"
            />
            <NumberField
              label="Histerese"
              value={f.histerese}
              onChange={(v) => set("histerese", v)}
              unit="°C"
              hint="Apoio liga quando T ≤ TQ − histerese"
            />
            <NumberField
              label="Volume do boiler"
              value={f.volume}
              onChange={(v) => set("volume", v)}
              unit="L"
            />
            <NumberField
              label="Temp. inicial (Ti)"
              value={f.tInicial}
              onChange={(v) => set("tInicial", v)}
              unit="°C"
            />
            <Stepper
              label="Nº de banhos"
              value={f.nBanhos}
              onChange={(v) => set("nBanhos", v)}
              min={1}
              max={12}
            />
            <NumberField
              label="Vazão por ducha"
              value={f.vazaoDucha}
              onChange={(v) => set("vazaoDucha", v)}
              unit="L/min"
            />
            <NumberField
              label="Duração da simulação"
              value={f.duracao}
              onChange={(v) => set("duracao", v)}
              unit="min"
              min={1}
              max={240}
            />
            <NumberField
              label="Coef. de perdas"
              value={f.coefPerdas}
              onChange={(v) => set("coefPerdas", v)}
              step={0.01}
              min={0}
              max={0.9}
              hint="Reduz o volume efetivo"
            />
          </div>
        </Accordion>

        <Accordion title="Temperaturas da água" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Água fria (TF)"
              value={f.tFria}
              onChange={(v) => set("tFria", v)}
              unit="°C"
              step={0.1}
            />
            <NumberField
              label="Mistura (TM)"
              value={f.tMistura}
              onChange={(v) => set("tMistura", v)}
              unit="°C"
              hint="Temp. de conforto da ducha"
            />
          </div>
        </Accordion>

        <Accordion title="Apoio a gás">
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Potência"
              value={f.gasKcalh}
              onChange={(v) => set("gasKcalh", v)}
              unit="kcal/h"
            />
            <NumberField
              label="Rendimento térmico"
              value={f.gasRendimento}
              onChange={(v) => set("gasRendimento", v)}
              step={0.01}
              min={0}
              max={1}
            />
          </div>
        </Accordion>

        <Accordion title="Apoio elétrico">
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Potência"
              value={f.eletKW}
              onChange={(v) => set("eletKW", v)}
              unit="kW"
              hint="Resistência não aplica rendimento"
            />
          </div>
        </Accordion>
      </div>

      {/* RESULT HERO */}
      <div className="glass rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-xs font-bold uppercase tracking-widest text-amber">
            Curva de temperatura · {f.duracao} min
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              heroi.bom ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            }`}
          >
            {heroi.bom ? "Conforto OK" : "Banho esfria"}
          </span>
        </div>

        <LineChart
          series={chart.series}
          duracao={f.duracao}
          yMin={chart.yMin}
          yMax={chart.yMax}
          refLinha={d.tAciona}
          refLabel={`Aciona apoio (${d.tAciona.toFixed(0)} °C)`}
          zonaAbaixoDe={f.tMistura}
          zonaLabel="zona de banho frio"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Hero titulo={heroi.titulo} valor={heroi.valor} />
          <Hero titulo="T mínima (gás)" valor={`${gas.tMin.toFixed(1)} °C`} />
          <Hero titulo="T mínima (elétrico)" valor={`${eletrico.tMin.toFixed(1)} °C`} />
          <Hero
            titulo="Aciona apoio em"
            valor={`${d.tAciona.toFixed(0)} °C`}
          />
        </div>

        {gas.algumInsuficiente && (
          <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-300">
            Atenção: a partir do minuto {gas.primeiroInsuficiente} o boiler esfria tanto que não há
            água fria para misturar — a ducha sai abaixo da temperatura de mistura (água insuficiente).
          </p>
        )}
      </div>

      {/* COMPARADOR Gás × Elétrico */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Apoio a gás × elétrico
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="pb-2 font-medium">Métrica</th>
              <th className="pb-2 text-right font-medium text-amber">Gás</th>
              <th className="pb-2 text-right font-medium" style={{ color: COR_ELET }}>
                Elétrico
              </th>
            </tr>
          </thead>
          <tbody className="text-zinc-200">
            <Row
              l="Ganho do apoio (°C/min)"
              a={d.ganhoGas.toFixed(3)}
              b={d.ganhoElet.toFixed(3)}
            />
            <Row l="T mínima (°C)" a={gas.tMin.toFixed(1)} b={eletrico.tMin.toFixed(1)} />
            <Row
              l="T mínima no minuto"
              a={`${gas.tMinMinuto}`}
              b={`${eletrico.tMinMinuto}`}
            />
            <Row
              l="Banho frio a partir de"
              a={gas.minutoBanhoFrio ? `${gas.minutoBanhoFrio} min` : "nunca"}
              b={eletrico.minutoBanhoFrio ? `${eletrico.minutoBanhoFrio} min` : "nunca"}
            />
            <Row
              l="Conforto mantido?"
              a={gas.confortoMantido ? "sim" : "não"}
              b={eletrico.confortoMantido ? "sim" : "não"}
            />
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          O apoio a gás repõe muito mais calor por minuto, então segura a temperatura do boiler por
          mais tempo durante banhos simultâneos. A resistência elétrica recupera devagar — o
          argumento técnico (e de venda) para a central térmica a gás.
        </p>
      </div>

      {/* RESULT: detalhes técnicos + tabela minuto a minuto */}
      <div className="space-y-4">
        <Accordion title="Detalhes técnicos (auditar)">
          <div className="grid grid-cols-2 gap-3 text-sm text-zinc-300">
            <Det l="Vazão de mistura (N×Q)" v={`${d.vazaoMistura.toFixed(1)} L/min`} />
            <Det l="Volume efetivo" v={`${d.volEfetivo.toFixed(0)} L`} />
            <Det l="Aciona apoio (TQ−hist)" v={`${d.tAciona.toFixed(1)} °C`} />
            <Det l="Consumo por min" v={`${d.consumoPorMin.toFixed(3)} °C/min`} />
            <Det l="Gás (kW)" v={`${d.gasKW.toFixed(2)} kW`} />
            <Det l="Elétrico (kcal/h)" v={`${d.eletKcalh.toFixed(0)}`} />
            <Det l="Ganho gás (apoio on)" v={`${d.ganhoGas.toFixed(3)} °C/min`} />
            <Det l="Ganho elétrico (apoio on)" v={`${d.ganhoElet.toFixed(3)} °C/min`} />
          </div>
        </Accordion>

        <Accordion title="Tabela minuto a minuto">
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-ink-800">
                <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="px-1 py-1.5 font-medium">min</th>
                  <th className="px-1 py-1.5 text-right font-medium text-amber">T gás</th>
                  <th className="px-1 py-1.5 text-right font-medium">AQ</th>
                  <th className="px-1 py-1.5 text-right font-medium">AF</th>
                  <th className="px-1 py-1.5 text-right font-medium" style={{ color: COR_ELET }}>
                    T elét
                  </th>
                  <th className="px-1 py-1.5 text-right font-medium">AQ</th>
                  <th className="px-1 py-1.5 text-right font-medium">AF</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {gas.linhas.map((lg, idx) => {
                  const le = eletrico.linhas[idx];
                  return (
                    <tr key={lg.t} className="border-t border-ink-700">
                      <td className="px-1 py-1 text-zinc-500">{lg.t}</td>
                      <td className="px-1 py-1 text-right font-semibold text-amber">
                        {lg.tBoiler.toFixed(1)}
                      </td>
                      <td className="px-1 py-1 text-right">{lg.vazaoAQ.toFixed(1)}</td>
                      <td
                        className={`px-1 py-1 text-right ${lg.insuficiente ? "text-red-400" : ""}`}
                      >
                        {lg.insuficiente ? "0*" : lg.vazaoAF.toFixed(1)}
                      </td>
                      <td className="px-1 py-1 text-right font-semibold" style={{ color: COR_ELET }}>
                        {le.tBoiler.toFixed(1)}
                      </td>
                      <td className="px-1 py-1 text-right">{le.vazaoAQ.toFixed(1)}</td>
                      <td
                        className={`px-1 py-1 text-right ${le.insuficiente ? "text-red-400" : ""}`}
                      >
                        {le.insuficiente ? "0*" : le.vazaoAF.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">
            AQ/AF em L/min. * = água fria insuficiente (boiler frio demais para misturar).
          </p>
        </Accordion>
      </div>

      {/* MEUS PROJETOS */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Meus projetos
        </h3>
        {projetos.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nenhum cálculo salvo ainda. Dê um nome e toque em “Salvar projeto”.
          </p>
        ) : (
          <ul className="space-y-2">
            {projetos.map((p) => (
              <li
                key={p.id}
                className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                  p.id === projetoId ? "border-amber/50 bg-amber/5" : "border-ink-600"
                }`}
              >
                <button onClick={() => carregar(p)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium text-zinc-100">{p.nome}</div>
                  <div className="text-[11px] text-zinc-500">
                    salvo {tempoRelativo(p.atualizadoEm)}
                  </div>
                </button>
                <button
                  onClick={() => {
                    excluirProjeto(p.id);
                    if (p.id === projetoId) novo();
                    refresh();
                  }}
                  className="ml-3 text-xs text-zinc-500 hover:text-red-400"
                >
                  excluir
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* BARRA STICKY de salvar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do projeto (ex.: Casa Jerivá - Boiler)"
            className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber/60"
          />
          {projetoId && (
            <button
              onClick={novo}
              className="rounded-xl border border-ink-600 px-3 py-2.5 text-sm text-zinc-400"
            >
              Novo
            </button>
          )}
          <button
            onClick={salvar}
            className="rounded-xl bg-amber px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-95"
          >
            {projetoId ? "Atualizar" : "Salvar projeto"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Hero({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-ink-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{titulo}</div>
      <div className="mt-0.5 font-display text-2xl font-bold text-amber">{valor}</div>
    </div>
  );
}

function Row({ l, a, b }: { l: string; a: string; b: string }) {
  return (
    <tr className="border-t border-ink-700">
      <td className="py-2 text-zinc-400">{l}</td>
      <td className="py-2 text-right font-semibold text-amber">{a}</td>
      <td className="py-2 text-right">{b}</td>
    </tr>
  );
}

function Det({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-ink-900/40 px-3 py-2">
      <span className="text-zinc-500">{l}</span>
      <span className="font-semibold text-zinc-200">{v}</span>
    </div>
  );
}
