// Clique do botão -> arquivo na pasta de downloads.
//
// O react-pdf (centenas de KB) e o renderer entram por import() no clique: quem só
// abre uma calculadora não paga esse peso no First Load JS.

import { lerMemorial } from "@/lib/memorial";
import { moduloNome } from "@/lib/modulos";
import { carregarPerfil } from "@/lib/perfil";
import { registrarEvento } from "@/lib/telemetria";
import { prepararMemorial } from "./preparar";

export type ResultadoMemorial =
  | { ok: true; avisos: string[] }
  | { ok: false; motivo: string };

const SEM_DADOS =
  "Este módulo ainda não emite memorial em PDF. Use o dimensionamento na tela por enquanto.";

function nomeDoArquivo(partes: string[]): string {
  return partes
    .filter((p) => p.trim() !== "")
    .join(" - ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
}

function diaDoArquivo(em: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${em.getFullYear()}-${pad(em.getMonth() + 1)}-${pad(em.getDate())}`;
}

function baixar(blob: Blob, arquivo: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = arquivo;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // revogar na hora corta o download em alguns navegadores
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function gerarMemorial(modulo: string, email: string): Promise<ResultadoMemorial> {
  const dados = lerMemorial(modulo);
  if (!dados) return { ok: false, motivo: SEM_DADOS };
  if (dados.impedimento) return { ok: false, motivo: dados.impedimento };

  const nome = moduloNome(modulo);
  const emitidoEm = new Date();
  const perfil = await carregarPerfil();
  const { memorial, avisos } = await prepararMemorial({ dados, perfil, moduloNome: nome, emitidoEm });

  const titulo = nomeDoArquivo([dados.cliente, dados.calculo, nome, diaDoArquivo(emitidoEm)]);
  const [{ pdf }, { Memorial }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./Memorial"),
  ]);
  const blob = await pdf(<Memorial memorial={memorial} titulo={titulo} />).toBlob();

  baixar(blob, `${titulo}.pdf`);
  registrarEvento(email, "pdf_exportado", modulo);
  return { ok: true, avisos };
}
