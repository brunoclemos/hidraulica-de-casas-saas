// Memorial de cálculo em A4 retrato. Cabeçalho do escritório, identificação do
// documento, os blocos que o módulo mandou, assinatura do responsável técnico e
// rodapé paginado em todas as páginas.

import { Document, Font, Image, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import { perfilPreenchido, type Perfil } from "@/lib/perfil";
import { Bloco } from "./Blocos";
import { AMBAR_TINTA, s } from "./estilos";
import type { MemorialPronto } from "./tipos";

// O react-pdf hifeniza com padrões de inglês e quebrou "Velocidade" em "Ve-locidade".
// Devolver a palavra inteira desliga a hifenização; a quebra passa a ser só no espaço.
Font.registerHyphenationCallback((palavra) => [palavra]);

const DATA_LONGA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const VAZIO = "—";

// O <Image> do react-pdf só decodifica PNG e JPEG. Logo em SVG (ou data URL
// estranha) cai na marca da ferramenta em vez de derrubar o documento.
const LOGO_SUPORTADA = /^data:image\/(png|jpe?g);base64,/i;

function MarcaFerramenta() {
  return (
    <View style={s.marca}>
      <Svg viewBox="0 0 694 663" style={s.marcaIcone}>
        <Path d="M0 314.005L231.06 226.617V660.596H0V314.005Z" fill={AMBAR_TINTA} />
        <Path d="M462.121 315.486L693.181 228.098V662.077H462.121V315.486Z" fill={AMBAR_TINTA} />
        <Path d="M231.06 87.3882L462.121 0V539.141L231.06 433.979V87.3882Z" fill={AMBAR_TINTA} />
      </Svg>
      <View>
        <Text style={s.marcaNome}>HIDRÁULICA</Text>
        <Text style={s.marcaAssinatura}>DE CASAS</Text>
      </View>
    </View>
  );
}

// O campo do perfil sugere "CREA-RS 123456", então o número costuma chegar já com o
// prefixo: repetir daria "CREA CREA-SP 123456/D" no cabeçalho e na assinatura.
function comPrefixoCrea(crea: string): string {
  return /^crea/i.test(crea.trim()) ? crea.trim() : `CREA ${crea.trim()}`;
}

function linhasDoEscritorio(perfil: Perfil): string[] {
  const creaLinha = perfil.crea === "" ? "" : comPrefixoCrea(perfil.crea);
  return [perfil.responsavel, creaLinha, perfil.cidade, perfil.telefone, perfil.contato].filter(
    (l) => l.trim() !== "",
  );
}

function Cabecalho({ perfil }: { perfil: Perfil }) {
  const comLogo = LOGO_SUPORTADA.test(perfil.logo);
  const temPerfil = perfilPreenchido(perfil);
  return (
    <View>
      <View style={s.cabecalho}>
        {comLogo ? (
          <View style={s.marca}>
            <Image src={perfil.logo} style={s.logo} />
          </View>
        ) : temPerfil ? (
          <View style={s.marca}>
            <Text style={s.empresa}>{perfil.empresa || perfil.responsavel}</Text>
          </View>
        ) : (
          <MarcaFerramenta />
        )}
        <View style={s.escritorio}>
          {comLogo && perfil.empresa !== "" ? <Text style={s.empresa}>{perfil.empresa}</Text> : null}
          {linhasDoEscritorio(perfil).map((linha) => (
            <Text key={linha} style={s.escritorioLinha}>
              {linha}
            </Text>
          ))}
        </View>
      </View>
      <View style={s.regra} />
    </View>
  );
}

function Campo({ rotulo, valor, largo }: { rotulo: string; valor: string; largo?: boolean }) {
  return (
    <View style={largo ? s.identColunaLarga : s.identColuna}>
      <Text style={s.identRotulo}>{rotulo}</Text>
      <Text style={largo ? s.identValorLargo : s.identValor}>{valor === "" ? VAZIO : valor}</Text>
    </View>
  );
}

function Identificacao({ memorial }: { memorial: MemorialPronto }) {
  const { perfil } = memorial;
  return (
    <View style={s.identificacao}>
      <View style={s.identLinha}>
        <Campo rotulo="Obra / Cliente" valor={memorial.cliente} />
        <Campo rotulo="Emitido em" valor={DATA_HORA.format(memorial.emitidoEm)} />
      </View>
      <View style={s.identLinha}>
        <Campo rotulo="Cálculo" valor={memorial.calculo} />
        <Campo rotulo="Responsável técnico" valor={perfil.responsavel} />
      </View>
      <View style={s.identLinha}>
        <Campo rotulo="Módulo" valor={memorial.moduloNome} />
        <Campo rotulo="CREA" valor={perfil.crea} />
      </View>
      <View style={s.identLinha}>
        <Campo rotulo="Normas aplicadas" valor={memorial.normas.join(" · ")} largo />
      </View>
    </View>
  );
}

function Assinatura({ perfil, emitidoEm }: { perfil: Perfil; emitidoEm: Date }) {
  const local = perfil.cidade === "" ? "" : `${perfil.cidade}, `;
  const cargo =
    perfil.crea === "" ? "Responsável técnico" : `Responsável técnico · ${comPrefixoCrea(perfil.crea)}`;
  return (
    <View style={s.assinatura} wrap={false}>
      <Text style={s.localData}>{`${local}${DATA_LONGA.format(emitidoEm)}`}</Text>
      <View style={s.linhaAssinatura} />
      <Text style={s.responsavel}>{perfil.responsavel === "" ? VAZIO : perfil.responsavel}</Text>
      <Text style={s.responsavelCargo}>{cargo}</Text>
    </View>
  );
}

function Rodape({ memorial }: { memorial: MemorialPronto }) {
  const identificacao = [
    memorial.perfil.empresa || "Hidráulica de Casas",
    memorial.moduloNome,
    memorial.calculo,
    memorial.cliente,
  ]
    .filter((p) => p.trim() !== "")
    .join(" · ");
  return (
    <View style={s.rodape} fixed>
      <Text style={s.rodapeTexto}>{identificacao}</Text>
      <Text
        style={s.rodapePagina}
        render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`}
      />
    </View>
  );
}

export function Memorial({ memorial, titulo }: { memorial: MemorialPronto; titulo: string }) {
  const autor = memorial.perfil.responsavel || memorial.perfil.empresa || "Hidráulica de Casas";
  return (
    <Document
      title={titulo}
      author={autor}
      subject={`Memorial de cálculo — ${memorial.moduloNome}`}
      creator="Hidráulica de Casas"
      producer="Hidráulica de Casas"
      language="pt-BR"
    >
      <Page size="A4" orientation="portrait" style={s.pagina}>
        <Cabecalho perfil={memorial.perfil} />
        <Text style={s.titulo}>Memorial de Cálculo</Text>
        <Text style={s.subtitulo}>{memorial.moduloNome}</Text>
        <Identificacao memorial={memorial} />
        {memorial.blocos.map((bloco, i) => (
          <Bloco key={i} bloco={bloco} />
        ))}
        <Assinatura perfil={memorial.perfil} emitidoEm={memorial.emitidoEm} />
        <Rodape memorial={memorial} />
      </Page>
    </Document>
  );
}
