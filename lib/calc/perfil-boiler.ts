// Motor de cálculo do módulo "Perfil Térmico do Boiler".
// Portado da planilha "Perfil_Termico_Boiler-Ferreto-V3" (abas Parâmetros + Simulação).
// Simula minuto a minuto (passo de Euler de 1 min) a queda/recuperação de
// temperatura do boiler durante banhos simultâneos em 5 cenários: SEM apoio,
// SÓ GÁS, SÓ RESISTÊNCIA, SÓ BOMBA DE CALOR e TODOS OS APOIOS juntos.
//
// Fórmulas-fonte (planilha V3):
//   consumo     = N*Q*(TM-TF)/Volume — coef. de perdas (D13/D14 da planilha)
//                 removido a pedido do Ferreto (vídeo 23/jul/2026); equivale a D13=0
//   status_x(t) = ligado(t-1) ? (T(t-1)>=TQ ? 0 : 1)    (desliga só no set point)
//                             : (T(t-1)<=TQ-Hist_x ? 1 : 0)
//   T(t) = T(t-1) - consumo + Σ(pot_x ativos)/(60*Volume)   (ganho usa Volume TOTAL)
//   pot_gas = kcal/h × rendimento (perda na chaminé); elétrica = kW×860 (Joule, 100%);
//   bomba   = BTU/h × 0,252 (saída térmica direta).
//   Cruza TM: 1º minuto com T <= TM; indicador = minuto − 1 (min 1 = estado inicial).
//   Aquecimento sem consumo: Vol×ΔT ÷ (Σpot/60) minutos, por combinação de apoios.

export interface Inputs {
  // BOILER
  tSetPoint: number; // TQ (°C)
  volume: number; // L (armazenamento total)
  tInicial: number; // Ti (°C)
  tFria: number; // TF (°C)
  tMistura: number; // TM — válvula termostática (°C)
  nBanhos: number; // N (banhos simultâneos)
  vazaoDucha: number; // Q (L/min por ducha)
  duracao: number; // min de simulação
  // CENTRAL TÉRMICA A GÁS
  gasKcalh: number; // potência (kcal/h)
  gasRendimento: number; // 0..1
  histGas: number; // °C — liga quando T ≤ TQ − hist
  // RESISTÊNCIA ELÉTRICA
  eletKW: number; // potência (kW)
  histElet: number; // °C
  // BOMBA DE CALOR
  bombaBTUh: number; // potência (BTU/h)
  histBomba: number; // °C
  // APOIOS ATIVOS (toggle por apoio, vídeo do cliente 23/jul; desligado sai da simulação)
  gasAtivo: boolean;
  eletAtivo: boolean;
  bombaAtivo: boolean;
  // TEMPO DE AQUECIMENTO SEM CONSUMO
  deltaTAquecimento: number; // ΔT desejado (°C)
}

export type Cenario = "sem" | "gas" | "eletrico" | "bomba" | "todos";

export interface CurvaCenario {
  cenario: Cenario;
  temps: number[]; // T do boiler por minuto (índice 0 = minuto 1)
  status: boolean[][]; // por apoio do cenário, ligado/desligado por minuto
  tMin: number; // °C mínima atingida
  tMinMinuto: number;
  cruzaEm: number | null; // minutos até T <= TM (planilha: 1º minuto − 1), null = não cruza
}

export interface Derivados {
  vazaoMistura: number; // N*Q (L/min)
  consumoPorMin: number; // °C/min
  gasKW: number; // kcalh/860
  gasKcalhEfetiva: number; // kcalh × rendimento
  eletKcalh: number; // kW × 860
  bombaKcalh: number; // BTU/h × 0,252
  potIdealGas: number; // Q*(TM−TF)*60/rendimento (kcal/h p/ repor o consumo)
  potIdealElet: number; // Q*(TM−TF)*60
  ganhoGas: number; // °C/min com o apoio ligado
  ganhoElet: number;
  ganhoBomba: number;
}

