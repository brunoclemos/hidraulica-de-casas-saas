// Catálogo de módulos e quais estão liberados publicamente.
// Fonte única de verdade: usada pelo dashboard (o que aparece) e pelo guard de rota
// no layout (o que pode ser acessado por link direto).

export interface Modulo {
  slug: string;
  nome: string;
  desc: string;
  liberado: boolean; // true = disponível na divulgação; false = bloqueado
}

export const MODULOS: Modulo[] = [
  {
    slug: "circuladores",
    nome: "Cálculo de Circuladores",
    desc: "Perda de carga trecho a trecho, curva do sistema e seleção do circulador de recirculação.",
    liberado: true,
  },
  {
    slug: "balanco-vazao",
    nome: "Balanço de Vazão (Anel 1 × Anel 2)",
    desc: "Divide a vazão do tronco entre dois anéis em paralelo e mostra o tempo de recirculação de cada um.",
    liberado: true,
  },
  {
    slug: "tempo-espera",
    nome: "Tempo de Espera (Purga)",
    desc: "Tempo até a água quente chegar, somando vários trechos em série.",
    liberado: true,
  },
  {
    slug: "recirculacao",
    nome: "Tempo de Recirculação & Perda Térmica",
    desc: "Tempo até a água quente chegar, desperdício e resfriamento. Manifold × Convencional.",
    liberado: false,
  },
  {
    slug: "perfil-boiler",
    nome: "Perfil Térmico do Boiler",
    desc: "Simula minuto a minuto se o boiler segura banhos simultâneos. Gás × elétrica.",
    liberado: false,
  },
  {
    slug: "caixa-boiler-solar",
    nome: "Caixa d'Água, Boiler & Solar",
    desc: "Volume do boiler e nº de coletores solares, corrigidos por clima e orientação.",
    liberado: false,
  },
  {
    slug: "pvc-cpvc-pressao",
    nome: "PVC/CPVC, Bombas & Pressão",
    desc: "Dimensionamento trecho a trecho (NBR 5626) e pressão residual no ponto.",
    liberado: false,
  },
  {
    slug: "vaso-expansao",
    nome: "Vaso de Expansão",
    desc: "Volume do vaso por NBR 16057 e Caleffi, lado a lado.",
    liberado: false,
  },
  {
    slug: "apoio-gas",
    nome: "Apoio à Gás — Vazão & Seleção",
    desc: "Vazão do sistema por 3 métodos (V.M.P, NBR 16057 e tempo determinado) e sugestão do aquecedor por custo × benefício.",
    liberado: false,
  },
];

/** Slugs liberados (acesso público). */
export const SLUGS_LIBERADOS = new Set(MODULOS.filter((m) => m.liberado).map((m) => m.slug));

export function moduloLiberado(slug: string): boolean {
  return SLUGS_LIBERADOS.has(slug);
}

const POR_SLUG = new Map(MODULOS.map((m) => [m.slug, m]));

/** Nome de exibição de um módulo pelo slug (fallback: o próprio slug). */
export function moduloNome(slug: string): string {
  return POR_SLUG.get(slug)?.nome ?? slug;
}

export function modulo(slug: string): Modulo | undefined {
  return POR_SLUG.get(slug);
}
