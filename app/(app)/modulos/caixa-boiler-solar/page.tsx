"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  calcular,
  Inputs,
  PontoConsumo,
  Eletro,
  TipoPonto,
  Clima,
  Orientacao,
  CLIMA_LABEL,
  ORIENTACAO_LABEL,
  CONST_ENERGIA_UTIL,
  TAMANHOS_BOILER_COMERCIAIS,
  pontosPadrao,
  eletrosPadrao,
} from "@/lib/calc/caixa-boiler-solar";
import {
  MARCAS_COLETOR,
  modelosDaMarca,
  acharColetor,
} from "@/lib/calc/inmetro-coletores";
import { NumberField, SelectField, Stepper, Accordion } from "@/components/Fields";
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

const MODULO = "caixa-boiler-solar";

interface Form {
  nUsuarios: number;
  tQuente: number;
  tFria: number;
  tConsumo: number;
  pontos: PontoConsumo[];
  eletros: Eletro[];
  producaoColetor: number;
  marcaColetor: string; // seletor INMETRO (vazio = manual)
  modeloColetor: string;
  clima: Clima;
  orientacao: Orientacao;
  volumeBoilerEscolhido: number; // 0 = usar o volume calculado
}

const PADRAO: Form = {
  nUsuarios: 5,
  tQuente: 50,
  tFria: 21.8,
  tConsumo: 40,
  pontos: pontosPadrao(),
  eletros: eletrosPadrao(),
  producaoColetor: 166.4,
  marcaColetor: "",
  modeloColetor: "",
  clima: "quente",
  orientacao: "45-norte",
  volumeBoilerEscolhido: 0,
};

// cor da etiqueta PBE (A..E)
const COR_CLASSE: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-400",
  B: "bg-lime-500/15 text-lime-400",
  C: "bg-yellow-500/15 text-yellow-400",
  D: "bg-orange-500/15 text-orange-400",
  E: "bg-red-500/15 text-red-400",
};

function toInputs(f: Form): Inputs {
  return {
    nUsuarios: f.nUsuarios,
    tQuente: f.tQuente,
    tFria: f.tFria,
    tConsumo: f.tConsumo,
    pontos: f.pontos,
    eletros: f.eletros,
    producaoColetor: f.producaoColetor,
    clima: f.clima,
    orientacao: f.orientacao,
    volumeBoilerEscolhido: f.volumeBoilerEscolhido,
  };
}

const fmt = (n: number, d = 0) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const TIPO_OPCOES: { value: TipoPonto; label: string }[] = [
  { value: "AF", label: "Só fria (AF)" },
  { value: "AF e AQ", label: "Fria + quente (AF e AQ)" },
];

