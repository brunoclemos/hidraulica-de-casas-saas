"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  calcularTrecho,
  calcularProjeto,
  trechoPadrao,
  normalizarTrecho,
  diametrosDe,
  diametroInterno,
  conexoesDe,
  PECAS_UTILIZACAO,
  PRESSAO_MINIMA,
  vazaoTroncoBase,
  ganhoEstaticoProjeto,
  perdaProjetoEmVazao,
  detalheProjetoEmVazao,
  vazaoParaVelocidadeLmin,
  BOMBAS_PRESSURIZACAO,
  MONOCOMANDOS,
  CHUVEIROS,
  FILTRO_Y_KV,
  Material,
  TrechoSalvo,
} from "@/lib/calc/pvc-cpvc-pressao";
import { curvaBomba } from "@/lib/calc/bombas";
import { NumberField, SelectField, Stepper, Accordion } from "@/components/Fields";
import { EstrelaFavorita } from "@/components/EstrelaFavorita";
import { lerFavoritas, alternarFavorita } from "@/lib/favoritas";
import { QHChart } from "@/components/QHChart";
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
  cenarios: number[]; // vazões de tronco (L/min) da curva do sistema (vídeos 4/5)
  bombaSelecionada: string; // bomba destacada no gráfico (catálogo de pressurização)
}

