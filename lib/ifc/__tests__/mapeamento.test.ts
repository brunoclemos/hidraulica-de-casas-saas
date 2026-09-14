import { describe, expect, it } from "vitest";
import { CONEXOES_CPVC, CONEXOES_PVC, Material } from "@/lib/calc/pvc-cpvc-pressao";
import { ItemParaClassificar, classificarItem } from "../mapeamento";

const item = (familia: string, extra: Partial<ItemParaClassificar> = {}): ItemParaClassificar => ({
  familia,
  classe: "IFCFLOWFITTING",
  anguloEixos: null,
  entreBitolasDiferentes: false,
  ...extra,
});

describe("famílias do arquivo do cliente", () => {
  it("joelho de 45° e de 90° pelo ângulo entre as portas", () => {
    const a45 = classificarItem(item("AQ_Aquatherm_Joelho 45_90", { anguloEixos: 45 }), "CPVC");
    const a90 = classificarItem(item("AQ_Aquatherm_Joelho 45_90", { anguloEixos: 90 }), "CPVC");
    expect(a45).toMatchObject({ tipo: "conexao", id: "joelho_45", confianca: "exato" });
    expect(a90).toMatchObject({ tipo: "conexao", id: "joelho90", confianca: "exato" });
  });

  it("joelho com ângulo fora da tabela cai em joelho 90° marcado para conferir", () => {
    const fora = classificarItem(item("AQ_Cobre_Cotovelo 45_90", { anguloEixos: null }), "CPVC");
    expect(fora).toMatchObject({ tipo: "conexao", id: "joelho90", confianca: "heuristico" });
  });

  it("tê do PVC separa passagem direta de saída lateral", () => {
    expect(classificarItem(item("AF_Soldavel_Te_Reducao", { anguloEixos: 0 }), "PVC")).toMatchObject(
      { id: "te_direta", confianca: "exato" },
    );
    expect(
      classificarItem(item("AF_Soldavel_Te_Reducao", { anguloEixos: 90 }), "PVC"),
    ).toMatchObject({ id: "te_lateral", confianca: "exato" });
  });

  it("tê do CPVC entre bitolas diferentes vira redução central, heurístico", () => {
    expect(
      classificarItem(
        item("AQ_Aquatherm_Te_Reducao", { anguloEixos: 0, entreBitolasDiferentes: true }),
        "CPVC",
      ),
    ).toMatchObject({
      id: "te_passagem_direta_e_saida_lateral_de_reducao_central",
      confianca: "heuristico",
    });
    expect(
      classificarItem(item("AQ_Aquatherm_Te_Reducao", { anguloEixos: 0 }), "CPVC"),
    ).toMatchObject({ id: "te_direta", confianca: "exato" });
  });

  it("curva de 45° em CPVC vira joelho 45° (a tabela CPVC não tem curva 45°)", () => {
    expect(classificarItem(item("AF_Soldavel_Curva 45_90", { anguloEixos: 45 }), "PVC")).toMatchObject(
      { id: "curva_45", confianca: "exato" },
    );
    expect(
      classificarItem(item("AF_Soldavel_Curva 45_90", { anguloEixos: 45 }), "CPVC"),
    ).toMatchObject({ id: "joelho_45", confianca: "heuristico" });
    expect(classificarItem(item("AQ_Aquatherm_Curva 90", { anguloEixos: 90 }), "CPVC")).toMatchObject(
      { id: "curva90", confianca: "exato" },
    );
  });

  it("válvula de esfera entra como registro de gaveta aberto, para conferir", () => {
    const destino = classificarItem(
      item("VLV_Válvula de esfera com alavanca azul - Docol", { classe: "IFCFLOWCONTROLLER" }),
      "PVC",
    );
    expect(destino).toMatchObject({ id: "reg_gaveta", confianca: "heuristico" });
    expect(destino.motivo).toContain("passagem plena");
  });

  it("válvula de retenção entra como tipo leve", () => {
    expect(
      classificarItem(item("VLV_Válvula de retenção universal - Docol"), "PVC"),
    ).toMatchObject({ id: "valv_retencao", confianca: "heuristico" });
  });

  it("válvula misturadora só existe em CPVC", () => {
    expect(classificarItem(item("VLV_Válvula Misturadora Termostática"), "CPVC")).toMatchObject({
      tipo: "campo",
      campo: "qtdValvulaMisturadora",
    });
    expect(classificarItem(item("VLV_Válvula Misturadora Termostática"), "PVC")).toMatchObject({
      tipo: "ignorado",
    });
  });

  it("engate flexível do pressurizador é ignorado e não vira pressurizador", () => {
    const engate = classificarItem(item("AF_Engate Flexível Pressurizador N°1 - ERIKBIM"), "PVC");
    expect(engate.tipo).toBe("ignorado");
    expect(classificarItem(item("AQ_TEXIUS-Pressurizador_SmartPump"), "PVC")).toMatchObject({
      tipo: "campo",
      campo: "incrementoPressurizador",
    });
  });

  it("base do monocomando só sinaliza o campo, sem lançar conexão", () => {
    const destino = classificarItem(item("AQ_Base misturador monocomando"), "CPVC");
    expect(destino).toMatchObject({ tipo: "campo", campo: "monocomando" });
    expect(destino.motivo).toContain("DOCOL");
  });

  it("família de anotação e família desconhecida saem com motivo", () => {
    expect(classificarItem(item("AN_AQ_Aquatherm_Conector(centro)"), "CPVC").motivo).toContain(
      "anotação",
    );
    const inventada = classificarItem(
      item("XPTO_Peca Inventada", { classe: "IFCDISTRIBUTIONELEMENT" }),
      "CPVC",
    );
    expect(inventada.tipo).toBe("ignorado");
    expect(inventada.motivo).toContain("IFCDISTRIBUTIONELEMENT");
  });
});

