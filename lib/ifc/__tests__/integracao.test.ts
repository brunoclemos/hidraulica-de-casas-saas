// Ponta a ponta com o motor real, sem mockar nada: o que o importador monta tem que
// cair no calcularTrecho e devolver os mesmos números da planilha do curso.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TrechoSalvo,
  calcularTrecho,
  normalizarTrecho,
  vazaoDoTrecho,
} from "@/lib/calc/pvc-cpvc-pressao";
import type { TrechoImportado } from "../tipos";
import { ContextoInsercao, edicaoInicial, importarIfc, paraTrechoSalvo } from "../trechos";
import { CAMINHO_FIXTURE } from "./sintetico";

const fonte = readFileSync(CAMINHO_FIXTURE, "utf8");
const importacao = importarIfc(fonte, { nome: "TESTE HIDRO.ifc", bytes: fonte.length });
const [aguaQuente, aguaFria] = importacao.cadeias;

const inserir = (
  trecho: TrechoImportado,
  contexto: Partial<ContextoInsercao> = {},
  vazaoLmin = 0,
): TrechoSalvo =>
  paraTrechoSalvo(
    trecho,
    { ...edicaoInicial(trecho), vazaoLmin },
    {
      ambiente: "Banheiro suíte",
      nome: "A → B",
      arquivo: "TESTE HIDRO.ifc",
      aguaFria: false,
      ...contexto,
    },
  );

describe("comprimento equivalente das conexões lidas do IFC", () => {
  it("B → C em CPVC 28 soma 25,810 m de comprimento equivalente", () => {
    const trecho = inserir(aguaQuente.trechos[1]);
    const resultado = calcularTrecho(trecho, 10);
    // 8×0,922 + 6×1,844 + 5×0,615 + 3,688 + 0,307 + 0,3 (tabela CPVC na bitola 28)
    expect(resultado.compEquivalente).toBeCloseTo(25.81, 3);
    expect(resultado.compTotal).toBeCloseTo(25.7466 + 25.81, 3);
  });

  it("A → B em PVC 32 soma 11,900 m de comprimento equivalente", () => {
    const trecho = inserir(aguaFria.trechos[0]);
    const resultado = calcularTrecho(trecho, 10);
    // 5×0,6 + 5×0,9 + 2×0,3 + 3,8 (tabela PVC na bitola 32)
    expect(resultado.compEquivalente).toBeCloseTo(11.9, 3);
  });
});

describe("campos do trecho que o importador preenche", () => {
  it("a válvula misturadora do IFC vira quantidade no trecho de CPVC", () => {
    expect(inserir(aguaQuente.trechos[0]).qtdValvulaMisturadora).toBe(1);
  });

  it("o monocomando só sinaliza: o campo fica vazio para o engenheiro escolher a curva", () => {
    const trecho = inserir(aguaQuente.trechos[2]);
    expect(trecho.monocomando).toBe("");
    expect(calcularTrecho(trecho, 10).perdaMonocomando).toBe(0);
  });

  it("o pressurizador só sinaliza: o incremento em mca continua zero", () => {
    expect(inserir(aguaFria.trechos[0]).incrementoPressurizador).toBe(0);
  });

  it("o que o IFC não sabe fica no default do motor", () => {
    const trecho = inserir(aguaQuente.trechos[1]);
    expect(trecho.qtdRegistroPressao).toBe(0);
    expect(trecho.qtdFiltroY).toBe(0);
    expect(trecho.chuveiro).toBe("");
    expect(trecho.kvValvula).toBe(2.6);
    expect(trecho.noTronco).toBe(false);
  });
});

describe("vazão continua sendo do engenheiro", () => {
  it("sem vazão digitada o trecho entra no método dos pesos, com 0 L/min", () => {
    const trecho = inserir(aguaQuente.trechos[1]);
    expect(trecho.modoVazao).toBe("pesos");
    expect(trecho.pecas).toEqual({});
    expect(vazaoDoTrecho(trecho).lmin).toBe(0);
  });

  it("vazão digitada na revisão entra como manual", () => {
    const trecho = inserir(aguaQuente.trechos[2], {}, 30);
    expect(trecho.modoVazao).toBe("manual");
    expect(trecho.vazaoManualLmin).toBe(30);
    expect(vazaoDoTrecho(trecho).lmin).toBe(30);
  });
});

