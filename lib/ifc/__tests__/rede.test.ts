import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { montarRede } from "../rede";
import { lerStep } from "../step";
import { importarIfc } from "../trechos";
import { CAMINHO_FIXTURE, IfcSintetico } from "./sintetico";

const fonteFixture = readFileSync(CAMINHO_FIXTURE, "utf8");

describe("rede do arquivo do cliente", () => {
  const indice = lerStep(fonteFixture);
  const rede = montarRede(indice);

  it("encontra os elementos hidráulicos e as portas", () => {
    expect(rede.elementos.length).toBe(204);
    expect(rede.portas.size).toBe(382);
    expect(rede.segmentos.size).toBe(79);
  });

  it("une por proximidade as 3 portas soltas que o Revit deixou sem relação", () => {
    let paresDeclarados = 0;
    for (const e of indice.entidades.values()) {
      if (e.tipo === "IFCRELCONNECTSPORTS") paresDeclarados++;
    }
    expect(paresDeclarados).toBe(180);
    expect(rede.merges.length).toBe(3);
  });

  it("separa 2 cadeias e 19 elementos fora de cadeia", () => {
    expect(rede.componentes.filter((c) => c.length > 1).length).toBe(2);
    expect(rede.isolados.length).toBe(19);
  });

  it("mede todos os ângulos de porta dentro de 0°, 45° ou 90°", () => {
    const foraDaTabela = rede.elementos.filter(
      (el) => rede.portasDe(el).length >= 2 && rede.anguloEixos(el) === null,
    );
    expect(foraDaTabela).toEqual([]);
  });
});

describe("cadeias orientadas do arquivo do cliente", () => {
  const importacao = importarIfc(fonteFixture, { nome: "teste.ifc", bytes: fonteFixture.length });
  const [aguaQuente, aguaFria] = importacao.cadeias;

  it("orienta a água quente do reservatório para o ponto de uso", () => {
    expect(aguaQuente.sistema).toBe("AQ 1");
    expect(aguaQuente.descricaoSistema).toBe("2.Água Quente Doméstica");
    expect(aguaQuente.origem).toContain("Reservatorio");
    expect(aguaQuente.destino).toContain("Joelho 90 de Transicao");
    expect(aguaQuente.sentido).toEqual({ regra: "equipamento no destino", confiavel: true });
    expect(aguaQuente.bifurcacoes).toBe(0);
  });

  it("orienta a água fria do tanque para o boiler", () => {
    expect(aguaFria.sistema).toBe("AF 1");
    expect(aguaFria.origem).toContain("Tanque Fortlev");
    expect(aguaFria.sentido).toEqual({ regra: "equipamento na origem", confiavel: true });
  });

  it("soma o desnível líquido da água quente: do boiler ao chuveiro sobem 8,76 m", () => {
    const liquido = aguaQuente.trechos.reduce((s, t) => s + t.sobe - t.desce, 0);
    expect(liquido).toBeCloseTo(8.76, 2);
  });
});

describe("casos que não aparecem no arquivo do cliente", () => {
  it("sem IFCRELCONNECTSPORTS não monta cadeia nenhuma", () => {
    const ifc = new IfcSintetico();
    const a = ifc.elemento("IFCFLOWSEGMENT", "Tubo A");
    const b = ifc.elemento("IFCFLOWSEGMENT", "Tubo B");
    ifc.prenderPorta(ifc.porta([0, 0, 0], "SINK"), a);
    ifc.prenderPorta(ifc.porta([1, 0, 0], "SOURCE"), a);
    ifc.prenderPorta(ifc.porta([2, 0, 0], "SINK"), b);
    ifc.prenderPorta(ifc.porta([3, 0, 0], "SOURCE"), b);

    const rede = montarRede(lerStep(ifc.texto()));
    expect(rede.temConectividade).toBe(false);
    expect(rede.componentes.filter((c) => c.length > 1)).toEqual([]);
    expect(rede.isolados.map((i) => i.motivo)).toEqual([
      "porta sem conexão",
      "porta sem conexão",
    ]);
  });

  it("IFC4: lê as portas por IFCRELNESTS e liga os 3 elementos", () => {
    const ifc = new IfcSintetico("IFC4");
    const a = ifc.elemento("IFCPIPESEGMENT", "Tubo A");
    const meio = ifc.elemento("IFCPIPEFITTING", "Joelho");
    const b = ifc.elemento("IFCPIPESEGMENT", "Tubo B");
    const saidaA = ifc.porta([1, 0, 0], "SOURCE");
    const entradaMeio = ifc.porta([1, 0, 0], "SINK");
    const saidaMeio = ifc.porta([1, 1, 0], "SOURCE");
    const entradaB = ifc.porta([1, 1, 0], "SINK");
    ifc.aninharPortas(a, [ifc.porta([0, 0, 0], "SINK"), saidaA]);
    ifc.aninharPortas(meio, [entradaMeio, saidaMeio]);
    ifc.aninharPortas(b, [entradaB, ifc.porta([1, 2, 0], "SOURCE")]);
    ifc.conectar(saidaA, entradaMeio);
    ifc.conectar(saidaMeio, entradaB);

    const rede = montarRede(lerStep(ifc.texto()));
    const cadeias = rede.componentes.filter((c) => c.length > 1);
    expect(cadeias.length).toBe(1);
    expect(cadeias[0].length).toBe(3);
    expect(rede.caminhar(cadeias[0]).ordem).toEqual([a, meio, b]);
  });

  it("tê com 3 portas conectadas conta 1 bifurcação", () => {
    const ifc = new IfcSintetico();
    const te = ifc.elemento("IFCFLOWFITTING", "Te");
    const ramos = [0, 1, 2].map((i) => {
      const tubo = ifc.elemento("IFCFLOWSEGMENT", `Tubo ${i}`);
      const noTe = ifc.porta([i, 0, 0], "SOURCE");
      const noTubo = ifc.porta([i, 0, 0], "SINK");
      ifc.prenderPorta(noTe, te);
      ifc.prenderPorta(noTubo, tubo);
      ifc.prenderPorta(ifc.porta([i, 5, 0], "SOURCE"), tubo);
      ifc.conectar(noTe, noTubo);
      return tubo;
    });

    const rede = montarRede(lerStep(ifc.texto()));
    const componente = rede.componentes.find((c) => c.length > 1) ?? [];
    expect(componente.length).toBe(4);
    expect(rede.vizinhos(te).size).toBe(3);
    expect(rede.caminhar(componente).bifurcacoes).toBe(1);
    // a caminhada da fase 1 segue um caminho só: entra por um ramo e sai por outro
    expect(rede.caminhar(componente).ordem.length).toBe(3);
    expect(ramos.length).toBe(3);
  });
});
