// Paleta e medidas do documento. O app é escuro (âmbar #FABA0D sobre preto-petróleo
// #21211F), mas memorial de cálculo se imprime: fundo branco, tinta escura e âmbar
// só como acento do cabeçalho e do realce.

import { StyleSheet } from "@react-pdf/renderer";

export const PRETO = "#21211F";
const TINTA = "#33332F";
const SUAVE = "#6B6B66";
const LINHA = "#D5D5D0";
const AMBAR = "#FABA0D";
export const AMBAR_TINTA = "#8A6000";
const REALCE = "#FDF3D6";
const ALERTA = "#B3261E";
const CINZA_CLARO = "#F5F5F2";

const MARGEM_LATERAL = 38;
const MARGEM_INFERIOR = 52;

/** Largura útil da folha A4 retrato, em pontos. */
export const LARGURA_CONTEUDO = 595.28 - MARGEM_LATERAL * 2;

export const s = StyleSheet.create({
  pagina: {
    paddingTop: 32,
    paddingBottom: MARGEM_INFERIOR,
    paddingHorizontal: MARGEM_LATERAL,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: TINTA,
    backgroundColor: "#FFFFFF",
  },

  cabecalho: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  marca: { flexDirection: "row", alignItems: "center", maxWidth: 300 },
  logo: { width: 116, height: 44, objectFit: "contain" },
  marcaIcone: { width: 22, height: 21, marginRight: 6 },
  marcaNome: { fontFamily: "Helvetica-Bold", fontSize: 11, color: PRETO, letterSpacing: 1.6 },
  marcaAssinatura: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: AMBAR_TINTA, letterSpacing: 2.6 },
  empresa: { fontFamily: "Helvetica-Bold", fontSize: 11, color: PRETO, marginBottom: 2 },
  escritorio: { alignItems: "flex-end", maxWidth: 210 },
  escritorioLinha: { fontSize: 8, color: SUAVE, textAlign: "right", marginBottom: 1.5 },
  regra: { height: 2, backgroundColor: AMBAR, marginTop: 8 },
  titulo: { fontFamily: "Helvetica-Bold", fontSize: 14, color: PRETO, marginTop: 14 },
  subtitulo: { fontSize: 9.5, color: SUAVE, marginTop: 2 },

  identificacao: {
    marginTop: 12,
    borderWidth: 0.6,
    borderColor: LINHA,
    backgroundColor: CINZA_CLARO,
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  identLinha: { flexDirection: "row" },
  identColuna: { width: "50%", flexDirection: "row", paddingRight: 8, paddingVertical: 1.5 },
  identColunaLarga: { width: "100%", flexDirection: "row", paddingVertical: 1.5 },
  identRotulo: { width: 92, fontSize: 8, color: SUAVE },
  identValor: { width: 155, fontSize: 8.5, color: PRETO, fontFamily: "Helvetica-Bold" },
  identValorLargo: { width: 409, fontSize: 8.5, color: PRETO },

  bloco: { marginTop: 16 },
  tituloBloco: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: PRETO,
    borderBottomWidth: 1,
    borderBottomColor: AMBAR,
    paddingBottom: 3,
    marginBottom: 6,
  },
  nota: { fontSize: 7.5, color: SUAVE, marginTop: 4 },

  campoPar: { flexDirection: "row" },
  campoItem: {
    width: "50%",
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.4,
    borderBottomColor: LINHA,
    paddingVertical: 2.5,
    paddingRight: 10,
  },
  campoRotulo: { width: 150, fontSize: 8.5, color: SUAVE },
  campoValor: { width: 95, fontSize: 8.5, color: PRETO, fontFamily: "Helvetica-Bold", textAlign: "right" },

  tabelaCabecalho: {
    flexDirection: "row",
    backgroundColor: PRETO,
    paddingVertical: 3.5,
    paddingHorizontal: 2,
  },
  tabelaCabecalhoCelula: { fontSize: 7.5, color: "#FFFFFF", fontFamily: "Helvetica-Bold", paddingHorizontal: 3 },
  tabelaLinha: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: LINHA,
    paddingVertical: 2.5,
    paddingHorizontal: 2,
  },
  tabelaLinhaRealce: { backgroundColor: REALCE },
  tabelaCelula: { fontSize: 7.5, color: TINTA, paddingHorizontal: 3 },

  resultado: {
    borderLeftWidth: 3,
    borderLeftColor: AMBAR,
    backgroundColor: CINZA_CLARO,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  resultadoItem: { paddingVertical: 2.5, borderBottomWidth: 0.4, borderBottomColor: LINHA },
  resultadoTopo: { flexDirection: "row", justifyContent: "space-between" },
  resultadoRotulo: { width: 320, fontSize: 9, color: SUAVE },
  resultadoValor: { width: 150, fontSize: 10, color: PRETO, fontFamily: "Helvetica-Bold", textAlign: "right" },
  resultadoValorAlerta: { color: ALERTA },
  resultadoNota: { fontSize: 7.5, color: SUAVE, marginTop: 1.5, width: 460 },

  paragrafo: { fontSize: 9, color: TINTA, lineHeight: 1.45, marginBottom: 4 },

  grafico: { alignSelf: "center" },
  legenda: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 6 },
  legendaItem: { flexDirection: "row", alignItems: "center", marginRight: 14, marginBottom: 2 },
  legendaAmostra: { width: 12, height: 3.5, borderRadius: 1.75, marginRight: 4 },
  legendaNome: { fontSize: 7.5, color: TINTA },

  assinatura: { marginTop: 34, alignItems: "center" },
  localData: { fontSize: 9, color: TINTA, marginBottom: 26 },
  linhaAssinatura: { width: 260, borderTopWidth: 0.8, borderTopColor: PRETO, marginBottom: 4 },
  responsavel: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: PRETO },
  responsavelCargo: { fontSize: 8, color: SUAVE, marginTop: 1.5 },

  rodape: {
    position: "absolute",
    bottom: 22,
    left: MARGEM_LATERAL,
    right: MARGEM_LATERAL,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.6,
    borderTopColor: LINHA,
    paddingTop: 4,
  },
  rodapeTexto: { fontSize: 7, color: SUAVE, maxWidth: 420 },
  rodapePagina: { fontSize: 7, color: SUAVE, textAlign: "right" },
});

export type EstiloPdf = (typeof s)[keyof typeof s];