export default function CaixaBoilerSolar() {
  const [f, setF] = useState<Form>(PADRAO);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const setPonto = (id: string, patch: Partial<PontoConsumo>) =>
    setF((p) => ({
      ...p,
      pontos: p.pontos.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));

  const setEletro = (id: string, patch: Partial<Eletro>) =>
    setF((p) => ({
      ...p,
      eletros: p.eletros.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));

  // seletor de coletor INMETRO: escolher marca → modelo preenche a produção
  const selMarca = (marca: string) =>
    setF((p) => ({ ...p, marcaColetor: marca, modeloColetor: "" }));
  const selModelo = (modelo: string) => {
    const c = acharColetor(f.marcaColetor, modelo);
    setF((p) => ({
      ...p,
      modeloColetor: modelo,
      producaoColetor: c ? c.producao : p.producaoColetor,
    }));
  };
  const coletorSel = f.modeloColetor ? acharColetor(f.marcaColetor, f.modeloColetor) : undefined;

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

  function carregar(p: Projeto) {
    // mescla com PADRAO p/ projetos salvos antes de campos novos (ex.: volumeBoilerEscolhido)
    const merged = { ...PADRAO, ...(p.inputs as Partial<Form>) };
    setF(merged);
    setProjetoId(p.id);
    setCliente(p.cliente ?? "");
    setNome(p.nome);
    // snapshot da forma MESCLADA (não dos inputs crus): senão um projeto antigo, sem o
    // campo novo, divergiria do estado e marcaria "não-salvo" sem o usuário mexer.
    snapshot.current = JSON.stringify(merged);
    setSalvoEm(p.atualizadoEm);
    setEstado("salvo");
  }

  function novo() {
    setF(PADRAO);
    setProjetoId(null);
    setCliente("");
    setNome("");
    snapshot.current = "";
    setEstado("nao-salvo");
    setSalvoEm(null);
  }

  // --- cálculo ao vivo ---
  const r = useMemo(() => calcular(toInputs(f)), [f]);

  // atalhos de tamanho comercial de boiler em volta da sugestão (≈6 chips)
  const chipsBoiler = useMemo(() => {
    const idx = TAMANHOS_BOILER_COMERCIAIS.findIndex((t) => t === r.volBoilerSugerido);
    return idx >= 0
      ? TAMANHOS_BOILER_COMERCIAIS.slice(Math.max(0, idx - 1), idx + 5)
      : TAMANHOS_BOILER_COMERCIAIS.slice(6, 12);
  }, [r.volBoilerSugerido]);

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Ferramentas
          </Link>
          <h1 className="mt-1 font-display text-xl font-bold text-zinc-100">
            Caixa d&apos;Água, Boiler &amp; Coletores Solares
          </h1>
          <p className="text-sm text-zinc-400">
            Volume de água quente do boiler, consumo diário e quantos coletores comprar.
          </p>
        </div>
        <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
      </div>

      {/* aviso de validação das temperaturas */}
      {!r.tempOk && r.tempMsg && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {r.tempMsg}
        </div>
      )}

      {/* USUÁRIOS + TEMPERATURAS */}
      <Accordion title="Usuários & temperaturas" defaultOpen>
        <div className="grid grid-cols-2 gap-4">
          <Stepper
            label="Nº de usuários"
            value={f.nUsuarios}
            onChange={(v) => set("nUsuarios", v)}
            min={1}
            max={30}
          />
          <NumberField
            label="Temp. água quente (boiler)"
            value={f.tQuente}
            onChange={(v) => set("tQuente", v)}
            unit="°C"
          />
          <NumberField
            label="Temp. água fria (local)"
            value={f.tFria}
            onChange={(v) => set("tFria", v)}
            unit="°C"
          />
          <NumberField
            label="Temp. de consumo desejada"
            value={f.tConsumo}
            onChange={(v) => set("tConsumo", v)}
            unit="°C"
            hint="Precisa ficar entre a fria e a do boiler."
          />
        </div>
      </Accordion>

      {/* PONTOS DE CONSUMO */}
      <Accordion title="Pontos de consumo" defaultOpen>
        <div className="space-y-4">
          {f.pontos.map((p) => (
            <div key={p.id} className="rounded-xl border border-ink-600 bg-ink-900/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-sm font-semibold text-zinc-100">{p.nome}</span>
                <span className="text-[11px] font-medium text-amber">
                  {fmt(f.nUsuarios * p.tempo * p.vazao * p.frequencia, 0)} L/dia
                </span>
              </div>
              <SelectField
                label="Tipo"
                value={p.tipo}
                onChange={(v) => setPonto(p.id, { tipo: v })}
                options={TIPO_OPCOES}
              />
              <div className="mt-3 grid grid-cols-3 gap-3">
                <NumberField
                  label="Tempo"
                  value={p.tempo}
                  onChange={(v) => setPonto(p.id, { tempo: v })}
                  unit="min"
                />
                <NumberField
                  label="Vazão"
                  value={p.vazao}
                  onChange={(v) => setPonto(p.id, { vazao: v })}
                  unit="L/min"
                />
                <NumberField
                  label="Freq."
                  value={p.frequencia}
                  onChange={(v) => setPonto(p.id, { frequencia: v })}
                  unit="x/dia"
                />
              </div>
            </div>
          ))}
        </div>
      </Accordion>

      {/* APARELHOS ESPECIAIS */}
      <Accordion title="Aparelhos especiais">
        <div className="space-y-4">
          {f.eletros.map((e) => (
            <div key={e.id} className="rounded-xl border border-ink-600 bg-ink-900/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-sm font-semibold text-zinc-100">{e.nome}</span>
                <span className="text-[11px] font-medium text-amber">
                  {e.tem ? `${fmt(e.volume * Math.max(1, e.frequencia), 0)} L/dia` : "sem uso"}
                </span>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEletro(e.id, { tem: !e.tem })}
                  className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
                    e.tem
                      ? "border-amber bg-amber/10 text-amber"
                      : "border-ink-600 bg-ink-800 text-zinc-400"
                  }`}
                >
                  {e.tem ? "Há uso" : "Não tem"}
                </button>
                <SelectField
                  label=""
                  value={e.tipo}
                  onChange={(v) => setEletro(e.id, { tipo: v })}
                  options={TIPO_OPCOES}
                />
              </div>
              {e.tem && (
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Volume"
                    value={e.volume}
                    onChange={(v) => setEletro(e.id, { volume: v })}
                    unit="L"
                  />
                  {e.id === "maq-louca" && (
                    <NumberField
                      label="Freq."
                      value={e.frequencia}
                      onChange={(v) => setEletro(e.id, { frequencia: v })}
                      unit="x/dia"
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Accordion>

      {/* COLETOR / CLIMA / ORIENTAÇÃO */}
      <Accordion title="Coletor solar, clima & orientação" defaultOpen>
        <div className="grid grid-cols-1 gap-4">
          {/* seletor INMETRO: marca → modelo (puxa produção + classificação) */}
          <SelectField
            label="Fabricante / marca"
            value={f.marcaColetor}
            onChange={(v) => selMarca(String(v))}
            options={[
              { value: "", label: "— escolher (ou digitar manual abaixo) —" },
              ...MARCAS_COLETOR.map((m) => ({ value: m, label: m })),
            ]}
          />
          {f.marcaColetor && (
            <SelectField
              label="Modelo do coletor"
              value={f.modeloColetor}
              onChange={(v) => selModelo(String(v))}
              options={[
                { value: "", label: "— escolher modelo —" },
                ...modelosDaMarca(f.marcaColetor).map((c) => ({
                  value: c.modelo,
                  label: `${c.modelo} · ${c.producao} kWh/mês · classe ${c.classificacao}`,
                })),
              ]}
            />
          )}
          {coletorSel && (
            <div className="flex items-center justify-between rounded-xl border border-ink-600 bg-ink-900/40 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-100">
                  {coletorSel.marca} {coletorSel.modelo}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {coletorSel.producao} kWh/mês · {fmt(coletorSel.eficiencia, 1)}% efic. · {fmt(coletorSel.area, 1)} m²
                </div>
              </div>
              <span
                className={`ml-3 rounded-lg px-2.5 py-1 font-display text-sm font-bold ${
                  COR_CLASSE[coletorSel.classificacao] ?? "bg-zinc-100/5 text-zinc-300"
                }`}
              >
                {coletorSel.classificacao}
              </span>
            </div>
          )}
          <NumberField
            label="Produção do coletor (INMETRO)"
            value={f.producaoColetor}
            onChange={(v) => set("producaoColetor", v)}
            unit="kWh/mês"
            hint="Preenchido pelo modelo escolhido — ou edite manual. Tabela PBE/INMETRO (524 modelos)."
          />
          <SelectField
            label="Clima da região"
            value={f.clima}
            onChange={(v) => set("clima", v)}
            options={(Object.keys(CLIMA_LABEL) as Clima[]).map((c) => ({
              value: c,
              label: CLIMA_LABEL[c],
            }))}
          />
          <SelectField
            label="Orientação do telhado"
            value={f.orientacao}
            onChange={(v) => set("orientacao", v)}
            options={(Object.keys(ORIENTACAO_LABEL) as Orientacao[]).map((o) => ({
              value: o,
              label: ORIENTACAO_LABEL[o],
            }))}
          />
        </div>
      </Accordion>

      {/* RESULT HERO */}
      <div className="glass rounded-3xl p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* BOILER: valor calculado + volume escolhido (arbitrado pelo projetista) */}
          <div className="rounded-2xl bg-ink-900/50 p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Boiler · água quente</div>
            <div className="mt-0.5 font-display text-3xl font-bold text-amber">
              {fmt(r.volBoilerUsado, 0)} <span className="text-xl">L</span>
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {r.usouEscolhido ? (
                <>
                  volume escolhido · calculado{" "}
                  <span className="text-zinc-400">{fmt(r.volBoilerQuente, 0)} L</span>
                </>
              ) : (
                <>valor calculado (exato {fmt(r.volBoilerQuente, 1)} L)</>
              )}
            </div>

            {/* campo: o projetista arbitra o tamanho comercial que vai usar */}
            <div className="mt-3">
              <NumberField
                label="Volume escolhido (boiler comercial)"
                value={f.volumeBoilerEscolhido}
                onChange={(v) => set("volumeBoilerEscolhido", v)}
                unit="L"
                hint={`0 = usar o calculado · na vida real são tamanhos fechados (600, 800, 1000…). Sugestão: ${fmt(
                  r.volBoilerSugerido,
                  0,
                )} L`}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => set("volumeBoilerEscolhido", 0)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                    !r.usouEscolhido
                      ? "bg-amber/15 text-amber"
                      : "border border-ink-600 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  calculado
                </button>
                {chipsBoiler.map((t) => {
                  const ativo = f.volumeBoilerEscolhido === t;
                  const sugerido = t === r.volBoilerSugerido;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("volumeBoilerEscolhido", t)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                        ativo
                          ? "bg-amber/15 text-amber"
                          : `border border-ink-600 hover:text-zinc-200 ${
                              sugerido ? "text-amber/80" : "text-zinc-400"
                            }`
                      }`}
                    >
                      {fmt(t, 0)}
                      {sugerido && !ativo ? " ★" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <Hero
            titulo="Comprar coletores"
            valor={`${r.nColetoresCorrigido}`}
            sub={`exato: ${fmt(r.nCorrigidoExato, 2)} · puxa do volume ${
              r.usouEscolhido ? "escolhido" : "calculado"
            } (${fmt(r.volBoilerUsado, 0)} L)`}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Det l="Consumo total / dia" v={`${fmt(r.consumoTotal, 0)} L`} />
          <Det l="Volume água fria" v={`${fmt(r.volFria, 0)} L`} />
          <Det l="% água quente (mistura)" v={`${fmt(r.pctMisturaAQ, 1)} %`} />
          <Det l="% água fria (mistura)" v={`${fmt(100 - r.pctMisturaAQ, 1)} %`} />
        </div>
      </div>

      {/* COMO CHEGAMOS NO Nº DE COLETORES */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Como chegamos nos coletores
        </h3>
        <table className="w-full text-sm">
          <tbody className="text-zinc-200">
            <Row l="Energia útil diária" v={`${fmt(r.energiaUtil, 0)} kWh`} />
            <Row l="Coletores (bruto, c/ clima)" v={`${fmt(r.nColetoresExato, 2)} → ${r.nColetoresBruto}`} />
            <Row
              l="Fator clima"
              v={fmt(r.fatorClima, 2).replace(/\.00$/, "")}
            />
            <Row
              l="Coletores corrigidos (c/ orientação)"
              v={`${fmt(r.nCorrigidoExato, 2)} → ${r.nColetoresCorrigido}`}
            />
            <Row
              l="Fator orientação"
              v={fmt(r.fatorOrientacao, 2).replace(/\.00$/, "")}
            />
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          ROUNDUP em cada etapa (sempre arredonda pra cima). Energia útil ={" "}
          <span className="text-zinc-400">
            volume {r.usouEscolhido ? "escolhido" : "calculado"} ({fmt(r.volBoilerUsado, 0)} L)
          </span>{" "}
          × ΔT ÷ {fmt(CONST_ENERGIA_UTIL, 1)} (constante da planilha do curso). É o volume do boiler
          que dimensiona as placas — por isso o tamanho escolhido muda o nº de coletores. Mostramos
          também o valor exato antes do arredondamento.
        </p>
      </div>

      {/* DETALHES TÉCNICOS */}
      <Accordion title="Detalhes técnicos (auditar)">
        <div className="grid grid-cols-2 gap-3 text-sm text-zinc-300">
          <Det l="Consumo AF e AQ" v={`${fmt(r.consumoAQ, 0)} L`} />
          <Det l="% mistura (água quente)" v={`${fmt(r.pctMisturaAQ, 1)} %`} />
          <Det l="Vol. boiler calculado (exato)" v={`${fmt(r.volBoilerQuente, 2)} L`} />
          <Det
            l="Vol. usado no cálculo das placas"
            v={`${fmt(r.volBoilerUsado, 0)} L${r.usouEscolhido ? " (escolhido)" : " (calculado)"}`}
          />
          <Det l="Vol. fria (exato)" v={`${fmt(r.volFria, 2)} L`} />
          <Det l="Energia útil (exato)" v={`${fmt(r.energiaUtil, 2)} kWh`} />
          <Det l="Constante energia" v={fmt(CONST_ENERGIA_UTIL, 1)} />
        </div>
      </Accordion>

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
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-0">
            <ClienteField value={cliente} onChange={setCliente} sugestoes={clientesSug} className="w-28 shrink-0 sm:w-40" />
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do cálculo (ex.: Boiler casa)"
              className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber/60"
            />
          </div>
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

function Hero({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-ink-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{titulo}</div>
      <div className="mt-0.5 font-display text-3xl font-bold text-amber">{valor}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <tr className="border-t border-ink-700">
      <td className="py-2 text-zinc-400">{l}</td>
      <td className="py-2 text-right font-semibold text-amber">{v}</td>
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
