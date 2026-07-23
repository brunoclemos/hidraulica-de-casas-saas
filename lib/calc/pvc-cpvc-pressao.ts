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
  // Trecho pertence ao TRONCO (linha principal). Nos cenários de vazão, a vazão do
  // cenário substitui a vazão SÓ dos trechos marcados; os ramais mantêm a de projeto.
  // (Feedback 21/jul, vídeo: "a vazão máxima entra só no tronco, o resto segue igual".)
  noTronco: boolean;
  pecas: Record<string, number>; // nome da peça -> quantidade (modo "pesos")
  conexoes: QtdConexoes; // id da conexão -> quantidade
  sobe: number; // m (elevação que sobe)
  desce: number; // m (elevação que desce)
  incrementoPressurizador: number; // mca
  // registro de pressão (RP) e válvula misturadora (só AQ)
  qtdRegistroPressao: number;
  qtdValvulaMisturadora: number; // só faz sentido em CPVC/AQ
  kvValvula: number; // Kv da válvula misturadora (m³/h). Default 2,6 (valor da planilha do curso).
  // Monocomando no trecho (feedback 21/jul, vídeo 1): id do catálogo MONOCOMANDOS,
  // "" = nenhum. A perda vem da curva DOCOL na vazão do trecho, máx. 1 por trecho
  // (o trecho termina no ponto de uso).
  monocomando: string;
  // Filtro Y (feedback 21/jul): perda por Kv da bitola, mesma fórmula da válvula.
  qtdFiltroY: number;
  bitolaFiltroY: string; // chave de FILTRO_Y_KV
  // Chuveiro no ponto (feedback 21/jul, vídeo 3): id do catálogo CHUVEIROS, "" = nenhum,
  // "manual" = perda digitada. Soma na EXIGÊNCIA mínima do ponto, não na perda do trecho.
  chuveiro: string;
  perdaChuveiroManual: number; // mca — usada só quando chuveiro === "manual"
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
  perdaMonocomando: number; // mca (feedback 21/jul)
  monocomandoAcima: boolean; // vazão acima do alcance da curva do monocomando
  perdaFiltroY: number; // mca (feedback 21/jul)
  perdaChuveiro: number; // mca somada na exigência do ponto (feedback 21/jul)
  chuveiroAcima: boolean; // vazão acima do alcance da curva do chuveiro
  desnivel: number; // m (sobe - desce)
  pressaoDisponivel: number; // mca
  pressaoResidual: number; // mca
  pressaoMinima: number; // mca exigida no ponto (mínimo da peça + chuveiro)
  residualOk: boolean; // residual >= mínima
  // extras CPVC (Darcy-Weisbach)
  reynolds: number;
  regime: "Laminar" | "Reg. Transição" | "Turbulento" | "—";
  fatorAtrito: number;
}

// ---------------------------------------------------------------------------
// CURVAS DE VAZÃO DE EQUIPAMENTOS (feedback 21/jul) — pontos [pressão mca, vazão
// L/min] em pressão crescente, como publicados pelo fabricante (Q em função de P).
// O app usa o INVERSO (perda em função da vazão) via perdaPorCurvaVazao.
// ---------------------------------------------------------------------------

export interface CurvaVazao {
  id: string;
  nome: string;
  pontos: [number, number][]; // [mca, L/min]
}

