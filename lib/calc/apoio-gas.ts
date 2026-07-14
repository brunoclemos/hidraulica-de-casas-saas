// Motor de cálculo do módulo "Apoio a Gás — Vazão & Seleção".
// Portado da planilha "Ferreto_Vazao_Apoio_Gas - histerese.xlsx" (referencia/),
// aba Cálculo (3 métodos, fiéis célula a célula) + aba Aquecedores (catálogo Rinnai).
//
// O painel de seleção da planilha (só 1× ou 2× iguais) foi substituído, a pedido do
// cliente, por um otimizador de custo × benefício com preços editáveis. Desde 14/07/2026
// (pedido do cliente) os arranjos são SEMPRE do mesmo modelo, N× em paralelo — sistemas
// gêmeos: se um aparelho parar, o outro segura, e a manutenção fica intercambiável.
// As fórmulas físicas dos métodos continuam idênticas à planilha.
//
// Fórmulas portadas FIELMENTE das células (defaults entre parênteses):
//   ΔT   B21 = TAQ − TAF                                          (30)
//   M1   B24 VAQ = VB×(TB−TAF)/(TAQ−TAF)                          (24)
//        B25 P   = VAQ×ΔT×60                                      (43200)
//   M2   B30 Vcorr = Vcons×(TB−TAF)/(TAQ−TAF)                     (666.666667)
//        B31 Vpico = Vcorr×FS                                     (600)
//        B32 Farmaz: Vpico ≤1500→1/3 ≤6000→1/4 ≤12000→1/5 ≤20000→1/6 senão 1/7
//        B33 Varmaz = Vpico×Farmaz  B34 Vrecup = Vpico−Varmaz     (200 / 400)
//        B35 P = Vrecup×ΔT                                        (12000)
//   M3   B40 t₁ = V×Hist/(VB×(TB−TAF))                            (6.944444)
//        B41 P  = (t−t₁)≤0 ? 0 : max(0, 60×(VB×(TB−TAF) − V×(TAQ−Hist−TB)/(t−t₁)))
//                                                                 (5958.620690)
//        Com Hist=0 a fórmula degenera na versão antiga (P=3200 nos defaults).
//   vazão l/h = P/ΔT ; l/min = l/h/60 (identidade c ≈ 1 kcal/L·°C)
//
// VALIDAÇÃO (cache da planilha, 6 casas — reproduzir com exatidão):
//   A  (defaults VB=36 TB=40 TAF=20 TAQ=50 Vcons=1000 FS=0.9 V=1000 t=15 Hist=5):
//      M1 P=43200, 24 l/min · M2 P=12000, 6.666667 l/min · M3 t₁=6.944444, P=5958.620690, 3.310345 l/min
//   A0 (Hist=0): M3 t₁=0, P=3200 (regressão contra a planilha antiga)
//   At5 (t=5, Hist=5): t₁=6.944444 ≥ 5 → P=0 (dead-band cobre o tempo alvo)
//   At30 (t=30, Hist=5): P=30187.951807
//   B  (VB=24 TB=42 TAF=18 TAQ=60 Vcons=600 FS=0.9 V=500 t=10 Hist=5):
//      M1 P=34560 · M2 P=8640 · M3 t₁=4.340278, P=0 via MAX (reserva cobre)
//   Otimizador (preços default): P=43200 → 1×E10+1×E27 R$5089 (planilha dava 2×E21 R$5998);
//      P=12000 → 1×E10 R$1549 · P=30187.95 → 1×E10+1×E15 R$3449 (planilha: 1×E27 R$3540);
//      P=34560 → 2×E15 R$3800 · P=0 → apoio-dispensavel ·
//      empate R$6547 em P=43200 (E10+2×E17 vs 3×E10+E15) → vence E10+2×E17 (menos aparelhos)

// === Catálogo (aba Aquecedores) ==========================================
export interface ModeloAquecedor {
  id: string; // "E10" … "E43"
  marca: string;
  modelo: string; // nome comercial completo
  vazaoLmin: number;
  potNominalKcalH: number;
  potKw: number; // informativo
  rendimento: number; // E35 = 0,85 (intencional, confirmado pelo cliente 11/07/2026)
  precoRef: number; // R$ — referência de DATA_REF_PRECOS
}

export const DATA_REF_PRECOS = "21/06/2026"; // Aquecedores!D12

