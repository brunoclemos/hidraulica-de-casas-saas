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
//  - desnível: o spec define desnível = SOBE - DESCE (a planilha tinha SUM(DESCE-SOBE),
//    sinal invertido); seguimos o spec e rotulamos claramente SOBE/DESCE.
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
// IMPORTANTE: a matriz completa da planilha tem ~17 conexões (PVC, A62:Q72) e
// ~32 conexões (CPVC, B94:AH104). Incluímos aqui um SUBCONJUNTO CURADO das
// conexões MAIS COMUNS em hidráulica predial — joelho 90°, curva 90°,
// tê passagem direta, tê saída lateral, registro de gaveta, luva e válvula
// de retenção. Os valores são REAIS, copiados da planilha; NÃO foram inventados.
// (Ver nota na UI.) Para o conjunto completo, o SaaS final puxa do banco.
// ---------------------------------------------------------------------------

export interface ConexaoDef {
  id: string;
  nome: string;
  // valor de comp. equivalente (m) por diâmetro comercial
  valores: Record<number, number>;
}

// PVC — subconjunto curado (linhas A64:A72, colunas escolhidas de B62:Q62).
export const CONEXOES_PVC: ConexaoDef[] = [
  {
    id: "joelho90",
    nome: "Joelho 90°",
    valores: { 20: 1.1, 25: 1.2, 32: 1.5, 40: 2, 50: 3.2, 60: 3.4, 75: 3.7, 85: 3.9, 110: 4.3 },
  },
  {
    id: "curva90",
    nome: "Curva 90°",
    valores: { 20: 0.4, 25: 0.5, 32: 0.6, 40: 0.7, 50: 1.2, 60: 1.3, 75: 1.4, 85: 1.5, 110: 1.6 },
  },
  {
    id: "te_direta",
    nome: "Tê passagem direta",
    valores: { 20: 0.7, 25: 0.8, 32: 0.9, 40: 1.5, 50: 2.2, 60: 2.3, 75: 2.4, 85: 2.5, 110: 2.6 },
  },
  {
    id: "te_lateral",
    nome: "Tê passagem lateral",
    valores: { 20: 2.3, 25: 2.4, 32: 3.1, 40: 4.6, 50: 7.3, 60: 7.6, 75: 7.8, 85: 8, 110: 8.3 },
  },
  {
    id: "luva",
    nome: "Luva (entrada normal)",
    valores: { 20: 0.3, 25: 0.4, 32: 0.5, 40: 0.6, 50: 1, 60: 1.5, 75: 1.6, 85: 2, 110: 2.2 },
  },
  {
    id: "reg_gaveta",
    nome: "Registro de gaveta aberto",
    valores: { 20: 0.1, 25: 0.2, 32: 0.3, 40: 0.4, 50: 0.7, 60: 0.8, 75: 0.9, 85: 0.9, 110: 1 },
  },
  {
    id: "valv_retencao",
    nome: "Válvula de retenção (tipo leve)",
    valores: { 20: 2.5, 25: 2.7, 32: 3.8, 40: 4.9, 50: 6.8, 60: 7.1, 75: 8.2, 85: 9.3, 110: 10.4 },
  },
];

// CPVC — subconjunto curado (linhas A96:A104, colunas escolhidas de B94:AH94).
export const CONEXOES_CPVC: ConexaoDef[] = [
  {
    id: "joelho90",
    nome: "Joelho 90°",
    valores: { 15: 0.88, 22: 1.513, 28: 2.049, 35: 2.639, 42: 3.287, 54: 4.555, 73: 6.656, 89: 8.429, 114: 11.406 },
  },
  {
    id: "curva90",
    nome: "Curva 90°",
    valores: { 15: 0.396, 22: 0.681, 28: 0.922, 35: 1.188, 42: 1.479, 54: 2.05, 73: 2.995, 89: 3.793, 114: 5.133 },
  },
  {
    id: "te_direta",
    nome: "Tê passagem direta e saída lateral",
    valores: { 15: 0.792, 22: 1.361, 28: 1.844, 35: 2.375, 42: 2.958, 54: 4.1, 73: 5.99, 89: 7.586, 114: 10.265 },
  },
  {
    id: "te_lateral",
    nome: "Tê saída bilateral",
    valores: { 15: 0.968, 22: 1.664, 28: 2.254, 35: 2.903, 42: 3.615, 54: 5.011, 73: 7.321, 89: 9.272, 114: 12.547 },
  },
  {
    id: "luva",
    nome: "Luva simples",
    valores: { 15: 0.11, 22: 0.189, 28: 0.256, 35: 0.33, 42: 0.411, 54: 0.569, 73: 0.832, 89: 1.054, 114: 1.426 },
  },
  {
    id: "reg_gaveta",
    nome: "Registro de gaveta aberto",
    valores: { 15: 0.1, 22: 0.2, 28: 0.3, 35: 0.4, 42: 0.7, 54: 0.8, 73: 0.9, 89: 0.9, 114: 1 },
  },
  {
    id: "valv_retencao",
    nome: "Válvula de retenção (tipo leve)",
    valores: { 15: 2.5, 22: 2.7, 28: 3.8, 35: 4.9, 42: 6.8, 54: 7.1, 73: 8.2, 89: 9.3, 114: 10.4 },
  },
];

