// Motor de cálculo do módulo "Perfil Térmico do Boiler".
// Portado da planilha "Perfil_Termico_Boiler" (abas Parâmetros + Simulação).
// Simula minuto a minuto (passo de Euler de 1 min) a queda/recuperação de
// temperatura do boiler durante banhos simultâneos, comparando o apoio a GÁS
// vs ELÉTRICO. Funções puras e tipadas.
//
// Fórmulas-fonte (planilha):
//   consumo  = N*Q*(TM-TF)/vol_efetivo            (Simulação!E = ...*(D9-D8)/D14)
//   apoio_on = T(t-1) <= TQ - Histerese           (Simulação!F = IF(E<=D4-D5,1,0))
//   ganho_gas  = apoio_on ? (kcalh*rend)/(60*Vol_total) : 0   (usa Volume TOTAL — mantido)
//   ganho_elet = apoio_on ?  elet_kcalh/(60*Vol_total) : 0    (elétrica NÃO aplica rendimento)
//   T(t) = T(t-1) - consumo + ganho
//   AQ(t)= IFERROR( N*Q*(TM-TF)/(T(t)-TF), N*Q )
//   AF(t)= max(0, vazao_mistura - AQ)             (planilha deixa negativo; aqui
//                                                  corrigimos p/ 0 e sinalizamos)

export interface Inputs {
  // BOILER
  tSetPoint: number; // TQ (°C)
  histerese: number; // °C — apoio liga quando T <= TQ - histerese
  volume: number; // L (armazenamento total)
  tInicial: number; // Ti (°C)
  tFria: number; // TF (°C)
  tMistura: number; // TM (°C)
  nBanhos: number; // N (banhos simultâneos)
  vazaoDucha: number; // Q (L/min por ducha)
  coefPerdas: number; // 0..1 (reduz volume efetivo)
  duracao: number; // min de simulação
  // APOIO A GÁS
  gasKcalh: number; // potência (kcal/h)
  gasRendimento: number; // 0..1
  // APOIO ELÉTRICO
  eletKW: number; // potência (kW)
}

export type Fonte = "gas" | "eletrico";

// Uma linha minuto a minuto.
export interface Linha {
  t: number; // minuto (1..duracao)
  tBoiler: number; // °C
  apoioOn: boolean;
  vazaoAQ: number; // L/min de água quente do boiler
  vazaoAF: number; // L/min de água fria (clampada em 0)
  insuficiente: boolean; // true quando faltaria água fria (AF teórica < 0)
}

export interface CurvaResultado {
  fonte: Fonte;
  linhas: Linha[];
  tMin: number; // °C mínima atingida
  tMinMinuto: number; // minuto em que ocorreu a T mínima
  ganhoApoio: number; // °C/min adicionado quando o apoio está ligado
  // veredito
  confortoMantido: boolean; // true se T nunca cair abaixo de TM
  minutoBanhoFrio: number | null; // 1º minuto em que T < TM (banho frio), ou null
  algumInsuficiente: boolean; // true se em algum minuto faltou água fria
  primeiroInsuficiente: number | null; // 1º minuto com água insuficiente, ou null
}

export interface Derivados {
  vazaoMistura: number; // N*Q (L/min)
  volEfetivo: number; // Volume*(1-perdas) (L)
  gasKW: number; // kcalh/860
  eletKcalh: number; // kW*860
  tAciona: number; // TQ - histerese (°C)
  consumoPorMin: number; // N*Q*(TM-TF)/vol_efetivo (°C/min)
  ganhoGas: number; // (kcalh*rend)/(60*Volume) (°C/min, com apoio ligado)
  ganhoElet: number; // elet_kcalh/(60*Volume)   (°C/min, com apoio ligado)
}

export interface Resultado {
  derivados: Derivados;
  gas: CurvaResultado;
  eletrico: CurvaResultado;
  validacao: { ok: boolean; mensagem: string | null }; // TF < TM < TQ
}

