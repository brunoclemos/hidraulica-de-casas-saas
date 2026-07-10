// Motor do módulo "Tempo de Espera" — tempo até a água quente chegar ao ponto.
// Portado da planilha "Tempo de Espera - AQ - Ferreto.xlsx" (aba "Tempo de Espera -
// Trechos", que suporta vários trechos em série; a aba de trecho único é o caso limitado).
//
// Por trecho: velocidade = vazão / área do tubo; tempo = distância / velocidade.
// Tempo total de espera = soma dos tempos de todos os trechos (a água percorre em série).
//
// PARIDADE com a planilha: usa π = 3,14 literal (como as fórmulas C11/C12 da planilha).

// π literal da planilha (paridade de resultados com o curso).
const PI = 3.14;

// Diâmetro comercial CPVC: DN externo -> DN interno (mm). Aba "DN CPVC".
export const DN_CPVC: { externo: number; interno: number; rotulo: string }[] = [
  { externo: 15, interno: 11.8, rotulo: '15 mm (½")' },
  { externo: 22, interno: 17.6, rotulo: '22 mm (¾")' },
  { externo: 28, interno: 22.6, rotulo: '28 mm (1")' },
  { externo: 35, interno: 28.6, rotulo: '35 mm (1¼")' },
  { externo: 42, interno: 34.4, rotulo: '42 mm (1½")' },
  { externo: 54, interno: 44.2, rotulo: '54 mm (2")' },
  { externo: 73, interno: 59.2, rotulo: '73 mm (2½")' },
  { externo: 89, interno: 72, rotulo: '89 mm (3")' },
  { externo: 114, interno: 93.2, rotulo: '114 mm (4")' },
];

export function dnInterno(externo: number): number {
  const row = DN_CPVC.find((d) => d.externo === externo);
  return row ? row.interno : 0;
}

// --- núcleo (Q em L/min, D interno em mm) ---
/** Área interna do tubo (m²). */
function area(dIntMm: number): number {
  return (PI * (dIntMm / 1000) ** 2) / 4;
}
/** Velocidade da água (m/s). */
export function velocidade(vazaoLmin: number, dIntMm: number): number {
  if (dIntMm <= 0) return 0;
  return (4 * (vazaoLmin / 60) / 1000) / (PI * (dIntMm / 1000) ** 2);
}

// ---------------------------------------------------------------------------
// TIPOS
// ---------------------------------------------------------------------------

export interface Trecho {
  nome: string;
  vazao: number; // L/min
  pontos: number; // pontos simultâneos (informativo — vazão total = vazão × pontos)
  dnExterno: number; // mm
  distancia: number; // m
}

export interface TrechoResultado {
  nome: string;
  vazaoTotal: number; // L/min (vazão × pontos)
  dnInterno: number; // mm
  velocidade: number; // m/s
  tempoSeg: number; // s (distância / velocidade)
  volume: number; // L (área × distância)
}

export interface Resultado {
  trechos: TrechoResultado[];
  tempoTotalSeg: number; // soma dos tempos (s)
  volumeTotal: number; // L
}

// ---------------------------------------------------------------------------
// MOTOR
// ---------------------------------------------------------------------------

export function calcular(trechos: Trecho[]): Resultado {
  const res: TrechoResultado[] = trechos.map((t) => {
    const dInt = dnInterno(t.dnExterno);
    const v = velocidade(t.vazao, dInt);
    const tempoSeg = v > 0 ? t.distancia / v : 0;
    const volume = area(dInt) * t.distancia * 1000; // m³ -> L
    return {
      nome: t.nome,
      vazaoTotal: t.vazao * t.pontos,
      dnInterno: dInt,
      velocidade: v,
      tempoSeg,
      volume,
    };
  });
  return {
    trechos: res,
    tempoTotalSeg: res.reduce((s, t) => s + t.tempoSeg, 0),
    volumeTotal: res.reduce((s, t) => s + t.volume, 0),
  };
}

/** Formata segundos como "M min SS s" (ou "SS s" quando < 1 min). */
export function minSeg(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "—";
  const s = Math.round(segundos);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(s % 60).padStart(2, "0")} s`;
}
