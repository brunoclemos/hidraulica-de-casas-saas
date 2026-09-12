// Passo de browser entre o módulo e o renderer: nos textos de valor troca o ponto
// decimal por vírgula, sanea todo texto para a tabela de caracteres das fontes
// padrão do PDF e troca cada bloco de gráfico pelo PNG rasterizado do SVG da tela.

import type { BlocoMemorial, DadosMemorial } from "@/lib/memorial";
import type { Perfil } from "@/lib/perfil";
import { rasterizarGrafico } from "./rasterizar";
import { colunaFracionaria, paraWinAnsi, valorDeDocumento } from "./texto";
import type { BlocoPronto, MemorialPronto } from "./tipos";

function textoOpcional(valor: string | undefined): string | undefined {
  return valor === undefined ? undefined : paraWinAnsi(valor);
}

function saneiaBloco(bloco: Exclude<BlocoMemorial, { tipo: "grafico" }>): BlocoPronto {
  switch (bloco.tipo) {
    case "campos":
      return {
        ...bloco,
        titulo: textoOpcional(bloco.titulo),
        itens: bloco.itens.map((i) => ({
          label: paraWinAnsi(i.label),
          valor: valorDeDocumento(i.valor),
        })),
      };
    case "tabela": {
      const fracionaria = bloco.colunas.map((cabecalho, i) =>
        colunaFracionaria(cabecalho, bloco.linhas.map((l) => l[i] ?? "")),
      );
      return {
        ...bloco,
        titulo: textoOpcional(bloco.titulo),
        colunas: bloco.colunas.map(paraWinAnsi),
        linhas: bloco.linhas.map((l) => l.map((c, i) => valorDeDocumento(c, fracionaria[i]))),
        nota: bloco.nota === undefined ? undefined : valorDeDocumento(bloco.nota),
      };
    }
    case "texto":
      return {
        ...bloco,
        titulo: textoOpcional(bloco.titulo),
        paragrafos: bloco.paragrafos.map((paragrafo) => valorDeDocumento(paragrafo)),
      };
    case "resultado":
      return {
        ...bloco,
        titulo: textoOpcional(bloco.titulo),
        itens: bloco.itens.map((i) => ({
          ...i,
          label: paraWinAnsi(i.label),
          valor: valorDeDocumento(i.valor),
          nota: i.nota === undefined ? undefined : valorDeDocumento(i.nota),
        })),
      };
  }
}

function saneiaPerfil(p: Perfil): Perfil {
  return {
    empresa: paraWinAnsi(p.empresa),
    responsavel: paraWinAnsi(p.responsavel),
    crea: paraWinAnsi(p.crea),
    telefone: paraWinAnsi(p.telefone),
    contato: paraWinAnsi(p.contato),
    cidade: paraWinAnsi(p.cidade),
    logo: p.logo,
  };
}

export async function prepararMemorial(entrada: {
  dados: DadosMemorial;
  perfil: Perfil;
  moduloNome: string;
  emitidoEm: Date;
}): Promise<{ memorial: MemorialPronto; avisos: string[] }> {
  const blocos: BlocoPronto[] = [];
  const avisos: string[] = [];

  for (const bloco of entrada.dados.blocos) {
    if (bloco.tipo !== "grafico") {
      blocos.push(saneiaBloco(bloco));
      continue;
    }
    // gráfico que não rasteriza não derruba o memorial: o documento sai sem ele e o
    // aluno é avisado do que ficou de fora
    try {
      const { dataUrl, proporcao } = await rasterizarGrafico(bloco.seletor, bloco.proporcao);
      blocos.push({ tipo: "imagem", titulo: textoOpcional(bloco.titulo), dataUrl, proporcao });
    } catch (erro) {
      const nome = bloco.titulo ?? "sem título";
      const motivo = erro instanceof Error ? erro.message : String(erro);
      avisos.push(`O gráfico "${nome}" ficou fora do documento: ${motivo}.`);
    }
  }

  return {
    memorial: {
      moduloNome: paraWinAnsi(entrada.moduloNome),
      cliente: paraWinAnsi(entrada.dados.cliente),
      calculo: paraWinAnsi(entrada.dados.calculo),
      normas: entrada.dados.normas.map(paraWinAnsi),
      blocos,
      perfil: saneiaPerfil(entrada.perfil),
      emitidoEm: entrada.emitidoEm,
    },
    avisos,
  };
}
