import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aplicarDirecao, aplicarPonto, atributos, lerStep, ref, refs, texto } from "../step";
import { ErroIfc } from "../tipos";
import { CAMINHO_FIXTURE, montarIfc } from "./sintetico";

describe("lerStep no arquivo do cliente", () => {
  const indice = lerStep(readFileSync(CAMINHO_FIXTURE, "utf8"));

  it("lê schema, unidade e quantidade de entidades", () => {
    expect(indice.schema).toBe("IFC2X3");
    expect(indice.escala).toBe(1);
    expect(indice.entidades.size).toBe(4141);
    expect(indice.aplicacao).toContain("Revit");
  });

  it("lê o nome de um elemento pela posição do atributo", () => {
    const sistemas = [...indice.entidades.values()].filter((e) => e.tipo === "IFCSYSTEM");
    expect(indice.nomeDe(sistemas[0].id)).toBe("AQ 1");
  });
});

describe("decodificação de texto STEP", () => {
  it("decodifica \\X\\ de um byte", () => {
    expect(texto("'V\\X\\E1lvula'")).toBe("Válvula");
  });

  it("decodifica \\X2\\ de dois bytes", () => {
    expect(texto("'\\X2\\00E1\\X0\\'")).toBe("á");
  });

  it("desfaz o escape de aspas duplicadas", () => {
    expect(texto("'it''s'")).toBe("it's");
  });

  it("devolve vazio para atributo nulo", () => {
    expect(texto("$")).toBe("");
  });
});

describe("tokenizer por estado", () => {
  it("lê entidade quebrada em duas linhas e string com ponto e vírgula", () => {
    const indice = lerStep(
      montarIfc([
        "#10=IFCFLOWSEGMENT('abc',$,",
        "  'tubo; com ponto e virgula (e parenteses)',$,$,$,$,$);",
        "#11=IFCFLOWSEGMENT('def',$,'depois',$,$,$,$,$);",
      ]),
    );
    expect(indice.nomeDe(10)).toBe("tubo; com ponto e virgula (e parenteses)");
    expect(indice.nomeDe(11)).toBe("depois");
    expect(indice.entidades.size).toBe(2);
  });

  it("separa atributos no nível 0 respeitando listas e strings", () => {
    expect(atributos("'a,b',(#1,#2),$,3.5")).toEqual(["'a,b'", "(#1,#2)", "$", "3.5"]);
  });

  it("lê referências simples e de lista", () => {
    expect(ref("#42")).toBe(42);
    expect(ref("$")).toBeNull();
    expect(refs("(#1,#2,#3)")).toEqual([1, 2, 3]);
  });

  it("recusa arquivo que não é STEP", () => {
    expect(() => lerStep("isto aqui e um txt renomeado")).toThrowError(ErroIfc);
    try {
      lerStep("isto aqui e um txt renomeado");
      throw new Error("deveria ter lançado");
    } catch (erro) {
      expect((erro as ErroIfc).codigo).toBe("nao_e_ifc");
    }
  });
});

describe("matriz de placement", () => {
  // pai transladado em (10,0,0) e girado 90° em Z (X do pai aponta para +Y);
  // filho transladado em (0,0,5) sem rotação própria.
  const indice = lerStep(
    montarIfc([
      "#1=IFCCARTESIANPOINT((10.,0.,0.));",
      "#2=IFCDIRECTION((0.,0.,1.));",
      "#3=IFCDIRECTION((0.,1.,0.));",
      "#4=IFCAXIS2PLACEMENT3D(#1,#2,#3);",
      "#5=IFCLOCALPLACEMENT($,#4);",
      "#6=IFCCARTESIANPOINT((0.,0.,5.));",
      "#7=IFCAXIS2PLACEMENT3D(#6,$,$);",
      "#8=IFCLOCALPLACEMENT(#5,#7);",
    ]),
  );

  it("compõe pai × filho no ponto", () => {
    expect(aplicarPonto(indice.matrizGlobal(8), [1, 0, 0], indice.escala)).toEqual([10, 1, 5]);
  });

  it("gira a direção sem transladar", () => {
    const eixo = aplicarDirecao(indice.matrizGlobal(8), [1, 0, 0]);
    expect(eixo[0]).toBeCloseTo(0, 12);
    expect(eixo[1]).toBeCloseTo(1, 12);
    expect(eixo[2]).toBeCloseTo(0, 12);
  });
});

describe("unidade em milímetro", () => {
  const indice = lerStep(
    montarIfc([
      "#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);",
      "#2=IFCCARTESIANPOINT((1000.,0.,0.));",
      "#3=IFCAXIS2PLACEMENT3D(#2,$,$);",
      "#4=IFCLOCALPLACEMENT($,#3);",
    ]),
  );

  it("converte posições para metros", () => {
    expect(indice.escala).toBe(0.001);
    expect(aplicarPonto(indice.matrizGlobal(4), [0, 0, 0], indice.escala)).toEqual([1, 0, 0]);
  });
});
