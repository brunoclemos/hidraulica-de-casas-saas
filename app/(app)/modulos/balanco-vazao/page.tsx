"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  calcular,
  minSeg,
  normalizarAnel,
  detalharIda,
  dnInterno,
  Inputs,
  Anel,
  TrechoIda,
  FonteVazao,
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
import { useMemorial, BlocoMemorial } from "@/lib/memorial";

const MODULO = "balanco-vazao";

type Form = Inputs;

const PADRAO: Form = {
  a1: { material: "CPVC", dnExterno: 22, rugosidade: 0.006, comprimentoTotal: 27.37, trechosIda: [{ dnExterno: 22, comprimento: 15.52, fonteVazao: "tronco" }] },
  a2: { material: "CPVC", dnExterno: 22, rugosidade: 0.006, comprimentoTotal: 44.05, trechosIda: [{ dnExterno: 22, comprimento: 31.9, fonteVazao: "tronco" }] },
  temperatura: 40,
  vazaoTotal: 6,
  tempoAlvoAnel2: 1,
};

const opcoesMaterial: { value: Material; label: string }[] = [
  { value: "CPVC", label: "CPVC" },
  { value: "PVC", label: "PVC" },
];

const opcoesFonte: { value: FonteVazao; label: string }[] = [
  { value: "tronco", label: "Tronco" },
  { value: "braco", label: "Braço" },
  { value: "manual", label: "Manual" },
];

const num = (x: number, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : "—");

