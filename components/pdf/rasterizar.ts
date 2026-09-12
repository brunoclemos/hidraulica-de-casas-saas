import { virgulaDecimal } from "./texto";

// Gráfico da tela -> PNG para o documento.
//
// O SVG na página é desenhado para FUNDO ESCURO: grade em cinza-carvão, curvas em
// tons claros (âmbar #FABA0D, verde #4ade80, cinza #9ca3af). Jogado direto num
// documento branco, metade dele desaparece. Antes de rasterizar, cada cor é lida do
// estilo COMPUTADO do elemento original (é o que resolve classe do Tailwind e
// currentColor) e tem a luminosidade trocada: o que era claro vira tinta escura, o
// que era escuro (grade, pastilha de fundo, halo) vira cinza-claro.

// Corte entre decoração e conteúdo: luminância que dá menos de 2:1 de contraste
// contra o fundo do app (#191917, luminância ~0,008). A grade (#3A3A36) fica em
// 1,6:1 — decoração. O rótulo de eixo (#71717a) dá 3,7:1 — conteúdo, e precisa sair
// escuro no papel: com um corte mais alto ele saía cinza-claro, ilegível na folha.
const ESCURO_MAXIMO = 0.07;
const LUZ_DECORACAO = 0.87; // lightness de saída da grade e das pastilhas
const TINTA_CONTEUDO = 0.3; // lightness de saída das curvas, eixos e rótulos
const ESCALA = 2;
// Detector de folha em branco: rasterização que falha resulta em PNG todo branco
// (fração 0). Os gráficos reais medem 5% a 9% de tinta, então o piso é conservador
// — ele não promete detectar "a curva sumiu", só "nada foi desenhado".
const TINTA_MINIMA = 0.0005;

const PROPRIEDADES = ["fill", "stroke", "stop-color"] as const;

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

function lerCor(valor: string): Rgb | null {
  const v = valor.trim().toLowerCase();
  const funcional = v.match(/^rgba?\(([^)]+)\)$/);
  if (funcional) {
    const partes = funcional[1].split(/[\s,/]+/).filter((p) => p !== "");
    const [r, g, b] = partes.map((p) => Number.parseFloat(p));
    const a = partes.length > 3 ? Number.parseFloat(partes[3]) : 1;
    if ([r, g, b, a].some((n) => !Number.isFinite(n))) return null;
    return { r, g, b, a };
  }
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!hex) return null;
  const d = hex[1];
  const largo = d.length === 3 ? d.split("").map((c) => c + c).join("") : d;
  return {
    r: Number.parseInt(largo.slice(0, 2), 16),
    g: Number.parseInt(largo.slice(2, 4), 16),
    b: Number.parseInt(largo.slice(4, 6), 16),
    a: 1,
  };
}

function luminancia({ r, g, b }: Rgb): number {
  const canal = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function matizESaturacao({ r, g, b }: Rgb): { h: number; s: number } {
  const [vr, vg, vb] = [r / 255, g / 255, b / 255];
  const max = Math.max(vr, vg, vb);
  const min = Math.min(vr, vg, vb);
  const d = max - min;
  if (d === 0) return { h: 0, s: 0 };
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === vr) h = ((vg - vb) / d) % 6;
  else if (max === vg) h = (vb - vr) / d + 2;
  else h = (vr - vg) / d + 4;
  return { h: ((h * 60) % 360 + 360) % 360, s };
}

function hslParaHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const setor = Math.floor(h / 60) % 6;
  const bases: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = bases[setor].map((v) => Math.round((v + m) * 255));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Cor da tela (tema escuro) -> cor de papel. Devolve null quando não é cor.
 * Preenchimento escuro é sempre máscara de fundo (a pastilha atrás do rótulo, que
 * existe para cobrir a curva): no papel ela vira branca e desaparece. Traço escuro é
 * grade, e no papel precisa continuar visível — sai em cinza-claro.
 */
function paraPapel(valor: string, propriedade: string): string | null {
  const cor = lerCor(valor);
  if (!cor || cor.a === 0) return null;
  const { h, s } = matizESaturacao(cor);
  if (luminancia(cor) < ESCURO_MAXIMO) {
    return propriedade === "stroke" ? hslParaHex(h, Math.min(s, 0.08), LUZ_DECORACAO) : "#ffffff";
  }
  return hslParaHex(h, s, TINTA_CONTEUDO);
}

