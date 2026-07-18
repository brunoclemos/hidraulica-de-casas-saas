// Motor de cálculo do módulo "PVC/CPVC, Bombas & Pressão".
// Portado fielmente da planilha "02. [DIMENSIONAMENTO] PVC, CPVC, BOMBAS E PRESSURIZAÇÃO.xlsm"
// (abas "Dimensionamento AF (PVC)", "Dimensionamento AF e AQ (CPVC)" e a aba OCULTA
//  "Dados e Planilhas"). Dimensiona a tubulação predial TRECHO A TRECHO pelo Método
//  dos Pesos (NBR 5626) e acumula a PRESSÃO RESIDUAL ponto a ponto.
//
// GOTCHAS corrigidas em relação à planilha:
//  - A planilha usa π = 3,14 LITERAL nas fórmulas de vazão/velocidade/registro.
//    Mantemos PI_PLANILHA = 3.14 para PARIDADE de resultados com o curso. (comentado em cada uso)
//  - A perda de carga do CPVC depende da função VBA FA_DarcyWeisbach (Colebrook-White),
//    que vem como #VALUE! no xlsx sem macro. Reimplementamos o fator de atrito por
//    BISSECÇÃO em TS (não dependemos de VBA).
//  - Tratamento de Q = 0 / Re = 0 -> perda de carga = 0 (evita divisão por zero / NaN).
//  - desnível: PARIDADE com a planilha -> desnível = DESCE - SOBE. Subir tubulação PERDE
//    pressão estática (desnível negativo); descer GANHA. (Uma versão anterior seguia um
//    "spec" que invertia o sinal -> residual não batia com o curso; corrigido.)
//
// As tabelas (pesos, diâmetro interno, comp. equivalente, viscosidade, K) foram extraídas
// via python+openpyxl da aba oculta "Dados e Planilhas" e estão ao final deste arquivo.

// π literal da planilha (paridade com o curso). Math.PI daria diferença na 3ª casa.
const PI_PLANILHA = 3.14;

export type Material = "PVC" | "CPVC";

// ---------------------------------------------------------------------------
// TABELAS-FONTE (extraídas da aba oculta "Dados e Planilhas")
// ---------------------------------------------------------------------------

// Peças de utilização -> peso relativo (coluna C "PESO RELATIVO" de A3:C17).
// A "SOMA DOS PESOS" do trecho usa o PESO RELATIVO (não a vazão de projeto).
export const PECAS_UTILIZACAO: { nome: string; peso: number }[] = [
  { nome: "Bacia sanitária caixa acoplada", peso: 0.3 },
  { nome: "Bacia sanitária válvula de descarga", peso: 32 },
  { nome: "Banheira", peso: 1 },
  { nome: "Bebedouro", peso: 0.1 },
  { nome: "Bidê", peso: 0.1 },
  { nome: "Chuveiro ou ducha", peso: 0.4 },
  { nome: "Chuveiro elétrico", peso: 0.1 },
  { nome: "Lavadora de pratos ou de roupas", peso: 1 },
  { nome: "Lavatório", peso: 0.3 },
  { nome: "Mictório com sifão integrado", peso: 2.8 },
  { nome: "Mictório sem sifão integrado", peso: 0.3 },
  { nome: "Pia torneira ou misturador", peso: 0.7 },
  { nome: "Pia torneira elétrica", peso: 0.1 },
  { nome: "Tanque", peso: 0.7 },
  { nome: "Torneira de jardim ou lavagem geral", peso: 0.4 },
];

