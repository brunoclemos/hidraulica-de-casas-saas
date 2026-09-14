// Rede hidráulica lida do IFC: elementos de fluxo, portas, grafo de conectividade,
// componentes conexas, caminhada, corte em equipamento e sentido do fluxo.
//
// O Revit 2027 em IFC2X3 exporta só as 4 classes genéricas + proxy; os nomes IFC4
// entram na lista porque custam zero e permitem ler um arquivo de outro exportador.

import {
  IndiceStep,
  Mat4,
  Vetor3,
  aplicarDirecao,
  aplicarPonto,
  atributos,
  distancia,
  escalar,
  numero,
  ref,
  refs,
  texto,
  enumeracao,
} from "./step";
import type { ElementoForaDeCadeia } from "./tipos";

const CLASSES_FLUXO = new Set([
  "IFCFLOWSEGMENT",
  "IFCPIPESEGMENT",
  "IFCFLOWFITTING",
  "IFCPIPEFITTING",
  "IFCFLOWCONTROLLER",
  "IFCVALVE",
  "IFCFLOWTERMINAL",
  "IFCSANITARYTERMINAL",
  "IFCFLOWMOVINGDEVICE",
  "IFCPUMP",
  "IFCTANK",
  "IFCFLOWSTORAGEDEVICE",
  "IFCENERGYCONVERSIONDEVICE",
  "IFCBUILDINGELEMENTPROXY",
  "IFCDISTRIBUTIONELEMENT",
]);

const CLASSES_TUBO = new Set(["IFCFLOWSEGMENT", "IFCPIPESEGMENT"]);

/** Equipamento que TERMINA uma cadeia e COMEÇA a próxima (reservatório, boiler, caixa). */
const EQUIPAMENTO_DE_CORTE = /reservat|boiler|aquecedor|caixa|tanque|cisterna/i;
/** Equipamento que fica DENTRO do trecho e pede o incremento em mca. */
export const EQUIPAMENTO_INLINE = /pressuriz|bomba|pump/i;
const FONTE_SEMPRE = /tanque|caixa|cisterna/i;
const FONTE_OU_DESTINO = /reservat|boiler|aquecedor/i;

/** Duas portas soltas a menos que isto uma da outra viram aresta (o Revit deixa folgas). */
const TOLERANCIA_MERGE_M = 0.02;

const ANGULOS_ESPERADOS = [0, 45, 90];
const TOLERANCIA_ANGULO = 10;

const SEM_VIZINHOS: ReadonlySet<number> = new Set<number>();

export interface PortaIfc {
  id: number;
  elemento: number;
  pos: Vetor3;
  eixo: Vetor3;
  /** SOURCE | SINK | SOURCEANDSINK | NOTDEFINED */
  fluxo: string;
}

export interface SegmentoIfc {
  /** Diâmetro externo em mm, do perfil da extrusão. */
  dExtMm: number;
  perfilNome: string;
  /** Profundidade da extrusão em m; NaN quando o tubo é um disco varrido (curvo). */
  compExtrusao: number;
  /** Pset_FlowSegmentPipeSegment.Length em m, quando o exportador escreveu. */
  compPset: number | null;
}

export interface ParteDaCadeia {
  origem: number | null;
  destino: number | null;
  elementos: number[];
}

export interface Caminhada {
  ordem: number[];
  /** Nós de grau >= 3. A fase 1 segue um caminho só e reporta. */
  bifurcacoes: number;
}

export type RegraBruta =
  | "equipamento na origem"
  | "equipamento no destino"
  | "porta solta de entrada/saída"
  | "portas internas"
  | "indefinido";

export interface SentidoDaParte {
  dir: 1 | -1;
  regra: RegraBruta;
  confiavel: boolean;
}

export const ehAguaQuente = (sistema: string): boolean => /(^|\s)AQ|quente/i.test(sistema);
export const ehAguaFria = (sistema: string): boolean => /(^|\s)AF|fria/i.test(sistema);

function maisFrequente(valores: string[]): string {
  const contagem = new Map<string, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  let melhor = "";
  let maior = 0;
  for (const [v, n] of contagem) {
    if (n > maior) {
      maior = n;
      melhor = v;
    }
  }
  return melhor;
}

