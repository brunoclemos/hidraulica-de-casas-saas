// Tipos públicos do importador de IFC (feedback do cliente 13/set: subir o .ifc e o
// app preencher diâmetro, comprimento, sobe/desce e conexões por trecho).
// O importador NÃO escreve no projeto: emite esta estrutura, a tela de revisão mostra,
// o engenheiro confere e só então vira TrechoSalvo.

import type { Material } from "@/lib/calc/pvc-cpvc-pressao";

export type Confianca = "exato" | "heuristico" | "nao_mapeado";

/** Campos do Trecho que ficam fora do grid de conexões e que o IFC consegue sinalizar. */
export type CampoDedicado = "qtdValvulaMisturadora" | "monocomando" | "incrementoPressurizador";

/** Para onde um elemento do IFC vai dentro de um Trecho do app. */
export type DestinoItem =
  | { tipo: "conexao"; id: string; confianca: Confianca; motivo: string }
  | { tipo: "campo"; campo: CampoDedicado; confianca: Confianca; motivo: string }
  | { tipo: "ignorado"; confianca: "nao_mapeado"; motivo: string };

export interface ItemImportado {
  idIfc: number;
  familia: string;
  classe: string;
  /** Graus entre os eixos das duas primeiras portas (0 | 45 | 90); null com menos de 2 portas. */
  anguloEixos: number | null;
  /** Tubo antes e tubo depois com diâmetro externo diferente (tê/bucha de redução). */
  entreBitolasDiferentes: boolean;
  destino: DestinoItem;
}

export type MaterialIfc = "PVC" | "CPVC" | "COBRE" | "PPR" | "desconhecido";

export interface TrechoImportado {
  material: Material;
  materialIfc: MaterialIfc;
  /** Diâmetro EXTERNO lido do perfil da extrusão, em mm (34.9). */
  diametroIfcMm: number;
  /** Comercial do app depois do snap (35); null quando fica fora da tabela. */
  diametro: number | null;
  confiancaDiametro: Confianca;
  comprimentoReal: number;
  sobe: number;
  desce: number;
  qtdTubos: number;
  pavimentos: string[];
  itens: ItemImportado[];
  idsIfc: number[];
}

export type RegraSentido =
  | "equipamento na origem"
  | "equipamento no destino"
  | "porta solta de entrada/saída"
  | "portas internas"
  | "indefinido";

export interface CadeiaImportada {
  id: string;
  sistema: string;
  descricaoSistema: string;
  origem: string;
  destino: string;
  sentido: { regra: RegraSentido; confiavel: boolean };
  /** Nós com 3+ vizinhos. A fase 1 só reporta: a caminhada segue um caminho só. */
  bifurcacoes: number;
  trechos: TrechoImportado[];
}

export interface ElementoForaDeCadeia {
  idIfc: number;
  familia: string;
  motivo: string;
}

export interface ImportacaoIfc {
  arquivo: {
    nome: string;
    schema: string;
    unidade: "m" | "mm";
    aplicacao: string;
    bytes: number;
    entidades: number;
    ms: number;
  };
  cadeias: CadeiaImportada[];
  isolados: ElementoForaDeCadeia[];
  avisos: string[];
}

export type CodigoErroIfc = "nao_e_ifc" | "sem_dados";

/** Falha de leitura que a UI traduz em mensagem para o engenheiro. */
export class ErroIfc extends Error {
  readonly codigo: CodigoErroIfc;

  constructor(codigo: CodigoErroIfc, mensagem: string) {
    super(mensagem);
    this.name = "ErroIfc";
    this.codigo = codigo;
  }
}
