"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { calcular, Inputs, mmss, Cenario } from "@/lib/calc/recirculacao";
import { CPVC, ARMAFLEX, AMBIENTES, SOLOS, RAIOS } from "@/lib/calc/tables";
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

const MODULO = "recirculacao";

interface Form {
  vazao: number;
  pontos: number;
  diametroManifold: number;
  diametroConvencional: number;
  distancia: number;
  tAmbiente: number;
  tFinal: number;
  espessura: number;
  tempoParado: number;
  tAlvo: number;
  cenario: Cenario;
  hExterno: number;
  kSolo: number;
  raioSolo: number;
}

const PADRAO: Form = {
  vazao: 12,
  pontos: 1,
  diametroManifold: 22,
  diametroConvencional: 35,
  distancia: 20,
  tAmbiente: 10,
  tFinal: 45,
  espessura: 9,
  tempoParado: 20,
  tAlvo: 35,
  cenario: "ar",
  hExterno: 7,
  kSolo: 1.5,
  raioSolo: 0.5,
};

function toInputs(f: Form, diametro: number): Inputs {
  return {
    vazao: f.vazao,
    pontos: f.pontos,
    diametro,
    distancia: f.distancia,
    tAmbiente: f.tAmbiente,
    tFinal: f.tFinal,
    espessura: f.espessura,
    tempoParado: f.tempoParado,
    tAlvo: f.tAlvo,
    cenario: f.cenario,
    hExterno: f.hExterno,
    kSolo: f.kSolo,
    raioSolo: f.raioSolo,
  };
}

