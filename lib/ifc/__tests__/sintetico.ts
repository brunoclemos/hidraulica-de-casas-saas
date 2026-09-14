// Construtor de IFC mínimo para os testes: só as entidades que o importador lê.
// Existe porque os casos de borda (sem conectividade, IFC4 por nesting, bifurcação,
// unidade em milímetro) não aparecem no arquivo do cliente.

export const CAMINHO_FIXTURE = "lib/ifc/__tests__/fixtures/teste-hidro.reduzido.ifc";

export function montarIfc(linhas: string[], schema = "IFC2X3"): string {
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');",
    "FILE_NAME('sintetico.ifc','2026-09-14T00:00:00',(''),(''),'','Teste','');",
    `FILE_SCHEMA(('${schema}'));`,
    "ENDSEC;",
    "DATA;",
    ...linhas,
    "ENDSEC;",
    "END-ISO-10303-21;",
  ].join("\r\n");
}

export type Ponto = [number, number, number];

export class IfcSintetico {
  private readonly linhas: string[] = [];
  private proximo = 1;

  constructor(private readonly schema = "IFC2X3") {}

  private id(): number {
    return this.proximo++;
  }

  milimetro(): void {
    this.linhas.push(`#${this.id()}=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);`);
  }

  elemento(classe: string, nome: string): number {
    const id = this.id();
    this.linhas.push(`#${id}=${classe}('g${id}',$,'${nome}',$,$,$,$,$);`);
    return id;
  }

  porta(pos: Ponto, fluxo: "SOURCE" | "SINK" | "SOURCEANDSINK" | "NOTDEFINED"): number {
    const ponto = this.id();
    const eixos = this.id();
    const local = this.id();
    const id = this.id();
    this.linhas.push(
      `#${ponto}=IFCCARTESIANPOINT((${pos[0]},${pos[1]},${pos[2]}));`,
      `#${eixos}=IFCAXIS2PLACEMENT3D(#${ponto},$,$);`,
      `#${local}=IFCLOCALPLACEMENT($,#${eixos});`,
      `#${id}=IFCDISTRIBUTIONPORT('g${id}',$,'P${id}',$,$,#${local},$,.${fluxo}.);`,
    );
    return id;
  }

  /** IFC2X3: a porta pendura no elemento por relação dedicada. */
  prenderPorta(porta: number, elemento: number): void {
    const id = this.id();
    this.linhas.push(`#${id}=IFCRELCONNECTSPORTTOELEMENT('g${id}',$,$,$,#${porta},#${elemento});`);
  }

  /** IFC4: a porta pendura no elemento por nesting. */
  aninharPortas(elemento: number, portas: number[]): void {
    const id = this.id();
    const lista = portas.map((p) => `#${p}`).join(",");
    this.linhas.push(`#${id}=IFCRELNESTS('g${id}',$,$,$,#${elemento},(${lista}));`);
  }

  conectar(portaA: number, portaB: number): void {
    const id = this.id();
    this.linhas.push(`#${id}=IFCRELCONNECTSPORTS('g${id}',$,$,$,#${portaA},#${portaB},$);`);
  }

  texto(): string {
    return montarIfc(this.linhas, this.schema);
  }
}
