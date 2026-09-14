import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CadeiaImportada, TrechoImportado } from "../tipos";
import { agregarConexoes, contarCampo, importarIfc, snapDiametro } from "../trechos";
import { CAMINHO_FIXTURE } from "./sintetico";

const fonte = readFileSync(CAMINHO_FIXTURE, "utf8");
const importacao = importarIfc(fonte, { nome: "teste-hidro.ifc", bytes: fonte.length });
const [aguaQuente, aguaFria] = importacao.cadeias;

const heuristicos = (t: TrechoImportado) =>
  t.itens.filter((i) => i.destino.confianca === "heuristico").length;

const familiasIgnoradas = (t: TrechoImportado) =>
  t.itens.filter((i) => i.destino.tipo === "ignorado").map((i) => i.familia);

describe("cadeia de água quente: reservatório -> chuveiro, 3 trechos", () => {
  it("corta em 3 trechos, um por bitola", () => {
    expect(aguaQuente.trechos.map((t) => `${t.material} ${t.diametro}`)).toEqual([
      "CPVC 35",
      "CPVC 28",
      "CPVC 22",
    ]);
  });

  it("A → B: cobre de 35 mm lido pela tabela CPVC", () => {
    const t = aguaQuente.trechos[0];
    expect(t.materialIfc).toBe("COBRE");
    expect(t.diametroIfcMm).toBe(35);
    expect(t.confiancaDiametro).toBe("heuristico");
    expect(t.comprimentoReal).toBeCloseTo(4.3915, 3);
    expect(t.sobe).toBeCloseTo(1.7235, 3);
    expect(t.desce).toBeCloseTo(1.0239, 3);
    expect(t.qtdTubos).toBe(14);
    expect(t.pavimentos).toEqual(["SUBSOLO"]);
    expect(agregarConexoes(t.itens)).toEqual({
      joelho90: 6,
      te_direta: 4,
      adaptador_de_transicao: 7,
      bucha_de_reducao_ate_2_dn: 2,
      reg_gaveta: 2,
      uniao: 1,
    });
    expect(contarCampo(t.itens, "qtdValvulaMisturadora")).toBe(1);
    // TODAS as 22 conexões do trecho, não só as de família ambígua: o comprimento
    // equivalente de cada uma sai da tabela do CPVC, que não é a do cobre. A válvula
    // misturadora fica de fora porque perde pelo Kv, não pela tabela.
    expect(heuristicos(t)).toBe(22);
    expect(t.itens.filter((i) => i.destino.tipo === "conexao" && i.destino.confianca === "exato"))
      .toEqual([]);
  });

  it("B → C: CPVC 28 atravessando três pavimentos", () => {
    const t = aguaQuente.trechos[1];
    expect(t.materialIfc).toBe("CPVC");
    expect(t.diametroIfcMm).toBe(28.1);
    expect(t.confiancaDiametro).toBe("exato");
    expect(t.comprimentoReal).toBeCloseTo(25.7466, 3);
    expect(t.sobe).toBeCloseTo(5.5209, 3);
    expect(t.desce).toBeCloseTo(0.78, 3);
    expect(t.qtdTubos).toBe(22);
    expect(t.pavimentos).toEqual(["SUBSOLO", "Térreo", "Superior"]);
    expect(agregarConexoes(t.itens)).toEqual({
      curva90: 8,
      te_direta: 6,
      joelho_45: 5,
      te_passagem_direta_e_saida_lateral_de_reducao_central: 1,
      uniao: 1,
      reg_gaveta: 1,
    });
    expect(heuristicos(t)).toBe(2);
  });

  it("C → D: CPVC 22 terminando na base do monocomando", () => {
    const t = aguaQuente.trechos[2];
    expect(t.diametroIfcMm).toBe(22);
    expect(t.comprimentoReal).toBeCloseTo(4.7032, 3);
    expect(t.sobe).toBeCloseTo(3.3361, 3);
    expect(t.desce).toBeCloseTo(0.017, 3);
    expect(t.qtdTubos).toBe(8);
    expect(t.pavimentos).toEqual(["Superior"]);
    expect(agregarConexoes(t.itens)).toEqual({
      curva90: 3,
      joelho90: 1,
      joelho_45: 1,
      te_direta: 1,
      joelho_90_c_latao: 1,
    });
    expect(contarCampo(t.itens, "monocomando")).toBe(1);
  });
});

