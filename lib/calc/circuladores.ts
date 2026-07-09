// Motor de cálculo do módulo "Cálculo de Circuladores".
// Portado fielmente da planilha "Planilha Dimensionamento Recirculação para consumo
// - Caso 01 - Anel 01.xlsx" (abas Caminho Crítico, Comprimento Equivalente,
//  Comparador de Vazões, Curva Sistema, Painel Operacao, Dados, Banco Bombas).
//
// O que o módulo faz:
//  1) CAMINHO CRÍTICO — trecho a trecho: velocidade, Reynolds, fator de atrito
//     (Swamee-Jain), perda de carga (Darcy-Weisbach) e PRESSÃO RESIDUAL acumulada,
//     mais perdas locais de registro de pressão, válvula misturadora e aquecedor de
//     passagem a gás (curvas Rinnai h = a·Q^b).
//  2) CURVA DO SISTEMA — perda de carga total x vazão em cenários (escala proporcional
//     ao 1º trecho) ajustada por regressão quadrática H = a + b·Q + c·Q².
//  3) SELEÇÃO DE BOMBA — cruza a curva de cada bomba (quadrática, do catálogo Texius)
//     com a curva do sistema → ponto de operação (Q, H) e diagnóstico de faixa útil.
//
// PARIDADE com a planilha (gotchas mantidas de propósito):
//  - Vazão/velocidade usam Math.PI (a planilha usa PI(), não 3,14).
//  - A perda do REGISTRO de pressão usa π = 3,14 LITERAL (fórmula da planilha).
//  - Fator de atrito f = 0.25/(log10(0.006/D/3.7 + 5.74/Re^0.9))² com D em mm.
//  - Q = 0 / Re = 0 -> perdas = 0 (evita divisão por zero / NaN).
//  - μ (viscosidade) por lookup de correspondência aproximada (VLOOKUP sem 4º arg).

// ---------------------------------------------------------------------------
// TABELAS-FONTE (extraídas da aba "Dados")
// ---------------------------------------------------------------------------

// Diâmetro comercial CPVC: DN externo -> DN interno (mm). Aba Dados A5:B13.
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

// Viscosidade dinâmica da água por temperatura (Pa·s). Aba Dados D5:E14.
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

