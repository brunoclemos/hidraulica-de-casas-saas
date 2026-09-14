// Cadeia orientada -> trechos do app. Regra de corte do cliente: mudou o diâmetro
// comercial (ou o material da tabela), começa trecho novo.
//
// Uma conexão pertence ao trecho de MONTANTE: a redução 28 -> 22 fica no trecho de 28,
// que é a bitola pela qual a tabela Tigre lista o tê de redução.

import {
  DIAMETROS,
  Material,
  QtdConexoes,
  TrechoSalvo,
  trechoPadrao,
} from "@/lib/calc/pvc-cpvc-pressao";
import { ItemParaClassificar, classificarItem } from "./mapeamento";
import { Rede, montarRede } from "./rede";
import { distancia, lerStep } from "./step";
import type {
  CadeiaImportada,
  Confianca,
  DestinoItem,
  ElementoForaDeCadeia,
  ImportacaoIfc,
  ItemImportado,
  MaterialIfc,
  TrechoImportado,
} from "./tipos";

/** Tolerância do snap do diâmetro externo do IFC para o comercial da tabela do app. */
const TOLERANCIA_SNAP_MM = 1.5;

const MOTIVO_COBRE =
  "cobre lido pela tabela CPVC (diâmetro interno e rugosidade diferem)";
const MOTIVO_MATERIAL_DESCONHECIDO =
  "material não identificado no IFC: lido pela tabela CPVC";

export interface DiametroSnap {
  material: Material;
  diametro: number | null;
  confianca: Confianca;
}

/** Nome do perfil da extrusão (ou do elemento) -> material que o IFC diz ser. */
export function materialDoPerfil(nome: string): MaterialIfc {
  if (/aquatherm|cpvc/i.test(nome)) return "CPVC";
  if (/soldav|marrom|pvc/i.test(nome)) return "PVC";
  if (/cobre|copper/i.test(nome)) return "COBRE";
  if (/ppr/i.test(nome)) return "PPR";
  return "desconhecido";
}

/**
 * Diâmetro externo do IFC -> comercial do app. Cobre, PPR e desconhecido tentam a
 * tabela CPVC: as bitolas de cobre (15/22/28/35/42/54) coincidem numericamente com a
 * série CPVC, o que dá um comprimento equivalente plausível para o engenheiro revisar.
 */
export function snapDiametro(dExtMm: number, materialIfc: MaterialIfc): DiametroSnap {
  const material: Material = materialIfc === "PVC" ? "PVC" : "CPVC";
  const comerciais = DIAMETROS[material];
  let melhor = comerciais[0].comercial;
  for (const { comercial } of comerciais) {
    if (Math.abs(comercial - dExtMm) < Math.abs(melhor - dExtMm)) melhor = comercial;
  }
  const exato = materialIfc === "PVC" || materialIfc === "CPVC";
  if (Math.abs(melhor - dExtMm) > TOLERANCIA_SNAP_MM) {
    return { material, diametro: null, confianca: "nao_mapeado" };
  }
  return { material, diametro: melhor, confianca: exato ? "exato" : "heuristico" };
}

export interface CorteEmTrechos {
  trechos: TrechoImportado[];
  avisos: string[];
}

/** Comprimento do tubo: Pset > profundidade da extrusão > distância entre as portas. */
function comprimentoDoTubo(rede: Rede, elemento: number): { valor: number; aviso: string | null } {
  const segmento = rede.segmentos.get(elemento);
  if (segmento) {
    if (segmento.compPset !== null && Number.isFinite(segmento.compPset)) {
      return { valor: segmento.compPset, aviso: null };
    }
    if (Number.isFinite(segmento.compExtrusao)) {
      return { valor: segmento.compExtrusao, aviso: null };
    }
  }
  const portas = rede.portasDe(elemento);
  const a = rede.portas.get(portas[0]);
  const b = rede.portas.get(portas[1]);
  if (a && b) return { valor: distancia(a.pos, b.pos), aviso: null };
  return {
    valor: 0,
    aviso: `tubo #${elemento} sem comprimento no IFC: entrou como 0 m, informe na revisão`,
  };
}

/** O tubo anterior e o seguinte têm diâmetro externo diferente? (tê/bucha de redução) */
function entreBitolasDiferentes(rede: Rede, elementos: number[], posicao: number): boolean {
  let antes: number | undefined;
  for (let i = posicao - 1; i >= 0; i--) {
    if (rede.ehTubo(elementos[i])) {
      antes = elementos[i];
      break;
    }
  }
  const depois = elementos.slice(posicao + 1).find((e) => rede.ehTubo(e));
  if (antes === undefined || depois === undefined) return false;
  const dAntes = rede.segmentos.get(antes)?.dExtMm ?? 0;
  const dDepois = rede.segmentos.get(depois)?.dExtMm ?? 0;
  return Math.round(dAntes) !== Math.round(dDepois);
}

