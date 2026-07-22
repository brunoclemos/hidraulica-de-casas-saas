"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  calcular,
  sugerirArranjos,
  rotuloArranjo,
  potUtil,
  Inputs,
  INPUTS_PADRAO,
  CATALOGO_RINNAI,
  DATA_REF_PRECOS,
  TABELA_C1,
  Arranjo,
  ResultadoSugestao,
} from "@/lib/calc/apoio-gas";
import { NumberField, Accordion } from "@/components/Fields";
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

const MODULO = "apoio-gas";

type Form = Inputs;
const PADRAO: Form = INPUTS_PADRAO;

// Inputs salvos no projeto = os 9 campos + overrides de preço (mapa esparso,
// só o que difere da referência — projetos antigos sem o campo caem nos defaults).
interface InputsSalvos extends Form {
  precos?: Record<string, number>;
}

const nf = (d: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: d });
const fmtKcal = (v: number) => (isFinite(v) ? `${nf(0).format(v)} kcal/h` : "—");
const fmtLmin = (v: number) => (isFinite(v) ? `${nf(2).format(v)} l/min` : "—");
const fmtMin = (v: number) => (isFinite(v) ? `${nf(1).format(v)} min` : "—");
const fmtBRL = (v: number) => `R$ ${nf(0).format(v)}`;

