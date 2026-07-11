"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  calcular,
  amostraCurvas,
  detalheEmVazao,
  vazaoParaVelocidade,
  dnInterno,
  Inputs,
  Trecho,
  DN_CPVC,
  CONEXOES,
  AQUECEDORES,
  BOMBAS,
} from "@/lib/calc/circuladores";
import { NumberField, SelectField, Accordion } from "@/components/Fields";
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
import fotoTbhweSs from "./fotos/tbhwe-ss-100w.png";
import fotoTbhweIp from "./fotos/tbhwe-ip-br-120w.png";
import fotoTbhux from "./fotos/tbhux-rn.png";
import fotoWsBr from "./fotos/ws-br.png";
import fotoTbhli from "./fotos/tbhli.png";

const MODULO = "circuladores";

// Foto por bomba (variações do mesmo modelo físico compartilham a foto — igual à planilha).
const FOTOS: Record<string, { src: string }> = {
  "TBHWE-SS 100W · Velocidade 1": fotoTbhweSs,
  "TBHWE-SS 100W · Velocidade 2": fotoTbhweSs,
  "TBHWE-SS 100W · Velocidade 3": fotoTbhweSs,
  "TBHWE-IP-BR 120W": fotoTbhweIp,
  "TBHUX-RN 3/4CV 220V": fotoTbhux,
  "WS-BR 1/2CV": fotoWsBr,
  "WS-BR 1/4CV": fotoWsBr,
  "TBHLI 1,0CV": fotoTbhli,
  "TBHLI-70 1/2CV": fotoTbhli,
};

// Estado serializável do formulário = Inputs + bomba selecionada.
interface Form extends Inputs {
  bombaSelecionada: string;
}

function trechoPadrao(nome: string, dnExterno: number, vazao: number): Trecho {
  return {
    nome,
    dnExterno,
    vazao,
    comprimentoReal: 0,
    conexoes: {},
    desnivel: 0,
    pressurizacao: 0,
    registrosPressao: 0,
    valvulasMisturadoras: 0,
    kvValvula: 0,
    aquecedorModelo: "",
    aquecedorQtd: 0,
  };
}

const PADRAO: Form = {
  temperaturaAgua: 40,
  pressaoDisponivelInicial: 0,
  bombaSelecionada: BOMBAS[2].nome, // TBHWE-SS 100W Velocidade 3
  trechos: [
    {
      ...trechoPadrao("Tronco", 22, 6),
      comprimentoReal: 2,
      conexoes: { "Curva 90°": 1, "Tê passagem direta e saída lateral": 1, "Registro de gaveta aberto": 1 },
    },
    {
      ...trechoPadrao("Anel de recirculação", 22, 3.4),
      comprimentoReal: 15,
      conexoes: { "Joelho 90°": 6 },
    },
  ],
  cenarios: [3, 6, 18, 22],
};

const opcoesDN = DN_CPVC.map((d) => ({ value: d.externo, label: d.rotulo }));
const opcoesAquecedor = [
  { value: "", label: "Nenhum" },
  ...AQUECEDORES.map((a) => ({ value: a.modelo, label: a.modelo })),
];

const num = (x: number, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : "—");