// Comprimento equivalente por peça, por DN externo (m/unidade). Aba Dados A18:AG27.
export const CONEXOES: { nome: string; m: Record<number, number> }[] = [
  { nome: "Adaptador de Transição", m: { 15: 0.176, 22: 0.303, 28: 0.41, 35: 0.528, 42: 0.657, 54: 0.911, 73: 1.331, 89: 1.686, 114: 2.281 } },
  { nome: "Bucha de Redução até 2 DN", m: { 15: 0.242, 22: 0.416, 28: 0.563, 35: 0.726, 42: 0.904, 54: 1.253, 73: 1.83, 89: 2.318, 114: 3.137 } },
  { nome: "Bucha de Redução acima de 2 DN", m: { 15: 0.374, 22: 0.643, 28: 0.871, 35: 1.122, 42: 1.397, 54: 1.936, 73: 2.829, 89: 3.582, 114: 4.848 } },
  { nome: "Curva 90°", m: { 15: 0.396, 22: 0.681, 28: 0.922, 35: 1.188, 42: 1.479, 54: 2.05, 73: 2.995, 89: 3.793, 114: 5.133 } },
  { nome: "Joelho 90°", m: { 15: 0.88, 22: 1.513, 28: 2.049, 35: 2.639, 42: 3.287, 54: 4.555, 73: 6.656, 89: 8.429, 114: 11.406 } },
  { nome: "Joelho 45°", m: { 15: 0.264, 22: 0.454, 28: 0.615, 35: 0.792, 42: 0.986, 54: 1.367, 73: 1.997, 89: 2.529, 114: 3.422 } },
  { nome: "Joelho 90° c/ latão", m: { 15: 0.968, 22: 1.664, 28: 2.254, 35: 2.903, 42: 3.615, 54: 5.011, 73: 7.321, 89: 9.272, 114: 12.547 } },
  { nome: "Joelho 90° c/ redução e latão", m: { 15: 1.54, 22: 2.647, 28: 3.585, 35: 4.618, 42: 5.752, 54: 7.971, 73: 11.647, 89: 14.751, 114: 19.961 } },
  { nome: "Luva Simples", m: { 15: 0.11, 22: 0.189, 28: 0.256, 35: 0.33, 42: 0.411, 54: 0.569, 73: 0.832, 89: 1.054, 114: 1.426 } },
  { nome: "Luva de Correr", m: { 15: 0.132, 22: 0.227, 28: 0.307, 35: 0.396, 42: 0.493, 54: 0.683, 73: 0.998, 89: 1.264, 114: 1.711 } },
  { nome: "Luva de Redução", m: { 15: 0.374, 22: 0.643, 28: 0.871, 35: 1.122, 42: 1.397, 54: 1.936, 73: 2.829, 89: 3.582, 114: 4.848 } },
  { nome: "Misturador", m: { 15: 0.88, 22: 1.513, 28: 2.049, 35: 2.639, 42: 3.287, 54: 4.555, 73: 6.656, 89: 8.429, 114: 11.406 } },
  { nome: "Tê passagem direta e saída lateral", m: { 15: 0.792, 22: 1.361, 28: 1.844, 35: 2.375, 42: 2.958, 54: 4.1, 73: 5.99, 89: 7.586, 114: 10.265 } },
  { nome: "Tê mesma direção e acréscimo", m: { 15: 0.572, 22: 0.983, 28: 1.332, 35: 1.715, 42: 2.136, 54: 2.961, 73: 4.326, 89: 5.479, 114: 7.414 } },
  { nome: "Tê saída bilateral", m: { 15: 0.968, 22: 1.664, 28: 2.254, 35: 2.903, 42: 3.615, 54: 5.011, 73: 7.321, 89: 9.272, 114: 12.547 } },
  { nome: "Tê chegada contrária", m: { 15: 1.848, 22: 3.177, 28: 4.302, 35: 5.542, 42: 6.902, 54: 9.566, 73: 13.977, 89: 17.701, 114: 23.953 } },
  { nome: "Tê saída bilateral de Redução central", m: { 15: 2.2, 22: 3.782, 28: 5.122, 35: 6.598, 42: 8.217, 54: 11.388, 73: 16.639, 89: 21.073, 114: 28.515 } },
  { nome: "Tê chegada contrária de Redução central", m: { 15: 3.961, 22: 6.807, 28: 9.219, 35: 11.876, 42: 14.791, 54: 20.498, 73: 29.951, 89: 37.931, 114: 51.327 } },
  { nome: "Tê passagem direta e saída lateral de Redução central", m: { 15: 1.584, 22: 2.723, 28: 3.688, 35: 4.75, 42: 5.916, 54: 8.199, 73: 11.98, 89: 15.172, 114: 20.531 } },
  { nome: "Tê mesma direção e acréscimo de Redução central", m: { 15: 1.144, 22: 1.967, 28: 2.663, 35: 3.431, 42: 4.273, 54: 5.922, 73: 8.652, 89: 10.958, 114: 14.828 } },
  { nome: "Tê de latão", m: { 15: 0.352, 22: 0.605, 28: 0.819, 35: 1.056, 42: 1.315, 54: 1.822, 73: 2.662, 89: 3.372, 114: 4.562 } },
  { nome: "Luva de Transposição", m: { 15: 0.528, 22: 0.908, 28: 1.229, 35: 1.583, 42: 1.972, 54: 2.733, 73: 3.993, 89: 5.057, 114: 6.844 } },
  { nome: "União", m: { 15: 0.132, 22: 0.227, 28: 0.307, 35: 0.396, 42: 0.493, 54: 0.683, 73: 0.998, 89: 1.264, 114: 1.711 } },
  { nome: "Entrada normal", m: { 15: 0.3, 22: 0.4, 28: 0.5, 35: 0.6, 42: 1.0, 54: 1.5, 73: 1.6, 89: 2.0, 114: 2.2 } },
  { nome: "Entrada de borda", m: { 15: 0.9, 22: 1.0, 28: 1.2, 35: 1.8, 42: 2.3, 54: 2.8, 73: 3.3, 89: 3.7, 114: 4.0 } },
  { nome: "Saída de canalização", m: { 15: 0.8, 22: 0.9, 28: 1.3, 35: 1.4, 42: 3.2, 54: 3.3, 73: 3.5, 89: 3.7, 114: 3.9 } },
  { nome: "Válvula de pé e crivo", m: { 15: 8.1, 22: 9.5, 28: 13.3, 35: 15.5, 42: 18.3, 54: 23.7, 73: 25.0, 89: 26.8, 114: 28.6 } },
  { nome: "Válvula de retenção tipo leve", m: { 15: 2.5, 22: 2.7, 28: 3.8, 35: 4.9, 42: 6.8, 54: 7.1, 73: 8.2, 89: 9.3, 114: 10.4 } },
  { nome: "Válvula de retenção tipo pesado", m: { 15: 3.6, 22: 4.1, 28: 5.8, 35: 7.4, 42: 9.1, 54: 10.8, 73: 12.5, 89: 14.2, 114: 16.0 } },
  { nome: "Registro de globo aberto", m: { 15: 11.1, 22: 11.4, 28: 15.0, 35: 22.0, 42: 35.8, 54: 37.9, 73: 38.0, 89: 40.0, 114: 42.3 } },
  { nome: "Registro de gaveta aberto", m: { 15: 0.1, 22: 0.2, 28: 0.3, 35: 0.4, 42: 0.7, 54: 0.8, 73: 0.9, 89: 0.9, 114: 1.0 } },
  { nome: "Registro de ângulo aberto", m: { 15: 5.9, 22: 6.1, 28: 8.4, 35: 10.5, 42: 17.0, 54: 18.5, 73: 19.0, 89: 20.0, 114: 22.1 } },
];

