"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  calcularTrecho,
  calcularProjeto,
  trechoPadrao,
  normalizarTrecho,
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
import { ErrorBoundary } from "@/components/ErrorBoundary";
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

const MODULO = "pvc-cpvc-pressao";

// Um PROJETO = várias INSERÇÕES (trechos) acumuladas, como nas macros do Excel.
// O "rascunho" é a inserção que está sendo montada; só entra no projeto ao clicar "Inserir".
interface Form {
  material: Material;
  residualInicial: number; // mca disponível na entrada do projeto
  trechos: TrechoSalvo[]; // inserções já confirmadas
}

const PADRAO: Form = { material: "PVC", residualInicial: 10, trechos: [] };

function freshDraft(material: Material, count: number, base?: TrechoSalvo): TrechoSalvo {
  const d = trechoPadrao(material);
  return {
    ...d,
    // ambiente é "pegajoso": o engenheiro costuma inserir vários trechos no mesmo
    // ambiente em sequência (ex.: Banheiro suíte: A-B, B-C, C-D).
    ambiente: base?.ambiente ?? "",
    nome: `Trecho ${count + 1}`,
    // mantém escolhas comuns entre inserções para agilizar (engenheiro repete bitola/peça)
    diametro: base?.diametro ?? d.diametro,
    temperaturaAgua: base?.temperaturaAgua ?? d.temperaturaAgua,
    pecaMinima: base?.pecaMinima ?? d.pecaMinima,
  };
}

