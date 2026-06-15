// Motor de cálculo do módulo "Vaso de Expansão".
// Portado da planilha "03. [DIMENSIONAMENTO] VOLUME VASO DE EXPANSÃO.xlsx"
// (abas Planilha1 = dois dimensionamentos lado a lado; Planilha2 = Tabela A.1).
//
// A planilha duplica os inputs (um bloco NBR e outro Caleffi); no app usamos
// UM conjunto unificado de inputs e rodamos os dois métodos em paralelo.
//
// Fórmulas portadas FIELMENTE das células:
//   NBR     C10 = (C5*C4)/(1-((C6+0.3+1)/(C7+1)))
//   Caleffi F6  = (0.31+3.9*10^-4*F5^2)/100   (coef. e por Caleffi)
//           F4  = F3*0.005                     (Vv = 0,5% do volume)
//           F11 = F8+0.3 (Po)  F12 = F11+1 (Pi)
//           F13 = F9-0.5 (Per) F14 = F13+1 (Pf)
//           F16 = ((F6*F3)+F4)/(1-(F12/F14))

// === Tabela A.1 (NBR 16057, aba Planilha2) ============================
// Coeficiente de dilatação 'e' da água por temperatura (°C),
// relativo a 4 °C (ρ = 1000 kg/m³).
export const TABELA_A1: { temp: number; e: number }[] = [
  { temp: 0, e: 0.00013 },
  { temp: 10, e: 0.00025 },
  { temp: 15, e: 0.00085 },
  { temp: 20, e: 0.0018 },
  { temp: 25, e: 0.00289 },
  { temp: 30, e: 0.00425 },
  { temp: 35, e: 0.00582 },
  { temp: 40, e: 0.00782 },
  { temp: 45, e: 0.00984 },
  { temp: 50, e: 0.01207 },
  { temp: 55, e: 0.01447 },
  { temp: 60, e: 0.01704 },
  { temp: 65, e: 0.01979 },
  { temp: 70, e: 0.02269 },
  { temp: 75, e: 0.02575 },
  { temp: 80, e: 0.02898 },
  { temp: 85, e: 0.03236 },
  { temp: 90, e: 0.0359 },
  { temp: 95, e: 0.03958 },
  { temp: 100, e: 0.04342 },
];

// Vasos de expansão comerciais (litros) — escada de volumes de catálogo.
export const VASOS_COMERCIAIS = [8, 12, 18, 24, 50, 100, 200];

// === Coeficiente 'e' da NBR ==========================================
// Na planilha é um VLOOKUP exato (modo 0) na Tabela A.1. Aqui oferecemos
// as duas vias: lookup exato (dropdown) e interpolação linear (segurança
// caso a temperatura caia entre dois pontos da tabela).

/** Lookup exato da Tabela A.1; retorna null se a temperatura não existe. */
export function coefExato(temp: number): number | null {
  const row = TABELA_A1.find((r) => r.temp === temp);
  return row ? row.e : null;
}

/** Interpolação linear na Tabela A.1 (clamp nas extremidades). */
export function coefInterpolado(temp: number): number {
  const tab = TABELA_A1;
  if (temp <= tab[0].temp) return tab[0].e;
  if (temp >= tab[tab.length - 1].temp) return tab[tab.length - 1].e;
  for (let i = 0; i < tab.length - 1; i++) {
    const a = tab[i];
    const b = tab[i + 1];
    if (temp >= a.temp && temp <= b.temp) {
      const frac = (temp - a.temp) / (b.temp - a.temp);
      return a.e + frac * (b.e - a.e);
    }
  }
  return tab[tab.length - 1].e;
}

/**
 * Coeficiente 'e' da NBR para a temperatura dada.
 * Usa o valor exato da tabela quando existe; senão interpola linearmente.
 */
export function coefNBR(temp: number): { e: number; interpolado: boolean } {
  const exato = coefExato(temp);
  if (exato !== null) return { e: exato, interpolado: false };
  return { e: coefInterpolado(temp), interpolado: true };
}

// === Inputs unificados ===============================================
export interface Inputs {
  tempBoiler: number; // °C (Tabela A.1 / tm do Caleffi)
  volume: number; // L de água do sistema (Va / volume do boiler)
  pSist: number; // bar — pressão da rede
  pValv: number; // bar — pressão de regulagem da válvula de segurança
}

