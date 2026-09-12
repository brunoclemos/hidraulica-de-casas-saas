// Contrato entre a preparação (browser: rasteriza gráfico, sanea texto) e o
// renderer (components/pdf/Memorial.tsx). O renderer recebe dados prontos para
// papel: nenhuma string por sanear e nenhum gráfico por rasterizar.

import type { BlocoGrafico, BlocoMemorial } from "@/lib/memorial";
import type { Perfil } from "@/lib/perfil";

// O BlocoGrafico aponta um <svg> da página, que só existe no browser. Na hora de
// desenhar o PDF ele já virou PNG.
export interface BlocoImagem {
  tipo: "imagem";
  titulo?: string;
  dataUrl: string;
  proporcao: number; // largura/altura
}

export type BlocoPronto = Exclude<BlocoMemorial, BlocoGrafico> | BlocoImagem;

export interface MemorialPronto {
  moduloNome: string;
  cliente: string;
  calculo: string;
  normas: string[];
  blocos: BlocoPronto[];
  perfil: Perfil;
  emitidoEm: Date;
}
