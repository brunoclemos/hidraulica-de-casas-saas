"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { calcular, duracaoLabel, minLabel, Inputs } from "@/lib/calc/perfil-boiler";
import { NumberField, Stepper, Accordion, Toggle } from "@/components/Fields";
import { LineChart, Serie, RefLinha } from "@/components/LineChart";
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

const MODULO = "perfil-boiler";

interface Form {
  tSetPoint: number;
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
  histGas: number;
  eletKW: number;
  histElet: number;
  bombaBTUh: number;
  histBomba: number;
  gasAtivo: boolean;
  eletAtivo: boolean;
  bombaAtivo: boolean;
  deltaTAquecimento: number;
}

// Defaults = aba Parâmetros da planilha V3.
const PADRAO: Form = {
  tSetPoint: 50,
  volume: 1000,
  tInicial: 50,
  tFria: 19.6,
  tMistura: 41,
  nBanhos: 2,
  vazaoDucha: 12,
  coefPerdas: 0,
  duracao: 60,
  gasKcalh: 14500,
  gasRendimento: 0.86,
  histGas: 5,
  eletKW: 4,
  histElet: 5,
  bombaBTUh: 40000,
  histBomba: 5,
  gasAtivo: true,
  eletAtivo: true,
  bombaAtivo: true,
  deltaTAquecimento: 10,
};

// Projetos salvos no schema antigo (v2, gás × elétrica) tinham `histerese` única
// e não tinham bomba de calor — herdamos a histerese pros 3 apoios.
function normalizarForm(raw: unknown): Form {
  const r = (raw ?? {}) as Partial<Form> & { histerese?: number };
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const histLegado = num(r.histerese, PADRAO.histGas);
  return {
    tSetPoint: num(r.tSetPoint, PADRAO.tSetPoint),
    volume: num(r.volume, PADRAO.volume),
    tInicial: num(r.tInicial, PADRAO.tInicial),
    tFria: num(r.tFria, PADRAO.tFria),
    tMistura: num(r.tMistura, PADRAO.tMistura),
    nBanhos: num(r.nBanhos, PADRAO.nBanhos),
    vazaoDucha: num(r.vazaoDucha, PADRAO.vazaoDucha),
    coefPerdas: num(r.coefPerdas, PADRAO.coefPerdas),
    duracao: num(r.duracao, PADRAO.duracao),
    gasKcalh: num(r.gasKcalh, PADRAO.gasKcalh),
    gasRendimento: num(r.gasRendimento, PADRAO.gasRendimento),
    histGas: num(r.histGas, histLegado),
    eletKW: num(r.eletKW, PADRAO.eletKW),
    histElet: num(r.histElet, histLegado),
    bombaBTUh: num(r.bombaBTUh, PADRAO.bombaBTUh),
    histBomba: num(r.histBomba, histLegado),
    // projetos salvos antes dos toggles: os 3 apoios ativos (= comportamento anterior)
    gasAtivo: bool(r.gasAtivo, true),
    eletAtivo: bool(r.eletAtivo, true),
    bombaAtivo: bool(r.bombaAtivo, true),
    deltaTAquecimento: num(r.deltaTAquecimento, PADRAO.deltaTAquecimento),
  };
}

function toInputs(f: Form): Inputs {
  return { ...f };
}

