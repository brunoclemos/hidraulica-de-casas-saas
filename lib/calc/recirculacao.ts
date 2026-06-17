// Motor de cálculo do módulo "Tempo de Recirculação & Perda Térmica".
// Portado das planilhas "Tempo Esvaziamento Recirculação" + "Análises Água Quente"
// (abas Shafts/Solos). JÁ INCLUI a correção do bug das fórmulas de resfriamento
// (a curva decai para a temperatura AMBIENTE, não para a temperatura final).

import { diametroInterno, CALEFFI_VEL, FIS } from "./tables";

export type Cenario = "ar" | "solo";
export type Tipo = "manifold" | "convencional";

export interface Inputs {
  vazao: number; // L/min por ponto
  pontos: number; // pontos simultâneos
  // tipo do traçado — define a vazão usada na VELOCIDADE (igual à planilha):
  //   manifold    -> cada ramal leva a vazão de 1 ponto (vazão por ponto)
  //   convencional-> o tronco leva a vazão total (vazão × pontos)
  // (a vazão mássica da troca térmica usa a vazão TOTAL nos dois casos, como na planilha)
  tipo: Tipo;
  diametro: number; // diâmetro comercial CPVC (mm)
  distancia: number; // m
  tAmbiente: number; // °C (meio externo: ar do shaft ou solo)
  tFinal: number; // °C (água quente)
  espessura: number; // mm de isolante (0 = tubo nu)
  tempoParado: number; // min sem uso
  tAlvo: number; // °C mínimo aceitável no ponto
  cenario: Cenario;
  hExterno: number; // W/m²·K (cenário "ar")
  kSolo: number; // W/m·K (cenário "solo")
  raioSolo: number; // m (cenário "solo")
}

export interface Resultado {
  diametroInterno: number; // mm
  vazaoTotal: number; // L/min
  velocidade: number; // m/s
  velMaxCaleffi: number; // m/s recomendada para o diâmetro
  velocidadeOk: boolean;
  tempoChegadaS: number; // s até a água quente chegar
  volumeL: number; // L de água parada no tubo (desperdício por abertura)
  perdaAguaParadaKcal: number; // kcal (positiva = perda)
  rTotal: number; // K/W
  ua: number; // W/K
  perdaRegime: number; // °C (queda escoando)
  tFinalReal: number; // °C no ponto
  tau: number; // s (constante térmica)
  tempAposXMin: number; // °C após "tempoParado" min parada  [CORRIGIDO]
  tempoAteAlvoMin: number; // min até cair na temp alvo        [CORRIGIDO]
}

const ln = Math.log;
const { PI, k_cpvc, k_iso, cp, visc, k_agua, Pr } = FIS;

export function calcular(i: Inputs): Resultado {
  const dInt = diametroInterno(i.diametro); // mm
  const dIntM = dInt / 1000; // m
  const dComM = i.diametro / 1000; // m
  const vazaoTotal = i.vazao * i.pontos; // L/min

  const area = (Math.pow(dIntM, 2) * PI) / 4; // m²
  // vazão que define a velocidade: por ponto (manifold) ou total (convencional) — igual à planilha
  const vazaoVel = i.tipo === "manifold" ? i.vazao : vazaoTotal;
  const velocidade = (4 * (vazaoVel / 60) / 1000) / (PI * Math.pow(dIntM, 2));

  const velMaxCaleffi = CALEFFI_VEL[i.diametro] ?? NaN;
  const velocidadeOk = velocidade <= velMaxCaleffi;

  const tempoChegadaS = i.distancia / velocidade; // s
  const volumeL = area * i.distancia * 1000; // L
  // perda da água parada — reportada como módulo positivo
  const perdaAguaParadaKcal = Math.abs(volumeL * (i.tAmbiente - i.tFinal));

  // --- modelo de resistências térmicas em série (usa PI real) ---
  const Re = (dIntM * velocidade) / visc;
  const Nu = 0.023 * Math.pow(Re, 0.8) * Math.pow(Pr, 0.3);
  const H = (k_agua * Nu) / dIntM;

  const rConvInt = 1 / (H * 2 * Math.PI * (dIntM / 2) * i.distancia);
  const rTubo = ln(i.diametro / dInt) / (2 * Math.PI * k_cpvc * i.distancia);
  const rIso =
    i.espessura === 0
      ? 0
      : ln((i.diametro + 2 * i.espessura) / i.diametro) /
        (2 * Math.PI * k_iso * i.distancia);
  const dExtFinal = (i.diametro + 2 * i.espessura) / 1000; // m

  const rExterno =
    i.cenario === "ar"
      ? 1 / (i.hExterno * Math.PI * dExtFinal * i.distancia)
      : ln(i.raioSolo / (dExtFinal / 2)) / (2 * Math.PI * i.kSolo * i.distancia);

  const rTotal = rConvInt + rTubo + rIso + rExterno;
  const ua = 1 / rTotal;

  const vazaoMassica = vazaoTotal / 60; // kg/s (água ~1 kg/L)
  const perdaRegime = (i.tFinal - i.tAmbiente) * (1 - Math.exp(-ua / (vazaoMassica * cp)));
  const tFinalReal = i.tFinal - perdaRegime;

  const capTermica = volumeL * cp;
  const tau = rTotal * capTermica; // s

  // === FÓRMULAS CORRIGIDAS (decaem para a temperatura AMBIENTE) ===
  const tempAposXMin = i.tAmbiente + (tFinalReal - i.tAmbiente) * Math.exp(-(i.tempoParado * 60) / tau);
  const tempoAteAlvoMin = (-tau * ln((i.tAlvo - i.tAmbiente) / (i.tFinal - i.tAmbiente))) / 60;

  return {
    diametroInterno: dInt,
    vazaoTotal,
    velocidade,
    velMaxCaleffi,
    velocidadeOk,
    tempoChegadaS,
    volumeL,
    perdaAguaParadaKcal,
    rTotal,
    ua,
    perdaRegime,
    tFinalReal,
    tau,
    tempAposXMin,
    tempoAteAlvoMin,
  };
}

export function mmss(segundos: number): string {
  if (!isFinite(segundos) || segundos < 0) return "—";
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