/**
 * Cor de série da tela -> cor de papel, com a mesma regra do gráfico. É o que mantém
 * a bolinha da legenda no tom exato da curva rasterizada.
 */
export function corParaPapel(cor: string): string {
  return paraPapel(cor, "stroke") ?? "#000000";
}

function reentintar(original: Element, copia: Element) {
  const computado = window.getComputedStyle(original);
  for (const prop of PROPRIEDADES) {
    const bruto = computado.getPropertyValue(prop) || copia.getAttribute(prop) || "";
    if (bruto === "" || bruto === "none" || bruto.startsWith("url(")) continue;
    const nova = paraPapel(bruto, prop);
    if (!nova) continue;
    const estilo = (copia as SVGElement).style;
    if (estilo.getPropertyValue(prop) !== "") estilo.setProperty(prop, nova);
    else copia.setAttribute(prop, nova);
  }
}

function dimensoes(svg: SVGSVGElement): { largura: number; altura: number } {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return { largura: vb.width, altura: vb.height };
  const caixa = svg.getBoundingClientRect();
  if (caixa.width > 0 && caixa.height > 0) return { largura: caixa.width, altura: caixa.height };
  throw new Error("o gráfico não tem dimensão na tela");
}

function fracaoDeTinta(dados: Uint8ClampedArray): number {
  let comTinta = 0;
  let lidos = 0;
  // amostra 1 pixel a cada 16: o suficiente para detectar folha vazia sem varrer
  // milhões de bytes a cada exportação
  for (let i = 0; i < dados.length; i += 64) {
    lidos += 1;
    if (dados[i] + dados[i + 1] + dados[i + 2] < 720) comTinta += 1;
  }
  return lidos === 0 ? 0 : comTinta / lidos;
}

async function carregarImagem(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  await new Promise<void>((resolver, rejeitar) => {
    img.onload = () => resolver();
    img.onerror = () => rejeitar(new Error("o navegador não conseguiu desenhar o SVG do gráfico"));
    img.src = url;
  });
  return img;
}

export async function rasterizarGrafico(
  seletor: string,
  proporcaoInformada?: number,
): Promise<{ dataUrl: string; proporcao: number }> {
  const svg = document.querySelector<SVGSVGElement>(seletor);
  if (!svg) throw new Error(`gráfico não encontrado na página (${seletor})`);

  const { largura, altura } = dimensoes(svg);
  const copia = svg.cloneNode(true) as SVGSVGElement;

  // o react-pdf não deduz tamanho de viewBox, e o <img> que rasteriza também não
  copia.setAttribute("width", String(largura));
  copia.setAttribute("height", String(altura));
  copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copia.removeAttribute("class");
  // sem a folha de estilo da página, texto sem font-family cai na fonte serif padrão
  copia.setAttribute("font-family", "Helvetica, Arial, sans-serif");

  const originais = [svg, ...Array.from(svg.querySelectorAll("*"))];
  const copias = [copia, ...Array.from(copia.querySelectorAll("*"))];
  originais.forEach((elemento, i) => reentintar(elemento, copias[i]));

  // rótulo de eixo é texto de valor como qualquer outro do documento: o gráfico da
  // tela escreve "6.3" e no papel tem que sair "6,3", igual às tabelas
  copia.querySelectorAll("text, tspan").forEach((no) => {
    no.childNodes.forEach((filho) => {
      if (filho.nodeType === Node.TEXT_NODE && filho.nodeValue) {
        filho.nodeValue = virgulaDecimal(filho.nodeValue);
      }
    });
  });

  const fonte = new XMLSerializer().serializeToString(copia);
  const img = await carregarImagem(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(fonte)}`);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(largura * ESCALA);
  canvas.height = Math.round(altura * ESCALA);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("o navegador não liberou o canvas para rasterizar o gráfico");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const tinta = fracaoDeTinta(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  if (tinta < TINTA_MINIMA) {
    throw new Error("o gráfico saiu em branco na conversão para papel");
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    proporcao: proporcaoInformada ?? largura / altura,
  };
}