export class Rede {
  readonly indice: IndiceStep;
  readonly elementos: number[] = [];
  readonly portas = new Map<number, PortaIfc>();
  readonly portasDeElemento = new Map<number, number[]>();
  readonly elementoDaPorta = new Map<number, number>();
  /** Porta -> porta conectada (IFCRELCONNECTSPORTS ou merge geométrico). */
  readonly portaVizinha = new Map<number, number>();
  readonly segmentos = new Map<number, SegmentoIfc>();
  readonly componentes: number[][] = [];
  readonly isolados: ElementoForaDeCadeia[] = [];
  /** Pares de portas soltas unidos por proximidade. */
  readonly merges: [number, number][] = [];
  /** O exportador escreveu conectividade de portas? Sem isso não há cadeia nenhuma. */
  readonly temConectividade: boolean;

  private readonly adjacencia = new Map<number, Set<number>>();
  private readonly sistemaDe = new Map<number, string>();
  private readonly descricaoSistemaDe = new Map<number, string>();
  private readonly pavimentoDe = new Map<number, string>();

  constructor(indice: IndiceStep) {
    this.indice = indice;
    for (const entidade of indice.entidades.values()) {
      if (CLASSES_FLUXO.has(entidade.tipo)) this.elementos.push(entidade.id);
    }
    for (const id of this.elementos) this.adjacencia.set(id, new Set());

    let paresDeclarados = 0;
    for (const entidade of indice.entidades.values()) {
      if (entidade.tipo === "IFCRELCONNECTSPORTTOELEMENT") {
        const attrs = atributos(entidade.args);
        this.registrarPorta(ref(attrs[4]), ref(attrs[5]));
      } else if (entidade.tipo === "IFCRELNESTS") {
        // IFC4 pendura a porta no elemento por nesting, não por relação dedicada.
        const attrs = atributos(entidade.args);
        const pai = ref(attrs[4]);
        for (const filho of refs(attrs[5])) {
          if (indice.tipoDe(filho) === "IFCDISTRIBUTIONPORT") this.registrarPorta(filho, pai);
        }
      } else if (entidade.tipo === "IFCRELCONNECTSPORTS") {
        const attrs = atributos(entidade.args);
        const a = ref(attrs[4]);
        const b = ref(attrs[5]);
        if (a !== null && b !== null) {
          this.portaVizinha.set(a, b);
          this.portaVizinha.set(b, a);
          paresDeclarados++;
        }
      }
    }
    this.temConectividade = paresDeclarados > 0;

    for (const [idPorta, elemento] of this.elementoDaPorta) {
      const attrs = indice.atributosDe(idPorta);
      const matriz: Mat4 = indice.matrizGlobal(ref(attrs[5]));
      this.portas.set(idPorta, {
        id: idPorta,
        elemento,
        pos: aplicarPonto(matriz, [0, 0, 0], indice.escala),
        eixo: unitarioSeguro(aplicarDirecao(matriz, [0, 0, 1])),
        fluxo: enumeracao(attrs[7]),
      });
    }

    for (const [a, b] of this.portaVizinha) this.ligar(a, b);
    this.unirPortasSoltas();
    this.lerSistemasEPavimentos();
    this.lerSegmentos();
    this.montarComponentes();
  }

  private registrarPorta(idPorta: number | null, idElemento: number | null): void {
    if (idPorta === null || idElemento === null) return;
    this.elementoDaPorta.set(idPorta, idElemento);
    const lista = this.portasDeElemento.get(idElemento);
    if (lista) lista.push(idPorta);
    else this.portasDeElemento.set(idElemento, [idPorta]);
  }

  private ligar(portaA: number, portaB: number): void {
    const a = this.elementoDaPorta.get(portaA);
    const b = this.elementoDaPorta.get(portaB);
    if (a === undefined || b === undefined || a === b) return;
    this.adjacencia.get(a)?.add(b);
    this.adjacencia.get(b)?.add(a);
  }

  // O Revit deixou uma válvula isolada entre dois conectores de cobre sem escrever a
  // relação de portas: sem este merge a cadeia de água quente vem partida em duas.
  private unirPortasSoltas(): void {
    const soltas: number[] = [];
    for (const idPorta of this.elementoDaPorta.keys()) {
      if (!this.portaVizinha.has(idPorta)) soltas.push(idPorta);
    }
    for (let i = 0; i < soltas.length; i++) {
      for (let j = i + 1; j < soltas.length; j++) {
        const p = this.portas.get(soltas[i]);
        const q = this.portas.get(soltas[j]);
        if (!p || !q || p.elemento === q.elemento) continue;
        if (distancia(p.pos, q.pos) >= TOLERANCIA_MERGE_M) continue;
        this.ligar(p.id, q.id);
        this.portaVizinha.set(p.id, q.id);
        this.portaVizinha.set(q.id, p.id);
        this.merges.push([p.id, q.id]);
      }
    }
  }

