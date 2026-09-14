// Família do IFC -> conexão do catálogo do app, campo dedicado do trecho ou ignorado.
//
// A tabela foi levantada por censo do arquivo do cliente (37 famílias). A ORDEM importa:
// "AF_Engate Flexível Pressurizador" precisa ser testada antes de /pressuriz/, senão o
// engate vira pressurizador.
//
// Nada some em silêncio: o que não mapeia vira "ignorado" com motivo e aparece na revisão.

import type { Material } from "@/lib/calc/pvc-cpvc-pressao";
import { EQUIPAMENTO_INLINE } from "./rede";
import type { DestinoItem } from "./tipos";

export interface ItemParaClassificar {
  familia: string;
  classe: string;
  /** 0, 45 ou 90; null quando o elemento tem menos de 2 portas ou o ângulo foge da tabela. */
  anguloEixos: number | null;
  entreBitolasDiferentes: boolean;
}

const exato = (id: string, motivo: string): DestinoItem => ({
  tipo: "conexao",
  id,
  confianca: "exato",
  motivo,
});

const heuristica = (id: string, motivo: string): DestinoItem => ({
  tipo: "conexao",
  id,
  confianca: "heuristico",
  motivo,
});

const dedicado = (campo: "qtdValvulaMisturadora" | "monocomando" | "incrementoPressurizador", motivo: string): DestinoItem => ({
  tipo: "campo",
  campo,
  confianca: "exato",
  motivo,
});

const ignorado = (motivo: string): DestinoItem => ({
  tipo: "ignorado",
  confianca: "nao_mapeado",
  motivo,
});

const ANGULO_RETO = "ângulo de 90° entre os eixos das portas";
const ANGULO_45 = "ângulo de 45° entre os eixos das portas";
const ANGULO_ESTRANHO = "ângulo entre as portas fora de 0°, 45° e 90°";

export function classificarItem(item: ItemParaClassificar, material: Material): DestinoItem {
  const { familia, classe, anguloEixos: angulo, entreBitolasDiferentes } = item;
  const cpvc = material === "CPVC";

  if (/^AN_/.test(familia)) return ignorado("família de anotação (prefixo AN_)");

  if (/misturadora termost/i.test(familia)) {
    return cpvc
      ? dedicado("qtdValvulaMisturadora", "válvula misturadora termostática")
      : ignorado("válvula misturadora só existe no CPVC");
  }
  if (/base misturador monocomando/i.test(familia)) {
    return dedicado("monocomando", "monocomando no ponto: escolha a curva DOCOL");
  }
  if (/engate flex/i.test(familia)) {
    return ignorado("engate flexível: sem comprimento equivalente na tabela");
  }
  if (EQUIPAMENTO_INLINE.test(familia)) {
    return dedicado("incrementoPressurizador", "pressurizador no trecho: informe o incremento (mca)");
  }
  if (/v[áa]lvula de esfera/i.test(familia)) {
    return heuristica(
      "reg_gaveta",
      "válvula de esfera contada como registro de gaveta aberto (passagem plena)",
    );
  }
  if (/reten[çc][ãa]o/i.test(familia)) {
    return heuristica("valv_retencao", "válvula de retenção contada como tipo leve");
  }
  if (/al[íi]vio/i.test(familia)) {
    return ignorado("válvula de alívio: não participa da perda de carga do trecho");
  }
  if (/joelho 90 de transi/i.test(familia)) {
    return cpvc
      ? heuristica("joelho_90_c_latao", "joelho de transição contado como joelho 90° c/ latão")
      : ignorado("joelho de transição sem equivalente em PVC");
  }
  if (/joelho|cotovelo/i.test(familia)) {
    if (angulo === 90) return exato("joelho90", ANGULO_RETO);
    if (angulo === 45) return exato("joelho_45", ANGULO_45);
    return heuristica("joelho90", ANGULO_ESTRANHO);
  }
  if (/curva/i.test(familia)) {
    if (angulo !== 45) return exato("curva90", "curva de 90°");
    return cpvc
      ? heuristica("joelho_45", "CPVC não tem curva 45°: contada como joelho 45°")
      : exato("curva_45", ANGULO_45);
  }
  if (/(^|_|\s)t[eê](_|\s|$)/i.test(familia)) {
    if (cpvc && entreBitolasDiferentes) {
      return heuristica(
        "te_passagem_direta_e_saida_lateral_de_reducao_central",
        angulo === 0
          ? "tê entre bitolas diferentes: redução central"
          : "tê lateral entre bitolas diferentes",
      );
    }
    if (cpvc) {
      return exato(
        "te_direta",
        "a tabela CPVC usa o mesmo comprimento para passagem direta e saída lateral",
      );
    }
    return angulo === 0
      ? exato("te_direta", "passagem direta: portas colineares")
      : exato("te_lateral", "saída lateral: portas não colineares");
  }
  if (/uni[ãa]o/i.test(familia)) {
    return cpvc
      ? exato("uniao", "união: mesmo diâmetro dos dois lados")
      : ignorado("união sem equivalente em PVC");
  }
  if (/luva de transi|conector/i.test(familia)) {
    return cpvc
      ? heuristica(
          "adaptador_de_transicao",
          "conector/luva de transição contado como adaptador de transição",
        )
      : ignorado("sem equivalente em PVC");
  }
  if (/bucha de redu/i.test(familia)) {
    return cpvc
      ? heuristica("bucha_de_reducao_ate_2_dn", "bucha contada como redução até 2 DN")
      : ignorado("bucha de redução sem equivalente em PVC");
  }
  if (/luva/i.test(familia)) {
    return cpvc
      ? heuristica("luva", "luva com bucha de latão contada como luva simples")
      : ignorado("luva sem equivalente em PVC");
  }
  if (/niple/i.test(familia)) {
    return ignorado("niple: sem comprimento equivalente na tabela");
  }
  if (/adaptador/i.test(familia)) {
    return cpvc
      ? heuristica("adaptador_de_transicao", "adaptador contado como adaptador de transição")
      : ignorado("adaptador sem equivalente em PVC");
  }
  return ignorado(`família não reconhecida (${classe})`);
}