// Diâmetros comerciais e diâmetro interno (mm) — tabelas separadas PVC x CPVC.
// PVC: tabela A47:B55. CPVC: tabela A111:B119.
export const DIAMETROS: Record<Material, { comercial: number; interno: number; rotulo: string }[]> = {
  PVC: [
    { comercial: 20, interno: 17, rotulo: '20 mm (½")' },
    { comercial: 25, interno: 21.4, rotulo: '25 mm (¾")' },
    { comercial: 32, interno: 27.8, rotulo: '32 mm (1")' },
    { comercial: 40, interno: 35.2, rotulo: '40 mm (1¼")' },
    { comercial: 50, interno: 44, rotulo: '50 mm (1½")' },
    { comercial: 60, interno: 53, rotulo: '60 mm (2")' },
    { comercial: 75, interno: 66.6, rotulo: '75 mm (2½")' },
    { comercial: 85, interno: 75.6, rotulo: '85 mm (3")' },
    { comercial: 110, interno: 97.8, rotulo: '110 mm (4")' },
  ],
  CPVC: [
    { comercial: 15, interno: 11.8, rotulo: '15 mm (½")' },
    { comercial: 22, interno: 17.6, rotulo: '22 mm (¾")' },
    { comercial: 28, interno: 22.6, rotulo: '28 mm (1")' },
    { comercial: 35, interno: 28.6, rotulo: '35 mm (1¼")' },
    { comercial: 42, interno: 34.4, rotulo: '42 mm (1½")' },
    { comercial: 54, interno: 44.2, rotulo: '54 mm (2")' },
    { comercial: 73, interno: 59.2, rotulo: '73 mm (2½")' },
    { comercial: 89, interno: 72, rotulo: '89 mm (3")' },
    { comercial: 114, interno: 93.2, rotulo: '114 mm (4")' },
  ],
};

