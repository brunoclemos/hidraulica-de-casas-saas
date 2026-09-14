// Leitor STEP/ISO-10303-21 mínimo: indexa as entidades do IFC e resolve placements.
// Lê só o que o importador pede (14 tipos de entidade, nenhuma malha) — por isso não
// usamos web-ifc, que tessela o modelo inteiro para visualização 3D.
//
// O tokenizer é por ESTADO, não por linha: um exportador pode quebrar a entidade em
// várias linhas e uma string STEP pode conter ";", "(" e "''".

import { ErroIfc } from "./tipos";

export interface EntidadeStep {
  id: number;
  tipo: string;
  /** Miolo entre o primeiro "(" e o ")" que o fecha. Nada é parseado antes de ser pedido. */
  args: string;
}

export type Vetor3 = [number, number, number];
/** Linha-maior: [X Y Z | L], última linha implícita (0,0,0,1). */
export type Mat4 = [number[], number[], number[], number[]];

const PREFIXO_STEP = "ISO-10303-21";
const ASPAS = 39; // '
const ABRE = 40; // (
const FECHA = 41; // )

const ehDigito = (c: number) => c >= 48 && c <= 57;
const ehLetraOuDigito = (c: number) =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const ehBranco = (c: number) => c === 32 || c === 9 || c === 13 || c === 10;

function pularBrancos(texto: string, i: number): number {
  let j = i;
  while (j < texto.length && ehBranco(texto.charCodeAt(j))) j++;
  return j;
}

/** Índice do ")" que fecha o "(" em `abertura`, respeitando strings STEP. -1 se não fecha. */
function fecharParenteses(texto: string, abertura: number): number {
  let profundidade = 0;
  let emString = false;
  for (let i = abertura; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (emString) {
      if (c === ASPAS) emString = false;
      continue;
    }
    if (c === ASPAS) emString = true;
    else if (c === ABRE) profundidade++;
    else if (c === FECHA && --profundidade === 0) return i;
  }
  return -1;
}

/** Separa os atributos de uma entidade no nível 0, respeitando parênteses e strings. */
export function atributos(args: string): string[] {
  const saida: string[] = [];
  let profundidade = 0;
  let atual = "";
  let emString = false;
  for (const c of args) {
    if (emString) {
      atual += c;
      if (c === "'") emString = false;
      continue;
    }
    if (c === "'") {
      emString = true;
      atual += c;
      continue;
    }
    if (c === "(") profundidade++;
    else if (c === ")") profundidade--;
    else if (c === "," && profundidade === 0) {
      saida.push(atual.trim());
      atual = "";
      continue;
    }
    atual += c;
  }
  saida.push(atual.trim());
  return saida;
}

export function ref(atributo: string | undefined): number | null {
  if (!atributo || atributo[0] !== "#") return null;
  const n = Number(atributo.slice(1));
  return Number.isFinite(n) ? n : null;
}

export function refs(atributo: string | undefined): number[] {
  if (!atributo) return [];
  return Array.from(atributo.matchAll(/#(\d+)/g), (m) => Number(m[1]));
}

const hexParaTexto = (hex: string, tamanho: number) => {
  let saida = "";
  for (let i = 0; i + tamanho <= hex.length; i += tamanho) {
    saida += String.fromCharCode(Number.parseInt(hex.slice(i, i + tamanho), 16));
  }
  return saida;
};

/** Atributo string STEP -> texto. Decodifica \X\E1 e \X2\00E1\X0\ (acentos do Revit). */
export function texto(atributo: string | undefined): string {
  if (!atributo || atributo[0] !== "'") return "";
  return atributo
    .slice(1, -1)
    .replace(/\\X2\\([0-9A-Fa-f]{4,})\\X0\\/g, (_, hex: string) => hexParaTexto(hex, 4))
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex: string) => hexParaTexto(hex, 2))
    .replace(/''/g, "'");
}

export function numero(atributo: string | undefined): number {
  return atributo === undefined ? NaN : Number(atributo);
}