// Aquecedores de passagem a gás — perda de carga h = a·Q^b (Q L/min, h m). Curvas
// Rinnai ajustadas por regressão potência (catálogo fev/2026). Aba Dados A31:D48.
export const AQUECEDORES: { modelo: string; a: number; b: number; r2: number }[] = [
  { modelo: "REU1002FEH", a: 0.095313, b: 1.9019, r2: 0.99978 },
  { modelo: "REU1602FEA", a: 0.146182, b: 2.0622, r2: 0.99939 },
  { modelo: "REU1602FEH", a: 0.047041, b: 1.7261, r2: 0.99817 },
  { modelo: "REU2402FEA", a: 0.046094, b: 1.9235, r2: 0.99909 },
  { modelo: "REU2402FEC1", a: 0.064558, b: 1.8052, r2: 0.9978 },
  { modelo: "REU2402FEH", a: 0.044826, b: 1.7638, r2: 0.99327 },
  { modelo: "REU2802FEC", a: 0.069589, b: 1.6076, r2: 0.95584 },
  { modelo: "REUE150FEH", a: 0.078472, b: 1.8414, r2: 0.9997 },
  { modelo: "REUE170FEH", a: 0.025263, b: 1.9228, r2: 0.99696 },
  { modelo: "REUE171FEH", a: 0.032557, b: 1.8419, r2: 0.99916 },
  { modelo: "REUE210FEH", a: 0.016949, b: 2.0783, r2: 0.99454 },
  { modelo: "REUE211FEH", a: 0.033768, b: 1.8339, r2: 0.99794 },
  { modelo: "REUE270FEH", a: 0.041763, b: 1.76, r2: 0.9921 },
  { modelo: "REUE271FEH", a: 0.046404, b: 1.7518, r2: 0.99557 },
  { modelo: "REUE330FEH", a: 0.038698, b: 1.7559, r2: 0.99946 },
  { modelo: "REUE331FEH", a: 0.036946, b: 1.7974, r2: 0.99951 },
  { modelo: "REUE420FEA", a: 0.026018, b: 1.8487, r2: 0.99881 },
  { modelo: "REUE480FEA", a: 0.026018, b: 1.8487, r2: 0.99881 },
];