const PADRAO: Form = { material: "PVC", residualInicial: 10, trechos: [], cenarios: [], bombaSelecionada: "" };

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
      // campos novos (vídeos 4/5) — projeto antigo não tem: default vazio.
      cenarios: Array.isArray(raw.cenarios) ? raw.cenarios : [],
      bombaSelecionada: typeof raw.bombaSelecionada === "string" ? raw.bombaSelecionada : "",
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

  // --- curva do sistema & cenários (vídeos 4/5): opera sobre as inserções confirmadas ---
  const setCenario = (idx: number, v: number) =>
    setF((p) => {
      const cen = [...(p.cenarios ?? [])];
      while (cen.length <= idx) cen.push(NaN);
      cen[idx] = v;
      return { ...p, cenarios: cen };
    });

  const baseTronco = useMemo(() => vazaoTroncoBase(f.trechos), [f.trechos]);
  // Feedback 21/jul: com trechos marcados, o cenário entra absoluto só neles.
  const temTronco = useMemo(() => f.trechos.some((t) => t.noTronco), [f.trechos]);
  // cenários válidos: os digitados (>0) ou, se nenhum, múltiplos automáticos do tronco.
  const cenariosValidos = useMemo(() => {
    const manuais = (f.cenarios ?? []).filter((q) => Number.isFinite(q) && q > 0);
    if (manuais.length) return manuais;
    return baseTronco > 0 ? [0.5, 1, 2, 3].map((m) => baseTronco * m) : [];
  }, [f.cenarios, baseTronco]);
  // v5: perda de carga por cenário + residual final simulada (report do cliente 22/jul:
  // na vazão de projeto do tronco ela bate exata com a residual da última inserção).
  const ganhoEstatico = useMemo(() => ganhoEstaticoProjeto(f.trechos), [f.trechos]);
  const pontosPerda = useMemo<[number, number, number][]>(
    () =>
      cenariosValidos.map((q) => {
        const perda = perdaProjetoEmVazao(f.trechos, q);
        return [q, perda, f.residualInicial + ganhoEstatico - perda];
      }),
    [cenariosValidos, f.trechos, f.residualInicial, ganhoEstatico],
  );

  // velocidade-alvo -> vazão equivalente no tronco (1º marcado; sem marcação, 1ª inserção).
  const [velAlvo, setVelAlvo] = useState(2.5);
  const trechoRef = f.trechos.find((t) => t.noTronco) ?? f.trechos[0];
  const dnIntTronco = trechoRef ? diametroInterno(trechoRef.material, trechoRef.diametro) : 0;
  const vazaoEquivVel = vazaoParaVelocidadeLmin(velAlvo, dnIntTronco);

  // --- SELEÇÃO DE BOMBA (modelo do cliente, áudio 18/jul): a bomba é escolhida por UM
  // ponto — a VAZÃO TOTAL do tronco (1ª inserção) e a PRESSÃO que falta pro ponto mais
  // crítico atingir o mínimo. Sem cenário e sem conta nova: pressão necessária =
  // max(pressão mínima − pressão residual), já vem do cálculo trecho a trecho. ---
  const temBombas = BOMBAS_PRESSURIZACAO.length > 0;
  const vazaoProjeto = baseTronco; // vazão total do tronco (L/min)
  const pontoCritico = useMemo(() => {
    if (!projeto.length) return null;
    return projeto.reduce((pior, p) =>
      p.resultado.pressaoMinima - p.resultado.pressaoResidual >
      pior.resultado.pressaoMinima - pior.resultado.pressaoResidual
        ? p
        : pior,
    );
  }, [projeto]);
  const pressaoNecessaria = pontoCritico
    ? Math.max(0, pontoCritico.resultado.pressaoMinima - pontoCritico.resultado.pressaoResidual)
    : 0;

  const bombasRes = useMemo(() => {
    if (!temBombas || !(vazaoProjeto > 0)) return [];
    return BOMBAS_PRESSURIZACAO.map((b) => {
      const c = curvaBomba(b.pontos);
      const dentroFaixa = vazaoProjeto <= c.qMax;
      const hEntrega = dentroFaixa
        ? Math.max(0, c.a + c.b * vazaoProjeto + c.c * vazaoProjeto * vazaoProjeto)
        : 0;
      const atende = dentroFaixa && hEntrega >= pressaoNecessaria;
      return { nome: b.nome, hEntrega, atende, qMax: c.qMax, dentroFaixa };
    });
  }, [temBombas, vazaoProjeto, pressaoNecessaria]);
  // seleção efetiva: se nada foi escolhido (ou o nome salvo não existe mais), cai na 1ª bomba.
  const bombaSelNome =
    f.bombaSelecionada && BOMBAS_PRESSURIZACAO.some((b) => b.nome === f.bombaSelecionada)
      ? f.bombaSelecionada
      : BOMBAS_PRESSURIZACAO[0]?.nome ?? "";
  const bombaSel = BOMBAS_PRESSURIZACAO.find((b) => b.nome === bombaSelNome) ?? null;
  const bombaSelRes = bombasRes.find((b) => b.nome === bombaSelNome) ?? null;

  // gráfico: curva da bomba destacada + linha horizontal da pressão necessária, com
  // marcador no ponto de projeto (vazão de projeto, pressão necessária).
  const curvasGrafico = useMemo(() => {
    const c = bombaSel ? curvaBomba(bombaSel.pontos) : null;
    const qMaxGraf = Math.max((c?.qMax ?? 0) * 1.02, vazaoProjeto * 1.4, 1e-6);
    const N = 48;
    return Array.from({ length: N + 1 }, (_, i) => {
      const q = (i * qMaxGraf) / N;
      const hBomba = c && q <= c.qMax ? c.a + c.b * q + c.c * q * q : null;
      return { q, hSistema: pressaoNecessaria, hBomba };
    });
  }, [bombaSel, pressaoNecessaria, vazaoProjeto]);

  // detalhamento por trecho e cenário (v5): 1 coluna por cenário.
  const colunasDetalhe = useMemo(
    () =>
      cenariosValidos.map((q, i) => ({
        titulo: `Cenário ${i + 1}`,
        q,
        linhas: detalheProjetoEmVazao(f.trechos, q),
        destaque: false,
      })),
    [cenariosValidos, f.trechos],
  );

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
  // Favoritas sobem pro topo (áudio do cliente 22/jul); sort estável preserva a
  // ordem da planilha entre as demais. Carrega no effect pra não divergir do SSR.
  const [favoritas, setFavoritas] = useState<Set<string>>(new Set());
  useEffect(() => {
    setFavoritas(lerFavoritas());
  }, []);
  const conexoesOrdenadas = useMemo(
    () =>
      [...conexoesDe(f.material)].sort(
        (a, b) => Number(favoritas.has(b.id)) - Number(favoritas.has(a.id)),
      ),
    [f.material, favoritas],
  );
  const tiposConexoesAtivos = Object.values(draft.conexoes).filter((q) => q > 0).length;
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

        <Accordion title="Vazão do trecho" defaultOpen>
          {/* Vídeo 1 do cliente: escolher Método dos Pesos OU digitar a vazão. */}
          <div className="grid grid-cols-2 gap-2">
            {([["pesos", "Método dos pesos"], ["manual", "Vazão manual"]] as const).map(
              ([modo, rotulo]) => (
                <button
                  key={modo}
                  type="button"
                  onClick={() => setDraftPatch({ modoVazao: modo })}
                  className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
                    draft.modoVazao === modo
                      ? "border-amber bg-amber/10 text-amber"
                      : "border-ink-600 bg-ink-800 text-zinc-400"
                  }`}
                >
                  {rotulo}
                </button>
              ),
            )}
          </div>

          {draft.modoVazao === "manual" ? (
            <div className="mt-3">
              <NumberField
                label="Vazão do trecho"
                value={draft.vazaoManualLmin}
                onChange={(v) => setDraftPatch({ vazaoManualLmin: v })}
                unit="L/min"
                step={0.1}
                hint="Vazão de projeto informada direto (sem somar pesos)."
              />
              <div className="mt-2 text-[11px] text-zinc-500">
                Equivale a <span className="font-semibold text-zinc-300">{r.vazaoLs.toFixed(3)} L/s</span>.
              </div>
            </div>
          ) : (
            <>
              <p className="mb-1 mt-3 text-[11px] text-zinc-500">
                Quantidade de cada peça abastecida no trecho (define a soma dos pesos → vazão).
              </p>
              {/* Vídeo do cliente 21/jul: steppers full-width "ocupavam a tela inteira" →
                  grid compacto em 2 colunas, mesmo padrão das conexões. */}
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                {PECAS_UTILIZACAO.map((p) => (
                  <div key={p.nome} className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={40}
                      value={draft.pecas[p.nome] ?? 0}
                      onChange={(e) =>
                        setPeca(p.nome, Math.min(40, Math.max(0, parseInt(e.target.value, 10) || 0)))
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-14 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 text-center text-sm font-semibold text-zinc-100 outline-none focus:border-amber/60"
                    />
                    <span className="min-w-0 flex-1 text-[12px] leading-tight text-zinc-400">
                      {p.nome}
                      <span className="text-zinc-600"> · peso {p.peso}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">
                Soma dos pesos:{" "}
                <span className="font-semibold text-zinc-300">{r.somaPesos.toFixed(2)}</span> → vazão{" "}
                {r.vazaoLmin.toFixed(1)} L/min
              </div>
            </>
          )}
        </Accordion>

        {/* Vídeo 2 do cliente: lista de conexões "muito grande" → grid compacto
            (2 colunas, input pequeno) + resumo no título, no padrão do Circuladores. */}
        <Accordion title={`Conexões · ${tiposConexoesAtivos} tipo(s) · ${r.compEquivalente.toFixed(2)} m`}>
          <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
            Tabela completa de conexões {f.material} da planilha do curso ({conexoes.length} tipos).
            O número ao lado de cada peça é o comp. equivalente na bitola {draft.diametro} mm.
            Toque na estrela pra fixar no topo as que você mais usa.
          </p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {conexoesOrdenadas.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.conexoes[c.id] ?? 0}
                  onChange={(e) => setConexao(c.id, Math.max(0, parseInt(e.target.value, 10) || 0))}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-14 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 text-center text-sm font-semibold text-zinc-100 outline-none focus:border-amber/60"
                />
                <span className="min-w-0 flex-1 text-[12px] leading-tight text-zinc-400">
                  {c.nome}
                  <span className="text-zinc-600"> · {(c.valores[draft.diametro] ?? 0).toFixed(2)} m</span>
                </span>
                <EstrelaFavorita
                  ativa={favoritas.has(c.id)}
                  onClick={() => setFavoritas(new Set(alternarFavorita(c.id)))}
                />
              </div>
            ))}
          </div>
        </Accordion>

        <Accordion title="Registros, válvulas & equipamentos">
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
            {/* Vídeo 3 do cliente: Kv editável puxando a mesma fórmula do Circuladores. */}
            {isAQ && (
              <NumberField
                label="Kv da válvula"
                value={draft.kvValvula}
                onChange={(v) => setDraftPatch({ kvValvula: v })}
                unit="m³/h"
                step={0.1}
                hint="Coef. de vazão da válvula misturadora (planilha do curso usa 2,6)."
              />
            )}
            {/* Feedback 21/jul (vídeo 1): monocomando com perda pela curva DOCOL. */}
            <SelectField
              label="Monocomando (curva DOCOL)"
              value={draft.monocomando}
              onChange={(v) => setDraftPatch({ monocomando: String(v) })}
              options={[
                { value: "", label: "Nenhum" },
                ...MONOCOMANDOS.map((m) => ({ value: m.id, label: m.nome })),
              ]}
            />
            {/* Feedback 21/jul: filtro Y com perda por Kv da bitola. */}
            <Stepper
              label="Filtro Y (qtd)"
              value={draft.qtdFiltroY}
              onChange={(v) => setDraftPatch({ qtdFiltroY: v })}
              min={0}
              max={10}
            />
            {draft.qtdFiltroY > 0 && (
              <SelectField
                label="Bitola do filtro Y"
                value={draft.bitolaFiltroY}
                onChange={(v) => setDraftPatch({ bitolaFiltroY: String(v) })}
                options={FILTRO_Y_KV.map((b) => ({ value: b.bitola, label: `${b.bitola} (Kv ${b.kv})` }))}
                hint="Kv preliminar lido do gráfico do fabricante."
              />
            )}
            <SelectField
              label="Peça crítica (mínimo)"
              value={draft.pecaMinima}
              onChange={(v) => setDraftPatch({ pecaMinima: String(v) })}
              options={PRESSAO_MINIMA.map((p) => ({ value: p.id, label: `${p.nome} (${p.mca} mca)` }))}
            />
            {/* Feedback 21/jul (vídeo 3): a curva do chuveiro entra na exigência do ponto. */}
            <SelectField
              label="Chuveiro no ponto (curva)"
              value={draft.chuveiro}
              onChange={(v) => setDraftPatch({ chuveiro: String(v) })}
              options={[
                { value: "", label: "Nenhum" },
                { value: "manual", label: "Manual (digitar a perda)" },
                ...CHUVEIROS.map((c) => ({ value: c.id, label: c.nome })),
              ]}
              hint="Curvas Docol/Deca do PDF do cliente; Manual cobre outros modelos."
            />
            {draft.chuveiro === "manual" && (
              <NumberField
                label="Perda do chuveiro"
                value={draft.perdaChuveiroManual}
                onChange={(v) => setDraftPatch({ perdaChuveiroManual: v })}
                unit="mca"
                step={0.5}
                hint="Perda de carga do chuveiro na vazão de projeto (da curva do fabricante)."
              />
            )}
          </div>

          {/* leitura ao vivo das perdas dos equipamentos ("aparecer na aba", vídeo 1) */}
          {(draft.monocomando || draft.qtdFiltroY > 0 || draft.chuveiro) && (
            <div className="mt-3 space-y-1 rounded-xl border border-ink-600 bg-ink-900/40 px-3 py-2 text-[12px] text-zinc-400">
              {draft.monocomando && (
                <div>
                  Perda do monocomando em {r.vazaoLmin.toFixed(1)} L/min:{" "}
                  <span className="font-semibold text-amber">{r.perdaMonocomando.toFixed(2)} mca</span>
                  {r.monocomandoAcima && (
                    <span className="block text-amber">
                      Vazão acima do alcance da curva — perda subestimada, revise a bitola/tipo.
                    </span>
                  )}
                </div>
              )}
              {draft.qtdFiltroY > 0 && (
                <div>
                  Perda do filtro Y ({draft.qtdFiltroY}× {draft.bitolaFiltroY}):{" "}
                  <span className="font-semibold text-amber">{r.perdaFiltroY.toFixed(2)} mca</span>
                </div>
              )}
              {draft.chuveiro && (
                <div>
                  Exigência no ponto: mínimo {(r.pressaoMinima - r.perdaChuveiro).toFixed(1)} +
                  chuveiro {r.perdaChuveiro.toFixed(2)} ={" "}
                  <span className="font-semibold text-amber">{r.pressaoMinima.toFixed(2)} mca</span>
                  {r.chuveiroAcima && (
                    <span className="block text-amber">
                      Vazão acima do que este chuveiro atinge — nenhuma pressão entrega essa vazão.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
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
          {/* Feedback 21/jul: o cenário de vazão entra só nos trechos do tronco. */}
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-ink-600 bg-ink-800 px-3 py-3">
            <input
              type="checkbox"
              checked={draft.noTronco}
              onChange={(e) => setDraftPatch({ noTronco: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-amber"
            />
            <span>
              <span className="block text-sm font-semibold text-zinc-100">
                Este trecho faz parte do tronco
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">
                Nos cenários de vazão, a vazão do cenário substitui a vazão deste trecho; os
                demais mantêm a vazão de projeto.
              </span>
            </span>
          </label>
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
            {draft.monocomando !== "" && (
              <Det l="Perda monocomando" v={`${r.perdaMonocomando.toFixed(4)} mca`} />
            )}
            {draft.qtdFiltroY > 0 && <Det l="Perda filtro Y" v={`${r.perdaFiltroY.toFixed(4)} mca`} />}
            {draft.chuveiro !== "" && (
              <Det l="Exigência chuveiro" v={`${r.perdaChuveiro.toFixed(2)} mca`} />
            )}
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
                            {p.trecho.noTronco && <span className="ml-1 text-amber">· tronco</span>}
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

      {/* CURVA DO SISTEMA × BOMBA (vídeos 4 e 5 do cliente 18/jul) */}
      {f.trechos.length > 0 && (
        <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
          <h3 className="mb-1 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
            Cenários & seleção de bomba
          </h3>
          <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
            Cada cenário recalcula a casa toda e mostra a perda de carga. A vazão do cenário é
            aplicada aos trechos marcados como <span className="text-zinc-400">tronco</span>; os
            demais mantêm a vazão de projeto.
          </p>
          {!temTronco && (
            <p className="mb-3 rounded-xl border border-amber/30 bg-amber/5 px-3 py-2 text-[11px] leading-relaxed text-amber">
              Nenhum trecho marcado como tronco: o cenário escala todos os trechos
              proporcionalmente. Marque os trechos do tronco na inserção para aplicar a vazão só
              neles.
            </p>
          )}

          {/* velocidade-alvo -> vazão equivalente no tronco */}
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-amber/25 bg-amber/5 p-3">
            <div className="w-32">
              <NumberField
                label="Velocidade-alvo (tronco)"
                value={velAlvo}
                onChange={setVelAlvo}
                unit="m/s"
                step={0.1}
              />
            </div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Vazão equivalente</div>
              <div className="font-display text-lg font-bold text-amber">{vazaoEquivVel.toFixed(1)} L/min</div>
              <div className="text-[11px] text-zinc-500">
                Copie num cenário abaixo pra testar o limite de velocidade.
              </div>
            </div>
          </div>

          {/* cenários de vazão */}
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <NumberField
                key={i}
                label={`Cenário ${i + 1}`}
                value={f.cenarios[i] ?? NaN}
                onChange={(v) => setCenario(i, v)}
                unit="L/min"
                step={0.5}
                compact
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Em branco = múltiplos automáticos do tronco
            {baseTronco > 0 ? ` (base ${baseTronco.toFixed(1)} L/min)` : ""}.
          </p>

          {/* perda de carga por cenário */}
          <div className="mt-4">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">
              Perda de carga por cenário
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {pontosPerda.map(([q, h, res], i) => (
                <div key={i} className="rounded-xl bg-ink-700 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400">Cenário {i + 1}</div>
                  <div className="font-display text-base font-bold text-zinc-100">{q.toFixed(1)} L/min</div>
                  <div className="font-display text-lg font-bold text-amber">{h.toFixed(3)} mca</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">Residual final</div>
                  <div className={`font-display text-sm font-bold ${res < 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {res.toFixed(2)} mca
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Perda = perdas hidráulicas do cenário (tubo, conexões, registro, válvula, monocomando
              e filtro Y). Residual final = pressão de entrada do projeto + desníveis e
              pressurizadores, menos a perda. Na vazão de projeto do tronco, o residual final é o
              mesmo da última inserção da lista.
            </p>
          </div>

          {/* detalhamento por trecho e cenário */}
          <div className="mt-3">
            <Accordion title="Detalhamento por trecho e cenário (validação)">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-right text-[11px]">
                  <thead>
                    <tr className="text-zinc-400">
                      <th className="sticky left-0 bg-ink-800 px-2 py-1 text-left font-semibold">Trecho</th>
                      {colunasDetalhe.map((col, i) => (
                        <th
                          key={i}
                          colSpan={3}
                          className={`border-l border-ink-700 px-2 py-1 text-center font-semibold ${col.destaque ? "bg-amber-deep/45 text-amber" : ""}`}
                        >
                          {col.titulo}
                          <div className={`text-[10px] font-normal ${col.destaque ? "text-amber/80" : "text-zinc-500"}`}>
                            {col.q.toFixed(2)} L/min
                          </div>
                        </th>
                      ))}
                    </tr>
                    <tr className="text-zinc-500">
                      <th className="sticky left-0 bg-ink-800 px-2 py-1"></th>
                      {colunasDetalhe.map((col, i) => (
                        <Fragment key={i}>
                          <th className={`border-l border-ink-700 px-2 py-1 font-medium ${col.destaque ? "bg-amber-deep/45 text-amber" : ""}`}>Q</th>
                          <th className={`px-2 py-1 font-medium ${col.destaque ? "bg-amber-deep/45 text-amber" : ""}`}>V</th>
                          <th className={`px-2 py-1 font-medium ${col.destaque ? "bg-amber-deep/45 text-amber" : ""}`}>h_f</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(colunasDetalhe[0]?.linhas ?? []).map((linha0, ti) => (
                      <tr key={ti} className="border-t border-ink-700">
                        <td className={`sticky left-0 bg-ink-800 px-2 py-1 text-left ${linha0.noTronco ? "font-semibold text-amber" : "text-zinc-300"}`}>
                          {[linha0.ambiente, linha0.nome].filter(Boolean).join(" · ") || `Trecho ${ti + 1}`}
                          {linha0.noTronco && <span className="font-normal text-amber/70"> · tronco</span>}
                        </td>
                        {colunasDetalhe.map((col, ci) => {
                          const d = col.linhas[ti];
                          const cor = col.destaque ? "bg-amber-deep/20 font-semibold text-amber" : "text-zinc-300";
                          return (
                            <Fragment key={ci}>
                              <td className={`border-l border-ink-700 px-2 py-1 ${cor}`}>{(d?.q ?? 0).toFixed(2)}</td>
                              <td className={`px-2 py-1 ${cor}`}>{(d?.v ?? 0).toFixed(3)}</td>
                              <td className={`px-2 py-1 ${cor}`}>{(d?.hf ?? 0).toFixed(3)}</td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Q em L/min · V em m/s · h_f em m (perda distribuída no tubo + conexões). A vazão do
                cenário entra só nos trechos do tronco (em âmbar); os demais mantêm a vazão de
                projeto. A coluna h_f mostra só a perda distribuída; a perda do card soma também
                registro, válvula, monocomando e filtro Y.
              </p>
            </Accordion>
          </div>

          {/* seleção de bomba — ponto de projeto (vazão total do tronco + pressão necessária) */}
          <div className="mt-4 rounded-2xl border border-ink-600 bg-ink-700 p-4">
            <h4 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
              Seleção de bomba (pressurização)
            </h4>
            {temBombas ? (
              <>
                {/* ponto de projeto: vazão total do tronco + pressão que a bomba precisa dar */}
                <div className="grid grid-cols-2 gap-2">
                  <Hero titulo="Vazão de projeto" valor={`${vazaoProjeto.toFixed(1)} L/min`} sub="vazão total do tronco" />
                  <Hero
                    titulo="Pressão necessária"
                    valor={`${pressaoNecessaria.toFixed(2)} mca`}
                    sub={
                      pressaoNecessaria > 0 && pontoCritico
                        ? `falta no ponto crítico: ${[pontoCritico.trecho.ambiente, pontoCritico.trecho.nome].filter(Boolean).join(" · ") || "trecho"}`
                        : "a rede já atinge o mínimo sem bomba"
                    }
                    alerta={pressaoNecessaria > 0}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  A bomba é escolhida por 1 ponto: a <span className="text-zinc-400">vazão total do
                  tronco</span> e a <span className="text-zinc-400">pressão que falta</span> pro ponto
                  mais crítico atingir o mínimo (pressão mínima − pressão residual, já sai do cálculo).
                  Curvas Q×H aproximadas do catálogo Texius.
                </p>

                <div className="mt-3">
                  <SelectField
                    label="Bomba destacada no gráfico"
                    value={bombaSelNome}
                    onChange={(v) => set("bombaSelecionada", String(v))}
                    options={BOMBAS_PRESSURIZACAO.map((b) => ({ value: b.nome, label: b.nome }))}
                  />
                </div>

                <QHChart
                  pontos={curvasGrafico}
                  qOp={vazaoProjeto}
                  hOp={pressaoNecessaria}
                  qMin={0}
                  qMax={0}
                  nomeBomba={bombaSel?.nome ?? ""}
                  nomeSistema="Pressão necessária"
                />

                {bombaSelRes && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Hero
                      titulo="Entrega na vazão"
                      valor={bombaSelRes.dentroFaixa ? `${bombaSelRes.hEntrega.toFixed(2)} mca` : "—"}
                      sub={bombaSelRes.dentroFaixa ? `em ${vazaoProjeto.toFixed(0)} L/min` : "vazão acima da bomba"}
                    />
                    <Hero titulo="Precisa" valor={`${pressaoNecessaria.toFixed(2)} mca`} />
                    <div className="flex flex-col justify-center rounded-2xl bg-ink-600 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-zinc-400">Atende?</div>
                      <div className={`mt-0.5 font-display text-sm font-bold ${bombaSelRes.atende ? "text-emerald-400" : "text-red-400"}`}>
                        {bombaSelRes.atende ? "Sim" : "Não"}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="text-zinc-500">
                        <th className="pb-2 font-medium">Bomba</th>
                        <th className="pb-2 text-right font-medium">Entrega em {vazaoProjeto.toFixed(0)} L/min</th>
                        <th className="pb-2 text-right font-medium">Atende?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bombasRes.map((b) => {
                        const selecionada = b.nome === bombaSelNome;
                        return (
                          <tr key={b.nome} className={`border-t border-ink-500 ${selecionada ? "bg-amber-deep/45 ring-1 ring-amber" : ""}`}>
                            <td className={`py-2 pl-2 pr-2 ${selecionada ? "border-l-4 border-amber font-bold text-amber" : "text-zinc-300"}`}>{b.nome}</td>
                            <td className={`py-2 text-right ${selecionada ? "font-bold text-amber" : "text-zinc-300"}`}>{b.dentroFaixa ? `${b.hEntrega.toFixed(2)} mca` : "vazão alta"}</td>
                            <td className={`py-2 pr-2 text-right font-semibold ${selecionada ? "text-amber" : b.atende ? "text-emerald-400" : "text-zinc-600"}`}>{b.atende ? "sim" : "não"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                  “Atende” = a bomba entrega pressão ≥ a necessária na vazão de projeto. Dimensionamento
                  preliminar — confira contra a planilha do curso.
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-amber/30 bg-amber/5 p-4 text-center">
                <div className="font-display text-sm font-bold text-amber">Seleção de bomba — em breve</div>
                <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-zinc-400">
                  A seleção entra assim que você enviar o catálogo de bombas de pressurização
                  (modelos e curvas Q × H).
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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