describe("integridade contra o catálogo do motor", () => {
  const familias = [
    "AQ_Aquatherm_Joelho 45_90",
    "AQ_Aquatherm_Curva 90",
    "AQ_Aquatherm_Te_Reducao",
    "AQ_Aquatherm_Joelho 90 de Transicao",
    "AQ_Aquatherm_Uniao",
    "AQ_Aquatherm_Luva de Transicao",
    "AQ_Aquatherm_Conector(ponta)",
    "AF_Soldavel_Curva 45_90",
    "AF_Soldavel_Te_Reducao",
    "AF_Soldavel_Luva com Bucha de Latao",
    "AQ_Cobre_Cotovelo 45_90",
    "AQ_Cobre_Te",
    "AQ_Cobre_União",
    "AQ_Cobre_Conector RM Rosca Macho x Bolsa",
    "BSP_Bucha de Redução - TUPY",
    "BSP_Niple Duplo - TUPY",
    "AF_Adaptador Soldavel com Anel para CxDagua - Fortlev",
    "VLV_Válvula de esfera com alavanca vermelha",
    "VLV_Válvula de retenção universal - Docol",
    "VLV_Válvula de alívio de temperatura e pressão",
  ];

  it("todo id devolvido existe na tabela de comprimento equivalente do material", () => {
    const idsPorMaterial: Record<Material, Set<string>> = {
      PVC: new Set(CONEXOES_PVC.map((c) => c.id)),
      CPVC: new Set(CONEXOES_CPVC.map((c) => c.id)),
    };
    const desconhecidos: string[] = [];
    for (const material of ["PVC", "CPVC"] as Material[]) {
      for (const familia of familias) {
        for (const angulo of [0, 45, 90, null]) {
          for (const reducao of [false, true]) {
            const destino = classificarItem(
              item(familia, { anguloEixos: angulo, entreBitolasDiferentes: reducao }),
              material,
            );
            if (destino.tipo === "conexao" && !idsPorMaterial[material].has(destino.id)) {
              desconhecidos.push(`${material}/${familia}/${angulo} -> ${destino.id}`);
            }
          }
        }
      }
    }
    expect(desconhecidos).toEqual([]);
  });

  it("todo destino traz um motivo escrito para a revisão", () => {
    for (const familia of familias) {
      expect(classificarItem(item(familia), "CPVC").motivo.length).toBeGreaterThan(5);
    }
  });
});
