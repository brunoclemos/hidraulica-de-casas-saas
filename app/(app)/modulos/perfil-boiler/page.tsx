"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { calcular, duracaoLabel, minLabel, Inputs, Resultado } from "@/lib/calc/perfil-boiler";
import { NumberField, Stepper, Accordion, Toggle } from "@/components/Fields";
import { LineChart, Serie, RefLinha } from "@/components/LineChart";
import { SaveBadge, EstadoSalvo } from "@/components/SaveBadge";
import {
  useMemorial,
  BlocoCampos,
  BlocoMemorial,
  BlocoTabela,
  DadosMemorial,
} from "@/lib/memorial";
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

// O formulário ABRE ZERADO (áudio do cliente 25/jul: "deixa configurado pra vir
// tudo zerado quando o cara abrir, tá vindo com números aleatórios"). Exceções
// conscientes: `duracao` é a janela do gráfico, não dado do projeto, e zerada
// não sobraria eixo nenhum; os toggles de apoio começam ligados pra o cara ver
// os cenários assim que preencher.
const ZERADO: Form = {
  tSetPoint: 0,
  volume: 0,
  tInicial: 0,
  tFria: 0,
  tMistura: 0,
  nBanhos: 0,
  vazaoDucha: 0,
  duracao: 60,
  gasKcalh: 0,
  gasRendimento: 0,
  histGas: 0,
  eletKW: 0,
  histElet: 0,
  bombaBTUh: 0,
  histBomba: 0,
  gasAtivo: true,
  eletAtivo: true,
  bombaAtivo: true,
  deltaTAquecimento: 0,
};

// Aba Parâmetros da planilha V3. Não é mais o estado inicial: serve de exemplo
// de um clique (útil pra gravar aula) e de fallback pra projeto salvo antigo a
// que falte um campo.
const EXEMPLO: Form = {
  tSetPoint: 50,
  volume: 1000,
  tInicial: 50,
  tFria: 19.6,
  tMistura: 41,
  nBanhos: 2,
  vazaoDucha: 12,
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
  const histLegado = num(r.histerese, EXEMPLO.histGas);
  return {
    tSetPoint: num(r.tSetPoint, EXEMPLO.tSetPoint),
    volume: num(r.volume, EXEMPLO.volume),
    tInicial: num(r.tInicial, EXEMPLO.tInicial),
    tFria: num(r.tFria, EXEMPLO.tFria),
    tMistura: num(r.tMistura, EXEMPLO.tMistura),
    nBanhos: num(r.nBanhos, EXEMPLO.nBanhos),
    vazaoDucha: num(r.vazaoDucha, EXEMPLO.vazaoDucha),
    // coefPerdas (schema antigo) é descartado — campo removido a pedido do cliente 23/jul
    duracao: num(r.duracao, EXEMPLO.duracao),
    gasKcalh: num(r.gasKcalh, EXEMPLO.gasKcalh),
    gasRendimento: num(r.gasRendimento, EXEMPLO.gasRendimento),
    histGas: num(r.histGas, histLegado),
    eletKW: num(r.eletKW, EXEMPLO.eletKW),
    histElet: num(r.histElet, histLegado),
    bombaBTUh: num(r.bombaBTUh, EXEMPLO.bombaBTUh),
    histBomba: num(r.histBomba, histLegado),
    // projetos salvos antes dos toggles: os 3 apoios ativos (= comportamento anterior)
    gasAtivo: bool(r.gasAtivo, true),
    eletAtivo: bool(r.eletAtivo, true),
    bombaAtivo: bool(r.bombaAtivo, true),
    deltaTAquecimento: num(r.deltaTAquecimento, EXEMPLO.deltaTAquecimento),
  };
}

function toInputs(f: Form): Inputs {
  return { ...f };
}

const NORMAS = [
  "Planilha do curso Hidráulica de Casas — Perfil Térmico do Boiler V3 (abas Parâmetros e Simulação)",
  "Balanço de energia sensível da água (1 kcal/kg·°C) integrado minuto a minuto",
  "Conversões de potência: 1 kW = 860 kcal/h · 1 BTU/h = 0,252 kcal/h",
];

const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const dec = (v: number, casas: number) => v.toFixed(casas).replace(".", ",");
const milhar = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
// "Só resistência" vira cabeçalho de coluna: sem recapitalizar, a tabela saía com
// "Sem apoio" e "resistência" lado a lado
const semPrefixoSo = (nome: string) =>
  nome.startsWith("Só ") ? nome[3].toUpperCase() + nome.slice(4) : nome;