// Banco de bombas — catálogo Texius, 6 pontos (Q L/min, H mca) por bomba, das curvas
// oficiais de desempenho. Aba Banco Bombas. A curva é ajustada por regressão quadrática.
export const BOMBAS: { nome: string; pontos: [number, number][] }[] = [
  { nome: "TBHWE-SS 100W · Velocidade 1", pontos: [[0, 3.6], [5, 3.1], [10, 2.5], [15, 1.9], [20, 1.2], [25, 0]] },
  { nome: "TBHWE-SS 100W · Velocidade 2", pontos: [[0, 4.6], [8, 3.9], [16, 3.1], [24, 2.2], [31, 1.1], [38, 0]] },
  { nome: "TBHWE-SS 100W · Velocidade 3", pontos: [[0, 6], [10, 4.9], [20, 3.7], [30, 2.4], [40, 1.1], [50, 0]] },
  { nome: "TBHWE-IP-BR 120W", pontos: [[0, 15], [10, 14], [25, 12], [40, 8], [55, 3.5], [69, 0]] },
  { nome: "TBHUX-RN 3/4CV 220V", pontos: [[0, 23], [20, 22], [45, 18.5], [70, 13], [90, 7], [108, 0]] },
  { nome: "WS-BR 1/2CV", pontos: [[0, 22.5], [20, 21], [50, 17], [80, 11], [110, 4], [133, 0]] },
  { nome: "WS-BR 1/4CV", pontos: [[0, 14], [20, 12.5], [45, 9], [70, 5], [95, 1.5], [107, 0]] },
  { nome: "TBHLI 1,0CV", pontos: [[0, 24], [30, 22], [60, 18.5], [100, 12], [140, 4.5], [178, 0]] },
  { nome: "TBHLI-70 1/2CV", pontos: [[0, 16], [20, 14.5], [45, 11], [70, 7], [95, 2.5], [107, 0]] },
];

// ---------------------------------------------------------------------------
// TIPOS DE ENTRADA
// ---------------------------------------------------------------------------

export interface Trecho {
  nome: string;
  dnExterno: number; // mm (chave da tabela CPVC)
  vazao: number; // L/min
  comprimentoReal: number; // m
  conexoes: Record<string, number>; // nome da peça -> quantidade
  desnivel: number; // m (positivo = sobe/consome pressão; negativo = desce/ganha)
  pressurizacao: number; // mca (bombeamento local)
  registrosPressao: number; // qtd de registros de pressão (redutores)
  valvulasMisturadoras: number; // qtd
  kvValvula: number; // Kv da válvula misturadora (m³/h)
  aquecedorModelo: string; // "" = nenhum
  aquecedorQtd: number; // nº de aquecedores em paralelo
}

export interface Inputs {
  temperaturaAgua: number; // °C
  pressaoDisponivelInicial: number; // mca (início do caminho crítico)
  pressaoMinimaExigida: number; // mca (limiar para sinalizar residual crítico)
  trechos: Trecho[];
  cenarios: number[]; // 4 vazões de tronco (Trecho 1) para montar a curva do sistema
}

// ---------------------------------------------------------------------------
// FUNÇÕES-NÚCLEO (hidráulica)
// ---------------------------------------------------------------------------

/** DN interno (mm) a partir do DN externo comercial. */
export function dnInterno(externo: number): number {
  const row = DN_CPVC.find((d) => d.externo === externo);
  return row ? row.interno : 0;
}

/** μ (Pa·s) por temperatura — VLOOKUP de correspondência aproximada (maior temp ≤ alvo). */
export function viscosidade(tempC: number): number {
  let mu = VISCOSIDADE[0].mu;
  for (const v of VISCOSIDADE) {
    if (v.temp <= tempC) mu = v.mu;
    else break;
  }
  return mu;
}

/** Comprimento equivalente por peça (m) para um dado DN externo. */
export function equivDaPeca(nome: string, dnExterno: number): number {
  const p = CONEXOES.find((c) => c.nome === nome);
  return p ? p.m[dnExterno] ?? 0 : 0;
}

/** Soma do comprimento equivalente das conexões de um trecho (m). */
export function comprimentoEquivalente(t: Trecho): number {
  let soma = 0;
  for (const [nome, qtd] of Object.entries(t.conexoes)) {
    if (qtd > 0) soma += qtd * equivDaPeca(nome, t.dnExterno);
  }
  return soma;
}

/** Velocidade (m/s). Q em L/min, D interno em mm. */
export function velocidade(vazao: number, dInt: number): number {
  if (dInt === 0) return 0;
  return (vazao / 60000) / (Math.PI * (dInt / 1000) ** 2 / 4);
}