export default function Recirculacao() {
  const [f, setF] = useState<Form>(PADRAO);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

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
  const man = useMemo(() => calcular(toInputs(f, f.diametroManifold)), [f]);
  const conv = useMemo(() => calcular(toInputs(f, f.diametroConvencional)), [f]);

  const opcoesDiam = CPVC.map((c) => ({ value: c.comercial, label: c.rotulo }));

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Ferramentas
          </Link>
          <h1 className="mt-1 font-display text-xl font-bold text-zinc-100">
            Tempo de Recirculação & Perda Térmica
          </h1>
          <p className="text-sm text-zinc-400">
            Em quanto tempo a água quente chega, quanto se desperdiça e em quanto tempo esfria.
          </p>
        </div>
        <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
      </div>

      {/* RESULT HERO (Manifold = recomendado) */}
      <div className="glass rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-xs font-bold uppercase tracking-widest text-amber">
            Manifold · {f.diametroManifold} mm
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              man.velocidadeOk
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {man.velocidadeOk ? "Velocidade OK (Caleffi)" : "Velocidade alta!"}
          </span>
        </div>

        <PipeFlow velocidade={man.velocidade} label="água quente no manifold" />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Hero titulo="Água quente chega em" valor={mmss(man.tempoChegadaS)} />
          <Hero titulo="Desperdício por abertura" valor={`${man.volumeL.toFixed(1)} L`} />
          <Hero
            titulo={`Após ${f.tempoParado} min parada`}
            valor={`${man.tempAposXMin.toFixed(1)} °C`}
          />
          <Hero
            titulo={`Esfria até ${f.tAlvo} °C em`}
            valor={`${man.tempoAteAlvoMin.toFixed(1)} min`}
          />
        </div>
      </div>

      {/* COMPARADOR Manifold x Convencional */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
          Manifold × Convencional
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="pb-2 font-medium">Métrica</th>
              <th className="pb-2 text-right font-medium text-amber">
                Manifold {f.diametroManifold}
              </th>
              <th className="pb-2 text-right font-medium">
                Convencional {f.diametroConvencional}
              </th>
            </tr>
          </thead>
          <tbody className="text-zinc-200">
            <Row l="Velocidade (m/s)" a={man.velocidade.toFixed(2)} b={conv.velocidade.toFixed(2)} />
            <Row l="Água quente chega" a={mmss(man.tempoChegadaS)} b={mmss(conv.tempoChegadaS)} />
            <Row l="Desperdício (L)" a={man.volumeL.toFixed(1)} b={conv.volumeL.toFixed(1)} />
            <Row
              l="Perda regime (°C)"
              a={man.perdaRegime.toFixed(2)}
              b={conv.perdaRegime.toFixed(2)}
            />
            <Row
              l={`Após ${f.tempoParado} min (°C)`}
              a={man.tempAposXMin.toFixed(1)}
              b={conv.tempAposXMin.toFixed(1)}
            />
            <Row
              l={`Esfria a ${f.tAlvo}°C (min)`}
              a={man.tempoAteAlvoMin.toFixed(1)}
              b={conv.tempoAteAlvoMin.toFixed(1)}
            />
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          O manifold entrega água quente mais rápido e desperdiça menos água fria a cada abertura —
          o argumento técnico (e de venda) pro cliente.
        </p>
      </div>

      {/* FORM */}
      <div className="space-y-4">
        {/* cenário */}
        <div className="grid grid-cols-2 gap-2">
          {(["ar", "solo"] as Cenario[]).map((c) => (
            <button
              key={c}
              onClick={() => set("cenario", c)}
              className={`rounded-xl border py-3 text-sm font-semibold transition ${
                f.cenario === c
                  ? "border-amber bg-amber/10 text-amber"
                  : "border-ink-600 bg-ink-800 text-zinc-400"
              }`}
            >
              {c === "ar" ? "Tubo no ar / shaft" : "Tubo enterrado"}
            </button>
          ))}
        </div>

        <Accordion title="Tubo & vazão" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Diâmetro Manifold"
              value={f.diametroManifold}
              onChange={(v) => set("diametroManifold", Number(v))}
              options={opcoesDiam}
            />
            <SelectField
              label="Diâmetro Convencional"
              value={f.diametroConvencional}
              onChange={(v) => set("diametroConvencional", Number(v))}
              options={opcoesDiam}
            />
            <NumberField
              label="Vazão por ponto"
              value={f.vazao}
              onChange={(v) => set("vazao", v)}
              unit="L/min"
            />
            <Stepper
              label="Pontos simultâneos"
              value={f.pontos}
              onChange={(v) => set("pontos", v)}
              min={1}
              max={8}
            />
            <NumberField
              label="Distância até o ponto"
              value={f.distancia}
              onChange={(v) => set("distancia", v)}
              unit="m"
            />
            <SelectField
              label="Espessura do isolante"
              value={f.espessura}
              onChange={(v) => set("espessura", Number(v))}
              options={ARMAFLEX.map((e) => ({
                value: e,
                label: e === 0 ? "Sem isolante" : `${e} mm armaflex`,
              }))}
            />
          </div>
        </Accordion>

        <Accordion title="Temperaturas" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Temp. do meio externo"
              value={f.tAmbiente}
              onChange={(v) => set("tAmbiente", v)}
              unit="°C"
              hint="Ar do shaft ou solo (pior caso de inverno)"
            />
            <NumberField
              label="Temp. da água quente"
              value={f.tFinal}
              onChange={(v) => set("tFinal", v)}
              unit="°C"
            />
            <NumberField
              label="Tempo parado"
              value={f.tempoParado}
              onChange={(v) => set("tempoParado", v)}
              unit="min"
            />
            <NumberField
              label="Temp. mínima aceitável"
              value={f.tAlvo}
              onChange={(v) => set("tAlvo", v)}
              unit="°C"
            />
          </div>
        </Accordion>

        <Accordion title={f.cenario === "ar" ? "Ambiente do tubo" : "Solo"}>
          {f.cenario === "ar" ? (
            <SelectField
              label="Onde o tubo passa (h externo)"
              value={f.hExterno}
              onChange={(v) => set("hExterno", Number(v))}
              options={AMBIENTES.map((a) => ({ value: a.h, label: `${a.nome} (${a.h})` }))}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <SelectField
                label="Tipo de solo (condutividade)"
                value={f.kSolo}
                onChange={(v) => set("kSolo", Number(v))}
                options={SOLOS.map((s) => ({ value: s.k, label: `${s.nome} (${s.k})` }))}
              />
              <SelectField
                label="Raio de influência"
                value={f.raioSolo}
                onChange={(v) => set("raioSolo", Number(v))}
                options={RAIOS.map((r) => ({ value: r.r, label: r.nome }))}
              />
            </div>
          )}
        </Accordion>

        <Accordion title="Detalhes técnicos (auditar)">
          <div className="grid grid-cols-2 gap-3 text-sm text-zinc-300">
            <Det l="Ø interno Manifold" v={`${man.diametroInterno} mm`} />
            <Det l="Ø interno Convenc." v={`${conv.diametroInterno} mm`} />
            <Det l="R total Manifold" v={man.rTotal.toFixed(4)} />
            <Det l="UA Manifold (W/K)" v={man.ua.toFixed(2)} />
            <Det l="τ Manifold (s)" v={man.tau.toFixed(0)} />
            <Det l="Vel. máx Caleffi" v={`${man.velMaxCaleffi} m/s`} />
            <Det l="T final real (Man.)" v={`${man.tFinalReal.toFixed(2)} °C`} />
            <Det l="Perda água parada" v={`${man.perdaAguaParadaKcal.toFixed(0)} kcal`} />
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
            placeholder="Nome do projeto (ex.: Casa Jerivá - AQ)"
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

function Hero({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-ink-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{titulo}</div>
      <div className="mt-0.5 font-display text-2xl font-bold text-amber">{valor}</div>
    </div>
  );
}

function Row({ l, a, b }: { l: string; a: string; b: string }) {
  return (
    <tr className="border-t border-ink-700">
      <td className="py-2 text-zinc-400">{l}</td>
      <td className="py-2 text-right font-semibold text-amber">{a}</td>
      <td className="py-2 text-right">{b}</td>
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