const listar = (itens: string[]) =>
  itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}` : itens[0];

export default function PerfilBoiler() {
  const [f, setF] = useState<Form>(ZERADO);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // abertura dos accordions de apoio (UI-only, não persiste): toggle ON abre, OFF
  // fecha ("fica bem fechado, não mostra nada" — vídeo 3 do cliente); o usuário
  // ainda pode abrir manualmente um apoio desligado pra pré-configurar
  const [abertos, setAbertos] = useState({ gas: true, elet: true, bomba: true });

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
    } else if (projetoId || atual !== JSON.stringify(ZERADO)) {
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
    setAbertos({ gas: form.gasAtivo, elet: form.eletAtivo, bomba: form.bombaAtivo });
    setProjetoId(p.id);
    setCliente(p.cliente ?? "");
    setNome(p.nome);
    snapshot.current = JSON.stringify(form);
    setSalvoEm(p.atualizadoEm);
    setEstado("salvo");
  }

  function novo() {
    setF(ZERADO);
    setAbertos({ gas: true, elet: true, bomba: true });
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

  // Com o formulário zerado o cálculo dividiria por volume 0 e o gráfico receberia
  // NaN, então os resultados só aparecem quando o motor tem o que precisa.
  const pronto =
    f.volume > 0 && f.duracao > 0 && f.nBanhos > 0 && f.vazaoDucha > 0 && validacao.ok;
  // formulário ainda intocado: não faz sentido cobrar a ordem TF < TM < TQ de quem
  // acabou de abrir a tela
  const virgem = JSON.stringify(f) === JSON.stringify(ZERADO);

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

  useMemorial(MODULO, () => dadosMemorial(f, r, pronto, cliente, nome));

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
        {!validacao.ok && !virgem && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {validacao.mensagem}
          </div>
        )}

        {/* PREENCHIMENTO DE UM LADO, GRÁFICO DO OUTRO */}
        <div className="mt-5 lg:grid lg:grid-cols-[400px,minmax(0,1fr)] lg:items-start lg:gap-6">
          {/* ESQUERDA — inputs */}
          <div className="space-y-4">
            {/* Card único (vídeo 3 do cliente): TF/TM subiram pra cá no lugar do
                coef. de perdas, e o card "Temperaturas da água" foi extinto. */}
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

            <Accordion
              title="Central térmica a gás"
              dimmed={!f.gasAtivo}
              open={abertos.gas}
              onOpenChange={(v) => setAbertos((p) => ({ ...p, gas: v }))}
              extra={
                <Toggle
                  label="Ativar aquecedor a gás"
                  checked={f.gasAtivo}
                  onChange={(v) => {
                    set("gasAtivo", v);
                    setAbertos((p) => ({ ...p, gas: v })); // ON abre, OFF fecha
                  }}
                />
              }
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
              dimmed={!f.eletAtivo}
              open={abertos.elet}
              onOpenChange={(v) => setAbertos((p) => ({ ...p, elet: v }))}
              extra={
                <Toggle
                  label="Ativar resistência elétrica"
                  checked={f.eletAtivo}
                  onChange={(v) => {
                    set("eletAtivo", v);
                    setAbertos((p) => ({ ...p, elet: v }));
                  }}
                />
              }
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
              dimmed={!f.bombaAtivo}
              open={abertos.bomba}
              onOpenChange={(v) => setAbertos((p) => ({ ...p, bomba: v }))}
              extra={
                <Toggle
                  label="Ativar bomba de calor"
                  checked={f.bombaAtivo}
                  onChange={(v) => {
                    set("bombaAtivo", v);
                    setAbertos((p) => ({ ...p, bomba: v }));
                  }}
                />
              }
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
                <span className="hidden text-[10px] text-zinc-500 sm:block">eixo Y em °C · eixo X em minutos</span>
              </div>

              {pronto ? (
                // id só pro memorial achar o SVG (BlocoGrafico.seletor). Sem classe
                // nova aqui: o full-bleed depende das margens negativas do wrapper.
                <div id="grafico-perfil">
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
              ) : (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 text-center">
                  <svg width="46" height="34" viewBox="0 0 46 34" fill="none" aria-hidden>
                    <path
                      d="M2 4v26h42"
                      stroke="#3A3A36"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M6 10c8 0 10 14 18 14s10-8 18-8"
                      stroke="#FABA0D"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      opacity="0.55"
                      strokeDasharray="3 3"
                    />
                  </svg>
                  <p className="max-w-xs text-sm leading-relaxed text-zinc-400">
                    Preencha o volume do boiler e as temperaturas pra ver o decaimento térmico.
                  </p>
                  <button
                    onClick={() => setF(EXEMPLO)}
                    className="rounded-xl border border-ink-600 px-4 py-2 text-sm text-zinc-300 active:scale-95"
                  >
                    Usar valores de exemplo
                  </button>
                </div>
              )}
            </div>

            {/* tempo até cruzar TM, por cenário */}
            {pronto && (
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
            )}
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

        {/* DETALHES + TABELA MINUTO A MINUTO (só com o formulário preenchido:
            zerado, o motor devolveria NaN em toda linha) */}
        {pronto && (
        <div className="mt-4 space-y-4">
          <Accordion title="Detalhes técnicos (auditar)">
            {/* linhas de apoio desligado somem ("não fica poluído", vídeo 3) */}
            <div className="grid grid-cols-2 gap-3 text-sm text-zinc-300">
              <Det l="Vazão de mistura (N×Q)" v={`${d.vazaoMistura.toFixed(1)} L/min`} />
              <Det l="Consumo por min" v={`${d.consumoPorMin.toFixed(3)} °C/min`} />
              {f.gasAtivo && <Det l="Gás efetivo (kcal/h × rend.)" v={d.gasKcalhEfetiva.toFixed(0)} />}
              {f.gasAtivo && <Det l="Ganho gás (ligado)" v={`${d.ganhoGas.toFixed(3)} °C/min`} />}
              {f.eletAtivo && <Det l="Ganho resistência (ligada)" v={`${d.ganhoElet.toFixed(3)} °C/min`} />}
              {f.bombaAtivo && <Det l="Ganho bomba (ligada)" v={`${d.ganhoBomba.toFixed(3)} °C/min`} />}
              {f.gasAtivo && <Det l="Pot. ideal gás (mét. vazão)" v={`${d.potIdealGas.toFixed(0)} kcal/h`} />}
              {f.eletAtivo && <Det l="Pot. ideal elétrica (mét. vazão)" v={`${d.potIdealElet.toFixed(0)} kcal/h`} />}
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
        )}

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

// Memorial de cálculo: só lê o que a tela já calculou e repete os mesmos números,
// com as mesmas casas decimais. O guard `pronto` vem de fora porque é o MESMO que
// libera o gráfico e a tabela — sem ele o motor divide por volume 0 e devolve NaN.
function dadosMemorial(
  f: Form,
  r: Resultado,
  pronto: boolean,
  cliente: string,
  nome: string,
): DadosMemorial {
  const { derivados: d, cenarios, aquecimento, validacao } = r;
  const identificacao = {
    cliente: cliente.trim(),
    calculo: nome.trim() || "Sem nome",
    normas: NORMAS,
  };

  // Potência no valor; rendimento e histerese descem para a nota do campo. Juntos no
  // valor, os três quebravam em quatro linhas na coluna do documento.
  const apoio = (ativo: boolean, hist: number, potencia: string, extra = "") => {
    if (!ativo) return { valor: "não considerada" };
    const histerese = `histerese ${num(hist)} °C (liga em T ≤ ${dec(f.tSetPoint - hist, 0)} °C)`;
    return { valor: potencia, nota: extra === "" ? histerese : `${extra} · ${histerese}` };
  };

  const entrada: BlocoCampos = {
    tipo: "campos",
    titulo: "Dados de entrada",
    itens: [
      { label: "Set point do boiler (TQ)", valor: `${num(f.tSetPoint)} °C` },
      { label: "Volume do boiler", valor: `${num(f.volume)} L` },
      { label: "Temperatura inicial (Ti)", valor: `${num(f.tInicial)} °C` },
      { label: "Água fria (TF)", valor: `${num(f.tFria)} °C` },
      { label: "Mistura na válvula termostática (TM)", valor: `${num(f.tMistura)} °C` },
      { label: "Banhos simultâneos", valor: num(f.nBanhos) },
      { label: "Vazão por ducha", valor: `${num(f.vazaoDucha)} L/min` },
      { label: "Duração da simulação", valor: `${num(f.duracao)} min` },
      {
        label: "Central térmica a gás",
        ...apoio(
          f.gasAtivo,
          f.histGas,
          `${num(f.gasKcalh)} kcal/h`,
          `rendimento ${num(f.gasRendimento)}`,
        ),
      },
      { label: "Resistência elétrica", ...apoio(f.eletAtivo, f.histElet, `${num(f.eletKW)} kW`) },
      { label: "Bomba de calor", ...apoio(f.bombaAtivo, f.histBomba, `${num(f.bombaBTUh)} BTU/h`) },
      { label: "ΔT do tempo de aquecimento", valor: `${num(f.deltaTAquecimento)} °C` },
    ],
  };

  if (!pronto) {
    const faltando = [
      f.volume > 0 ? null : "o volume do boiler",
      f.nBanhos > 0 ? null : "o nº de banhos",
      f.vazaoDucha > 0 ? null : "a vazão por ducha",
      f.duracao > 0 ? null : "a duração da simulação",
    ].filter((x): x is string => x !== null);
    return {
      ...identificacao,
      blocos: [entrada],
      impedimento:
        faltando.length > 0
          ? `Preencha ${listar(faltando)} para gerar o memorial.`
          : (validacao.mensagem ??
            "Revise as temperaturas: a ordem física é água fria < mistura < set point."),
    };
  }

  const minutos = cenarios[0].curva.temps.length;
  // No papel, 240 linhas viram lixo: amostra em passo regular e sempre fecha no
  // último minuto simulado (a simulação em si continua minuto a minuto).
  const passo = Math.max(1, Math.ceil(minutos / 60));
  const amostra: number[] = [];
  for (let idx = 0; idx < minutos; idx += passo) amostra.push(idx);
  if (amostra[amostra.length - 1] !== minutos - 1) amostra.push(minutos - 1);

  const cruzamentos = new Set(
    cenarios
      .map((c) => c.curva.cruzaEm)
      .filter((m): m is number => m !== null)
      .map((m) => m + 1),
  );

  const ganhos = [
    f.gasAtivo ? `gás ${dec(d.ganhoGas, 3)}` : null,
    f.eletAtivo ? `resistência ${dec(d.ganhoElet, 3)}` : null,
    f.bombaAtivo ? `bomba ${dec(d.ganhoBomba, 3)}` : null,
  ].filter((x): x is string => x !== null);

  const realce = amostra
    .map((idx, pos) => (cruzamentos.has(idx + 1) ? pos : -1))
    .filter((pos) => pos >= 0);

  const simulacao: BlocoTabela = {
    tipo: "tabela",
    titulo: "Simulação minuto a minuto",
    colunas: ["min", ...cenarios.map((c) => semPrefixoSo(c.nome))],
    linhas: amostra.map((idx) => [
      String(idx + 1),
      ...cenarios.map(
        (c) => `${dec(c.curva.temps[idx], 1)}${c.curva.status.some((s) => s[idx]) ? "*" : ""}`,
      ),
    ]),
    realce,
    nota: [
      "Temperaturas em °C.",
      passo > 1
        ? `Uma linha a cada ${passo} min (a simulação roda minuto a minuto).`
        : "Uma linha por minuto.",
      "O asterisco marca o minuto com o apoio ligado — no cenário combinado, com qualquer apoio ativo ligado.",
      `Consumo de ${dec(d.consumoPorMin, 3)} °C/min${
        ganhos.length > 0 ? `; ganho com o apoio ligado em °C/min: ${ganhos.join(", ")}` : ""
      }.`,
      realce.length > 0
        ? `Linhas realçadas: o minuto em que o cenário cruza a temperatura de mistura (${num(f.tMistura)} °C).`
        : cruzamentos.size > 0
          ? `O cruzamento da temperatura de mistura (${num(f.tMistura)} °C) cai entre duas linhas amostradas — o minuto de cada cenário está na conclusão.`
          : `Nenhum cenário cruza a temperatura de mistura (${num(f.tMistura)} °C) na janela simulada.`,
    ].join(" "),
  };

  const blocos: BlocoMemorial[] = [
    entrada,
    {
      tipo: "texto",
      titulo: "Método de cálculo",
      paragrafos: [
        "O boiler é tratado como um volume único e bem misturado. A simulação integra o balanço de energia sensível da água em passos de 1 minuto, partindo da temperatura inicial informada, e acompanha em paralelo os cenários sem apoio, com cada apoio isolado e com os apoios ativos somados.",
        // A saturação da válvula (commit 64de697) é o único ponto em que a
        // simulação se afasta da planilha V3 do curso: estendida abaixo da T. de
        // mistura, a queda linear da planilha levava o boiler a ficar mais frio
        // que a água que entra nele (−25,8 °C com 5 banhos). O memorial é assinado
        // por engenheiro e vai para o cliente da obra, então o método declara em
        // que faixa vale cada formulação em vez de deixar a conta implícita.
        "Acima da temperatura de mistura a válvula termostática compensa a queda puxando proporcionalmente mais água quente, e o consumo do boiler é constante em N × Q × (TM − TF) ÷ volume — é o comportamento da planilha do curso. Abaixo da temperatura de mistura a válvula satura: está toda aberta e não tem mais o que compensar, então o consumo deixa de ser constante e passa a (N × Q ÷ volume) × (T − TF), desacelerando rumo à temperatura da água fria. Em T = TM as duas formulações dão o mesmo valor, e a emenda entre elas é contínua.",
        "Cada apoio liga quando a temperatura cai a TQ menos a sua histerese e só desliga quando o boiler volta ao set point. O ganho de cada apoio ligado é a potência térmica dividida por 60 × volume: o gás entra com a potência multiplicada pelo rendimento (perda na chaminé), a resistência elétrica a 1 kW = 860 kcal/h sem rendimento (efeito Joule) e a bomba de calor pela saída térmica de 1 BTU/h = 0,252 kcal/h.",
      ],
    },
    simulacao,
  ];

  if (f.deltaTAquecimento > 0 && aquecimento.length > 0) {
    blocos.push({
      tipo: "tabela",
      titulo: "Tempo de aquecimento sem consumo",
      colunas: ["Apoio", "Potência", "Tempo"],
      linhas: aquecimento.map((a) => [
        a.nome,
        `${a.potKcalh.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kcal/h`,
        duracaoLabel(a.minutos),
      ]),
      nota: `Boiler parado, sem banho simultâneo. Energia necessária: ${num(f.volume)} L × ${num(
        f.deltaTAquecimento,
      )} °C = ${num(f.volume * f.deltaTAquecimento)} kcal.`,
    });
  }

  blocos.push(
    {
      tipo: "grafico",
      titulo: "Decaimento térmico × tempo",
      seletor: "#grafico-perfil svg",
      // mesma fonte das séries do LineChart, então a legenda do papel acompanha os
      // toggles de apoio: cenário desligado não vira curva nem linha de legenda
      legenda: cenarios.map((c) => ({ nome: c.nome, cor: c.cor })),
    },
    {
      tipo: "resultado",
      titulo: "Conclusão",
      itens: [
        { label: "Vazão de mistura (N × Q)", valor: `${dec(d.vazaoMistura, 1)} L/min` },
        // O último cenário é o do projeto: com os apoios ligados somados, ou o apoio
        // único, ou "Sem apoio" quando nenhum está ligado. Só ele leva alerta — os
        // outros estão no documento para comparação, e cinco linhas vermelhas
        // seguidas faziam o memorial parecer reprovado em bloco.
        ...cenarios.map((c, i) => ({
          label: c.nome,
          valor: `${dec(c.curva.temps[minutos - 1], 1)} °C`,
          nota: [
            i === cenarios.length - 1 ? "cenário do projeto" : null,
            `no minuto ${minutos}`,
            c.curva.cruzaEm === null
              ? "não cruza a temperatura de mistura na janela simulada"
              : `cruza a temperatura de mistura em ${minLabel(c.curva.cruzaEm)}`,
            c.curva.tMinMinuto === minutos
              ? null
              : `mínima de ${dec(c.curva.tMin, 1)} °C no minuto ${c.curva.tMinMinuto}`,
          ]
            .filter((parte): parte is string => parte !== null)
            .join(" · "),
          alerta: i === cenarios.length - 1 && c.curva.cruzaEm !== null,
        })),
        ...(f.gasAtivo && f.gasRendimento > 0
          ? [
              {
                label: "Potência ideal do gás (método da vazão)",
                valor: `${milhar(d.potIdealGas)} kcal/h`,
                nota: "potência que reporia o consumo dos banhos em regime",
              },
            ]
          : []),
        ...(f.eletAtivo
          ? [
              {
                label: "Potência ideal elétrica (método da vazão)",
                valor: `${milhar(d.potIdealElet)} kcal/h`,
                nota: "potência que reporia o consumo dos banhos em regime",
              },
            ]
          : []),
      ],
    },
  );

  return { ...identificacao, blocos };
}

function Det({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-ink-900/40 px-3 py-2">
      <span className="text-zinc-500">{l}</span>
      <span className="font-semibold text-zinc-200">{v}</span>
    </div>
  );
}
