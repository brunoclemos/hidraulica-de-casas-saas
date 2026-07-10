// Motor do módulo "Balanço de Vazão — Recirculação (Anel 1 × Anel 2)".
// Portado da planilha "Ferreto_Balanco_Vazao_Recirculacao_v2.xlsx" (aba "Balanço Vazão";
// a aba "Dados e Cálculos" é a memória de iteração e vira este motor; "Tempo de Espera"
// é ignorada, conforme o cliente).
//
// O que faz:
//  - DIVISÃO DE VAZÃO: distribui a vazão do tronco entre dois anéis em paralelo, de modo
//    que a perda de carga nos dois se iguale. Como f (atrito) depende da vazão, resolve-se
//    por iteração de ponto fixo: Q1 = Qt · K1/(K1+K2), com Ki = Di^2.5 / √(fi · Li).
//  - TEMPO DE RECIRCULAÇÃO por anel: volume interno (comprimento REAL) ÷ vazão do anel.
//  - MODO INVERSO: dado um tempo-alvo no Anel 2, acha a vazão necessária em cada anel
//    (ambos com a mesma perda de carga) e a vazão total.
//
// Atrito por Swamee-Jain; μ (viscosidade) por lookup de correspondência aproximada.

export type Material = "CPVC" | "PVC";

// Diâmetro comercial: DN externo -> DN interno (mm). Aba "Dados e Cálculos".
export const DN_TABELA: Record<Material, { externo: number; interno: number; rotulo: string }[]> = {
  CPVC: [
    { externo: 15, interno: 11.8, rotulo: '15 mm (½")' },
    { externo: 22, interno: 17.6, rotulo: '22 mm (¾")' },
    { externo: 28, interno: 22.6, rotulo: '28 mm (1")' },
    { externo: 35, interno: 28.6, rotulo: '35 mm (1¼")' },
    { externo: 42, interno: 34.4, rotulo: '42 mm (1½")' },
    { externo: 54, interno: 44.2, rotulo: '54 mm (2")' },
    { externo: 73, interno: 59.2, rotulo: '73 mm (2½")' },
    { externo: 89, interno: 72, rotulo: '89 mm (3")' },
  ],
  PVC: [
    { externo: 20, interno: 17, rotulo: '20 mm (½")' },
    { externo: 25, interno: 21.4, rotulo: '25 mm (¾")' },
    { externo: 32, interno: 27.8, rotulo: '32 mm (1")' },
    { externo: 40, interno: 35.2, rotulo: '40 mm (1¼")' },
    { externo: 50, interno: 44, rotulo: '50 mm (1½")' },
    { externo: 60, interno: 53, rotulo: '60 mm (2")' },
    { externo: 75, interno: 66.6, rotulo: '75 mm (2½")' },
    { externo: 85, interno: 75.6, rotulo: '85 mm (3")' },
    { externo: 110, interno: 97.8, rotulo: '110 mm (4")' },
  ],
};

// Viscosidade dinâmica da água por temperatura (Pa·s). Aba "Dados e Cálculos" H6:I15.
const VISCOSIDADE: { temp: number; mu: number }[] = [
  { temp: 10, mu: 0.001308 },
  { temp: 20, mu: 0.001002 },
  { temp: 30, mu: 0.0007978 },
  { temp: 40, mu: 0.0006531 },
  { temp: 50, mu: 0.0005471 },
  { temp: 60, mu: 0.0004668 },
  { temp: 70, mu: 0.0004044 },
  { temp: 80, mu: 0.000355 },
  { temp: 90, mu: 0.000315 },
  { temp: 100, mu: 0.0002822 },
];

export function dnInterno(material: Material, externo: number): number {
  const row = DN_TABELA[material].find((d) => d.externo === externo);
  return row ? row.interno : 0;
}

export function viscosidade(tempC: number): number {
  let mu = VISCOSIDADE[0].mu;
  for (const v of VISCOSIDADE) {
    if (v.temp <= tempC) mu = v.mu;
    else break;
  }
  return mu;
}

// --- núcleo hidráulico (Q em L/min, D interno em mm) ---
const G = 9.81;

function velocidade(qLmin: number, dIntMm: number): number {
  if (dIntMm <= 0) return 0;
  return qLmin / 60000 / (Math.PI * (dIntMm / 1000) ** 2 / 4);
}
function reynolds(qLmin: number, dIntMm: number, mu: number): number {
  if (mu <= 0 || dIntMm <= 0) return 0;
  return (1000 * velocidade(qLmin, dIntMm) * (dIntMm / 1000)) / mu;
}
function fatorAtrito(re: number, rugMm: number, dIntMm: number): number {
  if (re <= 0 || dIntMm <= 0) return 0;
  return 0.25 / Math.log10(rugMm / dIntMm / 3.7 + 5.74 / re ** 0.9) ** 2;
}
/** Volume interno de um tubo (litros). L em m, D interno em mm. */
function volumeLitros(dIntMm: number, comprimentoM: number): number {
  return (Math.PI * (dIntMm / 1000) ** 2 / 4) * comprimentoM * 1000;
}

// ---------------------------------------------------------------------------
// TIPOS
// ---------------------------------------------------------------------------

export interface Anel {
  material: Material;
  dnExterno: number; // mm
  rugosidade: number; // mm (padrão 0,006)
  comprimentoTotal: number; // m (real + equivalente) — usado na perda de carga / divisão
  comprimentoReal: number; // m (só tubo) — usado no volume / tempo
}

export interface Inputs {
  a1: Anel;
  a2: Anel;
  temperatura: number; // °C
  vazaoTotal: number; // L/min (chega no tronco)
  tempoAlvoAnel2: number; // min (modo inverso)
}