// === Resultado de cada método ========================================
export interface ResultadoMetodo {
  volumeVaso: number; // L (mínimo calculado)
  coef: number; // coeficiente de dilatação 'e' usado
  denominador: number; // 1 - (relação de pressões) — se <= 0, inválido
  valido: boolean; // denominador > 0
}

export interface ResultadoCaleffi extends ResultadoMetodo {
  vv: number; // L — folga de 0,5% do volume
  po: number; // bar — pré-carga = Psist + 0,3
  pi: number; // bar — pressão inicial absoluta = Po + 1
  per: number; // bar — pressão máx. de funcionamento = Pvalv - 0,5
  pf: number; // bar — pressão final absoluta = Per + 1
}

export interface Resultado {
  nbr: ResultadoMetodo & { interpolado: boolean };
  caleffi: ResultadoCaleffi;
  /** Maior dos dois volumes válidos (recomendação de adoção). */
  volumeAdotado: number;
  /** Qual método produziu o maior volume. */
  metodoAdotado: "NBR 16057" | "Caleffi" | null;
  /** Vaso comercial imediatamente acima do volume adotado. */
  vasoComercial: number | null;
  /** Validação Pvalv > Psist (necessária para o denominador ser positivo). */
  pressaoValida: boolean;
}

// === NBR 16057 =======================================================
// C10 = (Vol * e) / (1 - ((Psist + 0,3 + 1) / (Pvalv + 1)))
function calcularNBR(i: Inputs): ResultadoMetodo & { interpolado: boolean } {
  const { e, interpolado } = coefNBR(i.tempBoiler);
  const denominador = 1 - (i.pSist + 0.3 + 1) / (i.pValv + 1);
  const valido = denominador > 0;
  const volumeVaso = valido ? (i.volume * e) / denominador : NaN;
  return { volumeVaso, coef: e, denominador, valido, interpolado };
}

// === Caleffi =========================================================
// e   = (0,31 + 3,9e-4 * tm²) / 100
// Vv  = Vol * 0,005
// Po  = Psist + 0,3 ; Pi = Po + 1 ; Per = Pvalv - 0,5 ; Pf = Per + 1
// V   = ((e*Vol) + Vv) / (1 - (Pi/Pf))
function calcularCaleffi(i: Inputs): ResultadoCaleffi {
  const e = (0.31 + 3.9e-4 * Math.pow(i.tempBoiler, 2)) / 100;
  const vv = i.volume * 0.005;
  const po = i.pSist + 0.3;
  const pi = po + 1;
  const per = i.pValv - 0.5;
  const pf = per + 1;
  const denominador = 1 - pi / pf;
  const valido = denominador > 0;
  const volumeVaso = valido ? (e * i.volume + vv) / denominador : NaN;
  return { volumeVaso, coef: e, denominador, valido, vv, po, pi, per, pf };
}

/** Menor vaso comercial >= volume; null se nenhum cobre (acima do catálogo). */
export function vasoComercialAcima(volume: number): number | null {
  if (!isFinite(volume) || volume <= 0) return null;
  return VASOS_COMERCIAIS.find((v) => v >= volume) ?? null;
}

export function calcular(i: Inputs): Resultado {
  const nbr = calcularNBR(i);
  const caleffi = calcularCaleffi(i);

  // Gotcha: Pvalv tem que ser > Psist para o denominador ser positivo.
  // (Se a válvula abre a uma pressão <= a da rede, o vaso "não fecha conta".)
  const pressaoValida = i.pValv > i.pSist && nbr.valido && caleffi.valido;

  const volNBR = nbr.valido ? nbr.volumeVaso : -Infinity;
  const volCal = caleffi.valido ? caleffi.volumeVaso : -Infinity;

  let volumeAdotado = -Infinity;
  let metodoAdotado: Resultado["metodoAdotado"] = null;
  if (volNBR > -Infinity || volCal > -Infinity) {
    if (volCal >= volNBR) {
      volumeAdotado = volCal;
      metodoAdotado = "Caleffi";
    } else {
      volumeAdotado = volNBR;
      metodoAdotado = "NBR 16057";
    }
  }

  const vasoComercial =
    volumeAdotado > -Infinity ? vasoComercialAcima(volumeAdotado) : null;

  return {
    nbr,
    caleffi,
    volumeAdotado: volumeAdotado > -Infinity ? volumeAdotado : NaN,
    metodoAdotado,
    vasoComercial,
    pressaoValida,
  };
}
