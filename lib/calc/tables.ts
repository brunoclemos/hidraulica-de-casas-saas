// Tabelas-fonte extraídas das planilhas do curso Hidráulica de Casas.
// (No SaaS final viram seed no banco; aqui ficam tipadas para o protótipo.)

// CPVC: diâmetro comercial (mm) -> diâmetro interno (mm) = comercial - 2x parede
export const CPVC: { comercial: number; interno: number; rotulo: string }[] = [
  { comercial: 15, interno: 11.8, rotulo: '15 mm (½")' },
  { comercial: 22, interno: 17.6, rotulo: '22 mm (¾")' },
  { comercial: 28, interno: 22.6, rotulo: '28 mm (1")' },
  { comercial: 35, interno: 28.6, rotulo: '35 mm (1¼")' },
  { comercial: 42, interno: 34.4, rotulo: '42 mm (1½")' },
  { comercial: 54, interno: 44.2, rotulo: '54 mm (2")' },
  { comercial: 73, interno: 59.2, rotulo: '73 mm (2½")' },
  { comercial: 89, interno: 72.0, rotulo: '89 mm (3")' },
  { comercial: 114, interno: 93.2, rotulo: '114 mm (4")' },
];

export function diametroInterno(comercial: number): number {
  const row = CPVC.find((c) => c.comercial === comercial);
  return row ? row.interno : NaN;
}

// Velocidade máxima recomendada (Tabela Caleffi) por diâmetro comercial CPVC (m/s)
export const CALEFFI_VEL: Record<number, number> = {
  15: 1.0,
  22: 1.1,
  28: 1.3,
  35: 1.6,
  42: 1.8,
  54: 2.0,
  73: 2.2,
  89: 2.5,
  114: 2.5,
};

// Espessuras comerciais de isolante armaflex (mm)
export const ARMAFLEX = [0, 6, 9, 13, 19, 25, 32, 50];

// Cenário "tubo no ar": h externo (W/m²·K) por ambiente
export const AMBIENTES: { nome: string; h: number }[] = [
  { nome: "Ambiente interno parado", h: 3 },
  { nome: "Forro", h: 5 },
  { nome: "Embutido em parede", h: 4 },
  { nome: "Shaft técnico", h: 7 },
  { nome: "Ar livre sem vento", h: 12 },
  { nome: "Ar livre moderado", h: 20 },
  { nome: "Ar livre vento forte", h: 35 },
];

// Cenário "tubo enterrado": condutividade do solo (W/m·K)
export const SOLOS: { nome: string; k: number }[] = [
  { nome: "Solo seco / arenoso", k: 0.5 },
  { nome: "Solo residencial padrão", k: 1.0 },
  { nome: "Solo úmido", k: 1.5 },
  { nome: "Solo muito úmido / saturado", k: 2.0 },
];

// Raio de influência do solo (m)
export const RAIOS: { nome: string; r: number }[] = [
  { nome: "Enterrado raso (~5–15 cm)", r: 0.15 },
  { nome: "Residencial padrão (~20–40 cm)", r: 0.3 },
  { nome: "Enterrado profundo (>50 cm)", r: 0.5 },
];

// Constantes físicas (mantidas iguais à planilha do curso para os resultados baterem)
export const FIS = {
  PI: 3.14, // a planilha usa 3,14 literal — mantido para paridade com o curso
  k_cpvc: 0.14, // W/m·K
  k_iso: 0.036, // W/m·K (armaflex)
  cp: 4186, // J/kg·K
  visc: 8e-7, // m²/s (cinemática)
  k_agua: 0.598, // W/m·K
  Pr: 4.6, // Prandtl (fixo na planilha)
};