// Monocomandos DOCOL — curvas enviadas pelo cliente 21/jul (digitalizadas das
// imagens oficiais, erro de leitura ~±3%).
export const MONOCOMANDOS: CurvaVazao[] = [
  {
    id: "baixa_pressao",
    nome: "Monocomando baixa pressão (DOCOL)",
    pontos: [[2, 17.8], [4, 23], [6, 27], [8, 31], [10, 33.5], [14, 40.5], [18, 46], [22, 50.5], [26, 55.5], [30, 59.5], [34, 63], [40, 69]],
  },
  {
    id: "alta_pressao",
    nome: "Monocomando alta pressão (DOCOL)",
    pontos: [[4, 15.6], [6, 18], [8, 20.7], [10, 23], [12, 25.2], [16, 29.5], [20, 33.3], [24, 36.9], [28, 40], [32, 43], [36, 45.5], [40, 47.7]],
  },
  {
    id: "quatro_vias_banheira",
    nome: "Monocomando 4 vias — saída banheira (DOCOL)",
    pontos: [[5, 13.2], [10, 17.2], [14, 20], [18, 22.7], [22, 25.2], [26, 27.3], [30, 29.4], [34, 31.3], [40, 34.2]],
  },
  {
    id: "quatro_vias_chuveiro",
    nome: "Monocomando 4 vias — saída chuveiro (DOCOL)",
    pontos: [[5, 13.2], [10, 17.2], [14, 20], [18, 22.6], [22, 25], [26, 27], [30, 28.9], [34, 30.6], [40, 33.2]],
  },
];

// Chuveiros Docol/Deca — pontos exatos do PDF de curvas enviado pelo cliente 22/jul.
// Linhas Deca Flex/Quadrado só publicam mín/máx da ficha técnica (2 pontos).
export const CHUVEIROS: CurvaVazao[] = [
  { id: "docoleden150_sem", nome: "DocolEden 150 — sem restritor", pontos: [[1, 10.3], [2, 13], [4, 15.3], [6, 19], [8, 21.5], [10, 23.5], [14, 26.5], [18, 29.5], [22, 32], [26, 35], [30, 37.5], [34, 40], [38, 41.2], [40, 42.7]] },
  { id: "docoleden150_com", nome: "DocolEden 150 — com restritor", pontos: [[1, 6], [2, 8], [4, 10], [6, 12], [10, 12.2], [14, 12], [18, 12], [22, 12.2], [26, 11.8], [30, 12], [34, 12.2], [40, 12]] },
  { id: "mixmatch_sem", nome: "Docol Mix&Match parede — sem regulador", pontos: [[2, 20], [10, 32]] },
  { id: "mixmatch_com", nome: "Docol Mix&Match parede — com regulador", pontos: [[10, 12], [14, 15.5], [18, 18], [20, 19], [24, 20.3], [26, 21], [30, 21.3], [34, 21.7], [40, 22]] },
  { id: "docolrain", nome: "DocolRain Mix&Match — regulador 22 L/min", pontos: [[2, 9.5], [6, 12.5], [10, 15], [14, 16.7], [18, 18.5], [22, 20], [26, 21], [30, 21.2], [34, 21], [38, 20.8], [40, 21]] },
  { id: "technoshower_sem", nome: "Novo Technoshower — sem restritor", pontos: [[2, 12.2], [4, 17], [6, 20], [8, 23], [10, 25.5], [14, 30.5], [18, 34.5], [22, 37.5], [26, 41], [30, 43.5], [34, 46], [36, 47.2], [40, 50.5]] },
  { id: "technoshower_com", nome: "Novo Technoshower — com restritor", pontos: [[2, 9], [4, 11.5], [6, 12.7], [8, 13], [10, 13], [14, 12.5], [18, 12.6], [22, 12.3], [26, 12], [30, 11.3], [34, 11.3], [40, 11.3]] },
  { id: "docolheaven_sem", nome: "DocolHeaven Q200 teto — sem regulador", pontos: [[2, 7.5], [6, 14], [10, 18.5], [14, 21.5], [18, 24], [22, 26.5], [26, 28.5], [30, 30.5], [34, 32.3], [40, 34.2]] },
  { id: "docolheaven_com", nome: "DocolHeaven Q200 teto — com regulador", pontos: [[2, 4.5], [6, 7.7], [10, 10], [14, 11.7], [18, 13], [22, 14], [26, 15], [30, 15.7], [34, 16.2], [40, 16.5]] },
  { id: "deca_acqua_plus", nome: "Deca Acqua Plus", pontos: [[2, 14], [10, 28], [20, 41], [30, 51], [40, 60]] },
  { id: "deca_aquamax", nome: "Deca Aquamax", pontos: [[2, 12], [10, 22], [20, 33], [30, 41], [40, 47.5]] },
  { id: "deca_flex_max", nome: "Deca Flex Max (limitador, mín/máx)", pontos: [[2, 9], [40, 12]] },
  { id: "deca_flex_plus", nome: "Deca Flex Plus (limitador, mín/máx)", pontos: [[2, 9], [40, 12]] },
  { id: "deca_quadrado", nome: "Deca Quadrado (mín/máx)", pontos: [[2, 12], [40, 60]] },
];