export function cortarEmTrechos(rede: Rede, elementos: number[]): CorteEmTrechos {
  const trechos: TrechoImportado[] = [];
  const avisos: string[] = [];
  // itens que aparecem antes do primeiro tubo (bucha e conectores na saída do boiler)
  const pendentes: { elemento: number; reducao: boolean }[] = [];
  let atual: TrechoImportado | null = null;

  for (let i = 0; i < elementos.length; i++) {
    const elemento = elementos[i];
    const portas = rede.portasDe(elemento);
    const anterior: number | undefined = elementos[i - 1];
    const posterior: number | undefined = elementos[i + 1];
    const entrada =
      portas.find((p) => {
        const vizinha = rede.portaVizinha.get(p);
        return vizinha !== undefined && rede.elementoDaPorta.get(vizinha) === anterior;
      }) ?? null;
    const saida =
      portas.find((p) => {
        if (p === entrada) return false;
        if (i === elementos.length - 1) return true;
        const vizinha = rede.portaVizinha.get(p);
        return vizinha !== undefined && rede.elementoDaPorta.get(vizinha) === posterior;
      }) ??
      portas.find((p) => p !== entrada) ??
      null;
    const zEntrada = entrada === null ? null : rede.portas.get(entrada)?.pos[2];
    const zSaida = saida === null ? null : rede.portas.get(saida)?.pos[2];
    const dz =
      zEntrada === undefined || zEntrada === null || zSaida === undefined || zSaida === null
        ? 0
        : zSaida - zEntrada;

    const segmento = rede.segmentos.get(elemento);
    if (segmento) {
      const materialIfc = materialDoPerfil(segmento.perfilNome || rede.nome(elemento));
      const snap = snapDiametro(segmento.dExtMm, materialIfc);
      const confiancaDiametro: Confianca =
        materialIfc === "COBRE" || materialIfc === "desconhecido" ? "heuristico" : snap.confianca;
      if (!atual || atual.diametro !== snap.diametro || atual.material !== snap.material) {
        atual = {
          material: snap.material,
          materialIfc,
          diametroIfcMm: Math.round(segmento.dExtMm * 10) / 10,
          diametro: snap.diametro,
          confiancaDiametro,
          comprimentoReal: 0,
          sobe: 0,
          desce: 0,
          qtdTubos: 0,
          pavimentos: [],
          itens: [],
          idsIfc: [],
        };
        trechos.push(atual);
        for (const pendente of pendentes.splice(0)) {
          atual.itens.push(
            montarItem(rede, pendente.elemento, pendente.reducao, atual.material, materialIfc),
          );
        }
      }
      atual.qtdTubos++;
      const comprimento = comprimentoDoTubo(rede, elemento);
      atual.comprimentoReal += comprimento.valor;
      if (comprimento.aviso) avisos.push(comprimento.aviso);
    } else {
      const reducao = entreBitolasDiferentes(rede, elementos, i);
      if (atual) atual.itens.push(montarItem(rede, elemento, reducao, atual.material, atual.materialIfc));
      else pendentes.push({ elemento, reducao });
    }

    if (!atual) continue;
    if (dz > 0) atual.sobe += dz;
    else atual.desce += -dz;
    atual.idsIfc.push(elemento);
    const pavimento = rede.pavimento(elemento);
    if (pavimento && !atual.pavimentos.includes(pavimento)) atual.pavimentos.push(pavimento);
  }

  const primeiro = trechos[0];
  if (primeiro) {
    for (const pendente of pendentes) {
      primeiro.itens.push(
        montarItem(rede, pendente.elemento, pendente.reducao, primeiro.material, primeiro.materialIfc),
      );
      primeiro.idsIfc.unshift(pendente.elemento);
    }
  }
  return { trechos, avisos };
}

/**
 * Cobre, PPR e material não identificado não têm tabela própria no app: são lidos pela
 * do CPVC. Isso vale para o tubo E para cada conexão do trecho — o comprimento
 * equivalente sai de outro material, por mais que a família tenha sido reconhecida sem
 * ambiguidade. Devolve null quando o material tem tabela própria.
 */