export function conexoesDe(material: Material): ConexaoDef[] {
  return material === "PVC" ? CONEXOES_PVC : CONEXOES_CPVC;
}

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
  pecas: Record<string, number>; // nome da peça -> quantidade
  conexoes: QtdConexoes; // id da conexão -> quantidade
  sobe: number; // m (elevação que sobe)
  desce: number; // m (elevação que desce)
  incrementoPressurizador: number; // mca
  // registro de pressão (RP) e válvula misturadora (só AQ)
  qtdRegistroPressao: number;
  qtdValvulaMisturadora: number; // só faz sentido em CPVC/AQ
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
function somaDosPesos(pecas: Record<string, number>): number {
  let s = 0;
  for (const p of PECAS_UTILIZACAO) {
    const q = pecas[p.nome] ?? 0;
    if (q > 0) s += q * p.peso;
  }
  return s;
}

// Comprimento equivalente = Σ (qtd * valor da tabela[conexao][bitola]).
function comprimentoEquivalente(material: Material, diametro: number, conexoes: QtdConexoes): number {
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
// MOTOR PRINCIPAL DO TRECHO
// ---------------------------------------------------------------------------

export function calcularTrecho(t: Trecho, residualAnterior: number): ResultadoTrecho {
  const dInt = diametroInterno(t.material, t.diametro); // mm
  const somaPesos = somaDosPesos(t.pecas);

  // Vazão estimada (NBR 5626 — Método dos Pesos): Q[L/s] = 0.3 * sqrt(Σ pesos).
  const vazaoLs = 0.3 * Math.sqrt(somaPesos);
  const vazaoLmin = vazaoLs * 60;

  // Velocidade: V = 4*(Q/1000) / (π * (Dint/1000)^2). (π = 3.14 para paridade c/ a planilha.)
  const dIntM = dInt / 1000;
  const velocidade =
    somaPesos > 0 && dInt > 0
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

  // Válvula misturadora (SÓ AQ/CPVC): hf = (((Q*3.6)/2.6)^2 * 10) * qtd.
  const perdaValvulaMisturadora =
    t.material === "CPVC" && vazaoLs > 0 && t.qtdValvulaMisturadora > 0
      ? Math.pow((vazaoLs * 3.6) / 2.6, 2) * 10 * t.qtdValvulaMisturadora
      : 0;

  // --- pressões ---
  const desnivel = t.sobe - t.desce; // spec: SOBE - DESCE
  const pressaoDisponivel = desnivel + t.incrementoPressurizador + residualAnterior;
  const pressaoResidual =
    pressaoDisponivel - perdaCargaTotal - perdaRegistroPressao - perdaValvulaMisturadora;

  const pmin = PRESSAO_MINIMA.find((p) => p.id === t.pecaMinima)?.mca ?? 1;
  const residualOk = pressaoResidual >= pmin;

  return {
    diametroInterno: dInt,
    somaPesos,
    vazaoLs,
    vazaoLmin,
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
    desnivel,
    pressaoDisponivel,
    pressaoResidual,
    pressaoMinima: pmin,
    residualOk,
    reynolds,
    regime,
    fatorAtrito: fatorAtritoVal,
  };
}

// ---------------------------------------------------------------------------
// ENCADEAMENTO — recalcula a lista inteira, a residual de um trecho vira a
// "residual anterior" do próximo automaticamente.
// ---------------------------------------------------------------------------

export interface TrechoSalvo extends Trecho {
  nome: string;
}

export function calcularProjeto(
  trechos: TrechoSalvo[],
  residualInicial: number,
): { trecho: TrechoSalvo; resultado: ResultadoTrecho }[] {
  const saida: { trecho: TrechoSalvo; resultado: ResultadoTrecho }[] = [];
  let residual = residualInicial;
  for (const t of trechos) {
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
    pecas: {},
    conexoes: {},
    sobe: 0,
    desce: 0,
    incrementoPressurizador: 0,
    qtdRegistroPressao: 0,
    qtdValvulaMisturadora: 0,
    temperaturaAgua: 40,
    pecaMinima: "chuveiro",
  };
}