// Derivados (espelham as células calculadas da aba Parâmetros).
export function derivar(i: Inputs): Derivados {
  const vazaoMistura = i.nBanhos * i.vazaoDucha; // D12
  const volEfetivo = i.volume * (1 - i.coefPerdas); // D14
  const gasKW = i.gasKcalh / 860; // I5
  const eletKcalh = i.eletKW * 860; // I11
  const tAciona = i.tSetPoint - i.histerese; // B = D4 - D5
  const consumoPorMin = (vazaoMistura * (i.tMistura - i.tFria)) / volEfetivo;
  const ganhoGas = (i.gasKcalh * i.gasRendimento) / (60 * i.volume);
  const ganhoElet = eletKcalh / (60 * i.volume);
  return {
    vazaoMistura,
    volEfetivo,
    gasKW,
    eletKcalh,
    tAciona,
    consumoPorMin,
    ganhoGas,
    ganhoElet,
  };
}

// Valida a ordem física TF < TM < TQ.
export function validar(i: Inputs): { ok: boolean; mensagem: string | null } {
  if (!(i.tFria < i.tMistura)) {
    return { ok: false, mensagem: "A água fria (TF) precisa ser menor que a mistura (TM)." };
  }
  if (!(i.tMistura < i.tSetPoint)) {
    return { ok: false, mensagem: "A mistura (TM) precisa ser menor que o set point (TQ)." };
  }
  return { ok: true, mensagem: null };
}

// Roda a simulação de Euler para UMA fonte de apoio.
function simular(i: Inputs, d: Derivados, fonte: Fonte): CurvaResultado {
  const ganhoApoio = fonte === "gas" ? d.ganhoGas : d.ganhoElet;
  const passos = Math.max(1, Math.floor(i.duracao)); // gera linhas dinamicamente pela Duração
  const linhas: Linha[] = [];

  let tPrev = i.tInicial;
  let tMin = i.tInicial;
  let tMinMinuto = 1;
  let minutoBanhoFrio: number | null = null;
  let primeiroInsuficiente: number | null = null;

  for (let t = 1; t <= passos; t++) {
    // t=1 começa em Ti (na planilha E4 = D7); demais aplicam o passo de Euler.
    let tBoiler: number;
    let apoioOn: boolean;
    if (t === 1) {
      tBoiler = i.tInicial;
      apoioOn = tBoiler <= d.tAciona;
    } else {
      apoioOn = tPrev <= d.tAciona; // status calculado sobre T(t-1)
      const ganho = apoioOn ? ganhoApoio : 0;
      tBoiler = tPrev - d.consumoPorMin + ganho;
    }

    // AQ: IFERROR(N*Q*(TM-TF)/(T-TF), N*Q) — trata divisão por zero/NaN.
    const denom = tBoiler - i.tFria;
    let vazaoAQ: number;
    if (denom === 0 || !Number.isFinite(denom)) {
      vazaoAQ = d.vazaoMistura;
    } else {
      vazaoAQ = (d.vazaoMistura * (i.tMistura - i.tFria)) / denom;
      if (!Number.isFinite(vazaoAQ)) vazaoAQ = d.vazaoMistura;
    }

    // AF teórica pode ser negativa (boiler frio demais => precisaria de AQ > vazão
    // total de mistura). GOTCHA: clamp em 0 e sinalizar "água insuficiente".
    const afTeorica = d.vazaoMistura - vazaoAQ;
    const insuficiente = afTeorica < 0;
    const vazaoAF = insuficiente ? 0 : afTeorica;
    if (insuficiente && primeiroInsuficiente === null) primeiroInsuficiente = t;

    if (tBoiler < tMin) {
      tMin = tBoiler;
      tMinMinuto = t;
    }
    if (minutoBanhoFrio === null && tBoiler < i.tMistura) minutoBanhoFrio = t;

    linhas.push({ t, tBoiler, apoioOn, vazaoAQ, vazaoAF, insuficiente });
    tPrev = tBoiler;
  }

  return {
    fonte,
    linhas,
    tMin,
    tMinMinuto,
    ganhoApoio,
    confortoMantido: minutoBanhoFrio === null,
    minutoBanhoFrio,
    algumInsuficiente: primeiroInsuficiente !== null,
    primeiroInsuficiente,
  };
}

export function calcular(i: Inputs): Resultado {
  const derivados = derivar(i);
  return {
    derivados,
    gas: simular(i, derivados, "gas"),
    eletrico: simular(i, derivados, "eletrico"),
    validacao: validar(i),
  };
}

// helper de formatação de minutos -> "Xm" amigável
export function minLabel(min: number | null): string {
  if (min === null) return "—";
  return `${min} min`;
}