export interface LinhaAquecimento {
  nome: string;
  potKcalh: number;
  minutos: number; // Vol×ΔT ÷ (pot/60)
}

// Cenário pronto pra exibição — a lista é DINÂMICA: só apoios ativos entram,
// e o combinado só existe com 2+ ativos (com 1 seria idêntico ao "Só X").
export interface CenarioVisivel {
  id: Cenario;
  nome: string; // combinado: "Todos os apoios" (3 ativos) ou "Resistência + gás" etc. (2)
  cor: string;
  curva: CurvaCenario;
}

export interface Resultado {
  derivados: Derivados;
  cenarios: CenarioVisivel[]; // "Sem apoio" sempre primeiro; combinado por último
  aquecimento: LinhaAquecimento[]; // combos dos apoios ativos, sem consumo simultâneo
  validacao: { ok: boolean; mensagem: string | null }; // TF < TM < TQ
}

export function derivar(i: Inputs): Derivados {
  const vazaoMistura = i.nBanhos * i.vazaoDucha; // D12
  const consumoPorMin = (vazaoMistura * (i.tMistura - i.tFria)) / i.volume;
  const gasKcalhEfetiva = i.gasKcalh * i.gasRendimento;
  const eletKcalh = i.eletKW * 860; // I11
  const bombaKcalh = i.bombaBTUh * 0.252; // I17
  return {
    vazaoMistura,
    consumoPorMin,
    gasKW: i.gasKcalh / 860, // I5
    gasKcalhEfetiva,
    eletKcalh,
    bombaKcalh,
    potIdealGas: (vazaoMistura * (i.tMistura - i.tFria) * 60) / i.gasRendimento, // I7
    potIdealElet: vazaoMistura * (i.tMistura - i.tFria) * 60, // I12
    ganhoGas: gasKcalhEfetiva / (60 * i.volume),
    ganhoElet: eletKcalh / (60 * i.volume),
    ganhoBomba: bombaKcalh / (60 * i.volume),
  };
}

export function validar(i: Inputs): { ok: boolean; mensagem: string | null } {
  if (!(i.tFria < i.tMistura)) {
    return { ok: false, mensagem: "A água fria (TF) precisa ser menor que a mistura (TM)." };
  }
  if (!(i.tMistura < i.tSetPoint)) {
    return { ok: false, mensagem: "A mistura (TM) precisa ser menor que o set point (TQ)." };
  }
  return { ok: true, mensagem: null };
}

interface Apoio {
  potKcalh: number; // já efetiva (gás com rendimento aplicado)
  hist: number;
}

// Simula UM cenário: cada apoio tem histerese própria e status pegajoso —
// liga em T ≤ TQ−Hist, só desliga quando T volta ao set point TQ (planilha V3).
function simularCombo(i: Inputs, d: Derivados, cenario: Cenario, apoios: Apoio[]): CurvaCenario {
  const passos = Math.max(1, Math.floor(i.duracao));
  const temps: number[] = [];
  const status: boolean[][] = apoios.map(() => []);

  let tPrev = i.tInicial;
  const ligado = apoios.map((a) => i.tInicial <= i.tSetPoint - a.hist);
  let tMin = i.tInicial;
  let tMinMinuto = 1;
  let cruzaEm: number | null = null;

  for (let t = 1; t <= passos; t++) {
    let tBoiler: number;
    if (t === 1) {
      tBoiler = i.tInicial; // linha 1 da planilha = estado inicial
    } else {
      // status do minuto t decide sobre T(t-1)
      apoios.forEach((a, k) => {
        ligado[k] = ligado[k] ? tPrev < i.tSetPoint : tPrev <= i.tSetPoint - a.hist;
      });
      const ganho = apoios.reduce((s, a, k) => s + (ligado[k] ? a.potKcalh : 0), 0) / (60 * i.volume);
      tBoiler = tPrev - d.consumoPorMin + ganho;
    }

    apoios.forEach((_, k) => status[k].push(ligado[k]));
    if (tBoiler < tMin) {
      tMin = tBoiler;
      tMinMinuto = t;
    }
    if (cruzaEm === null && tBoiler <= i.tMistura) cruzaEm = t - 1; // MATCH(...)−1 da planilha
    temps.push(tBoiler);
    tPrev = tBoiler;
  }

  return { cenario, temps, status, tMin, tMinMinuto, cruzaEm };
}

