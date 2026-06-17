"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  calcular,
  Inputs,
  TABELA_A1,
  coefNBR,
  vasoComercialAcima,
} from "@/lib/calc/vaso-expansao";
import { NumberField, SelectField, Accordion } from "@/components/Fields";
import { SaveBadge, EstadoSalvo } from "@/components/SaveBadge";
import {
  listarProjetos,
  salvarProjeto,
  excluirProjeto,
  tempoRelativo,
  Projeto,
} from "@/lib/projetos";

const MODULO = "vaso-expansao";

interface Form {
  tempBoiler: number;
  volume: number;
  pSist: number;
  pValv: number;
}

const PADRAO: Form = {
  tempBoiler: 50,
  volume: 1000,
  pSist: 3,
  pValv: 4,
};

function toInputs(f: Form): Inputs {
  return {
    tempBoiler: f.tempBoiler,
    volume: f.volume,
    pSist: f.pSist,
    pValv: f.pValv,
  };
}

const fmtL = (v: number) => (isFinite(v) ? `${v.toFixed(1)} L` : "—");
const fmtBar = (v: number) => `${v.toFixed(2)} bar`;
const fmtCoef = (v: number) => v.toFixed(5);

export default function VasoExpansao() {
  const [f, setF] = useState<Form>(PADRAO);
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setF((p) => ({ ...p, [k]: v }));

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
  const coefInfo = useMemo(() => coefNBR(f.tempBoiler), [f.tempBoiler]);
  // método principal = NBR (o que o cliente usa, e o menor). Caleffi = 2ª verificação.
  const vasoNBR = vasoComercialAcima(r.nbr.volumeVaso);

  const opcoesTemp = TABELA_A1.map((t) => ({
    value: t.temp,
    label: `${t.temp} °C`,
  }));

  const denominadorRuim = !r.pressaoValida;

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Ferramentas
          </Link>
          <h1 className="mt-1 font-display text-xl font-bold text-zinc-100">
            Vaso de Expansão
          </h1>
          <p className="text-sm text-zinc-400">
            Volume mínimo do vaso por dois métodos lado a lado: NBR 16057 e Caleffi.
          </p>
        </div>
        <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
      </div>

      {/* FORM — inputs primeiro */}
      <div className="space-y-4">
        <Accordion title="Dados do sistema" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Temperatura do boiler"
              value={f.tempBoiler}
              onChange={(v) => set("tempBoiler", Number(v))}
              options={opcoesTemp}
              hint="Valores da Tabela A.1 (NBR 16057)"
            />
            <NumberField
              label="Volume de água do sistema"
              value={f.volume}
              onChange={(v) => set("volume", v)}
              unit="L"
            />
            <NumberField
              label="Pressão da rede (Psist)"
              value={f.pSist}
              onChange={(v) => set("pSist", v)}
              unit="bar"
              step={0.1}
            />
            <NumberField
              label="Pressão da válvula (Pvalv)"
              value={f.pValv}
              onChange={(v) => set("pValv", v)}
              unit="bar"
              step={0.1}
              hint="Tem que ser maior que Psist"
            />
          </div>
        </Accordion>
      </div>

      {/* ALERTA de pressão inválida */}
      {denominadorRuim && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          <strong className="font-semibold text-red-200">
            Pressões incompatíveis.
          </strong>{" "}
          A pressão da válvula de segurança (Pvalv) precisa ser maior que a pressão da
          rede (Psist) — senão o denominador do cálculo fica zero ou negativo e o vaso
          não tem volume útil. Ajuste Pvalv &gt; Psist.
        </div>
      )}

      {/* RESULT HERO — volume a adotar (NBR é o método principal) */}
      <div className="glass rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-xs font-bold uppercase tracking-widest text-amber">
            Volume a adotar
          </span>
          <span className="rounded-full bg-amber/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
            método NBR 16057
          </span>
        </div>

        <div className="flex items-end gap-3">
          <div className="font-display text-5xl font-bold leading-none text-amber">
            {isFinite(r.nbr.volumeVaso) ? r.nbr.volumeVaso.toFixed(1) : "—"}
          </div>
          <div className="pb-1 text-lg font-semibold text-zinc-400">L mínimo</div>
        </div>

        <div className="mt-4 rounded-2xl bg-ink-900/50 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            Vaso comercial recomendado
          </div>
          <div className="mt-0.5 font-display text-2xl font-bold text-zinc-100">
            {vasoNBR !== null
              ? `${vasoNBR} L`
              : isFinite(r.nbr.volumeVaso)
              ? "acima de 200 L (consultar fabricante)"
              : "—"}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Menor vaso de catálogo (8 / 12 / 18 / 24 / 50 / 100 / 200 L) que cobre o
            volume mínimo da NBR.
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-ink-600 px-3 py-2 text-sm">
          <span className="text-zinc-500">Caleffi · 2ª verificação</span>
          <span className="font-semibold text-zinc-300">{fmtL(r.caleffi.volumeVaso)}</span>
        </div>
      </div>

      {/* COMPARADOR NBR x Caleffi */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          NBR 16057 <span className="text-zinc-500">(principal)</span> × Caleffi
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="pb-2 font-medium">Métrica</th>
              <th className="pb-2 text-right font-medium text-amber">NBR 16057</th>
              <th className="pb-2 text-right font-medium text-zinc-300">Caleffi (2ª verif.)</th>
            </tr>
          </thead>
          <tbody className="text-zinc-200">
            <Row
              l="Volume do vaso"
              a={fmtL(r.nbr.volumeVaso)}
              b={fmtL(r.caleffi.volumeVaso)}
              destaqueA
            />
            <Row
              l="Coef. dilatação (e)"
              a={fmtCoef(r.nbr.coef)}
              b={fmtCoef(r.caleffi.coef)}
            />
            <Row l="Folga 0,5% (Vv)" a="—" b={fmtL(r.caleffi.vv)} />
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          A <strong className="text-zinc-300">NBR 16057</strong> é o método principal (é o
          que a norma exige e o que vocês usam). O <strong className="text-zinc-300">Caleffi</strong>{" "}
          entra só como segunda verificação: usa o coeficiente por fórmula, soma uma folga de
          0,5% do volume (Vv) e desconta 0,5 bar da válvula, então costuma dar um valor maior
          e mais conservador. Use a NBR para especificar e o Caleffi para conferir.
        </p>
      </div>

      {/* MEMÓRIA DE CÁLCULO — junto do resultado */}
      <div className="space-y-4">
        <Accordion title="Memória de cálculo NBR 16057">
          <div className="space-y-2 text-sm text-zinc-300">
            <p className="text-[12px] leading-relaxed text-zinc-400">
              V = (Vol × e) / (1 − ((Psist + 0,3 + 1) / (Pvalv + 1)))
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Det l="Coef. e (Tabela A.1)" v={fmtCoef(r.nbr.coef)} />
              <Det
                l="Origem do coef."
                v={coefInfo.interpolado ? "interpolado" : "exato (tabela)"}
              />
              <Det l="Volume (Vol)" v={`${f.volume} L`} />
              <Det l="Numerador (Vol×e)" v={(f.volume * r.nbr.coef).toFixed(2)} />
              <Det l="Pressões topo" v={`${(f.pSist + 0.3 + 1).toFixed(2)} bar`} />
              <Det l="Pressões base" v={`${(f.pValv + 1).toFixed(2)} bar`} />
              <Det l="Denominador" v={r.nbr.denominador.toFixed(4)} />
              <Det l="Volume do vaso" v={fmtL(r.nbr.volumeVaso)} />
            </div>
          </div>
        </Accordion>

        <Accordion title="Memória de cálculo Caleffi">
          <div className="space-y-2 text-sm text-zinc-300">
            <p className="text-[12px] leading-relaxed text-zinc-400">
              e = (0,31 + 3,9·10⁻⁴ × tm²) / 100 · V = ((e × Vol) + Vv) / (1 − (Pi / Pf))
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Det l="Coef. e (fórmula)" v={fmtCoef(r.caleffi.coef)} />
              <Det l="tm (temp. boiler)" v={`${f.tempBoiler} °C`} />
              <Det l="Vv (0,5% do volume)" v={fmtL(r.caleffi.vv)} />
              <Det l="Po (pré-carga = Psist+0,3)" v={fmtBar(r.caleffi.po)} />
              <Det l="Pi (inicial abs. = Po+1)" v={fmtBar(r.caleffi.pi)} />
              <Det l="Per (máx. func. = Pvalv−0,5)" v={fmtBar(r.caleffi.per)} />
              <Det l="Pf (final abs. = Per+1)" v={fmtBar(r.caleffi.pf)} />
              <Det l="Denominador" v={r.caleffi.denominador.toFixed(4)} />
              <Det l="Volume do vaso" v={fmtL(r.caleffi.volumeVaso)} />
            </div>
          </div>
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
            placeholder="Nome do projeto (ex.: Casa Jerivá - Vaso AQ)"
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

function Row({
  l,
  a,
  b,
  destaqueA,
  destaqueB,
}: {
  l: string;
  a: string;
  b: string;
  destaqueA?: boolean;
  destaqueB?: boolean;
}) {
  return (
    <tr className="border-t border-ink-700">
      <td className="py-2 text-zinc-400">{l}</td>
      <td className={`py-2 text-right font-semibold ${destaqueA ? "text-amber" : "text-zinc-200"}`}>
        {a}
      </td>
      <td className={`py-2 text-right font-semibold ${destaqueB ? "text-amber" : "text-zinc-200"}`}>
        {b}
      </td>
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
