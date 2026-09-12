// Ponte entre o dimensionamento (estado de cada módulo) e o memorial em PDF.
//
// O botão de exportar vive no header, que é um layout só, mas os dados vivem no
// estado dos 9 page.tsx. Um contexto React resolveria — ao custo de re-renderizar o
// layout a cada tecla digitada no nome do cálculo. Aqui cada módulo registra um
// GETTER, e o botão o chama no clique: nenhum render extra, e o PDF sempre pega o
// estado do instante em que o aluno clicou.
//
// Os módulos não montam PDF: descrevem o conteúdo em BLOCOS e um renderer único
// (components/pdf/Memorial.tsx) desenha todos igual. É o que mantém os 9 memoriais
// com a mesma cara e uma mudança de layout valendo para todos de uma vez.

import { useEffect, useRef } from "react";

export interface ItemCampo {
  label: string;
  valor: string;
  // Complemento curto embaixo do valor. É o que impede um valor com três
  // informações ("14.500 kcal/h · rendimento 0,86 · histerese 5 °C") de quebrar em
  // quatro linhas na coluna estreita do documento.
  nota?: string;
}

export interface BlocoCampos {
  tipo: "campos";
  titulo?: string;
  itens: ItemCampo[];
}

export interface BlocoTabela {
  tipo: "tabela";
  titulo?: string;
  colunas: string[];
  linhas: string[][];
  // índices de linha que saem realçados (ex.: o trecho crítico da prumada)
  realce?: number[];
  nota?: string;
}

export interface BlocoTexto {
  tipo: "texto";
  titulo?: string;
  paragrafos: string[];
}

// O gráfico já existe na tela como SVG. Em vez de reimplementá-lo nos primitivos do
// react-pdf, o renderer serializa o SVG do DOM e rasteriza em 2x — fiel ao que o
// aluno viu, e sem duas implementações do mesmo gráfico para manter em sincronia.
export interface BlocoGrafico {
  tipo: "grafico";
  titulo?: string;
  seletor: string; // CSS selector do <svg> na página
  proporcao?: number; // largura/altura, quando o viewBox não basta
  // A legenda do gráfico é HTML ao lado do <svg>, então não vem na rasterização: sem
  // ela o leitor do memorial não sabe qual curva é qual. Cada série entra com a cor
  // que ela tem NA TELA — o renderer aplica nela a mesma conversão para papel que
  // aplica no gráfico, para a bolinha sair no tom da curva. Opcional: gráfico de
  // série única se explica pelo título.
  legenda?: { nome: string; cor: string }[];
}

export interface BlocoResultado {
  tipo: "resultado";
  titulo?: string;
  itens: { label: string; valor: string; nota?: string; alerta?: boolean }[];
}

export type BlocoMemorial =
  | BlocoCampos
  | BlocoTabela
  | BlocoTexto
  | BlocoGrafico
  | BlocoResultado;

export interface DadosMemorial {
  cliente: string; // pasta do cliente (obra), quando houver
  calculo: string; // nome que o aluno deu ao cálculo
  // Normas e referências que o módulo aplica, impressas na identificação do
  // documento (é o que dá valor de memorial: o método declarado).
  normas: string[];
  blocos: BlocoMemorial[];
  // Quando o dimensionamento está incompleto, o botão explica em vez de gerar um
  // documento com campos vazios ou NaN.
  impedimento?: string;
}

type Getter = () => DadosMemorial;

// Módulo desmontado tem que liberar o registro, senão o botão do próximo módulo
// chamaria o getter do anterior (closure com estado morto).
let atual: { modulo: string; getter: Getter } | null = null;

export function lerMemorial(modulo: string): DadosMemorial | null {
  if (!atual || atual.modulo !== modulo) return null;
  return atual.getter();
}

export function useMemorial(modulo: string, getter: Getter) {
  const ref = useRef(getter);
  ref.current = getter;
  useEffect(() => {
    atual = { modulo, getter: () => ref.current() };
    return () => {
      if (atual?.modulo === modulo) atual = null;
    };
  }, [modulo]);
}
