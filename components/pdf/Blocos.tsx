// Desenho dos blocos do memorial. Renderer único: os 9 módulos descrevem o conteúdo
// em blocos (lib/memorial.ts) e saem com a mesma cara.

import { Image, Text, View } from "@react-pdf/renderer";
import { EstiloPdf, LARGURA_CONTEUDO, PRETO, s } from "./estilos";
import type { BlocoImagem, BlocoPronto } from "./tipos";
import type { BlocoCampos, BlocoResultado, BlocoTabela, BlocoTexto } from "@/lib/memorial";

const ALTURA_MAXIMA_GRAFICO = 300;
const LARGURA_MAXIMA_COLUNA = 26; // em caracteres: sem teto, uma nota longa engole a tabela
const LARGURA_MINIMA_COLUNA = 4;
const PROPORCAO_NUMERICA = 0.7; // coluna com essa fração de células numéricas alinha à direita
// `wrap` tem que ser booleano explícito: o react-pdf faz `'wrap' in props ?
// props.wrap : true`, então wrap={undefined} desliga a quebra e a tabela longa sai
// achatada, com as linhas por cima das outras e sem paginação.
// Até esse tamanho a tabela cabe numa página e sai inteira (wrap={false}): o
// cabeçalho viaja junto em vez de ficar recortado no pé da página anterior. Acima
// disso ela precisa paginar, e aí o cabeçalho repete com fixed.
const LINHAS_EM_UMA_PAGINA = 20;

function Secao({
  titulo,
  itens,
  estilo,
}: {
  titulo?: string;
  itens: React.ReactElement[];
  estilo?: EstiloPdf;
}) {
  const [primeiro, ...resto] = itens;
  return (
    <View style={estilo ? [s.bloco, estilo] : s.bloco}>
      {/* minPresenceAhead é ignorado pelo react-pdf: o que evita título órfão no pé
          da página é colar o título ao primeiro item num wrap={false} */}
      <View wrap={false}>
        {titulo ? <Text style={s.tituloBloco}>{titulo}</Text> : null}
        {primeiro}
      </View>
      {resto}
    </View>
  );
}

function Campos({ bloco }: { bloco: BlocoCampos }) {
  const pares: BlocoCampos["itens"][] = [];
  for (let i = 0; i < bloco.itens.length; i += 2) pares.push(bloco.itens.slice(i, i + 2));
  return (
    <Secao
      titulo={bloco.titulo}
      itens={pares.map((par, linha) => (
        <View key={linha} style={s.campoPar} wrap={false}>
          {par.map((item, coluna) => (
            <View key={coluna} style={s.campoItem}>
              <Text style={s.campoRotulo}>{item.label}</Text>
              <Text style={s.campoValor}>{item.valor}</Text>
            </View>
          ))}
        </View>
      ))}
    />
  );
}

function larguras(colunas: string[], linhas: string[][]): string[] {
  const pesos = colunas.map((coluna, i) => {
    const maior = linhas.reduce((m, l) => Math.max(m, (l[i] ?? "").length), coluna.length);
    return Math.min(Math.max(maior, LARGURA_MINIMA_COLUNA), LARGURA_MAXIMA_COLUNA);
  });
  const soma = pesos.reduce((a, b) => a + b, 0);
  return pesos.map((p) => `${((p / soma) * 100).toFixed(3)}%`);
}

function colunasNumericas(colunas: string[], linhas: string[][]): boolean[] {
  return colunas.map((_, i) => {
    const celulas = linhas.map((l) => (l[i] ?? "").trim()).filter((c) => c !== "");
    if (celulas.length === 0) return false;
    const numeros = celulas.filter((c) => /^[-+]?\d/.test(c)).length;
    return numeros / celulas.length >= PROPORCAO_NUMERICA;
  });
}

function Tabela({ bloco }: { bloco: BlocoTabela }) {
  const colunas = larguras(bloco.colunas, bloco.linhas);
  const direita = colunasNumericas(bloco.colunas, bloco.linhas);
  const realcadas = new Set(bloco.realce ?? []);
  const paginavel = bloco.linhas.length > LINHAS_EM_UMA_PAGINA;
  return (
    <View style={s.bloco} wrap={paginavel}>
      {/* fixed repete o cabeçalho na virada de página. O título vai DENTRO do fixed
          porque um fixed aninhado em wrap={false} para de repetir — e sem o título
          aqui ele ficaria órfão no pé da página */}
      <View fixed={paginavel}>
        {bloco.titulo ? <Text style={s.tituloBloco}>{bloco.titulo}</Text> : null}
        <View style={s.tabelaCabecalho}>
          {bloco.colunas.map((coluna, i) => (
            <Text
              key={i}
              style={[
                s.tabelaCabecalhoCelula,
                { width: colunas[i], textAlign: direita[i] ? "right" : "left" },
              ]}
            >
              {coluna}
            </Text>
          ))}
        </View>
      </View>
      {bloco.linhas.map((linha, i) => (
        <View
          key={i}
          wrap={false}
          style={realcadas.has(i) ? [s.tabelaLinha, s.tabelaLinhaRealce] : s.tabelaLinha}
        >
          {bloco.colunas.map((_, j) => (
            <Text
              key={j}
              style={[
                s.tabelaCelula,
                { width: colunas[j], textAlign: direita[j] ? "right" : "left" },
                realcadas.has(i) ? { fontFamily: "Helvetica-Bold", color: PRETO } : {},
              ]}
            >
              {linha[j] ?? ""}
            </Text>
          ))}
        </View>
      ))}
      {bloco.nota ? <Text style={s.nota}>{bloco.nota}</Text> : null}
    </View>
  );
}

function Texto({ bloco }: { bloco: BlocoTexto }) {
  return (
    <Secao
      titulo={bloco.titulo}
      itens={bloco.paragrafos.map((paragrafo, i) => (
        <Text key={i} style={s.paragrafo}>
          {paragrafo}
        </Text>
      ))}
    />
  );
}

function Resultado({ bloco }: { bloco: BlocoResultado }) {
  return (
    <Secao
      titulo={bloco.titulo}
      estilo={s.resultado}
      itens={bloco.itens.map((item, i) => (
        <View key={i} style={s.resultadoItem} wrap={false}>
          <View style={s.resultadoTopo}>
            <Text style={s.resultadoRotulo}>{item.label}</Text>
            <Text style={item.alerta ? [s.resultadoValor, s.resultadoValorAlerta] : s.resultadoValor}>
              {item.valor}
            </Text>
          </View>
          {item.nota ? <Text style={s.resultadoNota}>{item.nota}</Text> : null}
        </View>
      ))}
    />
  );
}

function Grafico({ bloco }: { bloco: BlocoImagem }) {
  const largura = Math.min(LARGURA_CONTEUDO, ALTURA_MAXIMA_GRAFICO * bloco.proporcao);
  return (
    <View style={s.bloco} wrap={false}>
      {bloco.titulo ? <Text style={s.tituloBloco}>{bloco.titulo}</Text> : null}
      <Image
        src={bloco.dataUrl}
        style={[s.grafico, { width: largura, height: largura / bloco.proporcao }]}
      />
    </View>
  );
}

export function Bloco({ bloco }: { bloco: BlocoPronto }) {
  switch (bloco.tipo) {
    case "campos":
      return <Campos bloco={bloco} />;
    case "tabela":
      return <Tabela bloco={bloco} />;
    case "texto":
      return <Texto bloco={bloco} />;
    case "resultado":
      return <Resultado bloco={bloco} />;
    case "imagem":
      return <Grafico bloco={bloco} />;
  }
}
