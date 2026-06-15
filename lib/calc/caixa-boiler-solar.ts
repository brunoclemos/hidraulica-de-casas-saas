// Motor de cálculo do módulo "Caixa d'Água, Boiler & Coletores Solares".
// Portado FIELMENTE da planilha do curso:
//   "01. [DIMENSIONAMENTO] CAIXA D_ÁGUA, BOILER E COLETORES SOLARES.xlsx"
//   (aba "Dimensionamento Cx|Boiler|Placa")
//
// Mapa de células -> código:
//   F20..F24  vol. por ponto = N_usuarios * tempo * vazao * freq      ($B$17*C*D*E)
//   F26,F27   eletro c/ volume fixo  = IF(há uso, vol, 0)
//   F28       máq. louça             = IF(há uso, vol*freq, 0)
//   B30       CONSUMO TOTAL          = soma de todos os F
//   B31       CONSUMO AF e AQ        = soma só dos pontos cujo tipo = "AF e AQ"
//   B33       VOLUME ÁGUA QUENTE     = B31 * (Tc - Tf) / (Tq - Tf)
//   B34       VOLUME ÁGUA FRIA       = B30 - B33
//   A37       ENERGIA ÚTIL           = B33 * (Tq - Tf) / 28.7
//   A43       N° COLETORES           = ROUNDUP( (energia / producao) * fatorClima )
//   A48       N° COLETORES CORRIGIDO = ROUNDUP( N_bruto * fatorOrientacao )
//   B14/B15   % água quente / fria   = (Vq / Vtotal) * 100  (na planilha sobre o bloco demo;
//                                       aqui aplicamos sobre o consumo real, mais útil)
//
// GOTCHAS corrigidas:
//   - Comparações de string da planilha viram ENUMS tipados (TipoPonto / Clima / Orientacao).
//   - A constante 28.7 (kcal -> conversão p/ energia útil diária da planilha) fica nomeada
//     e documentada em CONST_ENERGIA_UTIL.
//   - ROUNDUP reimplementado como Math.ceil; expomos também o valor EXATO (não arredondado).
//   - Divisão por zero (Tq == Tf) tratada retornando 0 em vez de NaN/Infinity.

// ----------------------------- enums / tipos -----------------------------

export type TipoPonto = "AF" | "AF e AQ"; // só "AF e AQ" entra no consumo de água quente

export type Clima =
  | "muito-frio"
  | "frio"
  | "quente"
  | "muito-quente";

export type Orientacao = "norte" | "45-norte" | "90-norte";

// Fatores de correção climática (planilha A41/A43: 1.4 / 1.2 / 1.0 / 0.85)
export const FATOR_CLIMA: Record<Clima, number> = {
  "muito-frio": 1.4, // "0°C - Muito frio"
  frio: 1.2, // "18,6°C - Frio"
  quente: 1.0, // "21,6°C - Quente"
  "muito-quente": 0.85, // "24,6° - Muito quente"
};

// Fatores de correção por orientação solar (planilha A48: 1.0 / 1.1 / 1.25)
export const FATOR_ORIENTACAO: Record<Orientacao, number> = {
  norte: 1.0, // "Norte"
  "45-norte": 1.1, // "45° do Norte"
  "90-norte": 1.25, // "90° do Norte"
};

// Rótulos legíveis (mantêm o texto original da planilha p/ rastreabilidade)
export const CLIMA_LABEL: Record<Clima, string> = {
  "muito-frio": "Muito frio (~0 °C) · fator 1,4",
  frio: "Frio (~18,6 °C) · fator 1,2",
  quente: "Quente (~21,6 °C) · fator 1,0",
  "muito-quente": "Muito quente (~24,6 °C) · fator 0,85",
};

export const ORIENTACAO_LABEL: Record<Orientacao, string> = {
  norte: "Norte (ideal) · fator 1,0",
  "45-norte": "45° do Norte · fator 1,1",
  "90-norte": "90° do Norte · fator 1,25",
};