describe("temperatura da água por sistema", () => {
  it("água fria em CPVC entra a 20 °C, água quente mantém os 40 °C do motor", () => {
    expect(inserir(aguaFria.trechos[1], { aguaFria: true }).temperaturaAgua).toBe(20);
    expect(inserir(aguaQuente.trechos[1], { aguaFria: false }).temperaturaAgua).toBe(40);
  });
});

describe("origemIfc sobrevive ao salvar e reabrir", () => {
  it("guarda o arquivo e as heurísticas do trecho de cobre", () => {
    const trecho = inserir(aguaQuente.trechos[0]);
    expect(trecho.origemIfc?.arquivo).toBe("TESTE HIDRO.ifc");
    expect(trecho.origemIfc?.heuristicas[0]).toBe(
      "cobre lido pela tabela CPVC (diâmetro interno e rugosidade diferem)",
    );
    expect(trecho.origemIfc?.heuristicas).toContain(
      "válvula de esfera contada como registro de gaveta aberto (passagem plena)",
    );
    // motivos repetidos (7 adaptadores) entram uma vez só
    expect(new Set(trecho.origemIfc?.heuristicas).size).toBe(trecho.origemIfc?.heuristicas.length);
  });

  it("normalizarTrecho preserva o campo de um projeto salvo", () => {
    const trecho = inserir(aguaQuente.trechos[0]);
    const relido = normalizarTrecho(JSON.parse(JSON.stringify(trecho)) as TrechoSalvo);
    expect(relido.origemIfc).toEqual(trecho.origemIfc);
    expect(calcularTrecho(relido, 10).compEquivalente).toBeCloseTo(
      calcularTrecho(trecho, 10).compEquivalente,
      9,
    );
  });

  it("projeto salvo antes do importador reabre com os mesmos números", () => {
    const antigo = {
      material: "PVC" as const,
      diametro: 25,
      comprimentoReal: 3,
      conexoes: { joelho90: 2 },
      pecas: { "Chuveiro ou ducha": 1 },
      sobe: 2,
      desce: 0,
      ambiente: "Banheiro",
      nome: "A-B",
    };
    const relido = normalizarTrecho(antigo);
    const resultado = calcularTrecho(relido, 10);
    expect(relido.origemIfc).toBeUndefined();
    // conferido à mão pelas fórmulas da planilha: Q = 0,3·√0,4 = 0,189737 L/s;
    // J = 8,69e6·Q^1,75·21,4^-4,75/10 = 0,0227153 mca/m; L total = 3 + 2×1,2 = 5,4 m;
    // residual = 10 − 2 (sobe) − 5,4·J.
    expect(resultado.vazaoLs).toBeCloseTo(0.189737, 6);
    expect(resultado.compEquivalente).toBeCloseTo(2.4, 9);
    expect(resultado.perdaCargaTotal).toBeCloseTo(0.122663, 6);
    expect(resultado.pressaoResidual).toBeCloseTo(7.877337, 6);
  });

  it("o campo novo é inerte para o motor: com e sem origemIfc dá o mesmo resultado", () => {
    const trecho = inserir(aguaFria.trechos[0]);
    const semOrigem: TrechoSalvo = { ...trecho };
    delete semOrigem.origemIfc;
    expect(calcularTrecho(semOrigem, 10)).toEqual(calcularTrecho(trecho, 10));
  });

  it("origemIfc malformado é descartado em vez de estourar a tela", () => {
    expect(normalizarTrecho({ origemIfc: { arquivo: 3 } } as never).origemIfc).toBeUndefined();
    expect(
      normalizarTrecho({ origemIfc: { arquivo: "x", heuristicas: "nao é lista" } } as never)
        .origemIfc,
    ).toBeUndefined();
    expect(
      normalizarTrecho({ origemIfc: { arquivo: "x", heuristicas: [1, 2] } } as never).origemIfc,
    ).toBeUndefined();
  });
});