export default function RecirculacaoConsumo() {
  const [f, setF] = useState<Form>(PADRAO);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // ---- edição de trechos ----
  const patchTrecho = (idx: number, patch: Partial<Trecho>) =>
    setF((p) => ({
      ...p,
      trechos: p.trechos.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));

  const patchConexao = (idx: number, nome: string, qtd: number) =>
    setF((p) => ({
      ...p,
      trechos: p.trechos.map((t, i) => {
        if (i !== idx) return t;
        const conexoes = { ...t.conexoes };
        if (qtd > 0) conexoes[nome] = qtd;
        else delete conexoes[nome];
        return { ...t, conexoes };
      }),
    }));

  const addTrecho = () =>
    setF((p) => ({
      ...p,
      trechos: [...p.trechos, trechoPadrao(`Trecho ${p.trechos.length + 1}`, 22, 6)],
    }));

  const removeTrecho = (idx: number) =>
    setF((p) => ({ ...p, trechos: p.trechos.filter((_, i) => i !== idx) }));

  const setCenario = (idx: number, v: number) =>
    setF((p) => ({ ...p, cenarios: p.cenarios.map((c, i) => (i === idx ? v : c)) }));

  // painéis expansíveis (Conexões / Perdas locais) por trecho — abrem em largura total
  const [paineis, setPaineis] = useState<Set<string>>(() => new Set());
  const togglePainel = (key: string) =>
    setPaineis((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  // velocidade-alvo (helper transitório p/ arbitrar a vazão pela velocidade no Trecho 1)
  const [velAlvo, setVelAlvo] = useState(2.5);

  // ---- estado de salvamento ("Meus Projetos") ----
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [nome, setNome] = useState("");
  const [estado, setEstado] = useState<EstadoSalvo>("nao-salvo");
  const [salvoEm, setSalvoEm] = useState<number | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [clientesSug, setClientesSug] = useState<string[]>([]);
  const snapshot = useRef<string>("");
  // edição inline do nome de um projeto salvo
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");

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
    const atual = JSON.stringify(f);
    if (projetoId && atual === snapshot.current) setEstado("salvo");
    else if (projetoId || atual !== JSON.stringify(PADRAO)) setEstado("nao-salvo");
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
    setF(p.inputs as Form);
    setProjetoId(p.id);
    setCliente(p.cliente ?? "");
    setNome(p.nome);
    snapshot.current = JSON.stringify(p.inputs);
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

  function duplicar(p: Projeto) {
    salvarProjeto<Form>({
      modulo: MODULO,
      nome: `${p.nome} (cópia)`,
      inputs: p.inputs as Form,
    });
    refresh();
  }

  function iniciarRenomear(p: Projeto) {
    setEditandoId(p.id);
    setEditNome(p.nome);
  }

  function confirmarRenomear(p: Projeto) {
    const novoNome = editNome.trim() || p.nome;
    salvarProjeto<Form>({ id: p.id, modulo: MODULO, nome: novoNome, inputs: p.inputs as Form });
    if (p.id === projetoId) setNome(novoNome);
    setEditandoId(null);
    refresh();
  }

  // ---- cálculo ao vivo ----
  const r = useMemo(() => calcular(f), [f]);
  const bombaSel = BOMBAS.find((b) => b.nome === f.bombaSelecionada) ?? BOMBAS[0];
  const bombaSelRes = r.bombas.find((b) => b.nome === f.bombaSelecionada) ?? null;
  const curvas = useMemo(
    () => amostraCurvas(r.sistema, bombaSel, r.qMaxSistema, bombaSelRes?.qOp ?? null),
    [r.sistema, bombaSel, r.qMaxSistema, bombaSelRes]
  );

  // vazão equivalente à velocidade-alvo no Trecho 1 (para arbitrar a vazão pela velocidade)
  const dnIntTronco = dnInterno(f.trechos[0]?.dnExterno ?? 0);
  const vazaoEquivVel = vazaoParaVelocidade(velAlvo, dnIntTronco);

  // colunas do detalhamento por trecho: 1 por cenário + ponto de operação (oficial)
  const qOp = bombaSelRes?.qOp ?? null;
  const colunasDetalhe = useMemo(() => {
    const cols = f.cenarios
      .filter((q) => Number.isFinite(q) && q > 0)
      .map((q, i) => ({ titulo: `Cenário ${i + 1}`, q, linhas: detalheEmVazao(f, q), destaque: false }));
    if (qOp !== null) {
      cols.push({ titulo: "Ponto de operação", q: qOp, linhas: detalheEmVazao(f, qOp), destaque: true });
    }
    return cols;
  }, [f, qOp]);

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Ferramentas
          </Link>
          <h1 className="mt-1 font-display text-xl font-bold text-zinc-100">
            Cálculo de Circuladores
          </h1>
          <p className="text-sm text-zinc-400">
            Perda de carga trecho a trecho, curva do sistema e seleção do circulador de recirculação.
          </p>
        </div>
        <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
      </div>

      {/* PARÂMETROS GERAIS */}
      <Accordion title="Parâmetros gerais" defaultOpen>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.8fr)_1fr_1fr]">
          <NumberField
            label="Temp. da água"
            value={f.temperaturaAgua}
            onChange={(v) => set("temperaturaAgua", v)}
            unit="°C"
            hint="Define a viscosidade"
          />
          <div>
            <span className="field-label">Tempo de espera / purga</span>
            <Link
              href="/modulos/tempo-espera"
              target="_blank"
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm font-bold text-amber transition hover:bg-amber/20 active:scale-95"
            >
              Purga
            </Link>
            <span className="mt-1 block text-[11px] text-zinc-500">
              Abre a ferramenta de tempo de espera (vários trechos) em nova aba.
            </span>
          </div>
          <div>
            <span className="field-label">Equilíbrio entre anéis</span>
            <Link
              href="/modulos/balanco-vazao"
              target="_blank"
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm font-bold text-amber transition hover:bg-amber/20 active:scale-95"
            >
              Equilibrar vazões
            </Link>
            <span className="mt-1 block text-[11px] text-zinc-500">
              Abre a ferramenta de balanço (Anel 1 × Anel 2) em nova aba.
            </span>
          </div>
        </div>
      </Accordion>

      {/* TRECHOS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
            Trechos do caminho crítico
          </h2>
          <span className="text-[11px] text-zinc-500">
            O 1º trecho é o tronco (referência de vazão da curva do sistema)
          </span>
        </div>

        {r.trechos.map((tr, idx) => {
          const t = f.trechos[idx];
          const lEquiv = tr.comprimentoEquiv;
          const conexoesAtivas = Object.entries(t.conexoes).filter(([, q]) => q > 0);
          return (
            <div key={idx} className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={t.nome}
                  onChange={(e) => patchTrecho(idx, { nome: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-100 outline-none focus:border-amber/60"
                />
                {f.trechos.length > 1 && (
                  <button
                    onClick={() => removeTrecho(idx)}
                    className="shrink-0 rounded-lg border border-ink-600 px-2.5 py-2 text-xs text-zinc-500 hover:text-red-400"
                  >
                    remover
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <SelectField
                  label="DN"
                  value={t.dnExterno}
                  onChange={(v) => patchTrecho(idx, { dnExterno: Number(v) })}
                  options={opcoesDN}
                />
                <NumberField
                  label="Vazão"
                  value={t.vazao}
                  onChange={(v) => patchTrecho(idx, { vazao: v })}
                  unit="L/min"
                  step={0.1}
                />
                <NumberField
                  label="Compr. real"
                  value={t.comprimentoReal}
                  onChange={(v) => patchTrecho(idx, { comprimentoReal: v })}
                  unit="m"
                  step={0.1}
                />
                <div className="flex flex-col justify-center rounded-xl bg-ink-700 px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400">Comp. equiv.</span>
                  <span className="text-sm font-semibold text-zinc-200">{num(lEquiv)} m</span>
                </div>
                <PainelBtn
                  titulo="Conexões"
                  resumo={`${conexoesAtivas.length} tipo(s) · ${num(lEquiv)} m`}
                  aberto={paineis.has(`${idx}:conex`)}
                  onClick={() => togglePainel(`${idx}:conex`)}
                />
                <PainelBtn
                  titulo="Perdas locais"
                  resumo="registro, válvula, aquecedor"
                  aberto={paineis.has(`${idx}:perdas`)}
                  onClick={() => togglePainel(`${idx}:perdas`)}
                />
              </div>

              {/* Conexões — conteúdo em largura total */}
              {paineis.has(`${idx}:conex`) && (
                <div className="mt-3 rounded-xl border border-amber/30 bg-ink-900/40 p-3">
                  <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                    {CONEXOES.map((c) => (
                      <div key={c.nome} className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={t.conexoes[c.nome] ?? 0}
                          onChange={(e) =>
                            patchConexao(idx, c.nome, Math.max(0, parseInt(e.target.value) || 0))
                          }
                          className="w-14 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 text-center text-sm font-semibold text-zinc-100 outline-none focus:border-amber/60"
                        />
                        <span className="min-w-0 flex-1 text-[12px] leading-tight text-zinc-400">
                          {c.nome}
                          <span className="text-zinc-600"> · {num(c.m[t.dnExterno] ?? 0)} m</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Perdas locais — conteúdo em largura total */}
              {paineis.has(`${idx}:perdas`) && (
                <div className="mt-2 rounded-xl border border-amber/30 bg-ink-900/40 p-3">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <NumberField
                      label="Registros de pressão"
                      value={t.registrosPressao}
                      onChange={(v) => patchTrecho(idx, { registrosPressao: Math.max(0, v) })}
                      step={1}
                      min={0}
                    />
                    <NumberField
                      label="Válvulas misturadoras"
                      value={t.valvulasMisturadoras}
                      onChange={(v) => patchTrecho(idx, { valvulasMisturadoras: Math.max(0, v) })}
                      step={1}
                      min={0}
                    />
                    <NumberField
                      label="Kv da válvula"
                      value={t.kvValvula}
                      onChange={(v) => patchTrecho(idx, { kvValvula: v })}
                      unit="m³/h"
                      step={0.1}
                    />
                    <SelectField
                      label="Aquecedor de passagem"
                      value={t.aquecedorModelo}
                      onChange={(v) => patchTrecho(idx, { aquecedorModelo: String(v) })}
                      options={opcoesAquecedor}
                    />
                    <NumberField
                      label="Qtd. aquecedores"
                      value={t.aquecedorQtd}
                      onChange={(v) => patchTrecho(idx, { aquecedorQtd: Math.max(0, v) })}
                      step={1}
                      min={0}
                    />
                  </div>
                </div>
              )}

              {/* resultado do trecho */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
                <Mini l="Veloc." v={`${num(tr.velocidade)} m/s`} />
                <Mini l="Compr. total" v={`${num(tr.comprimentoTotal)} m`} />
                <Mini l="Perda de carga" v={`${num(tr.perdaDistribuida)} mca`} />
                <Mini l="Residual final" v={`${num(tr.pResidualFinal)} mca`} />
              </div>
            </div>
          );
        })}

        <button
          onClick={addTrecho}
          className="w-full rounded-2xl border border-dashed border-ink-600 py-3 text-sm font-semibold text-amber hover:border-amber/60"
        >
          + Adicionar trecho
        </button>
      </div>

      {/* RESUMO DO CAMINHO CRÍTICO */}
      <div className="rounded-2xl border border-amber/30 bg-ink-800 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Resumo do caminho crítico
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <Hero titulo="Perda total" valor={`${num(r.perdaTotal)} mca`} />
          <Hero titulo="Comprimento" valor={`${num(r.comprimentoTotal, 1)} m`} />
          <Hero titulo="Residual final" valor={`${num(r.residualFinal)} mca`} />
        </div>
      </div>

      {/* CURVA DO SISTEMA */}
      <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Curva do sistema × circulador
        </h3>

        {/* Arbitrar a vazão pela velocidade-alvo no Trecho 1 */}
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-amber/25 bg-amber/5 p-3">
          <div className="w-32">
            <NumberField
              label="Velocidade-alvo (Trecho 1)"
              value={velAlvo}
              onChange={setVelAlvo}
              unit="m/s"
              step={0.1}
            />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Vazão equivalente</div>
            <div className="font-display text-lg font-bold text-amber">{num(vazaoEquivVel, 1)} L/min</div>
            <div className="text-[11px] text-zinc-500">
              Copie esse valor num cenário abaixo para testar o limite de velocidade.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {f.cenarios.map((c, i) => (
            <NumberField
              key={i}
              label={`Cenário ${i + 1}`}
              value={c}
              onChange={(v) => setCenario(i, v)}
              unit="L/min"
              step={0.5}
            />
          ))}
        </div>

        <QHChart
          pontos={curvas}
          qOp={bombaSelRes?.qOp ?? null}
          hOp={bombaSelRes?.hOp ?? null}
          qMin={r.qMinSistema}
          qMax={r.qMaxSistema}
          nomeBomba={bombaSel.nome}
        />

        {/* RESUMO — vazão x perda de carga por cenário */}
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">
            Perda de carga por cenário (para comparar com a curva da bomba)
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {r.pontosSistema.map(([q, h], i) => (
              <div key={i} className="rounded-xl bg-ink-700 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                  Cenário {i + 1}
                </div>
                <div className="font-display text-base font-bold text-zinc-100">{num(q, 1)} L/min</div>
                <div className="font-display text-lg font-bold text-amber">{num(h, 3)} mca</div>
              </div>
            ))}
          </div>
        </div>

        {/* DETALHAMENTO por trecho e cenário (validação) */}
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
                        <div className={`text-[10px] font-normal ${col.destaque ? "text-amber/80" : "text-zinc-500"}`}>{num(col.q, 2)} L/min</div>
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
                      <td className="sticky left-0 bg-ink-800 px-2 py-1 text-left text-zinc-300">
                        {linha0.nome || `Trecho ${ti + 1}`}
                      </td>
                      {colunasDetalhe.map((col, ci) => {
                        const d = col.linhas[ti];
                        const cor = col.destaque ? "bg-amber-deep/20 font-semibold text-amber" : "text-zinc-300";
                        return (
                          <Fragment key={ci}>
                            <td className={`border-l border-ink-700 px-2 py-1 ${cor}`}>{num(d?.q ?? 0, 2)}</td>
                            <td className={`px-2 py-1 ${cor}`}>{num(d?.v ?? 0, 3)}</td>
                            <td className={`px-2 py-1 ${cor}`}>{num(d?.hf ?? 0, 3)}</td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Q em L/min · V em m/s · h_f em m (perda distribuída). Cada cenário escala a vazão de
              todos os trechos proporcionalmente ao Trecho 1.
            </p>
          </Accordion>
        </div>
      </div>

      {/* SELEÇÃO DE BOMBA */}
      <div className="rounded-2xl border border-ink-600 bg-ink-700 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Ponto de operação × bombas
        </h3>

        <SelectField
          label="Bomba destacada no gráfico"
          value={f.bombaSelecionada}
          onChange={(v) => set("bombaSelecionada", String(v))}
          options={BOMBAS.map((b) => ({ value: b.nome, label: b.nome }))}
        />

        {FOTOS[f.bombaSelecionada] && (
          <div className="mt-3 flex flex-col items-center p-2">
            <div
              className="flex items-center justify-center rounded-full p-3"
              style={{
                background:
                  "radial-gradient(ellipse 62% 56% at 50% 46%, rgba(255,255,255,0.16), rgba(255,255,255,0.05) 45%, transparent 72%)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={FOTOS[f.bombaSelecionada].src}
                alt={`Foto da bomba ${f.bombaSelecionada}`}
                className="h-44 w-auto object-contain"
              />
            </div>
            <span className="mt-1 text-[11px] font-medium text-zinc-400">{f.bombaSelecionada}</span>
          </div>
        )}

        {bombaSelRes && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Hero tone="destaque" titulo="Vazão de operação" valor={bombaSelRes.qOp !== null ? `${num(bombaSelRes.qOp, 1)} L/min` : "—"} />
            <Hero tone="destaque" titulo="Pressão de operação" valor={bombaSelRes.hOp !== null ? `${num(bombaSelRes.hOp)} mca` : "—"} />
            <div className="flex flex-col justify-center rounded-2xl bg-ink-600 p-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">Faixa útil</div>
              <div className={`mt-0.5 font-display text-sm font-bold ${bombaSelRes.atende ? "text-emerald-400" : "text-red-400"}`}>
                {bombaSelRes.atende ? "Dentro" : "Fora"}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-zinc-500">
                <th className="pb-2 font-medium">Bomba</th>
                <th className="pb-2 text-right font-medium">Q oper.</th>
                <th className="pb-2 text-right font-medium">P oper.</th>
                <th className="pb-2 text-right font-medium">Atende?</th>
              </tr>
            </thead>
            <tbody>
              {r.bombas.map((b) => {
                const selecionada = b.nome === f.bombaSelecionada;
                return (
                <tr
                  key={b.nome}
                  className={`border-t border-ink-500 ${selecionada ? "bg-amber-deep/45 ring-1 ring-amber" : ""}`}
                >
                  <td className={`py-2 pl-2 pr-2 ${selecionada ? "border-l-4 border-amber font-bold text-amber" : "text-zinc-300"}`}>{b.nome}</td>
                  <td className={`py-2 text-right ${selecionada ? "font-bold text-amber" : "text-zinc-300"}`}>
                    {b.qOp !== null ? `${num(b.qOp, 1)}` : "—"}
                  </td>
                  <td className={`py-2 text-right ${selecionada ? "font-bold text-amber" : "text-zinc-300"}`}>
                    {b.hOp !== null ? `${num(b.hOp)}` : "—"}
                  </td>
                  <td className={`py-2 pr-2 text-right font-semibold ${selecionada ? "text-amber" : b.atende ? "text-emerald-400" : "text-zinc-600"}`}>
                    {b.atende ? "sim" : "fora"}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          O ponto de operação é o cruzamento da curva da bomba com a curva do sistema. “Atende” = o
          ponto cai dentro da faixa útil de vazão (mín–máx dos cenários).
        </p>
      </div>

      {/* MEUS PROJETOS */}
      <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
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
                {editandoId === p.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      autoFocus
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmarRenomear(p);
                        if (e.key === "Escape") setEditandoId(null);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-amber/50 bg-ink-800 px-2 py-1.5 text-sm font-medium text-zinc-100 outline-none"
                    />
                    <button onClick={() => confirmarRenomear(p)} className="shrink-0 text-xs font-bold text-amber">
                      salvar
                    </button>
                    <button onClick={() => setEditandoId(null)} className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300">
                      cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => carregar(p)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium text-zinc-100">{p.nome}</div>
                      <div className="text-[11px] text-zinc-500">salvo {tempoRelativo(p.atualizadoEm)}</div>
                    </button>
                    <button onClick={() => iniciarRenomear(p)} className="ml-3 text-xs text-zinc-500 hover:text-amber">
                      renomear
                    </button>
                    <button onClick={() => duplicar(p)} className="ml-3 text-xs text-zinc-500 hover:text-amber">
                      duplicar
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
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* BARRA STICKY */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-0">
            <ClienteField
              value={cliente}
              onChange={setCliente}
              sugestoes={clientesSug}
              className="w-28 shrink-0 sm:w-40"
            />
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do cálculo (ex.: Anel 01)"
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

// ---------------------------------------------------------------------------
// Gráfico Q × H (curva do sistema × curva da bomba)
// ---------------------------------------------------------------------------

function QHChart({
  pontos,
  qOp,
  hOp,
  qMin,
  qMax,
  nomeBomba,
}: {
  pontos: { q: number; hSistema: number; hBomba: number | null }[];
  qOp: number | null;
  hOp: number | null;
  qMin: number;
  qMax: number;
  nomeBomba: string;
}) {
  const W = 340;
  const H = 210;
  const ml = 34;
  const mr = 10;
  const mt = 12;
  const mb = 26;
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  const xMax = Math.max(1e-6, ...pontos.map((p) => p.q));
  const yMax = Math.max(
    1e-6,
    ...pontos.map((p) => Math.max(p.hSistema, p.hBomba ?? 0))
  ) * 1.05;

  const xAt = (q: number) => ml + (pw * q) / xMax;
  const yAt = (h: number) => mt + ph * (1 - Math.max(0, h) / yMax);

  const path = (sel: (p: (typeof pontos)[number]) => number | null) => {
    let d = "";
    let started = false;
    for (const p of pontos) {
      const v = sel(p);
      if (v === null || !Number.isFinite(v)) {
        started = false;
        continue;
      }
      d += `${started ? "L" : "M"}${xAt(p.q).toFixed(1)},${yAt(v).toFixed(1)} `;
      started = true;
    }
    return d.trim();
  };

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * xMax);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * yMax);

  return (
    <div className="mt-4 w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="curva do sistema × curva da bomba">
        {/* faixa útil de vazão (mín–máx do sistema) */}
        {qMax > qMin && (
          <rect
            x={xAt(qMin)}
            y={mt}
            width={Math.max(0, xAt(qMax) - xAt(qMin))}
            height={ph}
            fill="#FABA0D"
            opacity="0.06"
          />
        )}

        {/* grade + rótulos Y */}
        {yTicks.map((v, k) => (
          <g key={`y${k}`}>
            <line x1={ml} x2={W - mr} y1={yAt(v)} y2={yAt(v)} stroke="#3A3A36" strokeWidth="0.5" />
            <text x={ml - 4} y={yAt(v) + 3} textAnchor="end" fontSize="8" fill="#71717a">
              {v.toFixed(v < 10 ? 1 : 0)}
            </text>
          </g>
        ))}

        {/* rótulos X */}
        {xTicks.map((v, k) => (
          <text key={`x${k}`} x={xAt(v)} y={H - 8} textAnchor="middle" fontSize="8" fill="#71717a">
            {v.toFixed(v < 10 ? 1 : 0)}
          </text>
        ))}

        {/* curvas */}
        <path d={path((p) => p.hSistema)} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
        <path d={path((p) => p.hBomba)} fill="none" stroke="#FABA0D" strokeWidth="2" strokeLinejoin="round" />

        {/* ponto de operação */}
        {qOp !== null && hOp !== null && qOp <= xMax && (
          <>
            <line x1={xAt(qOp)} x2={xAt(qOp)} y1={mt} y2={mt + ph} stroke="#e4e4e7" strokeWidth="0.75" strokeDasharray="3 3" />
            <circle cx={xAt(qOp)} cy={yAt(hOp)} r="4" fill="#e4e4e7" stroke="#18181b" strokeWidth="1.5" />
          </>
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#60a5fa" }} />
          Sistema
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#FABA0D" }} />
          {nomeBomba}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-amber/20" />
          Faixa útil
        </span>
        <span className="ml-auto text-zinc-600">vazão (L/min) · pressão (mca)</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componentes de resultado
// ---------------------------------------------------------------------------

function Hero({ titulo, valor, tone = "grey" }: { titulo: string; valor: string; tone?: "grey" | "light" | "destaque" }) {
  // "grey"/"light" = tons de cinza; "destaque" = amarelo escuro (ponto de operação)
  const bg =
    tone === "destaque"
      ? "bg-amber-deep/20 ring-1 ring-amber-deep/50"
      : tone === "light"
      ? "bg-ink-600"
      : "bg-ink-700";
  return (
    <div className={`rounded-2xl ${bg} p-3`}>
      <div className="text-[11px] uppercase tracking-wider text-zinc-400">{titulo}</div>
      <div className="mt-0.5 font-display text-lg font-bold text-amber">{valor}</div>
    </div>
  );
}

function PainelBtn({
  titulo,
  resumo,
  aberto,
  onClick,
}: {
  titulo: string;
  resumo: string;
  aberto: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-full flex-col justify-center rounded-xl border px-3 py-2 text-left transition ${
        aberto ? "border-amber/60 bg-amber/10" : "border-ink-600 bg-ink-700 hover:border-amber/40"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">{titulo}</span>
        <span className="font-bold text-amber">{aberto ? "−" : "+"}</span>
      </span>
      <span className="mt-0.5 truncate text-[11px] leading-tight text-zinc-300">{resumo}</span>
    </button>
  );
}

function Mini({ l, v, destaque }: { l: string; v: string; destaque?: "ok" | "erro" }) {
  const cor = destaque === "erro" ? "text-red-400" : destaque === "ok" ? "text-emerald-400" : "text-zinc-100";
  return (
    <div className="rounded-lg bg-ink-700 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">{l}</div>
      <div className={`font-semibold ${cor}`}>{v}</div>
    </div>
  );
}