/** Reynolds. */
export function reynolds(v: number, dInt: number, mu: number): number {
  if (v === 0 || mu === 0) return 0;
  return (1000 * v * (dInt / 1000)) / mu;
}

/** Fator de atrito (Swamee-Jain). D interno em mm. */
export function fatorAtrito(re: number, dInt: number): number {
  if (re === 0 || dInt === 0) return 0;
  return 0.25 / Math.log10(0.006 / dInt / 3.7 + 5.74 / re ** 0.9) ** 2;
}

/** Perda de carga distribuída (mca) — Darcy-Weisbach. L total em m, D interno em mm. */
export function perdaDistribuida(f: number, lTotal: number, dInt: number, v: number): number {
  if (dInt === 0) return 0;
  return f * (lTotal / (dInt / 1000)) * (v ** 2 / (2 * 9.81));
}

/** Perda localizada em registros de pressão (mca). Fórmula da planilha (π = 3,14). */
export function perdaRegistro(vazao: number, dInt: number, qtd: number): number {
  if (qtd === 0 || dInt === 0) return 0;
  return ((8 * 1e6 * 40 * (vazao / 60) ** 2 * 3.14 ** -2 * dInt ** -4) / 10) * qtd;
}

/** Perda em válvula misturadora (mca) via Kv. Q em L/min, Kv em m³/h. */
export function perdaValvula(vazao: number, kv: number, qtd: number): number {
  if (qtd === 0 || kv === 0) return 0;
  return (((vazao / 60) * 3.6 / kv) ** 2 * 10) * qtd;
}

/** Perda no aquecedor de passagem (mca): h = a·(Q/qtd)^b, com vazão dividida entre as unidades. */
export function perdaAquecedor(vazao: number, modelo: string, qtd: number): number {
  if (!modelo || qtd === 0) return 0;
  const aq = AQUECEDORES.find((a) => a.modelo === modelo);
  if (!aq) return 0;
  return aq.a * (vazao / qtd) ** aq.b;
}

// ---------------------------------------------------------------------------
// AJUSTE QUADRÁTICO (mínimos quadrados) — equivalente a LINEST(y, x^{1,2})
// ---------------------------------------------------------------------------

export interface Quadratica {
  a: number; // intercepto
  b: number; // coef. Q
  c: number; // coef. Q²
}

/** Ajusta y = a + b·x + c·x² por mínimos quadrados (normal equations 3x3). */
export function ajustaQuadratica(pts: [number, number][]): Quadratica {
  let n = 0, sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0;
  for (const [x, y] of pts) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++;
    const x2 = x * x;
    sx += x; sx2 += x2; sx3 += x2 * x; sx4 += x2 * x2;
    sy += y; sxy += x * y; sx2y += x2 * y;
  }
  // Sistema:
  // [ n   sx   sx2 ] [a]   [ sy   ]
  // [ sx  sx2  sx3 ] [b] = [ sxy  ]
  // [ sx2 sx3  sx4 ] [c]   [ sx2y ]
  const M = [
    [n, sx, sx2, sy],
    [sx, sx2, sx3, sxy],
    [sx2, sx3, sx4, sx2y],
  ];
  const sol = resolve3x3(M);
  return { a: sol[0], b: sol[1], c: sol[2] };
}

/** Eliminação de Gauss para sistema 3x3 aumentado ([3][4]). */
function resolve3x3(m: number[][]): number[] {
  const a = m.map((r) => r.slice());
  for (let i = 0; i < 3; i++) {
    // pivô parcial
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(a[k][i]) > Math.abs(a[p][i])) p = k;
    [a[i], a[p]] = [a[p], a[i]];
    const piv = a[i][i];
    if (Math.abs(piv) < 1e-12) continue;
    for (let k = 0; k < 3; k++) {
      if (k === i) continue;
      const fator = a[k][i] / piv;
      for (let j = i; j < 4; j++) a[k][j] -= fator * a[i][j];
    }
  }
  return [0, 1, 2].map((i) => (Math.abs(a[i][i]) < 1e-12 ? 0 : a[i][3] / a[i][i]));
}

