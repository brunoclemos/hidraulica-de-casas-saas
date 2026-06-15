"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  calcularTrecho,
  calcularProjeto,
  trechoPadrao,
  diametrosDe,
  conexoesDe,
  PECAS_UTILIZACAO,
  PRESSAO_MINIMA,
  Material,
  TrechoSalvo,
} from "@/lib/calc/pvc-cpvc-pressao";
import { NumberField, SelectField, Stepper, Accordion } from "@/components/Fields";
import { PipeFlow } from "@/components/PipeFlow";
import { SaveBadge, EstadoSalvo } from "@/components/SaveBadge";
import {
  listarProjetos,
  salvarProjeto,
  excluirProjeto,
  tempoRelativo,
  Projeto,
} from "@/lib/projetos";

const MODULO = "pvc-cpvc-pressao";

// O "Meus Projetos" aqui salva o PROJETO INTEIRO (lista de trechos + residual inicial).
interface Form {
  material: Material;
  residualInicial: number; // mca disponível na entrada do projeto
  trechos: TrechoSalvo[];
}

function novoTrechoSalvo(material: Material, n: number): TrechoSalvo {
  return { ...trechoPadrao(material), nome: `Trecho ${n}` };
}

function padrao(material: Material): Form {
  return {
    material,
    residualInicial: 10,
    trechos: [novoTrechoSalvo(material, 1)],
  };
}

const PADRAO: Form = padrao("PVC");