export default function PvcCpvcPressao() {
  const [f, setF] = useState<Form>(PADRAO);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // rascunho (inserção atual) e índice em edição (null = nova inserção)
  const [draft, setDraft] = useState<TrechoSalvo>(() => freshDraft("PVC", 0));
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const atualStr = JSON.stringify(f);
    if (projetoId && atualStr === snapshot.current) setEstado("salvo");
    else if (projetoId || atualStr !== JSON.stringify(PADRAO)) setEstado("nao-salvo");
  }, [f, projetoId]);

  function salvarProjetoNuvem() {
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
    const raw = (p.inputs ?? {}) as Partial<Form>;
    // MIGRAÇÃO: projetos salvos em schema antigo podem não ter `trechos`, ou ter
    // trechos sem `ambiente`/`conexoes`/`pecas`. Normalizamos tudo aqui para não
    // estourar "client-side exception" ao abrir/editar (era o bug do feedback).
    const material: Material = raw.material === "CPVC" ? "CPVC" : "PVC";
    const inputs: Form = {
      material,
      residualInicial:
        typeof raw.residualInicial === "number" && Number.isFinite(raw.residualInicial)
          ? raw.residualInicial
          : PADRAO.residualInicial,
      trechos: Array.isArray(raw.trechos) ? raw.trechos.map(normalizarTrecho) : [],
    };
    setF(inputs);
    setDraft(freshDraft(inputs.material, inputs.trechos.length));
    setEditIndex(null);
    setProjetoId(p.id);
    setCliente(p.cliente ?? "");
    setNome(p.nome);
    snapshot.current = JSON.stringify(inputs);
    setSalvoEm(p.atualizadoEm);
    setEstado("salvo");
  }

  function novoProjeto() {
    setF(PADRAO);
    setDraft(freshDraft("PVC", 0));
    setEditIndex(null);
    setProjetoId(null);
    setCliente("");
    setNome("");
    snapshot.current = "";
    setSalvoEm(null);
    setEstado("nao-salvo");
  }

  function trocarMaterial(material: Material) {
    setF((p) => ({
      ...p,
      material,
      trechos: p.trechos.map((tr) => ({
        ...tr,
        material,
        diametro: diametrosDe(material)[1].comercial,
        conexoes: {},
      })),
    }));
    setDraft((d) => ({ ...d, material, diametro: diametrosDe(material)[1].comercial, conexoes: {} }));
  }

  // helpers do rascunho
  const setDraftPatch = (patch: Partial<TrechoSalvo>) => setDraft((d) => ({ ...d, ...patch }));
  const setPeca = (n: string, qtd: number) => setDraft((d) => ({ ...d, pecas: { ...d.pecas, [n]: qtd } }));
  const setConexao = (id: string, qtd: number) =>
    setDraft((d) => ({ ...d, conexoes: { ...d.conexoes, [id]: qtd } }));

  // --- cálculo do projeto (encadeado) ---
  const projeto = useMemo(
    () => calcularProjeto(f.trechos, f.residualInicial),
    [f.trechos, f.residualInicial],
  );

  // pressão de entrada do rascunho: fim da cadeia (nova) ou anterior ao índice editado.
  // Acessos com optional-chaining + fallback: se editIndex ficar momentaneamente fora
  // de range (ex.: excluir trechos enquanto edita, antes do re-render reindexar), não
  // estoura "client-side exception" — cai para a pressão de entrada do projeto.
  const entradaDraft =
    editIndex === null
      ? projeto.length
        ? projeto[projeto.length - 1].resultado.pressaoResidual
        : f.residualInicial
      : editIndex === 0
        ? f.residualInicial
        : projeto[editIndex - 1]?.resultado.pressaoResidual ?? f.residualInicial;

  const r = useMemo(() => calcularTrecho(draft, entradaDraft), [draft, entradaDraft]);

  // resumo do projeto (a casa toda)
  const reprovados = projeto.filter((p) => !p.resultado.residualOk).length;
  const criticaResidual = projeto.length
    ? Math.min(...projeto.map((p) => p.resultado.pressaoResidual))
    : null;

  // agrupa as inserções por AMBIENTE (hierarquia projeto › ambiente › trechos),
  // preservando o índice global de cada trecho (usado em editar/excluir/encadeamento).
  type ProjItem = (typeof projeto)[number];
  type Grupo = { ambiente: string; itens: { p: ProjItem; i: number }[] };
  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, Grupo>();
    projeto.forEach((p: ProjItem, i: number) => {
      const amb = p.trecho.ambiente?.trim() || "Sem ambiente";
      if (!map.has(amb)) map.set(amb, { ambiente: amb, itens: [] });
      map.get(amb)!.itens.push({ p, i });
    });
    return Array.from(map.values());
  }, [projeto]);

  // ações de inserção (igual às macros: vai inserindo, NÃO fecha o projeto)
  function inserir() {
    setF((p) => ({ ...p, trechos: [...p.trechos, { ...draft }] }));
    setDraft((d) => freshDraft(f.material, f.trechos.length + 1, d));
    setEditIndex(null);
  }
  function salvarEdicao() {
    if (editIndex === null) return;
    setF((p) => ({
      ...p,
      trechos: p.trechos.map((x, i) => (i === editIndex ? { ...draft } : x)),
    }));
    setDraft(freshDraft(f.material, f.trechos.length));
    setEditIndex(null);
  }
  function editar(i: number) {
    setDraft(normalizarTrecho(f.trechos[i])); // tolera trecho de schema antigo
    setEditIndex(i);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function cancelarEdicao() {
    setDraft(freshDraft(f.material, f.trechos.length));
    setEditIndex(null);
  }
  function excluirInsercao(i: number) {
    setF((p) => ({ ...p, trechos: p.trechos.filter((_, idx) => idx !== i) }));
    // Reindexa a edição em curso: excluir o próprio trecho editado cancela; excluir
    // um trecho de índice MENOR desloca o array, então editIndex precisa decrementar
    // (senão salvarEdicao gravaria no trecho errado e entradaDraft sairia de range).
    if (editIndex !== null) {
      if (editIndex === i) cancelarEdicao();
      else if (i < editIndex) setEditIndex(editIndex - 1);
    }
  }

  const opcoesDiam = diametrosDe(f.material).map((d) => ({ value: d.comercial, label: d.rotulo }));
  const conexoes = conexoesDe(f.material);
  const isAQ = f.material === "CPVC";
  const editando = editIndex !== null;

  return (
    <ErrorBoundary onReset={novoProjeto}>
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
            Dimensione a casa toda inserindo um trecho de cada vez. A pressão se acumula de uma
            inserção pra próxima — como nas macros, mas sem planilha.
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

      {/* FORM do rascunho (inserção atual) */}
      <div ref={formRef} className="space-y-4 scroll-mt-24">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
            {editando ? `Editando inserção ${editIndex! + 1}` : "Montar nova inserção"}
          </h3>
          {editando && (
            <button onClick={cancelarEdicao} className="text-xs text-amber">
              + nova inserção
            </button>
          )}
        </div>

        <Accordion title="Pressão de entrada do projeto" defaultOpen>
          <NumberField
            label="Pressão de entrada do projeto"
            value={f.residualInicial}
            onChange={(v) => set("residualInicial", v)}
            unit="mca"
            hint="Pressão disponível na chegada (ex.: coluna do reservatório). Entra no 1º trecho."
          />
        </Accordion>

        <Accordion title="Tubo & geometria" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Diâmetro comercial"
              value={draft.diametro}
              onChange={(v) => setDraftPatch({ diametro: Number(v) })}
              options={opcoesDiam}
            />
            <NumberField
              label="Comprimento real"
              value={draft.comprimentoReal}
              onChange={(v) => setDraftPatch({ comprimentoReal: v })}
              unit="m"
            />
            <NumberField
              label="Elevação que SOBE"
              value={draft.sobe}
              onChange={(v) => setDraftPatch({ sobe: v })}
              unit="m"
            />
            <NumberField
              label="Elevação que DESCE"
              value={draft.desce}
              onChange={(v) => setDraftPatch({ desce: v })}
              unit="m"
              hint={`desnível (desce − sobe) = ${r.desnivel.toFixed(2)} m · subir perde pressão`}
            />
            <NumberField
              label="Incremento pressurizador"
              value={draft.incrementoPressurizador}
              onChange={(v) => setDraftPatch({ incrementoPressurizador: v })}
              unit="mca"
            />
          </div>
        </Accordion>

        {isAQ && (
          <Accordion title="Temperatura da água (CPVC)" defaultOpen>
            <NumberField
              label="Temperatura da água"
              value={draft.temperaturaAgua}
              onChange={(v) => setDraftPatch({ temperaturaAgua: v })}
              unit="°C"
              hint="Define a viscosidade → Reynolds → fator de atrito (Darcy-Weisbach)"
            />
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
                value={draft.pecas[p.nome] ?? 0}
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

        <Accordion title={`Conexões do trecho · comp. equivalente (${conexoes.length})`}>
          <p className="mb-1 text-[11px] leading-relaxed text-zinc-500">
            Tabela completa de conexões {f.material} da planilha do curso ({conexoes.length} tipos).
            O valor entre parênteses é o comp. equivalente para a bitola {draft.diametro} mm.
          </p>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-ink-700/60 p-2">
            <div className="grid grid-cols-1 gap-3">
              {conexoes.map((c) => (
                <Stepper
                  key={c.id}
                  label={`${c.nome} (${(c.valores[draft.diametro] ?? 0).toFixed(2)} m)`}
                  value={draft.conexoes[c.id] ?? 0}
                  onChange={(v) => setConexao(c.id, v)}
                  min={0}
                  max={40}
                />
              ))}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Comp. equivalente: <span className="font-semibold text-zinc-300">{r.compEquivalente.toFixed(2)} m</span>
          </div>
        </Accordion>

        <Accordion title="Registro de pressão & válvula">
          <div className="grid grid-cols-2 gap-4">
            <Stepper
              label="Registro de pressão (qtd)"
              value={draft.qtdRegistroPressao}
              onChange={(v) => setDraftPatch({ qtdRegistroPressao: v })}
              min={0}
              max={10}
            />
            {isAQ && (
              <Stepper
                label="Válvula misturadora (qtd)"
                value={draft.qtdValvulaMisturadora}
                onChange={(v) => setDraftPatch({ qtdValvulaMisturadora: v })}
                min={0}
                max={10}
              />
            )}
            <SelectField
              label="Peça crítica (mínimo)"
              value={draft.pecaMinima}
              onChange={(v) => setDraftPatch({ pecaMinima: String(v) })}
              options={PRESSAO_MINIMA.map((p) => ({ value: p.id, label: `${p.nome} (${p.mca} mca)` }))}
            />
          </div>
        </Accordion>

        <Accordion title="Ambiente & trecho" defaultOpen>
          <p className="mb-2 text-[11px] text-zinc-500">
            Organização do projeto: <span className="text-zinc-400">projeto › ambiente › trechos</span>.
            O ambiente se mantém entre inserções pra você lançar vários trechos seguidos.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                Ambiente
              </label>
              <input
                value={draft.ambiente}
                onChange={(e) => setDraftPatch({ ambiente: e.target.value })}
                placeholder="Ex.: Banheiro suíte"
                className="w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-3 text-base font-semibold text-zinc-100 outline-none focus:border-amber/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                Trecho
              </label>
              <input
                value={draft.nome}
                onChange={(e) => setDraftPatch({ nome: e.target.value })}
                placeholder="Ex.: A → B"
                className="w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-3 text-base font-semibold text-zinc-100 outline-none focus:border-amber/60"
              />
            </div>
          </div>
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

      {/* RESULT HERO — inserção atual (prévia, antes de inserir) */}
      <div className="glass rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-xs font-bold uppercase tracking-widest text-amber">
            {editando
              ? `Editando: ${[draft.ambiente, draft.nome].filter(Boolean).join(" · ")}`
              : "Inserção atual (prévia)"}{" "}
            · {f.material} {draft.diametro} mm
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              r.residualOk ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            }`}
          >
            {r.residualOk ? "Pressão OK" : "Pressão insuficiente!"}
          </span>
        </div>

        <PipeFlow velocidade={r.velocidade} label="água no trecho" />

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
            mínimo p/ {PRESSAO_MINIMA.find((p) => p.id === draft.pecaMinima)?.nome}: {r.pressaoMinima.toFixed(2)} mca
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
          <Hero titulo="Pressão disponível" valor={`${r.pressaoDisponivel.toFixed(2)} mca`} sub={`entra ${entradaDraft.toFixed(2)} mca`} />
        </div>

        {isAQ && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Mini l="Reynolds" v={r.reynolds > 0 ? r.reynolds.toFixed(0) : "—"} />
            <Mini l="Regime" v={r.regime} />
            <Mini l="Fator f" v={r.fatorAtrito > 0 ? r.fatorAtrito.toFixed(4) : "—"} />
          </div>
        )}

        {/* AÇÃO PRIMÁRIA: inserir (igual macro). NÃO fecha o projeto. */}
        <div className="mt-4 flex gap-2">
          {editando ? (
            <>
              <button
                onClick={salvarEdicao}
                className="flex-1 rounded-xl bg-amber py-3.5 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-[0.98]"
              >
                Salvar alterações
              </button>
              <button
                onClick={cancelarEdicao}
                className="rounded-xl border border-ink-600 px-4 py-3.5 text-sm font-semibold text-zinc-400"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={inserir}
              className="flex-1 rounded-xl bg-amber py-3.5 font-display text-base font-bold uppercase tracking-wider text-ink-900 active:scale-[0.98]"
            >
              + Inserir no projeto
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          {editando
            ? "Você está editando uma inserção já no projeto."
            : "Insira quantos trechos precisar (10, 15, 20+). Isso não fecha o projeto."}
        </p>
      </div>

      {/* RESUMO DO PROJETO (a casa toda) */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <ResumoItem titulo="Inserções" valor={`${f.trechos.length}`} />
          <ResumoItem
            titulo="Pressão crítica"
            valor={criticaResidual === null ? "—" : `${criticaResidual.toFixed(1)}`}
            sub="mca"
            alerta={criticaResidual !== null && criticaResidual < 1}
          />
          <ResumoItem
            titulo="Pontos reprovados"
            valor={`${reprovados}`}
            alerta={reprovados > 0}
          />
        </div>
      </div>

      {/* LISTA DE INSERÇÕES DO PROJETO */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Inserções do projeto ({f.trechos.length})
        </h3>
        {projeto.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nenhuma inserção ainda. Monte o trecho acima e toque em{" "}
            <span className="font-semibold text-amber">+ Inserir no projeto</span>. Vá repetindo pra
            dimensionar a casa inteira.
          </p>
        ) : (
          <div className="space-y-4">
            {grupos.map((g) => (
              <div key={g.ambiente}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="font-display text-[11px] font-bold uppercase tracking-wider text-amber/90">
                    {g.ambiente}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {g.itens.length} trecho{g.itens.length > 1 ? "s" : ""}
                  </span>
                  <div className="h-px flex-1 bg-ink-700" />
                </div>
                <ol className="space-y-2">
                  {g.itens.map(({ p, i }) => {
                    const ok = p.resultado.residualOk;
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                          i === editIndex ? "border-amber/60 bg-amber/5" : "border-ink-600"
                        }`}
                      >
                        <span className="font-display text-xs font-bold text-zinc-500">{i + 1}</span>
                        <button onClick={() => editar(i)} className="min-w-0 flex-1 text-left">
                          <div className="truncate text-sm font-medium text-zinc-100">
                            {p.trecho.nome || "Trecho"}
                            <span className="text-zinc-500">
                              {" "}· {f.material} {p.trecho.diametro}mm
                            </span>
                            {i === editIndex && <span className="ml-1 text-amber">· editando</span>}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            residual{" "}
                            <span className={ok ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
                              {p.resultado.pressaoResidual.toFixed(2)} mca
                            </span>{" "}
                            · V {p.resultado.velocidade.toFixed(2)} m/s
                          </div>
                        </button>
                        <button
                          onClick={() => editar(i)}
                          className="text-xs text-zinc-500 hover:text-amber"
                        >
                          editar
                        </button>
                        <button
                          onClick={() => excluirInsercao(i)}
                          className="text-xs text-zinc-500 hover:text-red-400"
                        >
                          excluir
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          A pressão residual de cada inserção vira a entrada da próxima automaticamente. A
          numeração (#) é a <span className="text-zinc-400">ordem de inserção</span> — é ela que
          define a sequência hidráulica, mesmo que os trechos estejam agrupados por ambiente.
          Verde = atende o mínimo da peça; vermelho = insuficiente ou negativa. Toque numa
          inserção para editar.
        </p>
      </div>

      {/* MEUS PROJETOS (persistência do projeto inteiro) */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
            Meus projetos
          </h3>
          {projetoId && (
            <button onClick={novoProjeto} className="text-xs text-amber">
              + novo projeto
            </button>
          )}
        </div>
        {projetos.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nenhum projeto salvo ainda. Monte as inserções e toque em “Salvar projeto”.
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
                      {inp.material} · {inp.trechos?.length ?? 0} inserção(ões) · salvo{" "}
                      {tempoRelativo(p.atualizadoEm)}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      excluirProjeto(p.id);
                      if (p.id === projetoId) novoProjeto();
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

      {/* BARRA STICKY: ação primária = INSERIR; salvar projeto é secundário */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {editando ? (
            <div className="flex items-center gap-2">
              <button
                onClick={salvarEdicao}
                className="flex-1 rounded-xl bg-amber py-3 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-95"
              >
                Salvar alterações no trecho {editIndex! + 1}
              </button>
              <button
                onClick={cancelarEdicao}
                className="rounded-xl border border-ink-600 px-4 py-3 text-sm text-zinc-400"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={inserir}
                className="flex-1 rounded-xl bg-amber py-3 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-95"
              >
                + Inserir no projeto ({f.trechos.length})
              </button>
              <ClienteField value={cliente} onChange={setCliente} sugestoes={clientesSug} className="hidden w-36 shrink-0 sm:block" />
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do projeto"
                className="hidden min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-amber/60 sm:block"
              />
              <button
                onClick={salvarProjetoNuvem}
                className="rounded-xl border border-amber/40 px-4 py-3 text-sm font-bold text-amber active:scale-95"
              >
                {projetoId ? "Atualizar" : "Salvar projeto"}
              </button>
            </div>
          )}
          {/* campo de nome no mobile */}
          {!editando && (
            <>
              <ClienteField value={cliente} onChange={setCliente} sugestoes={clientesSug} className="mt-2 w-full sm:hidden" />
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do projeto (ex.: Casa Jerivá - prumada AF)"
                className="mt-2 w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber/60 sm:hidden"
              />
            </>
          )}
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}

function ResumoItem({
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
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{titulo}</div>
      <div className={`mt-0.5 font-display text-2xl font-bold ${alerta ? "text-red-400" : "text-zinc-100"}`}>
        {valor}
        {sub && <span className="ml-1 text-sm text-zinc-500">{sub}</span>}
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