describe("cadeia de água fria: tanque -> boiler, 2 trechos", () => {
  it("A → B: PVC 32 com o pressurizador dentro", () => {
    const t = aguaFria.trechos[0];
    expect(t.material).toBe("PVC");
    expect(t.diametro).toBe(32);
    expect(t.confiancaDiametro).toBe("exato");
    expect(t.comprimentoReal).toBeCloseTo(4.2885, 3);
    expect(t.sobe).toBeCloseTo(0.4037, 3);
    expect(t.desce).toBeCloseTo(0.6372, 3);
    expect(t.qtdTubos).toBe(13);
    expect(agregarConexoes(t.itens)).toEqual({
      curva90: 5,
      te_direta: 5,
      reg_gaveta: 2,
      valv_retencao: 1,
    });
    expect(contarCampo(t.itens, "incrementoPressurizador")).toBe(1);
    expect(heuristicos(t)).toBe(3);
  });

  it("A → B: as peças sem equivalente na tabela PVC ficam de fora, com motivo", () => {
    const fora = familiasIgnoradas(aguaFria.trechos[0]);
    expect(fora.filter((f) => f.includes("Niple Duplo")).length).toBe(4);
    expect(fora.filter((f) => f.includes("Engate Flexível")).length).toBe(2);
    expect(fora.filter((f) => f.includes("Luva com Bucha de Latao")).length).toBe(3);
    expect(fora.filter((f) => f.includes("Bucha de Redução")).length).toBe(3);
  });

  it("B → C: CPVC 35 depois da transição", () => {
    const t = aguaFria.trechos[1];
    expect(t.material).toBe("CPVC");
    expect(t.diametro).toBe(35);
    expect(t.diametroIfcMm).toBe(34.9);
    expect(t.comprimentoReal).toBeCloseTo(7.2084, 3);
    expect(t.sobe).toBeCloseTo(0.6097, 3);
    expect(t.desce).toBeCloseTo(0.9493, 3);
    expect(t.qtdTubos).toBe(22);
    expect(agregarConexoes(t.itens)).toEqual({
      te_direta: 8,
      joelho_45: 12,
      reg_gaveta: 1,
      adaptador_de_transicao: 1,
    });
  });
});

describe("invariantes do arquivo inteiro", () => {
  const todos = importacao.cadeias.flatMap((c: CadeiaImportada) => c.trechos);

  it("os 79 tubos do arquivo entraram em algum trecho", () => {
    expect(todos.reduce((s, t) => s + t.qtdTubos, 0)).toBe(79);
  });

  it("cada elemento aparece em um trecho só", () => {
    const ids = todos.flatMap((t) => t.idsIfc);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("as duas peças da parte sem tubo viram elementos fora de cadeia, não somem", () => {
    expect(importacao.isolados.filter((i) => i.motivo === "cadeia sem tubo").length).toBe(2);
    expect(importacao.isolados.length).toBe(21);
  });

  it("descreve o arquivo lido", () => {
    expect(importacao.arquivo.schema).toBe("IFC2X3");
    expect(importacao.arquivo.unidade).toBe("m");
    expect(importacao.arquivo.entidades).toBe(4141);
    expect(importacao.avisos).toEqual([
      "3 par(es) de portas soltas unidos por proximidade (até 20 mm).",
    ]);
  });
});

describe("snap do diâmetro externo para a bitola comercial", () => {
  it("usa a tabela do próprio material quando o IFC diz PVC ou CPVC", () => {
    expect(snapDiametro(34.9, "CPVC")).toEqual({
      material: "CPVC",
      diametro: 35,
      confianca: "exato",
    });
    expect(snapDiametro(32, "PVC")).toEqual({ material: "PVC", diametro: 32, confianca: "exato" });
  });

  it("cobre cai na série CPVC, marcado para conferir", () => {
    expect(snapDiametro(35, "COBRE")).toEqual({
      material: "CPVC",
      diametro: 35,
      confianca: "heuristico",
    });
  });

  it("diâmetro fora da tabela fica sem bitola, para o engenheiro escolher", () => {
    expect(snapDiametro(63, "PVC")).toEqual({
      material: "PVC",
      diametro: null,
      confianca: "nao_mapeado",
    });
  });
});