// Filtro Y — Kv por bitola lido do gráfico log-log do fabricante (Q = Kv·√ΔP;
// Kv = vazão em m³/h a 1 bar). PRELIMINAR (±15%, leitura de foto) — refinar
// quando o cliente mandar o datasheet.
export const FILTRO_Y_KV: { bitola: string; kv: number }[] = [
  { bitola: '1/2"', kv: 3 },
  { bitola: '3/4"', kv: 6.3 },
  { bitola: '1"', kv: 9.5 },
  { bitola: '1.1/4"', kv: 15 },
  { bitola: '1.1/2"', kv: 24 },
  { bitola: '2"', kv: 35 },
  { bitola: '2.1/2"', kv: 95 },
  { bitola: '3"', kv: 140 },
];

export interface PerdaCurva {
  perda: number; // mca
  acima: boolean; // vazão acima do máximo que a curva publicada atinge
}

/** Perda de carga (mca) pra uma vazão (L/min) invertendo a curva publicada Q(P).
 *  Interpola linear no envelope monotônico (curvas com restritor têm platô — acima
 *  dele a vazão é inatingível: clampa no fim do envelope e sinaliza `acima` pro
 *  alerta da UI). Abaixo do 1º ponto, extrapola P = P0·(Q/Q0)² (forma Q ∝ √P). */
export function perdaPorCurvaVazao(pontos: [number, number][], vazaoLmin: number): PerdaCurva {
  if (!(vazaoLmin > 0) || pontos.length === 0) return { perda: 0, acima: false };
  // envelope monotônico: só os pontos que aumentam a vazão máxima já atingida
  let qMax = -Infinity;
  const env: [number, number][] = [];
  for (const [p, q] of pontos) {
    if (q > qMax) {
      qMax = q;
      env.push([p, q]);
    }
  }
  const [p0, q0] = env[0];
  const [pN, qN] = env[env.length - 1];
  if (vazaoLmin <= q0) return { perda: p0 * Math.pow(vazaoLmin / q0, 2), acima: false };
  if (vazaoLmin > qN) return { perda: pN, acima: true };
  for (let i = 1; i < env.length; i++) {
    const [pa, qa] = env[i - 1];
    const [pb, qb] = env[i];
    if (vazaoLmin <= qb) {
      return { perda: pa + ((vazaoLmin - qa) / (qb - qa)) * (pb - pa), acima: false };
    }
  }
  return { perda: pN, acima: false };
}

/** Exigência extra do chuveiro no ponto (vídeo 3, 21/jul): pressão que o chuveiro
 *  pede na vazão do trecho — curva do fabricante ou perda digitada ("manual"). */