export interface Resultado {
  q1: number; // L/min no anel 1 (divisão)
  q2: number; // L/min no anel 2
  tempo1Seg: number; // tempo de recirculação anel 1 (s)
  tempo2Seg: number; // tempo de recirculação anel 2 (s)
  volume1: number; // L (comprimento real)
  volume2: number;
  soma: number; // q1+q2 (verificação)
  // modo inverso
  q1Nec: number; // vazão necessária no anel 1 para o tempo-alvo do anel 2
  q2Nec: number; // vazão necessária no anel 2 (fixa pelo tempo-alvo)
  qTotalNec: number;
}

// ---------------------------------------------------------------------------
// DIVISÃO DE VAZÃO (iteração de ponto fixo — perda de carga igual)
// ---------------------------------------------------------------------------

export function dividirVazao(inp: Inputs): { q1: number; q2: number } {
  const mu = viscosidade(inp.temperatura);
  const d1 = dnInterno(inp.a1.material, inp.a1.dnExterno);
  const d2 = dnInterno(inp.a2.material, inp.a2.dnExterno);
  const L1 = inp.a1.comprimentoTotal, L2 = inp.a2.comprimentoTotal;
  const Qt = inp.vazaoTotal;
  if (d1 <= 0 || d2 <= 0 || Qt <= 0 || L1 <= 0 || L2 <= 0) return { q1: 0, q2: 0 };

  // estimativa inicial (f = 1): Ki = Di^2.5 / √Li
  let K1 = d1 ** 2.5 / Math.sqrt(L1);
  let K2 = d2 ** 2.5 / Math.sqrt(L2);
  let q1 = (Qt * K1) / (K1 + K2);
  let q2 = Qt - q1;

  for (let i = 0; i < 60; i++) {
    const f1 = fatorAtrito(reynolds(q1, d1, mu), inp.a1.rugosidade, d1) || 1;
    const f2 = fatorAtrito(reynolds(q2, d2, mu), inp.a2.rugosidade, d2) || 1;
    K1 = d1 ** 2.5 / Math.sqrt(f1 * L1);
    K2 = d2 ** 2.5 / Math.sqrt(f2 * L2);
    const nq1 = (Qt * K1) / (K1 + K2);
    if (Math.abs(nq1 - q1) < 1e-9) { q1 = nq1; q2 = Qt - q1; break; }
    q1 = nq1; q2 = Qt - q1;
  }
  return { q1, q2 };
}

// ---------------------------------------------------------------------------
// MODO INVERSO (tempo-alvo no Anel 2 -> vazões necessárias)
// ---------------------------------------------------------------------------

function vazaoNecessariaAnel1(inp: Inputs, hfAlvo: number): number {
  const mu = viscosidade(inp.temperatura);
  const d1 = dnInterno(inp.a1.material, inp.a1.dnExterno);
  const L1 = inp.a1.comprimentoTotal;
  if (d1 <= 0 || L1 <= 0 || hfAlvo <= 0) return 0;
  const dm = d1 / 1000;
  // Q1 = √( hf · π² · g · Dm^5 / (8 · f · L1) ) · 60000 ; itera f (Swamee-Jain)
  let f = 0.03;
  let q1 = 0;
  for (let i = 0; i < 60; i++) {
    q1 = Math.sqrt((hfAlvo * Math.PI ** 2 * G * dm ** 5) / (8 * f * L1)) * 60000;
    const nf = fatorAtrito(reynolds(q1, d1, mu), inp.a1.rugosidade, d1) || f;
    if (Math.abs(nf - f) < 1e-9) { f = nf; break; }
    f = nf;
  }
  return Math.sqrt((hfAlvo * Math.PI ** 2 * G * dm ** 5) / (8 * f * L1)) * 60000;
}

// ---------------------------------------------------------------------------
// MOTOR PRINCIPAL
// ---------------------------------------------------------------------------

export function calcular(inp: Inputs): Resultado {
  const mu = viscosidade(inp.temperatura);
  const d1 = dnInterno(inp.a1.material, inp.a1.dnExterno);
  const d2 = dnInterno(inp.a2.material, inp.a2.dnExterno);

  const { q1, q2 } = dividirVazao(inp);

  const volume1 = volumeLitros(d1, inp.a1.comprimentoReal);
  const volume2 = volumeLitros(d2, inp.a2.comprimentoReal);
  // tempo de recirculação (s) = (volume_real / Q) em minutos × 60
  const tempo1Seg = q1 > 0 ? (volume1 / q1) * 60 : 0;
  const tempo2Seg = q2 > 0 ? (volume2 / q2) * 60 : 0;

  // modo inverso
  const t = inp.tempoAlvoAnel2;
  const q2Nec = t > 0 ? volume2 / t : 0; // encher o anel 2 em t minutos
  // perda de carga do anel 2 nessa vazão (usa comprimento TOTAL)
  const v2 = velocidade(q2Nec, d2);
  const f2 = fatorAtrito(reynolds(q2Nec, d2, mu), inp.a2.rugosidade, d2);
  const hfAlvo = d2 > 0 ? f2 * (inp.a2.comprimentoTotal / (d2 / 1000)) * (v2 ** 2 / (2 * G)) : 0;
  const q1Nec = vazaoNecessariaAnel1(inp, hfAlvo);
  const qTotalNec = q1Nec + q2Nec;

  return {
    q1, q2,
    tempo1Seg, tempo2Seg,
    volume1, volume2,
    soma: q1 + q2,
    q1Nec, q2Nec, qTotalNec,
  };
}

/** Formata segundos como "M min SS s". */
export function minSeg(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos <= 0) return "—";
  const s = Math.round(segundos);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m} min ${String(r).padStart(2, "0")} s`;
}