export default function PerfilBoiler() {
  const [f, setF] = useState<Form>(PADRAO);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // --- estado de salvamento ("Meus Projetos") ---
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [nome, setNome] = useState("");
  const [estado, setEstado] = useState<EstadoSalvo>("nao-salvo");
  const [salvoEm, setSalvoEm] = useState<number | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [clientesSug, setClientesSug] = useState<string[]>([]);
  const snapshot = useRef<string>("");

  const refresh = () => {
    setProjetos(listarProjetos(MODULO));
    setClientesSug(nomesClientes());
  };
  useEffect(() => {
    refresh();
  }, []);

  // deep-link: /modulos/<slug>?projeto=<id> reabre o cálculo (vindo da tela de Clientes)
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("projeto");
    if (!pid) return;
    const p = buscarProjeto(pid);
    if (p && p.modulo === MODULO) carregar(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      cliente: cliente.trim() || undefined,
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

  function salvarComoNovo() {
    setEstado("salvando");
    const p = salvarProjeto<Form>({
      id: undefined,
      modulo: MODULO,
      cliente: cliente.trim() || undefined,
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
    const form = normalizarForm(p.inputs);
    setF(form);
    setProjetoId(p.id);
    setCliente(p.cliente ?? "");
    setNome(p.nome);
    snapshot.current = JSON.stringify(form);
    setSalvoEm(p.atualizadoEm);
    setEstado("salvo");
  }

  function novo() {
    setF(PADRAO);
    setProjetoId(null);
    setCliente("");
    setNome("");
    snapshot.current = "";
    setSalvoEm(null);
    setEstado("nao-salvo");
  }

  // --- cálculo ao vivo ---
  const r = useMemo(() => calcular(toInputs(f)), [f]);
  const { derivados: d, cenarios, aquecimento, validacao } = r;

  // --- gráfico: séries dos cenários ativos + referências ---
  const chart = useMemo(() => {
    const series: Serie[] = cenarios.map((c) => ({
      nome: c.nome,
      cor: c.cor,
      pontos: c.curva.temps,
    }));
    const allY = series.flatMap((s) => s.pontos);
    const lo = Math.min(...allY, f.tMistura);
    const hi = Math.max(...allY, f.tSetPoint);
    // limites em múltiplos de 5 °C (grade fica igual à da planilha)
    const yMin = Math.floor((lo - 1) / 5) * 5;
    const yMax = Math.ceil((hi + 1) / 5) * 5;

    const refs: RefLinha[] = [
      { valor: f.tMistura, label: `T. mistura (${f.tMistura.toFixed(0)}°C)`, cor: "#f87171" },
    ];
    // linha de acionamento por valor DISTINTO de TQ−hist, só dos apoios ativos
    const ativos = ([
      ["gás", f.histGas, f.gasAtivo],
      ["resist.", f.histElet, f.eletAtivo],
      ["bomba", f.histBomba, f.bombaAtivo],
    ] as const).filter(([, , ativo]) => ativo);
    const acionamentos = new Map<number, string[]>();
    ativos.forEach(([nome, h]) => {
      const v = f.tSetPoint - h;
      acionamentos.set(v, [...(acionamentos.get(v) ?? []), nome]);
    });
    acionamentos.forEach((nomes, valor) => {
      const quem = nomes.length === ativos.length ? "" : ` ${nomes.join("/")}`;
      refs.push({ valor, label: `Acionamento${quem} (${valor.toFixed(0)}°C)`, cor: "#8a8a85" });
    });
    return { series, yMin, yMax, refs };
  }, [cenarios, f]);

  return (
    // full-bleed por negative margins — NÃO usar transform aqui: transform em
    // ancestral vira containing block e quebra o position:fixed da barra de salvar
    <div className="lg:mx-[calc(50%-50vw)]">
      <div className="lg:mx-auto lg:max-w-6xl lg:px-6">
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
              Minuto a minuto: o boiler segura os banhos simultâneos? Sem apoio × gás × resistência ×
              bomba de calor × todos.
            </p>
          </div>
          <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
        </div>

        {/* aviso de validação física TF < TM < TQ */}
        {!validacao.ok && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {validacao.mensagem}
          </div>
        )}

        {/* PREENCHIMENTO DE UM LADO, GRÁFICO DO OUTRO */}
        <div className="mt-5 lg:grid lg:grid-cols-[400px,minmax(0,1fr)] lg:items-start lg:gap-6">
          {/* ESQUERDA — inputs */}
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
                <NumberField
                  label="Coef. de perdas"
                  value={f.coefPerdas}
                  onChange={(v) => set("coefPerdas", v)}
                  step={0.01}
                  min={0}
                  max={0.9}
                  hint="Reduz o volume efetivo"
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
                  hint="Válvula termostática"
                />
              </div>
            </Accordion>

            <Accordion
              title="Central térmica a gás"
              defaultOpen
              dimmed={!f.gasAtivo}
              extra={<Toggle label="Ativar aquecedor a gás" checked={f.gasAtivo} onChange={(v) => set("gasAtivo", v)} />}
            >
              <div className="grid grid-cols-2 gap-4">
                <NumberField
                  label="Potência"
                  value={f.gasKcalh}
                  onChange={(v) => set("gasKcalh", v)}
                  unit="kcal/h"
                  hint={`${d.gasKW.toFixed(1)} kW`}
                />
                <NumberField
                  label="Rendimento térmico"
                  value={f.gasRendimento}
                  onChange={(v) => set("gasRendimento", v)}
                  step={0.01}
                  min={0}
                  max={1}
                  hint="Perda na chaminé"
                />
                <NumberField
                  label="Histerese gás"
                  value={f.histGas}
                  onChange={(v) => set("histGas", v)}
                  unit="°C"
                  hint={`Liga em T ≤ ${(f.tSetPoint - f.histGas).toFixed(0)} °C`}
                />
              </div>
            </Accordion>

            <Accordion
              title="Resistência elétrica"
              defaultOpen
              dimmed={!f.eletAtivo}
              extra={<Toggle label="Ativar resistência elétrica" checked={f.eletAtivo} onChange={(v) => set("eletAtivo", v)} />}
            >
              <div className="grid grid-cols-2 gap-4">
                <NumberField
                  label="Potência"
                  value={f.eletKW}
                  onChange={(v) => set("eletKW", v)}
                  unit="kW"
                  hint={`${d.eletKcalh.toFixed(0)} kcal/h · sem rendimento (Joule)`}
                />
                <NumberField
                  label="Histerese elétrica"
                  value={f.histElet}
                  onChange={(v) => set("histElet", v)}
                  unit="°C"
                  hint={`Liga em T ≤ ${(f.tSetPoint - f.histElet).toFixed(0)} °C`}
                />
              </div>
            </Accordion>

            <Accordion
              title="Bomba de calor"
              defaultOpen
              dimmed={!f.bombaAtivo}
              extra={<Toggle label="Ativar bomba de calor" checked={f.bombaAtivo} onChange={(v) => set("bombaAtivo", v)} />}
            >
              <div className="grid grid-cols-2 gap-4">
                <NumberField
                  label="Potência"
                  value={f.bombaBTUh}
                  onChange={(v) => set("bombaBTUh", v)}
                  unit="BTU/h"
                  hint={`${d.bombaKcalh.toFixed(0)} kcal/h (saída térmica)`}
                />
                <NumberField
                  label="Histerese bomba"
                  value={f.histBomba}
                  onChange={(v) => set("histBomba", v)}
                  unit="°C"
                  hint={`Liga em T ≤ ${(f.tSetPoint - f.histBomba).toFixed(0)} °C`}
                />
              </div>
            </Accordion>
          </div>

          {/* DIREITA — gráfico + indicadores (sticky no desktop) */}
          <div className="mt-5 space-y-4 lg:sticky lg:top-24 lg:mt-0">
            <div className="glass rounded-3xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-xs font-bold uppercase tracking-widest text-amber">
                  Decaimento térmico × tempo
                </span>
                <span className="text-[10px] text-zinc-500">eixo Y em °C · eixo X em minutos</span>
              </div>

              <LineChart
                series={chart.series}
                duracao={f.duracao}
                yMin={chart.yMin}
                yMax={chart.yMax}
                refs={chart.refs}
                zonaAbaixoDe={f.tMistura}
                zonaLabel="zona de banho frio"
              />
            </div>

            {/* tempo até cruzar TM, por cenário */}
            <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
              <h3 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-zinc-200">
                Tempo até cruzar a T. mistura ({f.tMistura.toFixed(0)} °C)
              </h3>
              <div className="space-y-1.5">
                {cenarios.map((c) => {
                  const cruza = c.curva.cruzaEm;
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.cor }} />
                      <span className="flex-1 text-zinc-400">{c.nome}</span>
                      <span
                        className={`font-display font-bold ${
                          cruza === null ? "text-emerald-400" : "text-zinc-200"
                        }`}
                      >
                        {minLabel(cruza)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                Depois desse tempo a válvula termostática não entrega mais a temperatura de mistura —
                o banho começa a esfriar.
              </p>
            </div>
          </div>
        </div>

        {/* TEMPO DE AQUECIMENTO SEM CONSUMO */}
        <div className="mt-5 rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
                Tempo de aquecimento — sem consumo
              </h3>
              <p className="text-[11px] text-zinc-500">
                Quanto tempo cada apoio leva pra subir o boiler em ΔT, parado (sem banho).
              </p>
            </div>
            <div className="w-36">
              <NumberField
                label="ΔT desejado"
                value={f.deltaTAquecimento}
                onChange={(v) => set("deltaTAquecimento", v)}
                unit="°C"
                min={0}
              />
            </div>
          </div>
          {aquecimento.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Ative pelo menos um apoio para calcular o tempo de aquecimento.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="pb-2 font-medium">Apoio</th>
                  <th className="pb-2 text-right font-medium">Potência</th>
                  <th className="pb-2 text-right font-medium">Tempo</th>
                </tr>
              </thead>
              <tbody className="text-zinc-200">
                {aquecimento.map((a) => (
                  <tr key={a.nome} className="border-t border-ink-700">
                    <td className="py-2 text-zinc-400">{a.nome}</td>
                    <td className="py-2 text-right tabular-nums">
                      {a.potKcalh.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kcal/h
                    </td>
                    <td className="py-2 text-right font-semibold text-amber">
                      {f.deltaTAquecimento > 0 ? duracaoLabel(a.minutos) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[11px] text-zinc-500">
            Energia necessária: {f.volume.toLocaleString("pt-BR")} L × {f.deltaTAquecimento} °C ={" "}
            {(f.volume * f.deltaTAquecimento).toLocaleString("pt-BR")} kcal.
          </p>
        </div>

        {/* DETALHES + TABELA MINUTO A MINUTO */}
        <div className="mt-4 space-y-4">
          <Accordion title="Detalhes técnicos (auditar)">
            <div className="grid grid-cols-2 gap-3 text-sm text-zinc-300">
              <Det l="Vazão de mistura (N×Q)" v={`${d.vazaoMistura.toFixed(1)} L/min`} />
              <Det l="Volume efetivo" v={`${d.volEfetivo.toFixed(0)} L`} />
              <Det l="Consumo por min" v={`${d.consumoPorMin.toFixed(3)} °C/min`} />
              <Det l="Gás efetivo (kcal/h × rend.)" v={d.gasKcalhEfetiva.toFixed(0)} />
              <Det l="Ganho gás (ligado)" v={`${d.ganhoGas.toFixed(3)} °C/min`} />
              <Det l="Ganho resistência (ligada)" v={`${d.ganhoElet.toFixed(3)} °C/min`} />
              <Det l="Ganho bomba (ligada)" v={`${d.ganhoBomba.toFixed(3)} °C/min`} />
              <Det l="Pot. ideal gás (mét. vazão)" v={`${d.potIdealGas.toFixed(0)} kcal/h`} />
              <Det l="Pot. ideal elétrica (mét. vazão)" v={`${d.potIdealElet.toFixed(0)} kcal/h`} />
            </div>
          </Accordion>

          <Accordion title="Tabela minuto a minuto">
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-ink-800">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="px-1 py-1.5 font-medium">min</th>
                    {cenarios.map((c) => (
                      <th key={c.id} className="px-1 py-1.5 text-right font-medium" style={{ color: c.cor }}>
                        {c.nome.replace("Só ", "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {cenarios[0].curva.temps.map((_, idx) => (
                    <tr key={idx} className="border-t border-ink-700">
                      <td className="px-1 py-1 text-zinc-500">{idx + 1}</td>
                      {cenarios.map((c) => {
                        const ligado = c.curva.status.some((s) => s[idx]);
                        return (
                          <td key={c.id} className="px-1 py-1 text-right tabular-nums">
                            {c.curva.temps[idx].toFixed(1)}
                            {c.id !== "sem" && (
                              <span
                                className={`ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                                  ligado ? "" : "opacity-15"
                                }`}
                                style={{ background: c.cor }}
                                title={ligado ? "apoio ligado" : "apoio desligado"}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-zinc-600">
              Temperaturas em °C. O ponto colorido indica apoio ligado naquele minuto (no cenário
              combinado, aceso se qualquer apoio ativo estiver ligado).
            </p>
          </Accordion>
        </div>

        {/* MEUS PROJETOS */}
        <div className="mt-4 rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
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
      </div>

      {/* BARRA STICKY de salvar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-0">
            <ClienteField value={cliente} onChange={setCliente} sugestoes={clientesSug} className="w-28 shrink-0 sm:w-40" />
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do cálculo (ex.: Banho simultâneo)"
              className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber/60"
            />
          </div>
          {projetoId && (
            <button
              onClick={salvarComoNovo}
              className="rounded-xl border border-ink-600 px-3 py-2.5 text-sm text-zinc-400"
            >
              Salvar como novo
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

function Det({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-ink-900/40 px-3 py-2">
      <span className="text-zinc-500">{l}</span>
      <span className="font-semibold text-zinc-200">{v}</span>
    </div>
  );
}