export default function BalancoVazao() {
  const [f, setF] = useState<Form>(PADRAO);

  const setAnel = (qual: "a1" | "a2", patch: Partial<Anel>) =>
    setF((p) => ({ ...p, [qual]: { ...p[qual], ...patch } }));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // trechos do caminho de ida (por anel)
  const patchTrecho = (qual: "a1" | "a2", idx: number, patch: Partial<TrechoIda>) =>
    setF((p) => ({
      ...p,
      [qual]: {
        ...p[qual],
        trechosIda: p[qual].trechosIda.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
      },
    }));
  // trecho novo entra no fim da ida = depois da derivação → braço
  const addTrecho = (qual: "a1" | "a2") =>
    setF((p) => ({
      ...p,
      [qual]: {
        ...p[qual],
        trechosIda: [
          ...p[qual].trechosIda,
          { dnExterno: p[qual].dnExterno, comprimento: 5, fonteVazao: "braco" as const },
        ],
      },
    }));
  const removeTrecho = (qual: "a1" | "a2", idx: number) =>
    setF((p) => ({
      ...p,
      [qual]: { ...p[qual], trechosIda: p[qual].trechosIda.filter((_, i) => i !== idx) },
    }));

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
  function salvarComoNovo() {
    setEstado("salvando");
    const p = salvarProjeto<Form>({ id: undefined, modulo: MODULO, cliente: cliente.trim() || undefined, nome: nome.trim() || "Sem nome", inputs: f });
    setProjetoId(p.id); setNome(p.nome); snapshot.current = JSON.stringify(f); setSalvoEm(p.atualizadoEm); setEstado("salvo"); refresh();
  }
  function carregar(p: Projeto) {
    // projetos salvos antes dos trechos de ida têm comprimentoReal único — migra na carga
    const bruto = p.inputs as Form;
    let form: Form = { ...bruto, a1: normalizarAnel(bruto.a1), a2: normalizarAnel(bruto.a2) };
    // salvos antes da TAG (13/07 tarde): vazão digitada vira "manual" (preserva o número),
    // sem vazão vira "braço" (= vazão automática de antes, resultado idêntico)
    const migra = (a: Anel): Anel => ({
      ...a,
      trechosIda: a.trechosIda.map((t) =>
        t.fonteVazao ? t : { ...t, fonteVazao: t.vazao != null ? ("manual" as const) : ("braco" as const) }
      ),
    });
    form = { ...form, a1: migra(form.a1), a2: migra(form.a2) };
    setF(form); setProjetoId(p.id); setCliente(p.cliente ?? ""); setNome(p.nome); snapshot.current = JSON.stringify(form); setSalvoEm(p.atualizadoEm); setEstado("salvo");
  }
  function novo() {
    setF(PADRAO); setProjetoId(null); setCliente(""); setNome(""); snapshot.current = ""; setSalvoEm(null); setEstado("nao-salvo");
  }

  const r = useMemo(() => calcular(f), [f]);
  const somaOk = Math.abs(r.soma - f.vazaoTotal) < 0.05;

  useMemorial(MODULO, () => {
    const aneis = [
      { rotulo: "Anel 1", anel: normalizarAnel(f.a1), q: r.q1, volume: r.volume1, tempo: r.tempo1Seg },
      { rotulo: "Anel 2", anel: normalizarAnel(f.a2), q: r.q2, volume: r.volume2, tempo: r.tempo2Seg },
    ];
    const dnRotulo = (material: Material, dn: number) =>
      DN_TABELA[material].find((d) => d.externo === dn)?.rotulo ?? "—";
    const fonteRotulo = (t: TrechoIda) =>
      opcoesFonte.find((o) => o.value === (t.fonteVazao ?? (t.vazao != null ? "manual" : "braco")))
        ?.label ?? "—";

    // A ida de cada anel já sai detalhada trecho a trecho pelo motor (mesma função da tela).
    const idas = aneis.map((a) => detalharIda(a.anel, a.q, f.vazaoTotal));

    const faltas: string[] = [];
    if (!Number.isFinite(f.temperatura)) faltas.push("temperatura da água");
    if (!(f.vazaoTotal > 0)) faltas.push("vazão total do tronco");
    if (!(f.tempoAlvoAnel2 > 0)) faltas.push("tempo máximo no Anel 2");
    aneis.forEach(({ rotulo, anel }, i) => {
      if (!(anel.comprimentoTotal > 0)) faltas.push(`${rotulo}: comprimento de ida e volta`);
      if (!(anel.rugosidade >= 0)) faltas.push(`${rotulo}: rugosidade`);
      anel.trechosIda.forEach((t, j) => {
        const nomeTrecho = `${rotulo}, trecho ${String(j + 1).padStart(2, "0")}`;
        if (!(t.comprimento > 0)) faltas.push(`${nomeTrecho}: comprimento`);
        if (!(idas[i][j].vazaoUsada > 0)) faltas.push(`${nomeTrecho}: vazão`);
        if (!(idas[i][j].dnInterno > 0)) faltas.push(`${nomeTrecho}: DN`);
      });
    });

    const linhasIda = aneis.flatMap(({ rotulo, anel }, i) =>
      anel.trechosIda.map((t, j) => ({
        anel: rotulo,
        trecho: `Trecho ${String(j + 1).padStart(2, "0")}`,
        material: anel.material,
        dnExterno: t.dnExterno,
        fonte: fonteRotulo(t),
        comprimento: t.comprimento,
        detalhe: idas[i][j],
      }))
    );
    const maisLentoIda = linhasIda.reduce(
      (mx, l, i) => (l.detalhe.tempoSeg > linhasIda[mx].detalhe.tempoSeg ? i : mx),
      0
    );
    const anelMaisLento = r.tempo2Seg > r.tempo1Seg ? 1 : 0;
    const velMax = Math.max(...linhasIda.map((l) => l.detalhe.velocidade));
    const alvoSeg = f.tempoAlvoAnel2 * 60;

    const blocos: BlocoMemorial[] = [
      {
        tipo: "campos",
        titulo: "Dados de entrada",
        itens: [
          { label: "Temperatura da água", valor: `${num(f.temperatura, 0)} °C` },
          { label: "Vazão total do tronco", valor: `${num(f.vazaoTotal)} L/min` },
          { label: "Tempo máximo desejado no Anel 2", valor: `${num(f.tempoAlvoAnel2)} min` },
          ...aneis.flatMap(({ rotulo, anel }) => [
            {
              label: `${rotulo} — material e DN`,
              valor: `${anel.material} · ${dnRotulo(anel.material, anel.dnExterno)}`,
            },
            {
              label: `${rotulo} — comprimento de ida e volta`,
              valor: `${num(anel.comprimentoTotal)} m (real + equivalente)`,
            },
            { label: `${rotulo} — rugosidade`, valor: `${num(anel.rugosidade, 3)} mm` },
          ]),
        ],
      },
      {
        tipo: "texto",
        titulo: "Método de cálculo",
        paragrafos: [
          "Os dois anéis saem do mesmo tronco e retornam ao mesmo ponto, então a perda de carga nos dois é igual — e é essa igualdade que reparte a vazão. Com a perda de carga de Darcy-Weisbach igualada nos dois ramos, a vazão de cada anel fica proporcional a K = D^2,5 / √(f · L). Como o fator de atrito depende da própria vazão através do número de Reynolds, a divisão é resolvida por iteração de ponto fixo até a vazão do Anel 1 estabilizar; o atrito vem de Swamee-Jain e a viscosidade da temperatura informada.",
          "O tempo de recirculação de cada anel é o volume interno do caminho de ida dividido pela vazão que corre nele. A ida é somada trecho a trecho porque o diâmetro muda ao longo do caminho, e cada trecho carrega a sua própria vazão: a do tronco antes da derivação, a do braço do anel depois dela, ou um valor medido em campo.",
          "O modo inverso parte do tempo máximo admitido no Anel 2: a vazão que percorre o volume da ida nesse tempo define a perda de carga do anel, e essa mesma perda de carga determina a vazão do Anel 1. A soma das duas é a vazão que o circulador precisa entregar no tronco.",
        ],
      },
      {
        tipo: "tabela",
        titulo: "Divisão da vazão entre os anéis",
        colunas: [
          "Anel",
          "Material / DN",
          "DN int. (mm)",
          "Compr. ida e volta (m)",
          "Rugosidade (mm)",
          "Vazão (L/min)",
          "Volume da ida (L)",
          "Tempo de recirculação",
        ],
        linhas: aneis.map(({ rotulo, anel, q, volume, tempo }) => [
          rotulo,
          `${anel.material} · ${dnRotulo(anel.material, anel.dnExterno)}`,
          num(dnInterno(anel.material, anel.dnExterno), 1),
          num(anel.comprimentoTotal),
          num(anel.rugosidade, 3),
          num(q),
          num(volume),
          minSeg(tempo),
        ]),
        realce: [anelMaisLento],
        nota: `Linha realçada: ${aneis[anelMaisLento].rotulo} é o anel mais lento e comanda o dimensionamento. Verificação: soma dos anéis = ${num(
          r.soma
        )} L/min ${somaOk ? "(confere com a vazão total do tronco)" : `(diferente dos ${num(f.vazaoTotal)} L/min informados)`}.`,
      },
      {
        tipo: "tabela",
        titulo: "Caminho de ida — trecho a trecho",
        colunas: [
          "Anel",
          "Trecho",
          "DN int. (mm)",
          "Compr. (m)",
          "Vazão (L/min)",
          "Origem da vazão",
          "Velocidade (m/s)",
          "Volume (L)",
          "Tempo",
        ],
        linhas: linhasIda.map((l) => [
          l.anel,
          l.trecho,
          num(l.detalhe.dnInterno, 1),
          num(l.comprimento),
          num(l.detalhe.vazaoUsada),
          l.fonte,
          num(l.detalhe.velocidade),
          num(l.detalhe.volume),
          minSeg(l.detalhe.tempoSeg),
        ]),
        realce: [maisLentoIda],
        nota: `Linha realçada: trecho que mais pesa no tempo de recirculação (${minSeg(
          linhasIda[maisLentoIda].detalhe.tempoSeg
        )}). A origem da vazão é a do projeto: "Tronco" usa a vazão total, "Braço" a vazão calculada do próprio anel e "Manual" o valor informado no trecho.`,
      },
      {
        tipo: "tabela",
        titulo: "Modo inverso — vazão para o tempo máximo no Anel 2",
        colunas: ["Grandeza", "Valor"],
        linhas: [
          ["Tempo máximo desejado no Anel 2", `${num(f.tempoAlvoAnel2)} min`],
          ["Vazão necessária no Anel 1", `${num(r.q1Nec)} L/min`],
          ["Vazão necessária no Anel 2", `${num(r.q2Nec)} L/min`],
          ["Vazão total necessária no tronco", `${num(r.qTotalNec)} L/min`],
          ["Vazão total informada no tronco", `${num(f.vazaoTotal)} L/min`],
        ],
        realce: [3],
        nota: "As vazões necessárias mantêm os dois anéis com a mesma perda de carga: é a condição física do paralelo, não uma escolha de projeto. O tempo-alvo é aplicado a todo o volume da ida percorrido na vazão do anel — por isso este resultado não se compara linha a linha com a tabela de trechos, onde cada trecho corre na sua própria vazão.",
      },
      {
        tipo: "resultado",
        titulo: "Conclusão",
        itens: [
          { label: "Vazão no Anel 1", valor: `${num(r.q1)} L/min`, nota: `Volume da ida ${num(r.volume1)} L` },
          { label: "Vazão no Anel 2", valor: `${num(r.q2)} L/min`, nota: `Volume da ida ${num(r.volume2)} L` },
          { label: "Tempo de recirculação — Anel 1", valor: minSeg(r.tempo1Seg) },
          {
            label: "Tempo de recirculação — Anel 2",
            valor: minSeg(r.tempo2Seg),
            nota: `Tempo máximo desejado: ${num(f.tempoAlvoAnel2)} min · vazão total necessária ${num(
              r.qTotalNec
            )} L/min`,
            alerta: r.tempo2Seg > alvoSeg,
          },
          {
            label: "Verificação da divisão",
            valor: `${num(r.soma)} L/min`,
            nota: somaOk
              ? "Soma dos anéis confere com a vazão total do tronco"
              : `Soma dos anéis diferente dos ${num(f.vazaoTotal)} L/min informados`,
            alerta: !somaOk,
          },
          {
            label: "Velocidade máxima na ida",
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
        "Darcy-Weisbach — perda de carga distribuída",
        "Swamee-Jain — fator de atrito (aproximação explícita de Colebrook-White)",
        "Perda de carga igual em ramos em paralelo — divisão de vazão por iteração",
        "Viscosidade dinâmica da água por temperatura — tabela da planilha de referência",
        "Diâmetros internos CPVC e PVC por DN comercial — tabela da planilha de referência",
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
          const qAnel = i === 0 ? r.q1 : r.q2;
          const detalhes = detalharIda(anel, qAnel, f.vazaoTotal);
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
                  label="Compr. ida e volta"
                  value={anel.comprimentoTotal}
                  onChange={(v) => setAnel(qual, { comprimentoTotal: v })}
                  unit="m"
                  step={0.1}
                  hint="Real + equivalente"
                />
                <NumberField
                  label="Rugosidade"
                  value={anel.rugosidade}
                  onChange={(v) => setAnel(qual, { rugosidade: v })}
                  unit="mm"
                  step={0.001}
                />
              </div>

              {/* CAMINHO DE IDA — trechos (o diâmetro muda ao longo da ida) */}
              <div className="mt-4 rounded-xl border border-ink-600 bg-ink-900/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                    Caminho de ida
                  </span>
                  <span className="text-[10px] text-zinc-500">define o tempo e o volume</span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Tronco <b className="text-amber">{num(f.vazaoTotal)}</b> · Braço deste anel{" "}
                  <b className="text-amber">{num(qAnel)}</b> L/min — a TAG puxa sozinha.
                </p>
                <div className="mt-2 space-y-2">
                  {anel.trechosIda.map((t, idx) => (
                    <div key={idx} className="rounded-lg border border-ink-700 bg-ink-800 p-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        Trecho {String(idx + 1).padStart(2, "0")}
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 gap-2">
                        <SelectField
                          label="Vazão"
                          value={t.fonteVazao ?? (t.vazao != null ? "manual" : "braco")}
                          onChange={(v) => {
                            const fonte = v as FonteVazao;
                            patchTrecho(qual, idx, {
                              fonteVazao: fonte,
                              // ao virar manual, parte da vazão que corria no trecho
                              ...(fonte === "manual" && t.vazao == null
                                ? { vazao: Number((detalhes[idx]?.vazaoUsada ?? qAnel).toFixed(2)) }
                                : {}),
                            });
                          }}
                          options={opcoesFonte}
                          compact
                        />
                        <SelectField
                          label="DN"
                          value={t.dnExterno}
                          onChange={(v) => patchTrecho(qual, idx, { dnExterno: Number(v) })}
                          options={opcoesDN}
                          compact
                        />
                        <NumberField
                          label="Compr."
                          value={t.comprimento}
                          onChange={(v) => patchTrecho(qual, idx, { comprimento: v })}
                          unit="m"
                          step={0.1}
                          compact
                        />
                      </div>
                      {(t.fonteVazao ?? (t.vazao != null ? "manual" : "braco")) === "manual" && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <NumberField
                            label="Vazão manual"
                            value={t.vazao ?? 0}
                            onChange={(v) => patchTrecho(qual, idx, { vazao: v })}
                            unit="L/min"
                            step={0.1}
                            compact
                          />
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500">
                        <span>
                          {num(detalhes[idx]?.vazaoUsada ?? 0)} L/min · {minSeg(detalhes[idx]?.tempoSeg ?? 0)} · {num(detalhes[idx]?.volume ?? 0)} L
                        </span>
                        {anel.trechosIda.length > 1 && (
                          <button
                            onClick={() => removeTrecho(qual, idx)}
                            className="text-zinc-500 hover:text-red-400"
                          >
                            remover
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => addTrecho(qual)}
                  className="mt-2 w-full rounded-lg border border-dashed border-ink-600 px-3 py-2 text-[12px] font-medium text-zinc-400 transition hover:border-amber/50 hover:text-amber"
                >
                  + Adicionar trecho
                </button>
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
            <div className="mt-1 text-[12px] text-zinc-400">Chega AQ em <b className="text-zinc-200">{minSeg(r.tempo1Seg)}</b></div>
            <div className="text-[11px] text-zinc-500">Volume {num(r.volume1)} L</div>
          </div>
          <div className="rounded-2xl bg-ink-700 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400">Anel 2</div>
            <div className="mt-0.5 font-display text-2xl font-bold text-amber">{num(r.q2)} <span className="text-sm">L/min</span></div>
            <div className="mt-1 text-[12px] text-zinc-400">Chega AQ em <b className="text-zinc-200">{minSeg(r.tempo2Seg)}</b></div>
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
          {projetoId && (<button onClick={salvarComoNovo} className="rounded-xl border border-ink-600 px-3 py-2.5 text-sm text-zinc-400">Salvar como novo</button>)}
          <button onClick={salvar} className="rounded-xl bg-amber px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-95">{projetoId ? "Atualizar" : "Salvar projeto"}</button>
        </div>
      </div>
    </div>
  );
}