function motivoDoMaterial(materialIfc: MaterialIfc): string | null {
  if (materialIfc === "PVC" || materialIfc === "CPVC") return null;
  if (materialIfc === "COBRE") return MOTIVO_COBRE;
  if (materialIfc === "desconhecido") return MOTIVO_MATERIAL_DESCONHECIDO;
  return `${materialIfc} lido pela tabela CPVC`;
}

/**
 * Classificação da família rebaixada pelo material do trecho. Campos dedicados não
 * entram: a válvula misturadora e o monocomando perdem pelo Kv e pela curva do
 * fabricante, não pela tabela de comprimento equivalente.
 */
function classificarNoTrecho(
  base: ItemParaClassificar,
  material: Material,
  materialIfc: MaterialIfc,
): DestinoItem {
  const destino = classificarItem(base, material);
  const motivoMaterial = motivoDoMaterial(materialIfc);
  if (!motivoMaterial || destino.tipo !== "conexao" || destino.confianca !== "exato") {
    return destino;
  }
  return { ...destino, confianca: "heuristico", motivo: motivoMaterial };
}

function montarItem(
  rede: Rede,
  elemento: number,
  reducao: boolean,
  material: Material,
  materialIfc: MaterialIfc,
): ItemImportado {
  const base = {
    familia: rede.familia(elemento),
    classe: rede.classe(elemento),
    anguloEixos: rede.anguloEixos(elemento),
    entreBitolasDiferentes: reducao,
  };
  return { idIfc: elemento, ...base, destino: classificarNoTrecho(base, material, materialIfc) };
}

/** Reclassifica os itens do trecho para outro material (o grid de conexões zera junto). */
export function reclassificarItens(
  itens: ItemImportado[],
  material: Material,
  materialIfc: MaterialIfc,
): ItemImportado[] {
  return itens.map((item) => ({
    ...item,
    destino: classificarNoTrecho(item, material, materialIfc),
  }));
}

export function agregarConexoes(itens: ItemImportado[]): QtdConexoes {
  const conexoes: QtdConexoes = {};
  for (const { destino } of itens) {
    if (destino.tipo !== "conexao") continue;
    conexoes[destino.id] = (conexoes[destino.id] ?? 0) + 1;
  }
  return conexoes;
}

export function contarCampo(
  itens: ItemImportado[],
  campo: "qtdValvulaMisturadora" | "monocomando" | "incrementoPressurizador",
): number {
  return itens.filter((i) => i.destino.tipo === "campo" && i.destino.campo === campo).length;
}

/** Motivos que o engenheiro precisa conferir, sem repetir o mesmo texto. */
export function heuristicasDoTrecho(trecho: TrechoImportado, itens: ItemImportado[]): string[] {
  const motivos: string[] = [];
  const motivoMaterial = motivoDoMaterial(trecho.materialIfc);
  if (motivoMaterial) motivos.push(motivoMaterial);
  for (const { destino } of itens) {
    if (destino.confianca === "heuristico" && !motivos.includes(destino.motivo)) {
      motivos.push(destino.motivo);
    }
  }
  return motivos;
}

/** Campos que a tela de revisão deixa o engenheiro mexer antes de inserir. */
export interface EdicaoTrecho {
  material: Material;
  diametro: number;
  comprimentoReal: number;
  sobe: number;
  desce: number;
  conexoes: QtdConexoes;
  /** Itens já reclassificados para `material` (a troca de material zera as conexões). */
  itens: ItemImportado[];
  /** > 0 muda o trecho para vazão manual; 0 deixa no método dos pesos. */
  vazaoLmin: number;
}

/** Estado inicial da linha da revisão: o que o IFC leu, pronto para o engenheiro mexer. */
export function edicaoInicial(trecho: TrechoImportado): EdicaoTrecho {
  return {
    material: trecho.material,
    // 0 = fora da tabela do app; a revisão pede a bitola antes de deixar inserir
    diametro: trecho.diametro ?? 0,
    comprimentoReal: trecho.comprimentoReal,
    sobe: trecho.sobe,
    desce: trecho.desce,
    conexoes: agregarConexoes(trecho.itens),
    itens: trecho.itens,
    vazaoLmin: 0,
  };
}

export interface ContextoInsercao {
  ambiente: string;
  nome: string;
  arquivo: string;
  /** Sistema de água fria: em CPVC a água não está a 40 °C. */
  aguaFria: boolean;
}

