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
import { useMemorial, BlocoMemorial } from "@/lib/memorial";

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

  useMemorial(MODULO, () => {
    const rotulo = (i: number) =>
      f.trechos[i].nome.trim() || `Trecho ${String(i + 1).padStart(2, "0")}`;
    const dnRotulo = (dn: number) => opcoesDN.find((o) => o.value === dn)?.label ?? "—";

    const faltas = f.trechos.flatMap((t, i) => {
      const pendencias: string[] = [];
      if (!(t.vazao > 0)) pendencias.push("vazão");
      if (!(t.distancia > 0)) pendencias.push("distância");
      if (!(r.trechos[i].dnInterno > 0)) pendencias.push("DN");
      return pendencias.length ? [`${rotulo(i)}: ${pendencias.join(", ")}`] : [];
    });

    const maisLento = r.trechos.reduce(
      (mx, t, i) => (t.tempoSeg > r.trechos[mx].tempoSeg ? i : mx),
      0
    );
    const velMax = Math.max(...r.trechos.map((t) => t.velocidade));
    const pontosSimultaneos = f.trechos.some((t) => t.pontos > 1);

    const blocos: BlocoMemorial[] = [
      {
        tipo: "campos",
        titulo: "Dados de entrada",
        itens: [
          { label: "Trechos em série", valor: num(f.trechos.length, 0) },
          ...f.trechos.map((t, i) => ({
            label: rotulo(i),
            valor: `${num(t.vazao)} L/min · ${num(t.pontos, 0)} ponto(s) · ${dnRotulo(
              t.dnExterno
            )} · ${num(t.distancia)} m`,
          })),
        ],
      },
      {
        tipo: "texto",
        titulo: "Método de cálculo",
        paragrafos: [
          "O tempo de espera é o tempo de trânsito da água quente do aquecedor até o ponto de utilização. Em cada trecho a velocidade sai da equação da continuidade (V = Q/A, com A calculada sobre o diâmetro interno do CPVC) e o tempo do trecho é a distância dividida pela velocidade. Os trechos estão em série: a água percorre um depois do outro, e o tempo total é a soma dos tempos.",
          "O volume interno de cada trecho (A × L) é a água fria que sai pelo ponto antes de a quente chegar — o desperdício por abertura. É esse número que justifica recircular, aproximar o aquecedor ou reduzir o diâmetro do ramal.",
          "A NBR 5626 não fixa tempo máximo de espera; o critério é de conforto e de desperdício. O limite normativo verificado aqui é o de velocidade, 3,0 m/s. Área e velocidade usam π = 3,14, como nas fórmulas da planilha de referência do curso — é o que mantém este memorial idêntico a ela célula a célula.",
        ],
      },
      {
        tipo: "tabela",
        titulo: "Memorial — trecho a trecho",
        colunas: [
          "Trecho",
          "Vazão (L/min)",
          "DN",
          "DN int. (mm)",
          "Distância (m)",
          "Velocidade (m/s)",
          "Volume (L)",
          "Tempo",
        ],
        linhas: r.trechos.map((tr, i) => [
          rotulo(i),
          num(f.trechos[i].vazao),
          dnRotulo(f.trechos[i].dnExterno),
          num(tr.dnInterno, 1),
          num(f.trechos[i].distancia),
          num(tr.velocidade),
          num(tr.volume),
          minSeg(tr.tempoSeg),
        ]),
        realce: [maisLento],
        nota: [
          `Linha realçada: ${rotulo(maisLento)} é o trecho que mais pesa na espera (${minSeg(
            r.trechos[maisLento].tempoSeg
          )}).`,
          pontosSimultaneos
            ? "Pontos simultâneos entram como informação de projeto: velocidade, tempo e volume usam a vazão informada no próprio trecho."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
      {
        tipo: "resultado",
        titulo: "Conclusão",
        itens: [
          {
            label: "Tempo total de espera",
            valor: minSeg(r.tempoTotalSeg),
            nota: `${num(r.tempoTotalSeg, 1)} s · ${f.trechos.length} trecho(s) em série`,
          },
          {
            label: "Volume total descartado",
            valor: `${num(r.volumeTotal)} L`,
            nota: "Água fria descartada em cada abertura até a quente chegar",
          },
          {
            label: "Velocidade máxima",
            valor: `${num(velMax)} m/s`,
            nota:
              velMax > 3
                ? "Acima do limite de 3,0 m/s da NBR 5626 — reveja o DN do trecho"
                : "Dentro do limite de 3,0 m/s da NBR 5626",
            alerta: velMax > 3,
          },
        ],
      },
    ];

    return {
      cliente: cliente.trim(),
      calculo: nome.trim() || "Sem nome",
      normas: [
        "ABNT NBR 5626:2020 — sistemas prediais de água fria e água quente",
        "Equação da continuidade — V = Q/A (velocidade e tempo de trânsito)",
        "Diâmetros internos CPVC por DN comercial — tabela da planilha de referência",
      ],
      blocos,
      impedimento: faltas.length
        ? `Complete o dimensionamento antes de emitir o memorial — ${faltas.join("; ")}.`
        : undefined,
    };
  });


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
