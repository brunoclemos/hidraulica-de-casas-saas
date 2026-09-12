// Texto da tela -> texto do documento: notação técnica que as fontes padrão do PDF
// não codificam, e ponto decimal virando vírgula.
//
// As fontes padrão (Helvetica) só codificam WinAnsi. Caractere fora dessa tabela não
// dá erro: sai como glifo trocado ou desaparece — no teste, "≈" virou "H", "→" virou
// "’" e "ρ = 1000 kg/m³" perdeu o rho. Os módulos usam Δ, π, ρ, Σ, √, ≤, →,
// expoentes e subscritos, então tudo isso é transliterado antes de entrar no PDF.

// Sequências primeiro: "Dⁱⁿᵗ" é um nome (D interno), não um expoente.
const SEQUENCIAS: [RegExp, string][] = [
  [/ⁱⁿᵗ/g, "int"],
  [/ΔT/g, "delta T"],
];

const EXPOENTES: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁻": "-",
  "·": ",",
};

// Expoente só vira "^..." quando tem algum caractere que o WinAnsi não codifica:
// "m²" e "m³" ficam como estão, "10⁻⁴" e "Q¹·⁷⁵" viram "10^-4" e "Q^1,75".
const CORRIDA_EXPOENTE = /[⁰¹²³⁴-⁹⁻]+(?:·[⁰¹²³⁴-⁹]+)*/g;
const EXPOENTE_CODIFICAVEL = /^[¹²³]+$/;

const CARACTERES: Record<string, string> = {
  "−": "-",
  "→": "->",
  "←": "<-",
  "↔": "<->",
  "≤": "<=",
  "≥": ">=",
  "≈": "~",
  "≠": "!=",
  "∝": "prop. a",
  "√": "raiz ",
  "⌈": "[",
  "⌉": "]",
  "★": "*",
  "ṁ": "m",
  "′": "'",
  "″": '"',
  "⌀": "Ø",
  " ": " ",
  "Δ": "delta",
  "Σ": "soma ",
  "π": "pi",
  "ρ": "rho",
  "ν": "nu",
  "τ": "tau",
  "μ": "µ", // mu grego -> sinal de micro, que o WinAnsi codifica
  "α": "alfa",
  "β": "beta",
  "γ": "gama",
  "δ": "delta",
  "ε": "epsilon",
  "η": "eta",
  "θ": "teta",
  "λ": "lambda",
  "φ": "fi",
  "ω": "ómega",
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};

// Além do Latin-1 imprimível, o WinAnsi tem 27 posições próprias (travessão, meia
// risca, aspas curvas, bullet, reticências) — essas passam.
const EXTRAS_WINANSI = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function codificavel(codigo: number): boolean {
  if (codigo === 0x0a) return true;
  if (codigo >= 0x20 && codigo <= 0x7e) return true;
  if (codigo >= 0xa0 && codigo <= 0xff) return true;
  return EXTRAS_WINANSI.has(codigo);
}

export function paraWinAnsi(texto: string): string {
  let s = texto;
  for (const [de, para] of SEQUENCIAS) s = s.replace(de, para);
  s = s.replace(CORRIDA_EXPOENTE, (corrida) =>
    EXPOENTE_CODIFICAVEL.test(corrida)
      ? corrida
      : `^${Array.from(corrida)
          .map((c) => EXPOENTES[c] ?? c)
          .join("")}`,
  );
  return Array.from(s)
    .map((c) => CARACTERES[c] ?? c)
    .join("")
    .split("")
    .filter((c) => codificavel(c.codePointAt(0) ?? 0))
    .join("");
}

// As telas formatam número de duas maneiras: `toFixed` (ponto decimal, "7.26 mca") e
// `Intl`/`toLocaleString("pt-BR")` (vírgula decimal e PONTO de milhar, "43.200
// kcal/h", "R$ 5.089"). Documento em português pede vírgula decimal, e trocar todo
// ponto entre dígitos transformaria 43.200 kcal/h em 43,200 kcal/h — erro de mil
// vezes num documento assinado. Daí a classificação por token.

const NUMERO = /\d+(?:[.,]\d+)*/g;

// milhar agrupado: 1 a 3 dígitos (sem zero à frente) + grupo de 3
const MILHAR = /^[1-9]\d{0,2}\.\d{3}$/;

// Unidades cujo valor nunca chega a mil nesta ferramenta: junto delas "12.345" só
// pode ser decimal. As de grandeza grande (kcal, L, W, R$) ficam fora da lista.
const UNIDADE_FRACIONARIA = /(mca\/m|mca|bar|m\/s|°C|m³\/h|m\/m|kgf\/cm²)\b/;

/**
 * Ponto decimal -> vírgula, sem estragar milhar já formatado nem código de modelo.
 * `fracionario` resolve o caso ambíguo ("12.345" pode ser milhar ou 3 decimais) a
 * favor do decimal, e é decidido por coluna em `colunaFracionaria`.
 */
export function virgulaDecimal(texto: string, fracionario = false): string {
  return texto.replace(NUMERO, (token: string, posicao: number) => {
    // "TOP BLUE1.5", "KOCS PR2.0": modelo de equipamento, não é número
    if (/[A-Za-z]/.test(texto[posicao - 1] ?? "")) return token;
    if (token.includes(",") || !token.includes(".")) return token;
    if ((token.match(/\./g) ?? []).length > 1) return token;
    if (!MILHAR.test(token)) return token.replace(".", ",");
    const depois = texto.slice(posicao + token.length);
    return fracionario || UNIDADE_FRACIONARIA.test(depois.slice(0, 12))
      ? token.replace(".", ",")
      : token;
  });
}

/**
 * Coluna de tabela em que "12.345" é decimal: a unidade está no cabeçalho, ou alguma
 * célula já é decimal sem ambiguidade. Sem isso a mesma coluna sairia com "0,135" e
 * "1.080" lado a lado.
 */
export function colunaFracionaria(cabecalho: string, celulas: string[]): boolean {
  if (UNIDADE_FRACIONARIA.test(cabecalho)) return true;
  return celulas.some((c) => /\d,\d/.test(c) || virgulaDecimal(c) !== c);
}

/** Texto de valor: vírgula decimal e só caracteres que as fontes padrão codificam. */
export function valorDeDocumento(texto: string, fracionario = false): string {
  return paraWinAnsi(virgulaDecimal(texto, fracionario));
}