export function paraTrechoSalvo(
  trecho: TrechoImportado,
  edicao: EdicaoTrecho,
  contexto: ContextoInsercao,
): TrechoSalvo {
  const base = trechoPadrao(edicao.material);
  const manual = edicao.vazaoLmin > 0;
  return {
    ...base,
    material: edicao.material,
    diametro: edicao.diametro,
    comprimentoReal: edicao.comprimentoReal,
    sobe: edicao.sobe,
    desce: edicao.desce,
    conexoes: edicao.conexoes,
    qtdValvulaMisturadora: contarCampo(edicao.itens, "qtdValvulaMisturadora"),
    temperaturaAgua: contexto.aguaFria ? 20 : base.temperaturaAgua,
    modoVazao: manual ? "manual" : "pesos",
    vazaoManualLmin: manual ? edicao.vazaoLmin : 0,
    ambiente: contexto.ambiente,
    nome: contexto.nome,
    origemIfc: {
      arquivo: contexto.arquivo,
      heuristicas: heuristicasDoTrecho(trecho, edicao.itens),
    },
  };
}

const SCHEMAS_CONHECIDOS = ["IFC2X3", "IFC4", "IFC4X3"];

export function importarIfc(
  fonte: string,
  arquivo: { nome: string; bytes: number },
): ImportacaoIfc {
  const inicio = performance.now();
  const indice = lerStep(fonte);
  const rede = montarRede(indice);
  const avisos: string[] = [];

  if (!SCHEMAS_CONHECIDOS.includes(indice.schema)) {
    avisos.push(
      `Schema ${indice.schema || "não declarado"}: o importador foi validado em IFC 2x3. Confira os trechos.`,
    );
  } else if (indice.schema !== "IFC2X3") {
    avisos.push(`${indice.schema}: validado só com IFC 2x3 do Revit, confira os trechos.`);
  }
  if (rede.merges.length) {
    avisos.push(
      `${rede.merges.length} par(es) de portas soltas unidos por proximidade (até 20 mm).`,
    );
  }
  if (!rede.temConectividade) {
    avisos.push(
      "O IFC não trouxe conectividade (portas). No Revit, exporte com 'Exportar conectores/portas' ligado (IFC 2x3 Coordination View).",
    );
  }

  const cadeias: CadeiaImportada[] = [];
  const isolados: ElementoForaDeCadeia[] = [...rede.isolados];

  for (const componente of rede.componentes) {
    if (componente.length < 2) continue;
    const { ordem, bifurcacoes } = rede.caminhar(componente);
    for (const parte of rede.cortarEmEquipamentos(ordem)) {
      const sentido = rede.sentidoDaParte(parte);
      const inverte = sentido.dir === -1;
      const elementos = inverte ? [...parte.elementos].reverse() : parte.elementos;
      const equipamentoOrigem = inverte ? parte.destino : parte.origem;
      const equipamentoDestino = inverte ? parte.origem : parte.destino;
      const corte = cortarEmTrechos(rede, elementos);
      if (!corte.trechos.length) {
        for (const elemento of elementos) {
          isolados.push({
            idIfc: elemento,
            familia: rede.familia(elemento),
            motivo: "cadeia sem tubo",
          });
        }
        continue;
      }
      avisos.push(...corte.avisos);
      const sistema = rede.sistemaPredominante(elementos);
      cadeias.push({
        id: `cadeia-${cadeias.length + 1}`,
        sistema: sistema.nome,
        descricaoSistema: sistema.descricao,
        origem: pontaDaCadeia(rede, equipamentoOrigem, elementos[0]),
        destino: pontaDaCadeia(rede, equipamentoDestino, elementos[elementos.length - 1]),
        sentido: { regra: sentido.regra, confiavel: sentido.confiavel },
        bifurcacoes,
        trechos: corte.trechos,
      });
      if (bifurcacoes > 0) {
        avisos.push(
          `A cadeia ${cadeias.length} tem ${bifurcacoes} derivação(ões); a caminhada seguiu um caminho só.`,
        );
      }
    }
  }

  return {
    arquivo: {
      nome: arquivo.nome,
      schema: indice.schema,
      unidade: indice.escala === 1 ? "m" : "mm",
      aplicacao: indice.aplicacao,
      bytes: arquivo.bytes,
      entidades: indice.entidades.size,
      ms: Math.round(performance.now() - inicio),
    },
    cadeias,
    isolados,
    avisos,
  };
}

function pontaDaCadeia(rede: Rede, equipamento: number | null, extremidade: number): string {
  return equipamento === null
    ? `extremidade solta (${rede.familia(extremidade)})`
    : rede.familia(equipamento);
}