// Ordem = planilha (pot. útil crescente); o otimizador não depende disso, mas o
// desempate final usa a ordem do catálogo pra ser determinístico.
export const CATALOGO_RINNAI: ModeloAquecedor[] = [
  { id: "E10", marca: "Rinnai", modelo: "RINNAI E10", vazaoLmin: 10, potNominalKcalH: 14500, potKw: 16.8, rendimento: 0.86, precoRef: 1549 },
  { id: "E15", marca: "Rinnai", modelo: "RINNAI E15", vazaoLmin: 15, potNominalKcalH: 21000, potKw: 24.4, rendimento: 0.86, precoRef: 1900 },
  { id: "E17", marca: "Rinnai", modelo: "RINNAI E17", vazaoLmin: 17, potNominalKcalH: 23800, potKw: 27.7, rendimento: 0.86, precoRef: 2499 },
  { id: "E21", marca: "Rinnai", modelo: "RINNAI E21", vazaoLmin: 21, potNominalKcalH: 29000, potKw: 33.7, rendimento: 0.86, precoRef: 2999 },
  { id: "E27", marca: "Rinnai", modelo: "RINNAI E27", vazaoLmin: 27, potNominalKcalH: 37700, potKw: 43.8, rendimento: 0.86, precoRef: 3540 },
  { id: "E33", marca: "Rinnai", modelo: "RINNAI E33", vazaoLmin: 32.5, potNominalKcalH: 45300, potKw: 52.7, rendimento: 0.86, precoRef: 4409 },
  { id: "E35", marca: "Rinnai", modelo: "RINNAI E35", vazaoLmin: 35, potNominalKcalH: 49130, potKw: 57.1, rendimento: 0.85, precoRef: 4735 },
  { id: "E43", marca: "Rinnai", modelo: "RINNAI E43", vazaoLmin: 45, potNominalKcalH: 62800, potKw: 73, rendimento: 0.86, precoRef: 10470 },
];

/** Pot. útil (kcal/h) = nominal × rendimento (Aquecedores!H = D×F). */
export function potUtil(m: ModeloAquecedor): number {
  return m.potNominalKcalH * m.rendimento;
}

// === Tabela C.1 (ABNT NBR 16057:2024, Anexo C) ===========================
// Fração armazenada por faixa de V pico — limites com ≤, fiel a B32.
export const TABELA_C1: { ateVPico: number; fArmaz: number; rotulo: string }[] = [
  { ateVPico: 1500, fArmaz: 1 / 3, rotulo: "0 a 1 500" },
  { ateVPico: 6000, fArmaz: 1 / 4, rotulo: "1 501 a 6 000" },
  { ateVPico: 12000, fArmaz: 1 / 5, rotulo: "6 001 a 12 000" },
  { ateVPico: 20000, fArmaz: 1 / 6, rotulo: "12 001 a 20 000" },
  { ateVPico: Infinity, fArmaz: 1 / 7, rotulo: "> 20 001" },
];

export function fArmazNBR(vPico: number): number {
  return TABELA_C1.find((r) => vPico <= r.ateVPico)!.fArmaz;
}

// === Inputs ==============================================================
export interface Inputs {
  vb: number; // l/min — vazão de uso                          (B12)
  tb: number; // °C — temp. de uso                             (B13)
  taf: number; // °C — temp. água fria                         (B14)
  taq: number; // °C — temp. do boiler                         (B15)
  vConsumoDiario: number; // L — consumo diário NBR            (B16)
  fs: number; // — fator de simultaneidade NBR                 (B17)
  volumeBoiler: number; // L — volume do boiler (T.D)          (B18)
  tempoAlvo: number; // min — tempo alvo (T.D)                 (B19)
  histerese: number; // °C — 0 = por demanda · 5 = termostato  (B20)
}

export const INPUTS_PADRAO: Inputs = {
  vb: 36,
  tb: 40,
  taf: 20,
  taq: 50,
  vConsumoDiario: 1000,
  fs: 0.9,
  volumeBoiler: 1000,
  tempoAlvo: 15,
  histerese: 5,
};

// === Resultado ===========================================================
export interface ResultadoMetodoBase {
  potenciaUtil: number; // kcal/h
  vazaoLh: number;
  vazaoLmin: number;
}

export interface ResultadoNBR extends ResultadoMetodoBase {
  vCorrigido: number;
  vPico: number;
  fArmaz: number;
  vArmazGas: number;
  vRecup: number;
}

export interface ResultadoTD extends ResultadoMetodoBase {
  t1DeadBand: number; // min — atraso até o termostato rearmar
  tempRearme: number; // °C — TAQ − Hist
  zeradoPorDeadBand: boolean; // (t − t₁) ≤ 0: apoio nem chega a ligar
  zeradoPorReserva: boolean; // MAX(0,·) atuou: reserva do boiler cobre a demanda
}