export default function ApoioGas() {
  const [f, setF] = useState<Form>(PADRAO);
  const [precos, setPrecos] = useState<Record<string, number>>({});
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // --- estado de salvamento ("Meus Projetos") ---
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [nome, setNome] = useState("");
  const [estado, setEstado] = useState<EstadoSalvo>("nao-salvo");
  const [salvoEm, setSalvoEm] = useState<number | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [clientesSug, setClientesSug] = useState<string[]>([]);
  const snapshot = useRef<string>("");

  const persistiveis = (): InputsSalvos =>
    Object.keys(precos).length > 0 ? { ...f, precos } : { ...f };

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
    const atual = JSON.stringify({ f, precos });
    if (projetoId && atual === snapshot.current) {
      setEstado("salvo");
    } else if (projetoId || atual !== JSON.stringify({ f: PADRAO, precos: {} })) {
      setEstado("nao-salvo");
    }
  }, [f, precos, projetoId]);

  function salvar() {
    setEstado("salvando");
    const p = salvarProjeto<InputsSalvos>({
      id: projetoId ?? undefined,
      modulo: MODULO,
      cliente: cliente.trim() || undefined,
      nome: nome.trim() || "Sem nome",
      inputs: persistiveis(),
    });
    setProjetoId(p.id);
    setNome(p.nome);
    snapshot.current = JSON.stringify({ f, precos });
    setSalvoEm(p.atualizadoEm);
    setEstado("salvo");
    refresh();
  }

  function salvarComoNovo() {
    setEstado("salvando");
    const p = salvarProjeto<InputsSalvos>({
      id: undefined,
      modulo: MODULO,
      cliente: cliente.trim() || undefined,
      nome: nome.trim() || "Sem nome",
      inputs: persistiveis(),
    });
    setProjetoId(p.id);
    setNome(p.nome);
    snapshot.current = JSON.stringify({ f, precos });
    setSalvoEm(p.atualizadoEm);
    setEstado("salvo");
    refresh();
  }

  function carregar(p: Projeto) {
    const { precos: pr, ...campos } = p.inputs as InputsSalvos;
    const form = { ...PADRAO, ...campos };
    setF(form);
    setPrecos(pr ?? {});
    setProjetoId(p.id);
    setCliente(p.cliente ?? "");
    setNome(p.nome);
    snapshot.current = JSON.stringify({ f: form, precos: pr ?? {} });
    setSalvoEm(p.atualizadoEm);
    setEstado("salvo");
  }

  function novo() {
    setF(PADRAO);
    setPrecos({});
    setProjetoId(null);
    setCliente("");
    setNome("");
    snapshot.current = "";
    setSalvoEm(null);
    setEstado("nao-salvo");
  }

  // --- cálculo ao vivo ---
  const r = useMemo(() => calcular(f), [f]);
  const sugestoes = useMemo(
    () => ({
      vmp: sugerirArranjos(r.vmp.potenciaUtil, CATALOGO_RINNAI, { precos }),
      nbr: sugerirArranjos(r.nbr.potenciaUtil, CATALOGO_RINNAI, { precos }),
      td: sugerirArranjos(r.td.potenciaUtil, CATALOGO_RINNAI, { precos }),
    }),
    [r, precos]
  );
  const precosEditados = Object.keys(precos).length > 0;
  const modelosIgnorados = sugestoes.vmp.modelosIgnorados;
  const linhaC1Ativa = isFinite(r.nbr.vPico)
    ? TABELA_C1.findIndex((t) => r.nbr.vPico <= t.ateVPico)
    : -1;

  const motivoDispensavelTD = r.td.zeradoPorDeadBand
    ? "a banda morta do termostato cobre todo o tempo alvo — o apoio nem chega a acionar"
    : "a reserva do boiler acima da temperatura de uso cobre a demanda no período";

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Ferramentas
          </Link>
          <h1 className="mt-1 font-display text-xl font-bold text-zinc-100">
            Apoio a Gás — Vazão &amp; Seleção
          </h1>
          <p className="text-sm text-zinc-400">
            Vazão do sistema por três métodos e sugestão do aquecedor por custo × benefício.
          </p>
        </div>
        <SaveBadge estado={estado} quando={salvoEm ? tempoRelativo(salvoEm) : undefined} />
      </div>

      {/* FORM — inputs primeiro */}
      <div className="space-y-4">
        <Accordion title="Dados de uso" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="VB — vazão de uso"
              value={f.vb}
              onChange={(v) => set("vb", v)}
              unit="l/min"
              hint="ex.: 3 banhos ~ 12 l/min cada"
            />
            <NumberField
              label="TB — temperatura de uso"
              value={f.tb}
              onChange={(v) => set("tb", v)}
              unit="°C"
            />
            <NumberField
              label="TAF — temperatura da água fria"
              value={f.taf}
              onChange={(v) => set("taf", v)}
              unit="°C"
            />
            <NumberField
              label="TAQ — temperatura do boiler"
              value={f.taq}
              onChange={(v) => set("taq", v)}
              unit="°C"
            />
          </div>
        </Accordion>

        <Accordion title="NBR 16057 (SAAG)" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="V — consumo diário"
              value={f.vConsumoDiario}
              onChange={(v) => set("vConsumoDiario", v)}
              unit="L"
            />
            <NumberField
              label="FS — fator de simultaneidade"
              value={f.fs}
              onChange={(v) => set("fs", v)}
              step={0.05}
              hint="0,9 p/ unidade habitacional"
            />
          </div>
        </Accordion>

        <Accordion title="Tempo determinado (T.D)" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="V — volume do boiler"
              value={f.volumeBoiler}
              onChange={(v) => set("volumeBoiler", v)}
              unit="L"
            />
            <NumberField
              label="t — tempo alvo"
              value={f.tempoAlvo}
              onChange={(v) => set("tempoAlvo", v)}
              unit="min"
            />
            <NumberField
              label="Histerese do termostato"
              value={f.histerese}
              onChange={(v) => set("histerese", v)}
              unit="°C"
              min={0}
              hint="0 = apoio por demanda · 5 = termostato"
            />
          </div>
        </Accordion>
      </div>

      {/* ALERTAS */}
      {!r.tempValida && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          <strong className="font-semibold text-red-200">Temperaturas incompatíveis.</strong>{" "}
          TAQ precisa ser maior que TAF (e TB maior que TAF) — senão as conversões de
          potência em vazão dividem por zero. Ajuste as temperaturas.
        </div>
      )}
      {r.tempValida && r.tbAcimaBoiler && (
        <div className="rounded-2xl border border-amber/40 bg-amber/10 p-4 text-sm text-amber">
          <strong className="font-semibold">TB acima de TAQ.</strong> A temperatura de uso é
          maior que a do boiler — a mistura sozinha não entrega TB. Revise TAQ ou TB.
        </div>
      )}
      {r.tempValida && !r.tbAcimaBoiler && r.rearmeAbaixoUso && (
        <div className="rounded-2xl border border-amber/40 bg-amber/10 p-4 text-sm text-amber">
          <strong className="font-semibold">Rearme abaixo da temperatura de uso.</strong> Com
          histerese de {nf(1).format(f.histerese)} °C, o apoio só religa a{" "}
          {nf(1).format(r.td.tempRearme)} °C — abaixo de TB ({nf(1).format(f.tb)} °C). A água
          chega abaixo da temperatura de uso antes de o apoio ligar. O cálculo segue fiel à
          planilha; avalie reduzir a histerese.
        </div>
      )}
      {modelosIgnorados.length > 0 && (
        <div className="rounded-2xl border border-amber/40 bg-amber/10 p-4 text-sm text-amber">
          <strong className="font-semibold">Modelos fora da sugestão:</strong>{" "}
          {modelosIgnorados.join(", ")} — preço inválido (precisa ser maior que zero). Corrija
          no catálogo abaixo.
        </div>
      )}

      {/* RESUMO — vazões do sistema (3 métodos em pé de igualdade) */}
      <div className="glass rounded-3xl p-5">
        <span className="font-display text-xs font-bold uppercase tracking-widest text-amber">
          Vazões do sistema
        </span>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <VazaoCard nome="Vazão Máxima Provável" sigla="V.M.P" lmin={r.vmp.vazaoLmin} p={r.vmp.potenciaUtil} />
          <VazaoCard nome="NBR 16057" sigla="SAAG" lmin={r.nbr.vazaoLmin} p={r.nbr.potenciaUtil} />
          <VazaoCard nome="Tempo Determinado" sigla="T.D" lmin={r.td.vazaoLmin} p={r.td.potenciaUtil} />
        </div>
      </div>

      {/* PAINEL — sugestão de aquecedores */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-200">
            Sugestão de aquecedores
          </h3>
          {precosEditados && (
            <span className="rounded-full bg-amber/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
              preços editados
            </span>
          )}
        </div>
        <p className="mb-4 text-[11px] leading-relaxed text-zinc-500">
          Sugestão de custo–benefício com base nos preços informados — sempre o mesmo modelo,
          em paralelo (sistemas gêmeos: se um aparelho parar, o outro segura). A decisão final é
          do projetista.
        </p>

        <div className="space-y-4">
          <BlocoMetodo
            titulo="Vazão Máxima Provável (V.M.P)"
            p={r.vmp.potenciaUtil}
            s={sugestoes.vmp}
          />
          <BlocoMetodo titulo="NBR 16057" p={r.nbr.potenciaUtil} s={sugestoes.nbr} />
          <BlocoMetodo
            titulo="Tempo Determinado (T.D)"
            p={r.td.potenciaUtil}
            s={sugestoes.td}
            motivoDispensavel={motivoDispensavelTD}
          />
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
          Preços médios de referência levantados em {DATA_REF_PRECOS} (editáveis no catálogo
          abaixo) · aparelhos em paralelo · não inclui instalação, ponto de gás ou exaustão.
        </p>
      </div>

      {/* ATALHO — próximo passo do projeto: dimensionar o circulador */}
      <Link
        href="/modulos/circuladores"
        className="flex items-center gap-3 rounded-2xl border border-amber/30 bg-ink-800 p-4 transition hover:border-amber/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber/15">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="8" stroke="#FABA0D" strokeWidth="1.8" />
            <path
              d="M12 12l3.5-4.5M12 12l1.5 5.2M12 12l-5-1.5"
              stroke="#FABA0D"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold text-zinc-100">
            Calcular circuladora
          </span>
          <span className="block text-[12px] text-zinc-500">
            Abre o Cálculo de Circuladores para dimensionar a bomba de recirculação deste
            projeto.
          </span>
        </span>
        <span className="text-zinc-600">→</span>
      </Link>

      {/* MEMÓRIAS DE CÁLCULO */}
      <div className="space-y-4">
        <Accordion title="Memória de cálculo — V.M.P">
          <div className="space-y-2 text-sm text-zinc-300">
            <p className="text-[12px] leading-relaxed text-zinc-400">
              VAQ = VB × (TB−TAF)/(TAQ−TAF) · P = VAQ × ΔT × 60
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Det l="ΔT = TAQ − TAF" v={`${nf(1).format(r.deltaT)} °C`} />
              <Det l="VAQ (vazão no boiler)" v={fmtLmin(r.vmp.vaq)} />
              <Det l="P (potência útil)" v={fmtKcal(r.vmp.potenciaUtil)} />
              <Det l="Vazão" v={fmtLmin(r.vmp.vazaoLmin)} />
            </div>
          </div>
        </Accordion>

        <Accordion title="Memória de cálculo — NBR 16057 (Anexo C)">
          <div className="space-y-2 text-sm text-zinc-300">
            <p className="text-[12px] leading-relaxed text-zinc-400">
              V corrigido = Vcons × (TB−TAF)/(TAQ−TAF) · V pico = V corrigido × FS ·
              V recup = V pico × (1 − F armaz) · P = V recup × ΔT
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Det l="V corrigido" v={`${nf(1).format(r.nbr.vCorrigido)} L`} />
              <Det l="V pico" v={`${nf(1).format(r.nbr.vPico)} L`} />
              <Det l="F armaz (Tabela C.1)" v={isFinite(r.nbr.fArmaz) ? nf(4).format(r.nbr.fArmaz) : "—"} />
              <Det l="V armazenamento gás" v={`${nf(1).format(r.nbr.vArmazGas)} L`} />
              <Det l="V recuperação" v={`${nf(1).format(r.nbr.vRecup)} L`} />
              <Det l="P (potência útil)" v={fmtKcal(r.nbr.potenciaUtil)} />
            </div>
            <div className="mt-2 rounded-xl bg-ink-900/40 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">
                Tabela C.1 — fração armazenada por V pico (ABNT NBR 16057:2024, Anexo C)
              </div>
              <table className="w-full text-[12px]">
                <tbody>
                  {TABELA_C1.map((t, i) => (
                    <tr
                      key={t.rotulo}
                      className={i === linhaC1Ativa ? "text-amber" : "text-zinc-400"}
                    >
                      <td className="py-0.5">{t.rotulo} L</td>
                      <td className="py-0.5 text-right font-semibold">
                        {t.fArmaz === 1 / 3 ? "1/3" : t.fArmaz === 1 / 4 ? "1/4" : t.fArmaz === 1 / 5 ? "1/5" : t.fArmaz === 1 / 6 ? "1/6" : "1/7"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Accordion>

        <Accordion title="Memória de cálculo — Tempo Determinado (com histerese)">
          <div className="space-y-2 text-sm text-zinc-300">
            <p className="text-[12px] leading-relaxed text-zinc-400">
              t₁ = V × Hist / (VB×(TB−TAF)) · P = 60×[VB×(TB−TAF) − V×(TAQ−Hist−TB)/(t−t₁)],
              nunca negativo
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Det l="t₁ (atraso do dead-band)" v={fmtMin(r.td.t1DeadBand)} />
              <Det l="Temperatura de rearme" v={`${nf(1).format(r.td.tempRearme)} °C`} />
              <Det l="P (potência útil)" v={fmtKcal(r.td.potenciaUtil)} />
              <Det l="Vazão" v={fmtLmin(r.td.vazaoLmin)} />
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              O apoio fica desligado nos primeiros t₁ minutos (banda morta do termostato: só
              religa quando o boiler cai à temperatura de rearme TAQ − Hist). Com histerese 0,
              o resultado é o modelo clássico de apoio por demanda.
            </p>
          </div>
        </Accordion>

        {/* CATÁLOGO com preços editáveis */}
        <Accordion title="Catálogo de aquecedores (Rinnai) — preços editáveis">
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Preços de referência de {DATA_REF_PRECOS}, valores médios de mercado. Edite
            conforme a sua cotação atual — a sugestão recalcula na hora e os preços editados
            são salvos junto com o projeto.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="pb-2 font-medium">Modelo</th>
                  <th className="pb-2 text-right font-medium">Vazão</th>
                  <th className="pb-2 text-right font-medium">Pot. nominal</th>
                  <th className="pb-2 text-right font-medium">Rend.</th>
                  <th className="pb-2 text-right font-medium">Pot. útil</th>
                  <th className="pb-2 text-right font-medium">Preço (R$)</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {CATALOGO_RINNAI.map((m) => {
                  const editado = precos[m.id] !== undefined;
                  return (
                    <tr key={m.id} className="border-t border-ink-700">
                      <td className="py-2 font-semibold text-zinc-100">{m.modelo}</td>
                      <td className="py-2 text-right">{nf(1).format(m.vazaoLmin)} l/min</td>
                      <td className="py-2 text-right">{nf(0).format(m.potNominalKcalH)}</td>
                      <td className={`py-2 text-right ${m.rendimento !== 0.86 ? "text-amber" : ""}`}>
                        {nf(2).format(m.rendimento)}
                      </td>
                      <td className="py-2 text-right">{nf(1).format(potUtil(m))}</td>
                      <td className="py-2 pl-3 text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={1}
                          value={precos[m.id] ?? m.precoRef}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setPrecos((p) => {
                              const novo = { ...p };
                              if (!isFinite(v) || v === m.precoRef) delete novo[m.id];
                              else novo[m.id] = v;
                              return novo;
                            });
                          }}
                          onWheel={(e) => e.currentTarget.blur()}
                          className={`w-24 rounded-lg border bg-ink-800 px-2 py-1.5 text-right text-[12px] font-semibold outline-none focus:border-amber/60 ${
                            editado ? "border-amber/50 text-amber" : "border-ink-600 text-zinc-100"
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-zinc-500">
              <span className="text-amber">E35:</span> rendimento 0,85 — dado do fabricante
              (difere dos demais, confirmado).
            </p>
            {precosEditados && (
              <button
                onClick={() => setPrecos({})}
                className="shrink-0 rounded-lg border border-ink-600 px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:border-amber/50 hover:text-amber"
              >
                Restaurar preços de referência
              </button>
            )}
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
              placeholder="Nome do cálculo (ex.: Apoio casa térrea)"
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

// --- componentes locais ---------------------------------------------------

function VazaoCard({ nome, sigla, lmin, p }: { nome: string; sigla: string; lmin: number; p: number }) {
  return (
    <div className="rounded-2xl bg-ink-900/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{sigla}</span>
      </div>
      <div className="mt-1 font-display text-2xl font-bold leading-none text-amber">
        {isFinite(lmin) ? nf(2).format(lmin) : "—"}
        <span className="ml-1 text-sm font-semibold text-zinc-400">l/min</span>
      </div>
      <div className="mt-1 text-[11px] text-zinc-500">{nome}</div>
      <div className="text-[11px] text-zinc-500">pot. útil {fmtKcal(p)}</div>
    </div>
  );
}

function BlocoMetodo({
  titulo,
  p,
  s,
  motivoDispensavel,
}: {
  titulo: string;
  p: number;
  s: ResultadoSugestao;
  motivoDispensavel?: string;
}) {
  return (
    <div className="rounded-xl border border-ink-700 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-zinc-200">{titulo}</span>
        <span className="text-[11px] text-zinc-500">
          pot. útil necessária: <span className="font-semibold text-zinc-300">{fmtKcal(p)}</span>
        </span>
      </div>

      {s.status === "apoio-dispensavel" ? (
        <div className="rounded-xl bg-ink-900/50 px-3 py-2.5 text-sm text-zinc-300">
          <span className="font-semibold text-amber">Apoio dispensável</span>
          {motivoDispensavel ? <span className="text-zinc-400"> — {motivoDispensavel}.</span> : null}
        </div>
      ) : s.status === "demanda-excede-cap" ? (
        <div className="rounded-xl bg-ink-900/50 px-3 py-2.5 text-sm text-zinc-400">
          Demanda acima do que o catálogo cobre num arranjo razoável — revise as premissas do
          cálculo (ou os preços do catálogo, se houver modelos ignorados).
        </div>
      ) : (
        <div className="space-y-1.5">
          <ArranjoLinha a={s.arranjos[0]} vencedor />
          {s.arranjos.slice(1).map((a, i) => (
            <ArranjoLinha key={i} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArranjoLinha({ a, vencedor = false }: { a: Arranjo; vencedor?: boolean }) {
  return (
    <div
      className={
        vencedor
          ? "rounded-xl border border-amber/60 bg-amber/5 px-3 py-2.5"
          : "rounded-xl bg-ink-900/40 px-3 py-2"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          {vencedor && (
            <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber">
              Sugestão
            </span>
          )}
          <span className={`text-sm font-semibold ${vencedor ? "text-zinc-100" : "text-zinc-300"}`}>
            {rotuloArranjo(a)}
          </span>
        </div>
        <span className={`text-sm font-bold ${vencedor ? "text-amber" : "text-zinc-300"}`}>
          {fmtBRL(a.precoTotal)}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-zinc-500">
        pot. nominal {nf(0).format(a.potNominalTotal)} kcal/h · pot. útil{" "}
        {nf(0).format(a.potUtilTotal)} kcal/h · folga {nf(0).format(a.folga)} kcal/h (
        {nf(1).format(a.folgaPct * 100)}%)
        {a.numAparelhos > 1 ? ` · ${a.numAparelhos} aparelhos em paralelo` : ""}
      </div>
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