/** Curva quadrática de uma bomba do catálogo (a partir dos pontos Q,H). */
export function curvaBomba(pontos: [number, number][]): Quadratica & { qMax: number } {
  const q = ajustaQuadratica(pontos);
  const qMax = Math.max(...pontos.map((p) => p[0]));
  return { ...q, qMax };
}

/** Menor raiz positiva da interseção sistema × bomba, dentro de [0, qMaxBomba]. */
export function interseccao(sistema: Quadratica, bomba: Quadratica & { qMax: number }): number | null {
  // (c_s - c_b) Q² + (b_s - b_b) Q + (a_s - a_b) = 0
  const A = sistema.c - bomba.c;
  const B = sistema.b - bomba.b;
  const C = sistema.a - bomba.a;
  const raizes: number[] = [];
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) > 1e-12) raizes.push(-C / B);
  } else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      raizes.push((-B + s) / (2 * A), (-B - s) / (2 * A));
    }
  }
  const validas = raizes.filter((q) => q > 0 && q <= bomba.qMax).sort((x, y) => x - y);
  return validas.length ? validas[0] : null;
}

// ---------------------------------------------------------------------------
// RESULTADO
// ---------------------------------------------------------------------------

export interface TrechoResultado {
  nome: string;
  dnExterno: number;
  dnInterno: number;
  vazao: number;
  comprimentoReal: number;
  comprimentoEquiv: number;
  comprimentoTotal: number;
  velocidade: number;
  reynolds: number;
  fatorAtrito: number;
  perdaDistribuida: number;
  perdaRegistro: number;
  perdaValvula: number;
  perdaAquecedor: number;
  desnivel: number;
  pressurizacao: number;
  pDisponivelInicio: number;
  pResidualFinal: number;
  ok: boolean; // residual >= pressão mínima exigida
}

export interface BombaResultado {
  nome: string;
  qOp: number | null; // L/min
  hOp: number | null; // mca
  atende: boolean; // interseção válida e dentro da faixa útil do sistema
  qMax: number;
}

export interface Resultado {
  trechos: TrechoResultado[];
  perdaTotal: number; // soma das perdas ao longo do caminho crítico (mca)
  residualFinal: number; // pressão residual no ponto final (mca)
  atendePressao: boolean;
  comprimentoTotal: number; // m
  sistema: Quadratica;
  qMinSistema: number;
  qMaxSistema: number;
  pontosSistema: [number, number][]; // (Q, perda) dos cenários
  bombas: BombaResultado[];
}

/** Perda de carga total do sistema (mca) para uma vazão de tronco (Trecho 1). */
export function perdaSistemaEmVazao(inp: Inputs, vazaoTronco: number): number {
  const mu = viscosidade(inp.temperaturaAgua);
  const base = inp.trechos[0]?.vazao || 0;
  if (base === 0) return 0;
  let total = 0;
  for (const t of inp.trechos) {
    const dInt = dnInterno(t.dnExterno);
    // escala proporcional ao Trecho 1
    const q = t.vazao * (vazaoTronco / base);
    const lTot = t.comprimentoReal + comprimentoEquivalente(t);
    const v = velocidade(q, dInt);
    const re = reynolds(v, dInt, mu);
    const f = fatorAtrito(re, dInt);
    total += perdaDistribuida(f, lTot, dInt, v);
    total += perdaRegistro(q, dInt, t.registrosPressao);
    total += perdaValvula(q, t.kvValvula, t.valvulasMisturadoras);
    total += perdaAquecedor(q, t.aquecedorModelo, t.aquecedorQtd);
  }
  return total;
}

// ---------------------------------------------------------------------------
// MOTOR PRINCIPAL
// ---------------------------------------------------------------------------