  private lerSistemasEPavimentos(): void {
    const indice = this.indice;
    for (const entidade of indice.entidades.values()) {
      if (entidade.tipo === "IFCRELASSIGNSTOGROUP") {
        const attrs = atributos(entidade.args);
        // [5] é RelatedObjectsType; o grupo é o [6]. Trocar isso deixa TODO sistema vazio.
        const grupo = ref(attrs[6]);
        const tipoGrupo = indice.tipoDe(grupo);
        if (tipoGrupo !== "IFCSYSTEM" && tipoGrupo !== "IFCDISTRIBUTIONSYSTEM") continue;
        const nome = indice.nomeDe(grupo);
        const attrsGrupo = indice.atributosDe(grupo);
        // O Revit escreve "2.Água Quente Doméstica" em ObjectType [4] e deixa
        // Description [3] vazio; outros exportadores usam o Description.
        const descricao = texto(attrsGrupo[3]) || texto(attrsGrupo[4]);
        for (const elemento of refs(attrs[4])) {
          this.sistemaDe.set(elemento, nome);
          this.descricaoSistemaDe.set(elemento, descricao);
        }
      } else if (entidade.tipo === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
        const attrs = atributos(entidade.args);
        const nome = indice.nomeDe(ref(attrs[5]));
        for (const elemento of refs(attrs[4])) this.pavimentoDe.set(elemento, nome);
      }
    }
  }

  private lerSegmentos(): void {
    const indice = this.indice;
    for (const elemento of this.elementos) {
      if (!CLASSES_TUBO.has(indice.tipoDe(elemento))) continue;
      const forma = ref(indice.atributosDe(elemento)[6]);
      if (forma === null) continue;
      const segmento = this.lerSolidoDoTubo(forma);
      if (segmento) this.segmentos.set(elemento, segmento);
    }
    this.lerComprimentosDePset();
  }

  private lerSolidoDoTubo(idForma: number): SegmentoIfc | null {
    const indice = this.indice;
    for (const idRepresentacao of refs(indice.entidades.get(idForma)?.args ?? "")) {
      if (indice.tipoDe(idRepresentacao) !== "IFCSHAPEREPRESENTATION") continue;
      for (const idItem of refs(indice.atributosDe(idRepresentacao)[3])) {
        const tipo = indice.tipoDe(idItem);
        if (tipo === "IFCEXTRUDEDAREASOLID") {
          const attrs = indice.atributosDe(idItem);
          const perfil = ref(attrs[0]);
          const tipoPerfil = indice.tipoDe(perfil);
          if (tipoPerfil !== "IFCCIRCLEPROFILEDEF" && tipoPerfil !== "IFCCIRCLEHOLLOWPROFILEDEF") {
            continue;
          }
          const attrsPerfil = indice.atributosDe(perfil);
          const raio = numero(attrsPerfil[3]);
          if (!(raio > 0)) continue;
          return {
            dExtMm: raio * 2 * indice.escala * 1000,
            perfilNome: texto(attrsPerfil[1]),
            compExtrusao: numero(attrs[3]) * indice.escala,
            compPset: null,
          };
        }
        if (tipo === "IFCSWEPTDISKSOLID") {
          // tubo curvo: o raio está direto no sólido e não há profundidade de extrusão
          const raio = numero(indice.atributosDe(idItem)[1]);
          if (!(raio > 0)) continue;
          return {
            dExtMm: raio * 2 * indice.escala * 1000,
            perfilNome: "",
            compExtrusao: NaN,
            compPset: null,
          };
        }
      }
    }
    return null;
  }