export default function PvcCpvcPressao() {
  const [f, setF] = useState<Form>(PADRAO);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // índice do trecho atualmente em edição (o "trecho atual" dos outputs herói)
  const [atual, setAtual] = useState(0);

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
    const atualStr = JSON.stringify(f);
    if (projetoId && atualStr === snapshot.current) {
      setEstado("salvo");
    } else if (projetoId || atualStr !== JSON.stringify(PADRAO)) {
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
    const inputs = p.inputs as Form;
    setF(inputs);
    setAtual(0);
    setProjetoId(p.id);
    setNome(p.nome);
    snapshot.current = JSON.stringify(inputs);
    setSalvoEm(p.atualizadoEm);
    setEstado("salvo");
  }

  function novo() {
    setF(PADRAO);
    setAtual(0);
    setProjetoId(null);
    setNome("");
    snapshot.current = "";
    setSalvoEm(null);
    setEstado("nao-salvo");
  }

  // troca de material: refaz os diâmetros default dos trechos (dropdown muda de tabela)
  function trocarMaterial(material: Material) {
    setF((p) => ({
      ...p,
      material,
      trechos: p.trechos.map((t) => ({
        ...t,
        material,
        diametro: diametrosDe(material)[1].comercial, // 2ª bitola como default seguro
        conexoes: {}, // ids de conexão são compatíveis, mas zera p/ evitar bitola inexistente
      })),
    }));
  }

  // helpers para mexer no trecho atual
  const t = f.trechos[atual];
  function setTrecho(patch: Partial<TrechoSalvo>) {
    setF((p) => ({
      ...p,
      trechos: p.trechos.map((x, i) => (i === atual ? { ...x, ...patch } : x)),
    }));
  }
  function setPeca(nome: string, qtd: number) {
    setTrecho({ pecas: { ...t.pecas, [nome]: qtd } });
  }
  function setConexao(id: string, qtd: number) {
    setTrecho({ conexoes: { ...t.conexoes, [id]: qtd } });
  }

  function addTrecho() {
    setF((p) => {
      const novos = [...p.trechos, novoTrechoSalvo(p.material, p.trechos.length + 1)];
      return { ...p, trechos: novos };
    });
    setAtual(f.trechos.length);
  }
  function excluirTrecho(i: number) {
    setF((p) => ({ ...p, trechos: p.trechos.filter((_, idx) => idx !== i) }));
    setAtual((a) => Math.max(0, a >= i ? a - 1 : a));
  }

  // --- cálculo AO VIVO ---
  // projeto inteiro encadeado (residual de um vira "anterior" do próximo)
  const projeto = useMemo(
    () => calcularProjeto(f.trechos, f.residualInicial),
    [f.trechos, f.residualInicial],
  );
  // residual que entra no trecho atual = residual do anterior (ou inicial)
  const residualAnterior = atual === 0 ? f.residualInicial : projeto[atual - 1].resultado.pressaoResidual;
  const r = useMemo(
    () => (t ? calcularTrecho(t, residualAnterior) : null),
    [t, residualAnterior],
  );

  const opcoesDiam = diametrosDe(f.material).map((d) => ({ value: d.comercial, label: d.rotulo }));
  const conexoes = conexoesDe(f.material);
  const isAQ = f.material === "CPVC";

  if (!t || !r) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">Nenhum trecho. Adicione um trecho para começar.</p>
        <button onClick={addTrecho} className="rounded-xl bg-amber px-5 py-2.5 text-sm font-bold text-ink-900">
          Adicionar trecho
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Ferramentas
          </Link>
          <h1 className="mt-1 font-display text-xl font-bold text-zinc-100">
            PVC/CPVC, Bombas & Pressão
          </h1>
          <p className="text-sm text-zinc-400">
            Dimensionamento trecho a trecho (Método dos Pesos, NBR 5626) com pressão residual acumulada.
          </p>
        </div>
        <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
      </div>

      {/* TOGGLE AF (PVC) x AQ (CPVC) */}
      <div className="grid grid-cols-2 gap-2">
        {(["PVC", "CPVC"] as Material[]).map((m) => (
          <button
            key={m}
            onClick={() => trocarMaterial(m)}
            className={`rounded-xl border py-3 text-sm font-semibold transition ${
              f.material === m
                ? "border-amber bg-amber/10 text-amber"
                : "border-ink-600 bg-ink-800 text-zinc-400"
            }`}
          >
            {m === "PVC" ? "Água fria · PVC (AF)" : "Água quente · CPVC (AQ)"}
          </button>
        ))}
      </div>

      {/* RESULT HERO — trecho atual */}
      <div className="glass rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-xs font-bold uppercase tracking-widest text-amber">
            {t.nome} · {f.material} {t.diametro} mm
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              r.residualOk
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {r.residualOk ? "Pressão OK" : "Pressão insuficiente!"}
          </span>
        </div>

        <PipeFlow velocidade={r.velocidade} label="água no trecho" />

        {/* número-herói: pressão residual */}
        <div className="mt-4 rounded-2xl bg-ink-900/50 p-4 text-center">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            Pressão residual no ponto
          </div>
          <div
            className={`mt-0.5 font-display text-4xl font-bold ${
              r.residualOk ? "text-amber" : "text-red-400"
            }`}
          >
            {r.pressaoResidual.toFixed(2)} <span className="text-xl">mca</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            mínimo p/ {PRESSAO_MINIMA.find((p) => p.id === t.pecaMinima)?.nome}: {r.pressaoMinima.toFixed(2)} mca
            {" · "}
            {(r.pressaoResidual * 9.80665).toFixed(0)} kPa
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Hero titulo="Vazão" valor={`${r.vazaoLs.toFixed(3)} L/s`} sub={`${r.vazaoLmin.toFixed(1)} L/min`} />
          <Hero
            titulo="Velocidade"
            valor={`${r.velocidade.toFixed(2)} m/s`}
            sub={r.velocidadeOk ? "dentro do limite" : "acima de 3 m/s!"}
            alerta={!r.velocidadeOk}
          />
          <Hero titulo="Perda de carga" valor={`${r.perdaCargaTotal.toFixed(3)} mca`} sub={`${r.compTotal.toFixed(1)} m equiv.`} />
          <Hero titulo="Pressão disponível" valor={`${r.pressaoDisponivel.toFixed(2)} mca`} sub={`entra ${residualAnterior.toFixed(2)} mca`} />
        </div>

        {/* extras CPVC (Darcy-Weisbach) */}
        {isAQ && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Mini l="Reynolds" v={r.reynolds > 0 ? r.reynolds.toFixed(0) : "—"} />
            <Mini l="Regime" v={r.regime} />
            <Mini l="Fator f" v={r.fatorAtrito > 0 ? r.fatorAtrito.toFixed(4) : "—"} />
          </div>
        )}
      </div>

      {/* SELETOR DE TRECHO + lista encadeada */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
            Trechos do projeto
          </h3>
          <button
            onClick={addTrecho}
            className="rounded-lg border border-amber/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber"
          >
            + Trecho
          </button>
        </div>
        <ul className="space-y-2">
          {projeto.map((p, i) => {
            const ok = p.resultado.residualOk;
            return (
              <li
                key={i}
                className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                  i === atual ? "border-amber/50 bg-amber/5" : "border-ink-600"
                }`}
              >
                <button onClick={() => setAtual(i)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium text-zinc-100">
                    {p.trecho.nome}{" "}
                    <span className="text-zinc-500">
                      · {f.material} {p.trecho.diametro}mm
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    residual{" "}
                    <span className={ok ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
                      {p.resultado.pressaoResidual.toFixed(2)} mca
                    </span>{" "}
                    · V {p.resultado.velocidade.toFixed(2)} m/s
                  </div>
                </button>
                {f.trechos.length > 1 && (
                  <button
                    onClick={() => excluirTrecho(i)}
                    className="ml-3 text-xs text-zinc-500 hover:text-red-400"
                  >
                    excluir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          A pressão residual de cada trecho vira a pressão de entrada do próximo automaticamente.
          Verde = atende o mínimo da peça; vermelho = insuficiente ou negativa.
        </p>
      </div>

      {/* FORM do trecho atual */}
      <div className="space-y-4">
        <Accordion title="Tubo & geometria" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Diâmetro comercial"
              value={t.diametro}
              onChange={(v) => setTrecho({ diametro: Number(v) })}
              options={opcoesDiam}
            />
            <NumberField
              label="Comprimento real"
              value={t.comprimentoReal}
              onChange={(v) => setTrecho({ comprimentoReal: v })}
              unit="m"
            />
            <NumberField
              label="Elevação que SOBE"
              value={t.sobe}
              onChange={(v) => setTrecho({ sobe: v })}
              unit="m"
            />
            <NumberField
              label="Elevação que DESCE"
              value={t.desce}
              onChange={(v) => setTrecho({ desce: v })}
              unit="m"
              hint={`desnível (sobe − desce) = ${r.desnivel.toFixed(2)} m`}
            />
            <NumberField
              label="Incremento pressurizador"
              value={t.incrementoPressurizador}
              onChange={(v) => setTrecho({ incrementoPressurizador: v })}
              unit="mca"
            />
            {atual === 0 && (
              <NumberField
                label="Pressão de entrada"
                value={f.residualInicial}
                onChange={(v) => set("residualInicial", v)}
                unit="mca"
                hint="Pressão disponível no início do projeto"
              />
            )}
          </div>
        </Accordion>

        {isAQ && (
          <Accordion title="Temperatura da água (CPVC)" defaultOpen>
            <div className="grid grid-cols-1 gap-4">
              <NumberField
                label="Temperatura da água"
                value={t.temperaturaAgua}
                onChange={(v) => setTrecho({ temperaturaAgua: v })}
                unit="°C"
                hint="Define a viscosidade → Reynolds → fator de atrito (Darcy-Weisbach)"
              />
            </div>
          </Accordion>
        )}

        <Accordion title="Peças de utilização do trecho" defaultOpen>
          <p className="mb-1 text-[11px] text-zinc-500">
            Quantidade de cada peça abastecida no trecho (define a soma dos pesos → vazão).
          </p>
          <div className="grid grid-cols-1 gap-3">
            {PECAS_UTILIZACAO.map((p) => (
              <Stepper
                key={p.nome}
                label={`${p.nome} (peso ${p.peso})`}
                value={t.pecas[p.nome] ?? 0}
                onChange={(v) => setPeca(p.nome, v)}
                min={0}
                max={40}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Soma dos pesos: <span className="font-semibold text-zinc-300">{r.somaPesos.toFixed(2)}</span>
          </div>
        </Accordion>

        <Accordion title="Conexões do trecho (comp. equivalente)">
          <p className="mb-1 text-[11px] leading-relaxed text-amber/80">
            Subconjunto curado das conexões mais comuns (valores reais da planilha do curso). A
            tabela completa tem ~32 conexões CPVC / ~17 PVC; aqui estão as principais.
          </p>
          <div className="grid grid-cols-1 gap-3">
            {conexoes.map((c) => (
              <Stepper
                key={c.id}
                label={`${c.nome} (${(c.valores[t.diametro] ?? 0).toFixed(2)} m)`}
                value={t.conexoes[c.id] ?? 0}
                onChange={(v) => setConexao(c.id, v)}
                min={0}
                max={40}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Comp. equivalente: <span className="font-semibold text-zinc-300">{r.compEquivalente.toFixed(2)} m</span>
          </div>
        </Accordion>

        <Accordion title="Registro de pressão & válvula">
          <div className="grid grid-cols-2 gap-4">
            <Stepper
              label="Registro de pressão (qtd)"
              value={t.qtdRegistroPressao}
              onChange={(v) => setTrecho({ qtdRegistroPressao: v })}
              min={0}
              max={10}
            />
            {isAQ && (
              <Stepper
                label="Válvula misturadora (qtd)"
                value={t.qtdValvulaMisturadora}
                onChange={(v) => setTrecho({ qtdValvulaMisturadora: v })}
                min={0}
                max={10}
              />
            )}
            <SelectField
              label="Peça crítica (mínimo)"
              value={t.pecaMinima}
              onChange={(v) => setTrecho({ pecaMinima: String(v) })}
              options={PRESSAO_MINIMA.map((p) => ({ value: p.id, label: `${p.nome} (${p.mca} mca)` }))}
            />
          </div>
        </Accordion>

        <Accordion title="Nome do trecho">
          <input
            value={t.nome}
            onChange={(e) => setTrecho({ nome: e.target.value })}
            placeholder="Ex.: Coluna AF → banheiro suíte"
            className="w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-3 text-base font-semibold text-zinc-100 outline-none focus:border-amber/60"
          />
        </Accordion>

        <Accordion title="Detalhes técnicos (auditar)">
          <div className="grid grid-cols-2 gap-3 text-sm text-zinc-300">
            <Det l="Ø interno" v={`${r.diametroInterno} mm`} />
            <Det l="Comp. total" v={`${r.compTotal.toFixed(2)} m`} />
            {f.material === "PVC" ? (
              <>
                <Det l="J unitária (FWH)" v={`${r.perdaUnitaria.toFixed(5)} mca/m`} />
                <Det l="Perda tubulação" v={`${r.perdaCargaTubulacao.toFixed(4)} mca`} />
                <Det l="Perda conexões" v={`${r.perdaCargaConexao.toFixed(4)} mca`} />
              </>
            ) : (
              <>
                <Det l="Reynolds" v={r.reynolds > 0 ? r.reynolds.toFixed(0) : "—"} />
                <Det l="Fator atrito f" v={r.fatorAtrito > 0 ? r.fatorAtrito.toFixed(5) : "—"} />
                <Det l="Perda Darcy" v={`${r.perdaCargaTubulacao.toFixed(4)} mca`} />
              </>
            )}
            <Det l="Perda registro RP" v={`${r.perdaRegistroPressao.toFixed(4)} mca`} />
            {isAQ && <Det l="Perda válv. mist." v={`${r.perdaValvulaMisturadora.toFixed(4)} mca`} />}
            <Det l="Desnível" v={`${r.desnivel.toFixed(2)} m`} />
            <Det l="Pressão disponível" v={`${r.pressaoDisponivel.toFixed(2)} mca`} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            PVC: Fair-Whipple-Hsiao (J = 8,69·10⁶·Q¹·⁷⁵·Dⁱⁿᵗ⁻⁴·⁷⁵/10). CPVC: Darcy-Weisbach com
            fator de atrito por Colebrook-White (bissecção). π = 3,14 (paridade com a planilha do curso).
          </p>
        </Accordion>
      </div>

      {/* MEUS PROJETOS (salva o projeto inteiro = lista de trechos) */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Meus projetos
        </h3>
        {projetos.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nenhum projeto salvo ainda. Dê um nome e toque em “Salvar projeto”.
          </p>
        ) : (
          <ul className="space-y-2">
            {projetos.map((p) => {
              const inp = p.inputs as Form;
              return (
                <li
                  key={p.id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                    p.id === projetoId ? "border-amber/50 bg-amber/5" : "border-ink-600"
                  }`}
                >
                  <button onClick={() => carregar(p)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium text-zinc-100">{p.nome}</div>
                    <div className="text-[11px] text-zinc-500">
                      {inp.material} · {inp.trechos?.length ?? 0} trecho(s) · salvo{" "}
                      {tempoRelativo(p.atualizadoEm)}
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
              );
            })}
          </ul>
        )}
      </div>

      {/* BARRA STICKY de salvar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do projeto (ex.: Casa Jerivá - prumada AF)"
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

function Hero({
  titulo,
  valor,
  sub,
  alerta,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-ink-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{titulo}</div>
      <div className={`mt-0.5 font-display text-2xl font-bold ${alerta ? "text-red-400" : "text-amber"}`}>
        {valor}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function Mini({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-xl bg-ink-900/50 p-2.5 text-center">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{l}</div>
      <div className="mt-0.5 font-display text-sm font-bold text-zinc-200">{v}</div>
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