// Constante da planilha (célula A37): divisor de conversão da energia útil diária.
export const CONST_ENERGIA_UTIL = 28.7;

// ----------------------------- inputs -----------------------------

// Ponto de consumo "por uso" (Ducha, Lavatório, Cozinha, Ducha higiênica, Tanque).
export interface PontoConsumo {
  id: string;
  nome: string;
  tipo: TipoPonto;
  tempo: number; // min por uso
  vazao: number; // L/min
  frequencia: number; // usos/dia
}

// Eletrodoméstico com volume fixo (Banheira, Máq. lavar roupa, Máq. louça).
export interface Eletro {
  id: string;
  nome: string;
  tipo: TipoPonto;
  tem: boolean; // "Há uso" ?
  volume: number; // L por uso
  frequencia: number; // usos/dia (usado p/ máq. louça; 1 nos demais)
}

export interface Inputs {
  nUsuarios: number; // B17
  tQuente: number; // B10 — boiler (°C)
  tFria: number; // B11 — água fria local (°C)
  tConsumo: number; // B12 — temperatura de consumo desejada (°C)
  pontos: PontoConsumo[];
  eletros: Eletro[];
  producaoColetor: number; // B39 — produção INMETRO do coletor escolhido
  clima: Clima; // B40
  orientacao: Orientacao; // B45
}

// ----------------------------- saída -----------------------------

export interface ItemResultado {
  id: string;
  nome: string;
  tipo: TipoPonto;
  volume: number; // L/dia
  contaAQ: boolean; // entrou no consumo de água quente?
}

export interface Resultado {
  itens: ItemResultado[];
  consumoTotal: number; // B30 (L/dia)
  consumoAQ: number; // B31 (L/dia)
  volBoilerQuente: number; // B33 (L) — número-herói
  volFria: number; // B34 (L)
  pctMisturaAQ: number; // (Tc - Tf) / (Tq - Tf) * 100
  pctAQ: number; // % do consumo total que é água quente
  pctAF: number; // % do consumo total que é água fria
  energiaUtil: number; // A37
  nColetoresExato: number; // (energia/producao)*fatorClima  (sem arredondar)
  nColetoresBruto: number; // A43 (ROUNDUP)
  nCorrigidoExato: number; // N_bruto * fatorOrientacao (sem arredondar)
  nColetoresCorrigido: number; // A48 (ROUNDUP) — número-herói
  fatorClima: number;
  fatorOrientacao: number;
  // validação das temperaturas (gotcha: Tq > Tc > Tf)
  tempOk: boolean;
  tempMsg: string | null;
}

// ROUNDUP(x, 0) do Excel == teto para inteiros positivos.
function roundUp(x: number): number {
  if (!isFinite(x) || x <= 0) return 0;
  return Math.ceil(x);
}

