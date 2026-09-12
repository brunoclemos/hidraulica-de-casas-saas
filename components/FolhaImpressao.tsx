"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Wordmark } from "@/components/Brand";
import { moduloNome } from "@/lib/modulos";
import { registrarEvento } from "@/lib/telemetria";

// Cabeçalho e rodapé que só existem no papel (exportar em PDF pelo diálogo do
// navegador). As regras de @media print que escondem a interface e clareiam o tema
// ficam em globals.css.

interface Emissao {
  cliente: string;
  calculo: string;
  em: Date;
}

// O cliente e o nome do cálculo são estado interno de cada um dos 9 page.tsx dos
// módulos. Ler os dois pelos campos da barra de salvar mantém a exportação em três
// arquivos em vez de doze — e é o mesmo valor que o aluno vê na tela.
const CAMPO_CLIENTE = 'input[aria-label="Cliente"]';
const CAMPO_CALCULO = 'input[placeholder^="Nome do "]';

// "Meus projetos" é navegação, não dimensionamento: sai do papel. O bloco não tem
// marcação própria em nenhum módulo, então se chega nele pelo título.
const CARTAO = '[class*="rounded-2xl"]';

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function primeiroValorPreenchido(seletor: string): string {
  const campos = Array.from(document.querySelectorAll<HTMLInputElement>(seletor));
  return campos.map((c) => c.value.trim()).find((v) => v !== "") ?? "";
}

function cartoesDeProjetosSalvos(): HTMLElement[] {
  return Array.from(document.querySelectorAll("h3"))
    .filter((h) => h.textContent?.trim() === "Meus projetos")
    .map((h) => h.closest<HTMLElement>(CARTAO))
    .filter((c): c is HTMLElement => c !== null);
}

function nomeDoArquivo(modulo: string, e: Emissao): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dia = `${e.em.getFullYear()}-${pad(e.em.getMonth() + 1)}-${pad(e.em.getDate())}`;
  return [e.cliente, e.calculo, moduloNome(modulo), dia]
    .filter((p) => p !== "")
    .join(" - ")
    .replace(/[\\/:*?"<>|]/g, "-");
}

export function FolhaImpressao({ modulo, email }: { modulo: string; email: string }) {
  const [emissao, setEmissao] = useState<Emissao | null>(null);
  const tituloDaAba = useRef("");

  useEffect(() => {
    function antes() {
      const dados: Emissao = {
        cliente: primeiroValorPreenchido(CAMPO_CLIENTE),
        calculo: primeiroValorPreenchido(CAMPO_CALCULO),
        em: new Date(),
      };
      // o cabeçalho precisa estar no DOM antes de o Chrome paginar; um setState
      // comum só entraria depois que este handler retornasse, com a folha já montada
      flushSync(() => setEmissao(dados));
      cartoesDeProjetosSalvos().forEach((c) => c.setAttribute("data-print-ocultar", ""));
      tituloDaAba.current = document.title;
      // o Chrome sugere document.title como nome do arquivo salvo
      document.title = nomeDoArquivo(modulo, dados);
      registrarEvento(email, "pdf_exportado", modulo);
    }
    function depois() {
      document.title = tituloDaAba.current;
      cartoesDeProjetosSalvos().forEach((c) => c.removeAttribute("data-print-ocultar"));
    }
    window.addEventListener("beforeprint", antes);
    window.addEventListener("afterprint", depois);
    return () => {
      window.removeEventListener("beforeprint", antes);
      window.removeEventListener("afterprint", depois);
    };
  }, [modulo, email]);

  if (!emissao) return null;

  const quando = DATA_HORA.format(emissao.em);

  return (
    <>
      <div data-print-cabecalho className="hidden">
        <div className="flex items-start justify-between gap-6 border-b border-ink-600 pb-3">
          <div>
            <Wordmark />
            <h2 className="mt-2 font-display text-base font-bold text-zinc-100">
              {moduloNome(modulo)}
            </h2>
          </div>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-[10px] text-zinc-500">
            <dt>Cliente</dt>
            <dd className="text-zinc-200">{emissao.cliente || "—"}</dd>
            <dt>Cálculo</dt>
            <dd className="text-zinc-200">{emissao.calculo || "—"}</dd>
            <dt>Emitido em</dt>
            <dd className="text-zinc-200">{quando}</dd>
            <dt>Por</dt>
            <dd className="text-zinc-200">{email}</dd>
          </dl>
        </div>
      </div>

      <div data-print-rodape className="hidden text-[9px] text-zinc-500">
        <span>Hidráulica de Casas · {moduloNome(modulo)}</span>
        <span>
          {emissao.cliente ? `${emissao.cliente} · ` : ""}
          {emissao.calculo || "cálculo sem nome"} · {quando} · {email}
        </span>
      </div>
    </>
  );
}