export function calcular(inp: Inputs): Resultado {
  const mu = viscosidade(inp.temperaturaAgua);
  const trechos: TrechoResultado[] = [];
  let pAnterior = inp.pressaoDisponivelInicial;

  for (const t of inp.trechos) {
    const dInt = dnInterno(t.dnExterno);
    const lEquiv = comprimentoEquivalente(t);
    const lTot = t.comprimentoReal + lEquiv;
    const v = velocidade(t.vazao, dInt);
    const re = reynolds(v, dInt, mu);
    const f = fatorAtrito(re, dInt);
    const hf = perdaDistribuida(f, lTot, dInt, v);
    const pReg = perdaRegistro(t.vazao, dInt, t.registrosPressao);
    const pValv = perdaValvula(t.vazao, t.kvValvula, t.valvulasMisturadoras);
    const pAq = perdaAquecedor(t.vazao, t.aquecedorModelo, t.aquecedorQtd);

    const pInicio = pAnterior;
    // Residual: entra - perda_carga - desnível + pressurização - registro - válvula - aquecedor
    const pFinal = pInicio - hf - t.desnivel + t.pressurizacao - pReg - pValv - pAq;
    pAnterior = pFinal;

    trechos.push({
      nome: t.nome,
      dnExterno: t.dnExterno,
      dnInterno: dInt,
      vazao: t.vazao,
      comprimentoReal: t.comprimentoReal,
      comprimentoEquiv: lEquiv,
      comprimentoTotal: lTot,
      velocidade: v,
      reynolds: re,
      fatorAtrito: f,
      perdaDistribuida: hf,
      perdaRegistro: pReg,
      perdaValvula: pValv,
      perdaAquecedor: pAq,
      desnivel: t.desnivel,
      pressurizacao: t.pressurizacao,
      pDisponivelInicio: pInicio,
      pResidualFinal: pFinal,
      ok: pFinal >= inp.pressaoMinimaExigida,
    });
  }

  const residualFinal = trechos.length ? trechos[trechos.length - 1].pResidualFinal : inp.pressaoDisponivelInicial;
  const perdaTotal = trechos.reduce(
    (s, t) => s + t.perdaDistribuida + t.perdaRegistro + t.perdaValvula + t.perdaAquecedor,
    0
  );
  const comprimentoTotal = trechos.reduce((s, t) => s + t.comprimentoTotal, 0);

  // Curva do sistema a partir dos cenários de vazão de tronco
  const cenariosValidos = inp.cenarios.filter((q) => Number.isFinite(q) && q > 0);
  const pontosSistema: [number, number][] = cenariosValidos.map((q) => [q, perdaSistemaEmVazao(inp, q)]);
  const sistema = pontosSistema.length >= 3 ? ajustaQuadratica(pontosSistema) : { a: 0, b: 0, c: 0 };
  const qMinSistema = pontosSistema.length ? Math.min(...pontosSistema.map((p) => p[0])) : 0;
  const qMaxSistema = pontosSistema.length ? Math.max(...pontosSistema.map((p) => p[0])) : 0;

  // Ponto de operação de cada bomba
  const bombas: BombaResultado[] = BOMBAS.map((b) => {
    const curva = curvaBomba(b.pontos);
    const qOp = pontosSistema.length >= 3 ? interseccao(sistema, curva) : null;
    const hOp = qOp !== null ? sistema.a + sistema.b * qOp + sistema.c * qOp * qOp : null;
    const atende = qOp !== null && qOp >= qMinSistema && qOp <= qMaxSistema;
    return { nome: b.nome, qOp, hOp, atende, qMax: curva.qMax };
  });

  return {
    trechos,
    perdaTotal,
    residualFinal,
    atendePressao: residualFinal >= inp.pressaoMinimaExigida,
    comprimentoTotal,
    sistema,
    qMinSistema,
    qMaxSistema,
    pontosSistema,
    bombas,
  };
}

/** Amostra a curva do sistema e de uma bomba para plotagem. */
export function amostraCurvas(
  sistema: Quadratica,
  bomba: { pontos: [number, number][] },
  qMaxSistema: number,
  qOp: number | null
): { q: number; hSistema: number; hBomba: number | null }[] {
  const curva = curvaBomba(bomba.pontos);
  const qMaxGraf = Math.max(qMaxSistema * 1.8, (qOp ?? 0) * 1.3, qMaxSistema + 5, curva.qMax * 0.6);
  const N = 40;
  const passo = qMaxGraf / N;
  const pts: { q: number; hSistema: number; hBomba: number | null }[] = [];
  for (let i = 0; i <= N; i++) {
    const q = i * passo;
    const hSistema = sistema.a + sistema.b * q + sistema.c * q * q;
    const hBomba = q <= curva.qMax ? curva.a + curva.b * q + curva.c * q * q : null;
    pts.push({ q, hSistema, hBomba });
  }
  return pts;
}