export interface ResultadoVMP extends ResultadoMetodoBase {
  vaq: number; // l/min — vazão equivalente na temp. do boiler
}

export interface Resultado {
  deltaT: number;
  vmp: ResultadoVMP;
  nbr: ResultadoNBR;
  td: ResultadoTD;
  /** TAQ > TAF (senão as divisões por ΔT/mistura ficam inválidas). */
  tempValida: boolean;
  /** TB > TAQ: o boiler não entrega a temp. de uso só por mistura. */
  tbAcimaBoiler: boolean;
  /** TAQ − Hist < TB: a água chega abaixo de TB antes do apoio rearmar. */
  rearmeAbaixoUso: boolean;
}

export function calcular(i: Inputs): Resultado {
  const deltaT = i.taq - i.taf; // B21
  const tempValida = deltaT > 0 && i.tb > i.taf;
  const tbAcimaBoiler = i.tb > i.taq;
  const rearmeAbaixoUso = i.taq - i.histerese < i.tb;

  const porDeltaT = (p: number) => ({
    vazaoLh: deltaT !== 0 ? p / deltaT : NaN,
    vazaoLmin: deltaT !== 0 ? p / deltaT / 60 : NaN,
  });

  // --- M1 — V.M.P (B24/B25) ---
  const vaq = deltaT !== 0 ? (i.vb * (i.tb - i.taf)) / deltaT : NaN;
  const p1 = vaq * deltaT * 60;
  const vmp: ResultadoVMP = { vaq, potenciaUtil: p1, ...porDeltaT(p1) };

  // --- M2 — NBR 16057 (B30…B35) ---
  const vCorrigido = deltaT !== 0 ? (i.vConsumoDiario * (i.tb - i.taf)) / deltaT : NaN;
  const vPico = vCorrigido * i.fs;
  const fArmaz = isFinite(vPico) ? fArmazNBR(vPico) : NaN;
  const vArmazGas = vPico * fArmaz;
  const vRecup = vPico - vArmazGas;
  const p2 = vRecup * deltaT;
  const nbr: ResultadoNBR = {
    vCorrigido,
    vPico,
    fArmaz,
    vArmazGas,
    vRecup,
    potenciaUtil: p2,
    ...porDeltaT(p2),
  };

  // --- M3 — Tempo Determinado com histerese (B40/B41) ---
  const demandaKcalMin = i.vb * (i.tb - i.taf); // kcal/min retirados pelo consumo
  const t1 = demandaKcalMin !== 0 ? (i.volumeBoiler * i.histerese) / demandaKcalMin : NaN;
  const zeradoPorDeadBand = isFinite(t1) && i.tempoAlvo - t1 <= 0;
  let p3: number;
  let zeradoPorReserva = false;
  if (!isFinite(t1)) {
    p3 = NaN;
  } else if (zeradoPorDeadBand) {
    p3 = 0;
  } else {
    const bruto =
      60 * (demandaKcalMin - (i.volumeBoiler * (i.taq - i.histerese - i.tb)) / (i.tempoAlvo - t1));
    zeradoPorReserva = bruto < 0;
    p3 = Math.max(0, bruto);
  }
  const td: ResultadoTD = {
    t1DeadBand: t1,
    tempRearme: i.taq - i.histerese,
    zeradoPorDeadBand,
    zeradoPorReserva,
    potenciaUtil: p3,
    ...porDeltaT(p3),
  };

  return { deltaT, vmp, nbr, td, tempValida, tbAcimaBoiler, rearmeAbaixoUso };
}

// === Otimizador de arranjos (substitui o painel travado da planilha) =====
// SEMPRE o mesmo modelo, N× em paralelo (14/07/2026, pedido do cliente — sistemas
// gêmeos). Por modelo: N = ⌈demanda / pot. útil⌉; mais unidades que N nunca ajudam
// (só encarecem), então cada modelo gera exatamente 1 candidato. Desempate:
//   1) menor preço  2) menos aparelhos (custo oculto de instalação/gás/exaustão)
//   3) maior pot. útil (folga de graça)  4) ordem do catálogo.

export interface ItemArranjo {
  modeloId: string;
  qtd: number;
}

export interface Arranjo {
  itens: ItemArranjo[];
  numAparelhos: number;
  potUtilTotal: number; // kcal/h
  potNominalTotal: number; // kcal/h
  precoTotal: number; // R$ (preços efetivos: editados ou referência)
  folga: number; // potUtilTotal − demanda
  folgaPct: number; // folga / demanda
}