export function perdaDoChuveiro(t: Trecho, vazaoLmin: number): PerdaCurva {
  if (t.chuveiro === "manual") {
    const v = Number.isFinite(t.perdaChuveiroManual) && t.perdaChuveiroManual > 0 ? t.perdaChuveiroManual : 0;
    return { perda: v, acima: false };
  }
  const c = CHUVEIROS.find((x) => x.id === t.chuveiro);
  if (!c) return { perda: 0, acima: false };
  return perdaPorCurvaVazao(c.pontos, vazaoLmin);
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
  perdaMonocomando: number; // mca (curva DOCOL na vazão do trecho)
  monocomandoAcima: boolean; // vazão acima do alcance da curva
  perdaFiltroY: number; // mca (Kv da bitola)
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

  // Monocomando (feedback 21/jul): perda pela curva DOCOL na vazão do trecho.
  const curvaMono = MONOCOMANDOS.find((m) => m.id === t.monocomando);
  const mono = curvaMono ? perdaPorCurvaVazao(curvaMono.pontos, vazaoLs * 60) : { perda: 0, acima: false };

  // Filtro Y (feedback 21/jul): mesma fórmula Kv da válvula, Kv por bitola.
  const kvFiltro = FILTRO_Y_KV.find((b) => b.bitola === t.bitolaFiltroY)?.kv ?? 0;
  const perdaFiltroY =
    vazaoLs > 0 && t.qtdFiltroY > 0 && kvFiltro > 0
      ? Math.pow((vazaoLs * 3.6) / kvFiltro, 2) * 10 * t.qtdFiltroY
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
    perdaMonocomando: mono.perda,
    monocomandoAcima: mono.acima,
    perdaFiltroY,
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
    pressaoDisponivel -
    p.perdaCargaTotal -
    p.perdaRegistroPressao -
    p.perdaValvulaMisturadora -
    p.perdaMonocomando -
    p.perdaFiltroY;

  // Exigência do ponto (feedback 21/jul): mínimo da peça + pressão que o chuveiro
  // pede na vazão (ex.: chuveiro 1 mca + curva 12 mca = 13 mca exigidos).
  const pminPeca = PRESSAO_MINIMA.find((x) => x.id === t.pecaMinima)?.mca ?? 1;
  const chuveiroCalc = perdaDoChuveiro(t, vazaoLmin);
  const pmin = pminPeca + chuveiroCalc.perda;
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
    perdaMonocomando: p.perdaMonocomando,
    monocomandoAcima: p.monocomandoAcima,
    perdaFiltroY: p.perdaFiltroY,
    perdaChuveiro: chuveiroCalc.perda,
    chuveiroAcima: chuveiroCalc.acima,
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
    // sem trecho marcado (projeto antigo) os cenários caem no modo proporcional legado.
    noTronco: raw?.noTronco === true,
    pecas: raw?.pecas && typeof raw.pecas === "object" ? raw.pecas : {},
    conexoes: raw?.conexoes && typeof raw.conexoes === "object" ? raw.conexoes : {},
    sobe: num(raw?.sobe, 0),
    desce: num(raw?.desce, 0),
    incrementoPressurizador: num(raw?.incrementoPressurizador, 0),
    qtdRegistroPressao: num(raw?.qtdRegistroPressao, 0),
    qtdValvulaMisturadora: num(raw?.qtdValvulaMisturadora, 0),
    kvValvula: num(raw?.kvValvula, 2.6),
    // campos novos (feedback 21/jul): default vazio/zero = projeto antigo calcula idêntico.
    monocomando: typeof raw?.monocomando === "string" ? raw.monocomando : "",
    qtdFiltroY: num(raw?.qtdFiltroY, 0),
    bitolaFiltroY: typeof raw?.bitolaFiltroY === "string" ? raw.bitolaFiltroY : '3/4"',
    chuveiro: typeof raw?.chuveiro === "string" ? raw.chuveiro : "",
    perdaChuveiroManual: num(raw?.perdaChuveiroManual, 0),
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
    noTronco: false,
    pecas: {},
    conexoes: {},
    sobe: 0,
    desce: 0,
    incrementoPressurizador: 0,
    qtdRegistroPressao: 0,
    qtdValvulaMisturadora: 0,
    kvValvula: 2.6,
    monocomando: "",
    qtdFiltroY: 0,
    bitolaFiltroY: '3/4"',
    chuveiro: "",
    perdaChuveiroManual: 0,
    temperaturaAgua: 40,
    pecaMinima: "chuveiro",
  };
}

// ---------------------------------------------------------------------------
// CURVA DO SISTEMA & CENÁRIOS (vídeos 4 e 5 do cliente 18/jul; refinado 21/jul).
// Com trechos marcados como TRONCO, a vazão do cenário entra ABSOLUTA neles e os
// demais mantêm a vazão de projeto ("o resto segue igual ao início da planilha").
// Sem marcação (projeto legado), escala tudo proporcionalmente à 1ª inserção.
// ---------------------------------------------------------------------------