// divisão segura (evita NaN/Infinity quando Tq == Tf)
function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function calcular(i: Inputs): Resultado {
  const n = i.nUsuarios;

  // --- validação de temperaturas: Tq > Tc > Tf ---
  let tempOk = true;
  let tempMsg: string | null = null;
  if (!(i.tQuente > i.tConsumo)) {
    tempOk = false;
    tempMsg = "A temperatura do boiler precisa ser maior que a de consumo.";
  } else if (!(i.tConsumo > i.tFria)) {
    tempOk = false;
    tempMsg = "A temperatura de consumo precisa ser maior que a da água fria.";
  }

  // --- volume por item ---
  const itensPontos: ItemResultado[] = i.pontos.map((p) => {
    const volume = n * p.tempo * p.vazao * p.frequencia; // F20..F24
    return {
      id: p.id,
      nome: p.nome,
      tipo: p.tipo,
      volume,
      contaAQ: p.tipo === "AF e AQ",
    };
  });

  const itensEletros: ItemResultado[] = i.eletros.map((e) => {
    // F26/F27 = IF(tem, vol, 0); F28 (louça) = IF(tem, vol*freq, 0)
    const volume = e.tem ? e.volume * Math.max(1, e.frequencia) : 0;
    return {
      id: e.id,
      nome: e.nome,
      tipo: e.tipo,
      volume,
      contaAQ: e.tipo === "AF e AQ" && e.tem,
    };
  });

  const itens = [...itensPontos, ...itensEletros];

  // B30 — consumo total (todos os itens)
  const consumoTotal = itens.reduce((acc, it) => acc + it.volume, 0);
  // B31 — consumo só dos itens "AF e AQ"
  const consumoAQ = itens.reduce((acc, it) => acc + (it.contaAQ ? it.volume : 0), 0);

  // fração de mistura = (Tc - Tf) / (Tq - Tf)
  const fracMistura = safeDiv(i.tConsumo - i.tFria, i.tQuente - i.tFria);

  // B33 — volume de água quente no boiler
  const volBoilerQuente = consumoAQ * fracMistura;
  // B34 — volume de água fria
  const volFria = consumoTotal - volBoilerQuente;

  const pctMisturaAQ = fracMistura * 100;
  const pctAQ = consumoTotal > 0 ? (volBoilerQuente / consumoTotal) * 100 : 0;
  const pctAF = consumoTotal > 0 ? (volFria / consumoTotal) * 100 : 0;

  // A37 — energia útil
  const energiaUtil = safeDiv(volBoilerQuente * (i.tQuente - i.tFria), CONST_ENERGIA_UTIL);

  // A43 — nº de coletores (bruto, corrigido por clima)
  const fatorClima = FATOR_CLIMA[i.clima];
  const fatorOrientacao = FATOR_ORIENTACAO[i.orientacao];
  const nColetoresExato = safeDiv(energiaUtil, i.producaoColetor) * fatorClima;
  const nColetoresBruto = roundUp(nColetoresExato);

  // A48 — nº de coletores corrigido pela orientação
  const nCorrigidoExato = nColetoresBruto * fatorOrientacao;
  const nColetoresCorrigido = roundUp(nCorrigidoExato);

  return {
    itens,
    consumoTotal,
    consumoAQ,
    volBoilerQuente,
    volFria,
    pctMisturaAQ,
    pctAQ,
    pctAF,
    energiaUtil,
    nColetoresExato,
    nColetoresBruto,
    nCorrigidoExato,
    nColetoresCorrigido,
    fatorClima,
    fatorOrientacao,
    tempOk,
    tempMsg,
  };
}

// ----------------------------- padrões (pré-preenchidos da planilha) -----------------------------

export function pontosPadrao(): PontoConsumo[] {
  return [
    { id: "ducha", nome: "Ducha", tipo: "AF e AQ", tempo: 15, vazao: 10, frequencia: 2 },
    { id: "lavatorio", nome: "Lavatório", tipo: "AF e AQ", tempo: 2, vazao: 5, frequencia: 2 },
    { id: "cozinha", nome: "Cozinha", tipo: "AF e AQ", tempo: 3, vazao: 5, frequencia: 2 },
    { id: "ducha-higienica", nome: "Ducha higiênica", tipo: "AF e AQ", tempo: 2, vazao: 5, frequencia: 2 },
    { id: "tanque", nome: "Tanque", tipo: "AF", tempo: 2, vazao: 5, frequencia: 1 },
  ];
}

export function eletrosPadrao(): Eletro[] {
  return [
    { id: "banheira", nome: "Banheira", tipo: "AF e AQ", tem: true, volume: 200, frequencia: 1 },
    { id: "maq-roupa", nome: "Máq. lavar roupa", tipo: "AF", tem: true, volume: 200, frequencia: 1 },
    { id: "maq-louca", nome: "Máq. lavar louça", tipo: "AF", tem: true, volume: 20, frequencia: 2 },
  ];
}