// Viscosidade dinâmica da água por temperatura (tabela A78:C87).
// Colunas: temperatura [°C] e viscosidade dinâmica [N.s/m²] (= mPa.s / 1000).
// Re na planilha = 1000 * V * D / μ_dyn  (equivale a V*D/ν, ν = μ/ρ com ρ≈1000).
export const VISCOSIDADE: { temp: number; mu: number }[] = [
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

// ---------------------------------------------------------------------------
// COMPRIMENTO EQUIVALENTE (m) por conexão x diâmetro comercial.
//
// A matriz COMPLETA da planilha (PVC 16 conexões B62:Q72, CPVC 32 conexões
// B94:AH104) vive em ./conexoes.ts, AUTOGERADO da planilha. Reexportamos aqui
// para manter a API do módulo estável (page.tsx importa daqui).
// ---------------------------------------------------------------------------

export { CONEXOES_PVC, CONEXOES_CPVC, conexoesDe } from "./conexoes";
export type { ConexaoDef } from "./conexoes";
import { conexoesDe } from "./conexoes";

export function diametrosDe(material: Material): { comercial: number; interno: number; rotulo: string }[] {
  return DIAMETROS[material];
}

export function diametroInterno(material: Material, comercial: number): number {
  const row = DIAMETROS[material].find((d) => d.comercial === comercial);
  return row ? row.interno : NaN;
}

// Pressão residual MÍNIMA recomendada por peça (mca). ~1 mca = ~10 kPa (chuveiro).
// (NBR 5626 — referência didática para o semáforo.)
export const PRESSAO_MINIMA: { id: string; nome: string; mca: number }[] = [
  { id: "chuveiro", nome: "Chuveiro / ducha", mca: 1.0 },
  { id: "torneira", nome: "Torneira / lavatório", mca: 0.5 },
  { id: "valvula_descarga", nome: "Válvula de descarga", mca: 1.5 },
  { id: "outro", nome: "Outro ponto", mca: 1.0 },
];

// ---------------------------------------------------------------------------
// TIPOS DE ENTRADA / SAÍDA
// ---------------------------------------------------------------------------

// Quantidade de cada conexão no trecho (chave = id da conexão).
export type QtdConexoes = Record<string, number>;

export interface Trecho {
  material: Material;
  diametro: number; // comercial (mm)
  comprimentoReal: number; // m
  // Vazão: "pesos" = Método dos Pesos (NBR 5626, Σ pesos das peças); "manual" = digitada.
  // (Feedback 18/jul, vídeo 1: "quero deixar o cara escolher método dos pesos OU vazão manual".)
  modoVazao: "pesos" | "manual";
  vazaoManualLmin: number; // L/min — usada só quando modoVazao === "manual"
  pecas: Record<string, number>; // nome da peça -> quantidade (modo "pesos")
  conexoes: QtdConexoes; // id da conexão -> quantidade
  sobe: number; // m (elevação que sobe)
  desce: number; // m (elevação que desce)
  incrementoPressurizador: number; // mca
  // registro de pressão (RP) e válvula misturadora (só AQ)
  qtdRegistroPressao: number;
  qtdValvulaMisturadora: number; // só faz sentido em CPVC/AQ
  kvValvula: number; // Kv da válvula misturadora (m³/h). Default 2,6 (valor da planilha do curso).
  // temperatura da água (só CPVC, define viscosidade -> Reynolds)
  temperaturaAgua: number; // °C
  pecaMinima: string; // id de PRESSAO_MINIMA para o semáforo do trecho
}

export interface ResultadoTrecho {
  diametroInterno: number; // mm
  somaPesos: number;
  vazaoLs: number; // L/s
  vazaoLmin: number; // L/min
  velocidade: number; // m/s
  velocidadeOk: boolean; // <= 3 m/s
  compEquivalente: number; // m
  compTotal: number; // m (real + equivalente)
  perdaUnitaria: number; // mca/m (só PVC; 0 no CPVC)
  perdaCargaTubulacao: number; // mca
  perdaCargaConexao: number; // mca
  perdaCargaTotal: number; // mca (perda no tubo+conexões)
  perdaRegistroPressao: number; // mca
  perdaValvulaMisturadora: number; // mca
  desnivel: number; // m (sobe - desce)
  pressaoDisponivel: number; // mca
  pressaoResidual: number; // mca
  pressaoMinima: number; // mca de referência da peça do trecho
  residualOk: boolean; // residual >= mínima
  // extras CPVC (Darcy-Weisbach)
  reynolds: number;
  regime: "Laminar" | "Reg. Transição" | "Turbulento" | "—";
  fatorAtrito: number;
}

// ---------------------------------------------------------------------------
// HELPERS DE CÁLCULO
// ---------------------------------------------------------------------------

// Soma dos pesos relativos das peças do trecho.
// (pecas pode vir undefined de projeto salvo em schema antigo -> trata como vazio.)
function somaDosPesos(pecas: Record<string, number> | undefined | null): number {
  if (!pecas) return 0;
  let s = 0;
  for (const p of PECAS_UTILIZACAO) {
    const q = pecas[p.nome] ?? 0;
    if (q > 0) s += q * p.peso;
  }
  return s;
}

// Comprimento equivalente = Σ (qtd * valor da tabela[conexao][bitola]).
// (conexoes pode vir undefined de projeto salvo em schema antigo -> trata como vazio.)
function comprimentoEquivalente(
  material: Material,
  diametro: number,
  conexoes: QtdConexoes | undefined | null,
): number {
  if (!conexoes) return 0;
  let total = 0;
  for (const c of conexoesDe(material)) {
    const q = conexoes[c.id] ?? 0;
    if (q > 0) total += q * (c.valores[diametro] ?? 0);
  }
  return total;
}

// Viscosidade dinâmica (N.s/m²) interpolada/aproximada pela tabela (vizinho mais próximo,
// como a VLOOKUP da planilha que casa o valor exato da temperatura selecionada).
function viscosidadePara(tempC: number): number {
  // VLOOKUP aproximada da planilha (procura o maior valor <= tempC).
  let mu = VISCOSIDADE[0].mu;
  for (const row of VISCOSIDADE) {
    if (tempC >= row.temp) mu = row.mu;
  }
  return mu;
}

// Fator de atrito de Colebrook-White por BISSECÇÃO (reimplementa a função VBA FA_DarcyWeisbach).
// 1/sqrt(f) = -2*log10(eps/3.7 + 2.51/(Re*sqrt(f))), eps = rugosidade relativa.
// Se Re <= 2100 -> escoamento laminar -> f = 64/Re.
export function fatorAtrito(reynolds: number, rugosidadeRelativa: number): number {
  if (!Number.isFinite(reynolds) || reynolds <= 0) return 0; // Q = 0 -> sem atrito
  if (reynolds <= 2100) return 64 / reynolds; // laminar

  // g(f) = 1/sqrt(f) + 2*log10(eps/3.7 + 2.51/(Re*sqrt(f)))  ->  raiz em [0.008, 0.08]
  const g = (f: number): number => {
    const sf = Math.sqrt(f);
    return 1 / sf + 2 * Math.log10(rugosidadeRelativa / 3.7 + 2.51 / (reynolds * sf));
  };

  let lo = 0.008;
  let hi = 0.08;
  let glo = g(lo);
  // Bissecção: g é monotônica no intervalo; 50 iterações dão precisão de sobra.
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const gmid = g(mid);
    if (Math.abs(gmid) < 1e-10) return mid;
    if (Math.sign(gmid) === Math.sign(glo)) {
      lo = mid;
      glo = gmid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// VAZÃO DO TRECHO — Método dos Pesos ou valor manual (vídeo 1 do cliente 18/jul)
// ---------------------------------------------------------------------------

/** Vazão do trecho (L/s e L/min) + soma dos pesos. Em modo "manual" usa o valor
 *  digitado; em "pesos" (padrão / legado) usa Q[L/s] = 0.3 * sqrt(Σ pesos). */
export function vazaoDoTrecho(t: Trecho): { ls: number; lmin: number; somaPesos: number } {
  const somaPesos = somaDosPesos(t.pecas);
  if (t.modoVazao === "manual") {
    const lmin = Number.isFinite(t.vazaoManualLmin) && t.vazaoManualLmin > 0 ? t.vazaoManualLmin : 0;
    return { ls: lmin / 60, lmin, somaPesos };
  }
  const ls = 0.3 * Math.sqrt(somaPesos); // NBR 5626 — Método dos Pesos
  return { ls, lmin: ls * 60, somaPesos };
}

// ---------------------------------------------------------------------------
// PERDAS HIDRÁULICAS DO TRECHO para uma vazão ARBITRÁRIA (L/s).
// Fatorado de calcularTrecho para ser reusado pelos cenários da curva do sistema
// (mesma física, vazão escalada). Só depende da vazão + geometria + material.
// ---------------------------------------------------------------------------

export interface PerdasHidraulicas {
  diametroInterno: number;
  velocidade: number;
  velocidadeOk: boolean;
  compEquivalente: number;
  compTotal: number;
  perdaUnitaria: number;
  perdaCargaTubulacao: number;
  perdaCargaConexao: number;
  perdaCargaTotal: number;
  perdaRegistroPressao: number;
  perdaValvulaMisturadora: number;
  reynolds: number;
  regime: ResultadoTrecho["regime"];
  fatorAtrito: number;
}

export function perdasHidraulicas(t: Trecho, vazaoLs: number): PerdasHidraulicas {
  const dInt = diametroInterno(t.material, t.diametro); // mm
  const dIntM = dInt / 1000;

  // Velocidade: V = 4*(Q/1000) / (π * (Dint/1000)^2). (π = 3.14 para paridade c/ a planilha.)
  const velocidade =
    vazaoLs > 0 && dInt > 0
      ? (4 * (vazaoLs / 1000)) / (PI_PLANILHA * Math.pow(dIntM, 2))
      : 0;
  const velocidadeOk = velocidade <= 3; // alerta de velocidade > 3 m/s

  const compEquivalente = comprimentoEquivalente(t.material, t.diametro, t.conexoes);
  const compTotal = t.comprimentoReal + compEquivalente;

  // --- perda de carga (depende do material) ---
  let perdaUnitaria = 0;
  let perdaCargaTubulacao = 0;
  let perdaCargaConexao = 0;
  let reynolds = 0;
  let regime: ResultadoTrecho["regime"] = "—";
  let fatorAtritoVal = 0;

  if (t.material === "PVC") {
    // Fair-Whipple-Hsiao: J = 8.69e6 * Q^1.75 * Dint^-4.75 / 10  (mca/m).
    // (Q em L/s, Dint em mm — como na planilha PVC D15.)
    if (vazaoLs > 0 && dInt > 0) {
      perdaUnitaria = (8.69e6 * Math.pow(vazaoLs, 1.75) * Math.pow(dInt, -4.75)) / 10;
    }
    // Planilha: perda tubulação = compReal * J; perda conexão = compEquiv * J; total = soma.
    perdaCargaTubulacao = t.comprimentoReal * perdaUnitaria;
    perdaCargaConexao = compEquivalente * perdaUnitaria;
  } else {
    // CPVC — Darcy-Weisbach. Reynolds usa viscosidade dinâmica por temperatura.
    // Re = 1000 * V * (Dint/1000) / μ_dyn   (= V*D/ν, ν = μ/ρ, ρ≈1000).
    const mu = viscosidadePara(t.temperaturaAgua);
    reynolds = velocidade > 0 ? 1000 * ((velocidade * dIntM) / mu) : 0;

    regime =
      reynolds <= 0
        ? "—"
        : reynolds <= 2300
          ? "Laminar"
          : reynolds < 4000
            ? "Reg. Transição"
            : "Turbulento";

    // rugosidade absoluta eps = 0.006 mm; relativa = eps / Dint (mm/mm).
    const eps = 0.006;
    const rugosidadeRelativa = dInt > 0 ? eps / dInt : 0;
    fatorAtritoVal = fatorAtrito(reynolds, rugosidadeRelativa);

    // hf = f * (L_total/(Dint/1000)) * V^2/(2*9.81). Q=0/Re=0 -> hf=0.
    const hf =
      reynolds > 0 && dIntM > 0
        ? fatorAtritoVal * (compTotal / dIntM) * (Math.pow(velocidade, 2) / (2 * 9.81))
        : 0;
    // No CPVC a planilha não separa tubo x conexão: o comp. total já entra na fórmula Darcy.
    perdaCargaTubulacao = hf;
    perdaCargaConexao = 0;
  }

  const perdaCargaTotal = perdaCargaTubulacao + perdaCargaConexao;

  // --- perdas localizadas extras (registro de pressão e válvula misturadora) ---
  // Registro de pressão: hf = (8e6 * 40 * Q^2 * π^-2 * Dint^-4 / 10) * qtd. (π = 3.14)
  const perdaRegistroPressao =
    vazaoLs > 0 && dInt > 0 && t.qtdRegistroPressao > 0
      ? ((8e6 * 40 * Math.pow(vazaoLs, 2) * Math.pow(PI_PLANILHA, -2) * Math.pow(dInt, -4)) / 10) *
        t.qtdRegistroPressao
      : 0;

  // Válvula misturadora (SÓ AQ/CPVC): hf = (((Q*3.6)/Kv)^2 * 10) * qtd.
  // Kv editável (vídeo 3 do cliente); fallback 2,6 (valor da planilha) se ausente/inválido.
  const kv = Number.isFinite(t.kvValvula) && t.kvValvula > 0 ? t.kvValvula : 2.6;
  const perdaValvulaMisturadora =
    t.material === "CPVC" && vazaoLs > 0 && t.qtdValvulaMisturadora > 0 && kv > 0
      ? Math.pow((vazaoLs * 3.6) / kv, 2) * 10 * t.qtdValvulaMisturadora
      : 0;

  return {
    diametroInterno: dInt,
    velocidade,
    velocidadeOk,
    compEquivalente,
    compTotal,
    perdaUnitaria,
    perdaCargaTubulacao,
    perdaCargaConexao,
    perdaCargaTotal,
    perdaRegistroPressao,
    perdaValvulaMisturadora,
    reynolds,
    regime,
    fatorAtrito: fatorAtritoVal,
  };
}

// ---------------------------------------------------------------------------
// MOTOR PRINCIPAL DO TRECHO
// ---------------------------------------------------------------------------

export function calcularTrecho(t: Trecho, residualAnterior: number): ResultadoTrecho {
  const { ls: vazaoLs, lmin: vazaoLmin, somaPesos } = vazaoDoTrecho(t);
  const p = perdasHidraulicas(t, vazaoLs);

  // --- pressões ---
  const desnivel = t.desce - t.sobe; // paridade c/ a planilha: subir perde pressão
  const pressaoDisponivel = desnivel + t.incrementoPressurizador + residualAnterior;
  const pressaoResidual =
    pressaoDisponivel - p.perdaCargaTotal - p.perdaRegistroPressao - p.perdaValvulaMisturadora;

  const pmin = PRESSAO_MINIMA.find((x) => x.id === t.pecaMinima)?.mca ?? 1;
  const residualOk = pressaoResidual >= pmin;

  return {
    diametroInterno: p.diametroInterno,
    somaPesos,
    vazaoLs,
    vazaoLmin,
    velocidade: p.velocidade,
    velocidadeOk: p.velocidadeOk,
    compEquivalente: p.compEquivalente,
    compTotal: p.compTotal,
    perdaUnitaria: p.perdaUnitaria,
    perdaCargaTubulacao: p.perdaCargaTubulacao,
    perdaCargaConexao: p.perdaCargaConexao,
    perdaCargaTotal: p.perdaCargaTotal,
    perdaRegistroPressao: p.perdaRegistroPressao,
    perdaValvulaMisturadora: p.perdaValvulaMisturadora,
    desnivel,
    pressaoDisponivel,
    pressaoResidual,
    pressaoMinima: pmin,
    residualOk,
    reynolds: p.reynolds,
    regime: p.regime,
    fatorAtrito: p.fatorAtrito,
  };
}

// ---------------------------------------------------------------------------
// ENCADEAMENTO — recalcula a lista inteira, a residual de um trecho vira a
// "residual anterior" do próximo automaticamente.
// ---------------------------------------------------------------------------

export interface TrechoSalvo extends Trecho {
  ambiente: string; // ex.: "Banheiro suíte" (hierarquia: projeto > ambiente > trechos)
  nome: string; // nome/identificação do trecho, ex.: "A-B"
}

// Normaliza um trecho possivelmente vindo de um schema ANTIGO do localStorage
// (sem `ambiente`, `conexoes`, `pecas` ou com campos numéricos ausentes).
// Garante que o motor de cálculo e a UI nunca recebam undefined -> evita o
// crash "client-side exception" ao abrir/editar projetos salvos.
export function normalizarTrecho(raw: Partial<TrechoSalvo> | undefined | null): TrechoSalvo {
  const material: Material = raw?.material === "CPVC" ? "CPVC" : "PVC";
  const base = trechoPadrao(material);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    material,
    diametro: num(raw?.diametro, base.diametro),
    comprimentoReal: num(raw?.comprimentoReal, base.comprimentoReal),
    // campos novos (feedback 18/jul): default retrocompatível — projeto antigo =
    // Método dos Pesos e Kv 2,6 (= comportamento anterior, resultado idêntico).
    modoVazao: raw?.modoVazao === "manual" ? "manual" : "pesos",
    vazaoManualLmin: num(raw?.vazaoManualLmin, 0),
    pecas: raw?.pecas && typeof raw.pecas === "object" ? raw.pecas : {},
    conexoes: raw?.conexoes && typeof raw.conexoes === "object" ? raw.conexoes : {},
    sobe: num(raw?.sobe, 0),
    desce: num(raw?.desce, 0),
    incrementoPressurizador: num(raw?.incrementoPressurizador, 0),
    qtdRegistroPressao: num(raw?.qtdRegistroPressao, 0),
    qtdValvulaMisturadora: num(raw?.qtdValvulaMisturadora, 0),
    kvValvula: num(raw?.kvValvula, 2.6),
    temperaturaAgua: num(raw?.temperaturaAgua, base.temperaturaAgua),
    pecaMinima: typeof raw?.pecaMinima === "string" ? raw.pecaMinima : base.pecaMinima,
    // campo novo: projetos antigos guardavam tudo em `nome` -> herdamos como ambiente vazio.
    ambiente: typeof raw?.ambiente === "string" ? raw.ambiente : "",
    nome: typeof raw?.nome === "string" ? raw.nome : "",
  };
}

export function calcularProjeto(
  trechos: TrechoSalvo[],
  residualInicial: number,
): { trecho: TrechoSalvo; resultado: ResultadoTrecho }[] {
  const saida: { trecho: TrechoSalvo; resultado: ResultadoTrecho }[] = [];
  let residual = Number.isFinite(residualInicial) ? residualInicial : 0;
  for (const raw of trechos ?? []) {
    const t = normalizarTrecho(raw); // tolera trecho de schema antigo
    const r = calcularTrecho(t, residual);
    saida.push({ trecho: t, resultado: r });
    residual = r.pressaoResidual; // encadeia
  }
  return saida;
}

export function trechoPadrao(material: Material): Trecho {
  return {
    material,
    diametro: material === "PVC" ? 25 : 22,
    comprimentoReal: 3,
    modoVazao: "pesos",
    vazaoManualLmin: 0,
    pecas: {},
    conexoes: {},
    sobe: 0,
    desce: 0,
    incrementoPressurizador: 0,
    qtdRegistroPressao: 0,
    qtdValvulaMisturadora: 0,
    kvValvula: 2.6,
    temperaturaAgua: 40,
    pecaMinima: "chuveiro",
  };
}

// ---------------------------------------------------------------------------
// CURVA DO SISTEMA & CENÁRIOS (vídeos 4 e 5 do cliente 18/jul) — mesma ideia do
// "Cálculo de Circuladores": escala a vazão de TODOS os trechos proporcionalmente
// à 1ª inserção (tronco) e soma a perda de carga; a curva vira H = a + b·Q + c·Q².
// ---------------------------------------------------------------------------

/** Vazão-base do tronco (1ª inserção) em L/min — referência de escala dos cenários. */
export function vazaoTroncoBase(trechos: Trecho[] | undefined | null): number {
  const t0 = trechos?.[0];
  return t0 ? vazaoDoTrecho(t0).lmin : 0;
}

/** Perda de carga TOTAL do projeto (mca) para uma vazão de tronco (L/min), escalando
 *  todos os trechos proporcionalmente à vazão-base da 1ª inserção. */
export function perdaProjetoEmVazao(trechos: Trecho[], vazaoTroncoLmin: number): number {
  const base = vazaoTroncoBase(trechos);
  if (!(base > 0)) return 0;
  const fator = vazaoTroncoLmin / base;
  let total = 0;
  for (const t of trechos) {
    const ls = vazaoDoTrecho(t).ls * fator;
    const p = perdasHidraulicas(t, ls);
    total += p.perdaCargaTotal + p.perdaRegistroPressao + p.perdaValvulaMisturadora;
  }
  return total;
}

export interface DetalheProjetoTrecho {
  ambiente: string;
  nome: string;
  q: number; // L/min (escalado ao cenário)
  v: number; // m/s
  hf: number; // mca (perda distribuída tubo+conexões, como no Circuladores)
}

/** Vazão (L/min) que produz uma velocidade-alvo (m/s) num tubo de Ø interno dado (mm).
 *  Inverso da velocidade do módulo — usa π = 3,14 (paridade com a planilha do curso). */
export function vazaoParaVelocidadeLmin(velAlvo: number, dnInternoMm: number): number {
  if (dnInternoMm <= 0 || !Number.isFinite(velAlvo) || velAlvo <= 0) return 0;
  const dIntM = dnInternoMm / 1000;
  // V = 4*(Q_Ls/1000)/(π·dIntM²)  ->  Q_Ls = V·π·dIntM²/4·1000 ; L/min = Q_Ls·60
  return ((velAlvo * PI_PLANILHA * Math.pow(dIntM, 2)) / 4) * 1000 * 60;
}

/** Detalhamento por trecho (Q, V, h_f distribuída) para uma vazão de tronco (L/min). */
export function detalheProjetoEmVazao(
  trechos: TrechoSalvo[],
  vazaoTroncoLmin: number,
): DetalheProjetoTrecho[] {
  const base = vazaoTroncoBase(trechos);
  return (trechos ?? []).map((t) => {
    const ls = base > 0 ? vazaoDoTrecho(t).ls * (vazaoTroncoLmin / base) : 0;
    const p = perdasHidraulicas(t, ls);
    return { ambiente: t.ambiente, nome: t.nome, q: ls * 60, v: p.velocidade, hf: p.perdaCargaTotal };
  });
}

// Catálogo de bombas de PRESSURIZAÇÃO (pontos Q [L/min] × H [mca] da curva Q×H).
// Fonte: Catálogo Técnico Texius — Linha Comercial (rev. 25.11.25, pág. 5-11), enviado
// pelo cliente (feedback 18/jul, vídeo 4).
//
// Cada curva é aproximada por H = Hmáx·(1 − (Q/Qmáx)²), ancorada nos DOIS valores
// publicados de cada modelo: pressão máx (altura de shutoff em Q=0) e vazão máx (fluxo
// livre em H=0). É o modelo clássico de bomba e casa com o formato côncavo das curvas
// do catálogo. Para precisão fina, substituir pelos pontos exatos das curvas oficiais.
// As versões "com manifold" (DM) e "sem manifold" (D) e mono/trifásica compartilham a
// mesma curva — muda só a conexão; por isso 1 entrada por curva distinta.
function curvaAfim(hMax: number, qMax: number): [number, number][] {
  return ([0, 0.2, 0.4, 0.6, 0.8, 1] as const).map((k): [number, number] => {
    const q = k * qMax;
    return [Math.round(q * 10) / 10, Math.round(hMax * (1 - k * k) * 100) / 100];
  });
}

export const BOMBAS_PRESSURIZACAO: { nome: string; pontos: [number, number][] }[] = [
  // Linha Smart Inverter (simples)
  { nome: "Smart Home 250W", pontos: curvaAfim(29, 60) },
  { nome: "Smart 300 · 1/2 CV", pontos: curvaAfim(23, 83) },
  { nome: "Smart 1/2 CV", pontos: curvaAfim(27, 115) },
  { nome: "Smart 1 CV", pontos: curvaAfim(37, 133) },
  { nome: "Smart 2 CV", pontos: curvaAfim(55, 143) },
  // Linha Smart Inverter Plus (duplo em cascata — 2× vazão, mesma pressão)
  { nome: "Smart Duplo 1/2 CV", pontos: curvaAfim(27, 230) },
  { nome: "Smart Duplo 1 CV", pontos: curvaAfim(37, 266) },
  { nome: "Smart Duplo 2 CV", pontos: curvaAfim(55, 285) },
  // Linha TPI-XL (simples)
  { nome: "TPI-XL 6-30 · 2 CV", pontos: curvaAfim(50, 200) },
  { nome: "TPI-XL 10-50 · 3 CV", pontos: curvaAfim(60, 300) },
  // Linha TPI-XL Plus (duplo em cascata)
  { nome: "TPI-XL Duplo 6-30 · 2 CV", pontos: curvaAfim(50, 400) },
  { nome: "TPI-XL Duplo 10-50 · 3 CV", pontos: curvaAfim(60, 600) },
];

// Altura estática necessária (mca) que a bomba precisa vencer ALÉM da perda de carga,
// pra que o ponto crítico atinja a pressão mínima. Modelo de 1ª ordem (caminho total):
//   C = pmin_crítico − pressão_entrada − Σ(desnível)
// onde desnível = desce − sobe (subir consome pressão). Assim a curva do sistema em
// pressurização = perda_de_carga(Q) + C, diferente do anel fechado do circulador (C≈0).
// PRELIMINAR: confirmar a convenção com a planilha do curso do Ferreto (definição exata
// de ponto crítico e acúmulo até ele podem diferir).
export function alturaEstaticaNecessaria(
  trechos: TrechoSalvo[],
  pressaoEntrada: number,
): number {
  const proj = calcularProjeto(trechos, pressaoEntrada);
  if (!proj.length) return 0;
  const critico = proj.reduce((m, p) =>
    p.resultado.pressaoResidual < m.resultado.pressaoResidual ? p : m,
  );
  const somaDesnivel = proj.reduce((s, p) => s + p.resultado.desnivel, 0);
  return critico.resultado.pressaoMinima - pressaoEntrada - somaDesnivel;
}