/** Vazão-base do tronco em L/min: 1º trecho marcado como tronco; sem marcação, a 1ª inserção. */
export function vazaoTroncoBase(trechos: Trecho[] | undefined | null): number {
  const t0 = trechos?.find((t) => t.noTronco) ?? trechos?.[0];
  return t0 ? vazaoDoTrecho(t0).lmin : 0;
}

// Vazão (L/s) de um trecho num cenário — único ponto de decisão tronco × legado,
// compartilhado pela perda total e pelo detalhamento pra nunca divergirem.
function vazaoLsNoCenario(t: Trecho, temTronco: boolean, vazaoCenarioLs: number, fator: number): number {
  if (temTronco) return t.noTronco ? vazaoCenarioLs : vazaoDoTrecho(t).ls;
  return vazaoDoTrecho(t).ls * fator;
}

/** Termo ESTÁTICO da cadeia de residuais: Σ (desce − sobe + incremento pressurizador).
 *  Não varia com a vazão, então `residualInicial + ganho − perdaProjetoEmVazao(q)`
 *  reproduz a residual da última inserção quando q = vazão de projeto do tronco.
 *  (Report do cliente 22/jul: cenário na vazão do projeto "não batia" com a pressão
 *  final — a diferença era exatamente entrada + desníveis, que o card não mostrava.) */
export function ganhoEstaticoProjeto(trechos: Trecho[] | undefined | null): number {
  let total = 0;
  for (const t of trechos ?? []) total += t.desce - t.sobe + t.incrementoPressurizador;
  return total;
}

/** Perda de carga TOTAL do projeto (mca) para uma vazão de cenário (L/min).
 *  Trechos do tronco recebem a vazão do cenário; ramais mantêm a de projeto.
 *  Sem trecho marcado, escala todos proporcionalmente à base (comportamento legado). */
export function perdaProjetoEmVazao(trechos: Trecho[], vazaoTroncoLmin: number): number {
  const temTronco = trechos.some((t) => t.noTronco);
  const base = vazaoTroncoBase(trechos);
  if (!temTronco && !(base > 0)) return 0;
  const fator = base > 0 ? vazaoTroncoLmin / base : 0;
  let total = 0;
  for (const t of trechos) {
    const ls = vazaoLsNoCenario(t, temTronco, vazaoTroncoLmin / 60, fator);
    const p = perdasHidraulicas(t, ls);
    total +=
      p.perdaCargaTotal +
      p.perdaRegistroPressao +
      p.perdaValvulaMisturadora +
      p.perdaMonocomando +
      p.perdaFiltroY;
  }
  return total;
}

export interface DetalheProjetoTrecho {
  ambiente: string;
  nome: string;
  noTronco: boolean; // pra tabela destacar as linhas do tronco
  q: number; // L/min (vazão usada no cenário)
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

/** Detalhamento por trecho (Q, V, h_f distribuída) para uma vazão de cenário (L/min). */
export function detalheProjetoEmVazao(
  trechos: TrechoSalvo[],
  vazaoTroncoLmin: number,
): DetalheProjetoTrecho[] {
  const temTronco = (trechos ?? []).some((t) => t.noTronco);
  const base = vazaoTroncoBase(trechos);
  const fator = base > 0 ? vazaoTroncoLmin / base : 0;
  return (trechos ?? []).map((t) => {
    const ls = vazaoLsNoCenario(t, temTronco, vazaoTroncoLmin / 60, fator);
    const p = perdasHidraulicas(t, ls);
    return {
      ambiente: t.ambiente,
      nome: t.nome,
      noTronco: t.noTronco,
      q: ls * 60,
      v: p.velocidade,
      hf: p.perdaCargaTotal,
    };
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

// A seleção de bomba usa o modelo do cliente (áudio 18/jul): ponto único de projeto =
// vazão total do tronco + pressão que falta pro ponto crítico atingir o mínimo
// (max(pressão mínima − pressão residual)). Isso já sai de calcularProjeto — não há
// conta de "altura estática" separada. A composição é feita na página do módulo.