  private lerComprimentosDePset(): void {
    const indice = this.indice;
    for (const entidade of indice.entidades.values()) {
      if (entidade.tipo !== "IFCRELDEFINESBYPROPERTIES") continue;
      const attrs = atributos(entidade.args);
      const idPset = ref(attrs[5]);
      if (indice.tipoDe(idPset) !== "IFCPROPERTYSET") continue;
      if (indice.nomeDe(idPset) !== "Pset_FlowSegmentPipeSegment") continue;
      for (const idPropriedade of refs(indice.atributosDe(idPset)[4])) {
        const propriedade = indice.atributosDe(idPropriedade);
        if (texto(propriedade[0]) !== "Length") continue;
        const valor = Number(propriedade[2]?.match(/\(([^)]*)\)/)?.[1]) * indice.escala;
        if (!Number.isFinite(valor)) continue;
        for (const elemento of refs(attrs[4])) {
          const segmento = this.segmentos.get(elemento);
          if (segmento) segmento.compPset = valor;
        }
      }
    }
  }

  private montarComponentes(): void {
    const visto = new Set<number>();
    for (const raiz of this.elementos) {
      if (visto.has(raiz) || !this.portasDe(raiz).length) continue;
      const pilha = [raiz];
      const componente: number[] = [];
      visto.add(raiz);
      while (pilha.length) {
        const atual = pilha.pop() as number;
        componente.push(atual);
        for (const vizinho of this.vizinhos(atual)) {
          if (visto.has(vizinho)) continue;
          visto.add(vizinho);
          pilha.push(vizinho);
        }
      }
      this.componentes.push(componente);
    }
    const emCadeia = new Set<number>();
    for (const componente of this.componentes) {
      if (componente.length > 1) for (const elemento of componente) emCadeia.add(elemento);
    }
    for (const elemento of this.elementos) {
      if (emCadeia.has(elemento)) continue;
      this.isolados.push({
        idIfc: elemento,
        familia: this.familia(elemento),
        motivo: this.portasDe(elemento).length ? "porta sem conexão" : "sem porta",
      });
    }
  }

  vizinhos(elemento: number): ReadonlySet<number> {
    return this.adjacencia.get(elemento) ?? SEM_VIZINHOS;
  }

  portasDe(elemento: number): number[] {
    return this.portasDeElemento.get(elemento) ?? [];
  }

  nome(elemento: number): string {
    return this.indice.nomeDe(elemento);
  }

  /** "AQ_Aquatherm_Joelho 45_90:Standard:5163657" -> "AQ_Aquatherm_Joelho 45_90". */
  familia(elemento: number): string {
    return this.nome(elemento).split(":")[0];
  }

  classe(elemento: number): string {
    return this.indice.tipoDe(elemento);
  }

  sistema(elemento: number): string {
    return this.sistemaDe.get(elemento) ?? "";
  }

  descricaoSistema(elemento: number): string {
    return this.descricaoSistemaDe.get(elemento) ?? "";
  }

  pavimento(elemento: number): string {
    return this.pavimentoDe.get(elemento) ?? "";
  }

  sistemaPredominante(elementos: number[]): { nome: string; descricao: string } {
    return {
      nome: maisFrequente(elementos.map((e) => this.sistema(e))),
      descricao: maisFrequente(elementos.map((e) => this.descricaoSistema(e))),
    };
  }

  /**
   * Graus entre os eixos das duas primeiras portas, arredondado para 0, 45 ou 90.
   * Usa o valor ABSOLUTO do produto escalar porque o Revit exporta a normal de algumas
   * portas apontando para dentro (20 dos 79 tubos dão 0° em vez de 180°).
   */
  anguloEixos(elemento: number): number | null {
    const portas = this.portasDe(elemento);
    if (portas.length < 2) return null;
    const a = this.portas.get(portas[0]);
    const b = this.portas.get(portas[1]);
    if (!a || !b) return null;
    const graus = (Math.acos(Math.min(1, Math.abs(escalar(a.eixo, b.eixo)))) * 180) / Math.PI;
    let melhor = ANGULOS_ESPERADOS[0];
    for (const candidato of ANGULOS_ESPERADOS) {
      if (Math.abs(candidato - graus) < Math.abs(melhor - graus)) melhor = candidato;
    }
    return Math.abs(melhor - graus) <= TOLERANCIA_ANGULO ? melhor : null;
  }

  ehEquipamentoDeCorte(elemento: number): boolean {
    if (EQUIPAMENTO_DE_CORTE.test(this.familia(elemento))) return true;
    const classe = this.classe(elemento);
    const muitasPortas = this.portasDe(elemento).length > 2;
    return (
      muitasPortas &&
      (classe === "IFCFLOWTERMINAL" || classe === "IFCTANK" || classe === "IFCFLOWSTORAGEDEVICE")
    );
  }

  ehTubo(elemento: number): boolean {
    return this.segmentos.has(elemento);
  }

  /** Começa numa ponta (grau <= 1) e segue o vizinho ainda não visitado. */
  caminhar(componente: number[]): Caminhada {
    let bifurcacoes = 0;
    let inicio: number | null = null;
    for (const elemento of componente) {
      const grau = this.vizinhos(elemento).size;
      if (grau >= 3) bifurcacoes++;
      if (grau <= 1 && inicio === null) inicio = elemento;
    }
    const ordem: number[] = [];
    const visto = new Set<number>();
    let atual: number | null = inicio ?? componente[0] ?? null;
    if (atual !== null) visto.add(atual);
    while (atual !== null) {
      ordem.push(atual);
      let proximo: number | null = null;
      for (const vizinho of this.vizinhos(atual)) {
        if (!visto.has(vizinho)) {
          proximo = vizinho;
          break;
        }
      }
      if (proximo === null) break;
      visto.add(proximo);
      atual = proximo;
    }
    return { ordem, bifurcacoes };
  }

  /** O equipamento de corte vira destino da parte anterior e origem da seguinte. */
  cortarEmEquipamentos(ordem: number[]): ParteDaCadeia[] {
    const partes: ParteDaCadeia[] = [];
    let atual: ParteDaCadeia = { origem: null, destino: null, elementos: [] };
    for (const elemento of ordem) {
      if (this.ehEquipamentoDeCorte(elemento)) {
        atual.destino = elemento;
        if (atual.elementos.length) partes.push(atual);
        atual = { origem: elemento, destino: null, elementos: [] };
      } else {
        atual.elementos.push(elemento);
      }
    }
    if (atual.elementos.length) partes.push(atual);
    return partes;
  }

  /**
   * Sentido do fluxo. Regras em ordem; a primeira que decide, decide.
   * As portas internas ficam por último de propósito: no arquivo do cliente a família
   * "Válvula Misturadora Termostática" tem os conectores invertidos no Revit e os votos
   * dão 15 × 16 na cadeia de água quente.
   */
  sentidoDaParte(parte: ParteDaCadeia): SentidoDaParte {
    const { origem, destino, elementos } = parte;
    const sistema = maisFrequente(
      elementos.map((e) => `${this.sistema(e)} ${this.descricaoSistema(e)}`),
    );
    const quente = ehAguaQuente(sistema);
    const fria = ehAguaFria(sistema);
    const papel = (elemento: number | null): "fonte" | "destino" | "ambiguo" | null => {
      if (elemento === null) return null;
      const familia = this.familia(elemento);
      if (FONTE_SEMPRE.test(familia)) return "fonte";
      if (FONTE_OU_DESTINO.test(familia)) return quente ? "fonte" : fria ? "destino" : "ambiguo";
      return "ambiguo";
    };
    const papelOrigem = papel(origem);
    const papelDestino = papel(destino);
    if (papelOrigem === "fonte") return { dir: 1, regra: "equipamento na origem", confiavel: true };
    if (papelDestino === "fonte") {
      return { dir: -1, regra: "equipamento no destino", confiavel: true };
    }
    if (papelOrigem === "destino") {
      return { dir: -1, regra: "equipamento na origem", confiavel: true };
    }
    if (papelDestino === "destino") {
      return { dir: 1, regra: "equipamento no destino", confiavel: true };
    }

    const fluxoSolto = (elemento: number | undefined): string => {
      if (elemento === undefined) return "";
      for (const idPorta of this.portasDe(elemento)) {
        if (!this.portaVizinha.has(idPorta)) return this.portas.get(idPorta)?.fluxo ?? "";
      }
      return "";
    };
    const noInicio = fluxoSolto(elementos[0]);
    const noFim = fluxoSolto(elementos[elementos.length - 1]);
    if (noFim === "SOURCE" || noInicio === "SINK") {
      return { dir: 1, regra: "porta solta de entrada/saída", confiavel: true };
    }
    if (noInicio === "SOURCE" || noFim === "SINK") {
      return { dir: -1, regra: "porta solta de entrada/saída", confiavel: true };
    }

    let aFavor = 0;
    let contra = 0;
    for (let i = 1; i < elementos.length; i++) {
      for (const idPorta of this.portasDe(elementos[i])) {
        const vizinha = this.portaVizinha.get(idPorta);
        if (vizinha === undefined || this.elementoDaPorta.get(vizinha) !== elementos[i - 1]) {
          continue;
        }
        const daqui = this.portas.get(idPorta)?.fluxo ?? "";
        const dali = this.portas.get(vizinha)?.fluxo ?? "";
        if (daqui === "SINK" || dali === "SOURCE") aFavor++;
        if (daqui === "SOURCE" || dali === "SINK") contra++;
      }
    }
    const total = aFavor + contra;
    if (total && Math.max(aFavor, contra) / total >= 0.75) {
      return { dir: aFavor >= contra ? 1 : -1, regra: "portas internas", confiavel: true };
    }
    return { dir: 1, regra: "indefinido", confiavel: false };
  }
}

function unitarioSeguro(v: Vetor3): Vetor3 {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n ? [v[0] / n, v[1] / n, v[2] / n] : v;
}

export function montarRede(indice: IndiceStep): Rede {
  return new Rede(indice);
}