export interface OpcoesSugestao {
  /** Overrides de preço por modeloId; ausente → precoRef. */
  precos?: Record<string, number>;
  /** Cap de aparelhos por arranjo (proteção contra demanda absurda). */
  maxAparelhos?: number;
  /** Quantos arranjos retornar (vencedor + alternativas). */
  maxArranjos?: number;
}

export interface ResultadoSugestao {
  status: "ok" | "apoio-dispensavel" | "demanda-excede-cap";
  arranjos: Arranjo[]; // [0] = vencedor
  modelosIgnorados: string[]; // preço inválido (≤0 / NaN / não finito)
}

const CAP_APARELHOS = 12;

export function precoEfetivo(m: ModeloAquecedor, precos?: Record<string, number>): number {
  const v = precos?.[m.id];
  return v === undefined ? m.precoRef : v;
}

export function sugerirArranjos(
  pKcalH: number,
  catalogo: ModeloAquecedor[] = CATALOGO_RINNAI,
  opts: OpcoesSugestao = {}
): ResultadoSugestao {
  const maxAparelhos = opts.maxAparelhos ?? CAP_APARELHOS;
  const maxArranjos = opts.maxArranjos ?? 3;

  if (!isFinite(pKcalH) || pKcalH <= 0) {
    return { status: "apoio-dispensavel", arranjos: [], modelosIgnorados: [] };
  }

  // Modelos com preço válido (a UI valida > 0, mas o motor se defende sozinho).
  const modelosIgnorados: string[] = [];
  const validos = catalogo.filter((m) => {
    const preco = precoEfetivo(m, opts.precos);
    const ok = isFinite(preco) && preco > 0;
    if (!ok) modelosIgnorados.push(m.id);
    return ok;
  });
  if (validos.length === 0) {
    return { status: "demanda-excede-cap", arranjos: [], modelosIgnorados };
  }

  const potMax = Math.max(...validos.map(potUtil));
  if (pKcalH > maxAparelhos * potMax) {
    return { status: "demanda-excede-cap", arranjos: [], modelosIgnorados };
  }

  // 1 candidato por modelo: a menor quantidade que cobre a demanda.
  const posCatalogo = new Map(catalogo.map((m, k) => [m.id, k]));
  const encontrados: Arranjo[] = [];
  for (const m of validos) {
    // tolerância p/ igualdade exata em float (demanda == N × pot. útil)
    const qtd = Math.ceil((pKcalH - 1e-9) / potUtil(m));
    if (qtd > maxAparelhos) continue;
    const util = qtd * potUtil(m);
    encontrados.push({
      itens: [{ modeloId: m.id, qtd }],
      numAparelhos: qtd,
      potUtilTotal: util,
      potNominalTotal: qtd * m.potNominalKcalH,
      precoTotal: qtd * precoEfetivo(m, opts.precos),
      folga: util - pKcalH,
      folgaPct: (util - pKcalH) / pKcalH,
    });
  }

  if (encontrados.length === 0) {
    return { status: "demanda-excede-cap", arranjos: [], modelosIgnorados };
  }

  // Desempate: preço → nº aparelhos → maior pot. útil → ordem do catálogo.
  const chaveCatalogo = (a: Arranjo) =>
    a.itens
      .map((it) => [posCatalogo.get(it.modeloId) ?? 99, it.qtd] as const)
      .sort((x, y) => x[0] - y[0])
      .flat()
      .join(",");
  encontrados.sort(
    (a, b) =>
      a.precoTotal - b.precoTotal ||
      a.numAparelhos - b.numAparelhos ||
      b.potUtilTotal - a.potUtilTotal ||
      chaveCatalogo(a).localeCompare(chaveCatalogo(b))
  );

  // Vencedor + alternativas não Pareto-dominadas (custa mais E rende menos E
  // tem ≥ aparelhos que alguém já listado → sai).
  const arranjos: Arranjo[] = [];
  for (const c of encontrados) {
    if (arranjos.length >= maxArranjos) break;
    const dominado = arranjos.some(
      (v) =>
        c.precoTotal >= v.precoTotal &&
        c.potUtilTotal <= v.potUtilTotal &&
        c.numAparelhos >= v.numAparelhos
    );
    if (!dominado) arranjos.push(c);
  }

  return { status: "ok", arranjos, modelosIgnorados };
}

/** "2× E21" — rótulo de exibição de um arranjo (o "+" só aparece em salvos antigos mistos). */
export function rotuloArranjo(a: Arranjo): string {
  return a.itens.map((it) => `${it.qtd}× ${it.modeloId}`).join(" + ");
}