/** `.SOURCE.` -> `SOURCE`. */
export function enumeracao(atributo: string | undefined): string {
  return atributo ? atributo.replace(/\./g, "") : "";
}

function indexar(fonte: string): Map<number, EntidadeStep> {
  const entidades = new Map<number, EntidadeStep>();
  const marcaDados = fonte.indexOf("DATA;");
  let i = marcaDados >= 0 ? marcaDados + 5 : 0;
  while (i < fonte.length) {
    const cerquilha = fonte.indexOf("#", i);
    if (cerquilha < 0) break;
    i = cerquilha + 1;
    let j = i;
    while (j < fonte.length && ehDigito(fonte.charCodeAt(j))) j++;
    if (j === i) continue; // "#" que não abre instância (dentro de ENDSEC, por exemplo)
    const id = Number(fonte.slice(i, j));
    j = pularBrancos(fonte, j);
    if (fonte.charCodeAt(j) !== 61) continue; // "="
    j = pularBrancos(fonte, j + 1);
    const inicioTipo = j;
    while (j < fonte.length && ehLetraOuDigito(fonte.charCodeAt(j))) j++;
    const tipo = fonte.slice(inicioTipo, j).toUpperCase();
    j = pularBrancos(fonte, j);
    if (fonte.charCodeAt(j) !== ABRE) continue;
    const fim = fecharParenteses(fonte, j);
    if (fim < 0) break;
    // tipo vazio = entidade complexa `#1=(A(..),B(..))`: indexada mas nunca consultada.
    entidades.set(id, { id, tipo, args: fonte.slice(j + 1, fim) });
    i = fim + 1;
  }
  return entidades;
}

const IDENTIDADE: Mat4 = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

const produto = (a: Mat4, b: Mat4): Mat4 =>
  a.map((linha) => b[0].map((_, j) => linha.reduce((s, v, k) => s + v * b[k][j], 0))) as Mat4;

const cruzado = (a: Vetor3, b: Vetor3): Vetor3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const unitario = (a: Vetor3): Vetor3 => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n ? [a[0] / n, a[1] / n, a[2] / n] : a;
};

export const escalar = (a: Vetor3, b: Vetor3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const distancia = (a: Vetor3, b: Vetor3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Ponto local -> global, já convertido para metros. */
export const aplicarPonto = (m: Mat4, p: Vetor3, escala: number): Vetor3 => [
  (m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2] + m[0][3]) * escala,
  (m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2] + m[1][3]) * escala,
  (m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2] + m[2][3]) * escala,
];

/** Direção local -> global (sem translação, sem escala: continua unitária). */
export const aplicarDirecao = (m: Mat4, d: Vetor3): Vetor3 => [
  m[0][0] * d[0] + m[0][1] * d[1] + m[0][2] * d[2],
  m[1][0] * d[0] + m[1][1] * d[1] + m[1][2] * d[2],
  m[2][0] * d[0] + m[2][1] * d[1] + m[2][2] * d[2],
];

export class IndiceStep {
  readonly entidades: Map<number, EntidadeStep>;
  readonly schema: string;
  readonly aplicacao: string;
  /** Fator que converte o comprimento do arquivo para metros (1 ou 0.001). */
  readonly escala: number;

  private readonly cacheAtributos = new Map<number, string[]>();
  private readonly cachePlacement = new Map<number, Mat4>();