export function calcular(i: Inputs): Resultado {
  const d = derivar(i);

  // ordem canônica de exibição: resistência, gás, bomba (mesma do gráfico)
  const apoios = [
    {
      id: "eletrico" as Cenario,
      nomeSo: "Só resistência",
      nomeCombo: "Resistência",
      nomeAq: "Resistência elétrica",
      cor: "#f87171",
      ativo: i.eletAtivo,
      apoio: { potKcalh: d.eletKcalh, hist: i.histElet },
    },
    {
      id: "gas" as Cenario,
      nomeSo: "Só aquecedor a gás",
      nomeCombo: "Gás",
      nomeAq: "Aquecedor a gás",
      cor: "#FABA0D",
      ativo: i.gasAtivo,
      apoio: { potKcalh: d.gasKcalhEfetiva, hist: i.histGas },
    },
    {
      id: "bomba" as Cenario,
      nomeSo: "Só bomba de calor",
      nomeCombo: "Bomba",
      nomeAq: "Bomba de calor",
      cor: "#38bdf8",
      ativo: i.bombaAtivo,
      apoio: { potKcalh: d.bombaKcalh, hist: i.histBomba },
    },
  ];
  const ativos = apoios.filter((a) => a.ativo);

  const cenarios: CenarioVisivel[] = [
    { id: "sem", nome: "Sem apoio", cor: "#9ca3af", curva: simularCombo(i, d, "sem", []) },
    ...ativos.map((a) => ({
      id: a.id,
      nome: a.nomeSo,
      cor: a.cor,
      curva: simularCombo(i, d, a.id, [a.apoio]),
    })),
  ];
  if (ativos.length >= 2) {
    const nome =
      ativos.length === 3
        ? "Todos os apoios"
        : ativos.map((a, k) => (k === 0 ? a.nomeCombo : a.nomeCombo.toLowerCase())).join(" + ");
    cenarios.push({
      id: "todos",
      nome,
      cor: "#4ade80",
      curva: simularCombo(i, d, "todos", ativos.map((a) => a.apoio)),
    });
  }

  const energia = i.volume * i.deltaTAquecimento; // D29 = Vol × ΔT (kcal)
  const combo = (nome: string, pots: number[]): LinhaAquecimento => {
    const pot = pots.reduce((s, p) => s + p, 0);
    return { nome, potKcalh: pot, minutos: pot > 0 ? energia / (pot / 60) : Infinity };
  };
  // combos só dos ativos: singles, pares, trio (3 ativos = as 7 linhas de sempre)
  const aquecimento: LinhaAquecimento[] = ativos.map((a) => combo(a.nomeAq, [a.apoio.potKcalh]));
  for (let j = 0; j < ativos.length; j++) {
    for (let k = j + 1; k < ativos.length; k++) {
      aquecimento.push(
        combo(`${ativos[j].nomeCombo} + ${ativos[k].nomeCombo.toLowerCase()}`, [
          ativos[j].apoio.potKcalh,
          ativos[k].apoio.potKcalh,
        ]),
      );
    }
  }
  if (ativos.length === 3) {
    aquecimento.push(combo("Todos os apoios", ativos.map((a) => a.apoio.potKcalh)));
  }

  return { derivados: d, cenarios, aquecimento, validacao: validar(i) };
}

// "48 min" / "2 h 54 min" amigável para a tabela de aquecimento
export function duracaoLabel(minutos: number): string {
  if (!Number.isFinite(minutos)) return "—";
  if (minutos < 90) return `${minutos.toFixed(0)} min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return `${h} h ${m.toString().padStart(2, "0")} min`;
}

export function minLabel(min: number | null): string {
  if (min === null) return "Não cruza";
  return `${min} min`;
}