  constructor(fonte: string) {
    if (!fonte.startsWith(PREFIXO_STEP)) {
      throw new ErroIfc(
        "nao_e_ifc",
        "Este arquivo não é um IFC (formato STEP ISO-10303-21). Exporte do Revit em IFC 2x3 Coordination View.",
      );
    }
    const marcaDados = fonte.indexOf("DATA;");
    const cabecalho = fonte.slice(0, marcaDados >= 0 ? marcaDados : fonte.length);
    this.schema = cabecalho.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/)?.[1] ?? "";
    this.aplicacao = lerAplicacao(cabecalho);
    this.entidades = indexar(fonte);
    if (this.entidades.size === 0) {
      throw new ErroIfc("sem_dados", "O IFC não tem seção DATA com entidades legíveis.");
    }
    this.escala = lerEscalaDeComprimento(this.entidades);
  }

  tipoDe(id: number | null): string {
    return id === null ? "" : (this.entidades.get(id)?.tipo ?? "");
  }

  atributosDe(id: number | null): string[] {
    if (id === null) return [];
    const emCache = this.cacheAtributos.get(id);
    if (emCache) return emCache;
    const entidade = this.entidades.get(id);
    if (!entidade) return [];
    const partido = atributos(entidade.args);
    this.cacheAtributos.set(id, partido);
    return partido;
  }

  /** Name de um IfcRoot (atributo [2]). */
  nomeDe(id: number | null): string {
    return texto(this.atributosDe(id)[2]);
  }

  /** Coordenadas de um IFCCARTESIANPOINT / IFCDIRECTION (z ausente = 0). */
  coordenadas(id: number | null): Vetor3 {
    const lista = this.atributosDe(id)[0] ?? "";
    const valores = lista.replace(/[()]/g, "").split(",").map(Number);
    return [valores[0] ?? 0, valores[1] ?? 0, valores[2] ?? 0];
  }

  /** Matriz acumulada de um IFCLOCALPLACEMENT (produto pai × filho), com cache. */
  matrizGlobal(idPlacement: number | null): Mat4 {
    if (idPlacement === null) return IDENTIDADE;
    const emCache = this.cachePlacement.get(idPlacement);
    if (emCache) return emCache;
    const attrs = this.atributosDe(idPlacement);
    const pai = ref(attrs[0]);
    const matriz = produto(
      pai === null ? IDENTIDADE : this.matrizGlobal(pai),
      this.matrizDeEixos(ref(attrs[1])),
    );
    this.cachePlacement.set(idPlacement, matriz);
    return matriz;
  }

  /** IFCAXIS2PLACEMENT3D -> matriz. Z padrão (0,0,1); X ortogonalizado por Gram-Schmidt. */
  matrizDeEixos(idEixos: number | null): Mat4 {
    if (idEixos === null) return IDENTIDADE;
    const attrs = this.atributosDe(idEixos);
    const local = this.coordenadas(ref(attrs[0]));
    const refZ = ref(attrs[1]);
    const z: Vetor3 = refZ === null ? [0, 0, 1] : unitario(this.coordenadas(refZ));
    const refX = ref(attrs[2]);
    const bruto: Vetor3 =
      refX === null ? (Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]) : this.coordenadas(refX);
    const projecao = escalar(bruto, z);
    const x = unitario([
      bruto[0] - z[0] * projecao,
      bruto[1] - z[1] * projecao,
      bruto[2] - z[2] * projecao,
    ]);
    const y = cruzado(z, x);
    return [
      [x[0], y[0], z[0], local[0]],
      [x[1], y[1], z[1], local[1]],
      [x[2], y[2], z[2], local[2]],
      [0, 0, 0, 1],
    ];
  }
}

function lerAplicacao(cabecalho: string): string {
  const inicio = cabecalho.indexOf("FILE_NAME");
  if (inicio < 0) return "";
  const abertura = cabecalho.indexOf("(", inicio);
  if (abertura < 0) return "";
  const fim = fecharParenteses(cabecalho, abertura);
  if (fim < 0) return "";
  return texto(atributos(cabecalho.slice(abertura + 1, fim))[5]);
}

function lerEscalaDeComprimento(entidades: Map<number, EntidadeStep>): number {
  let escala = 1;
  for (const entidade of entidades.values()) {
    if (entidade.tipo !== "IFCSIUNIT" || !entidade.args.includes(".LENGTHUNIT.")) continue;
    if (entidade.args.includes(".MILLI.")) escala = 0.001;
  }
  return escala;
}

export function lerStep(fonte: string): IndiceStep {
  return new IndiceStep(fonte);
}
