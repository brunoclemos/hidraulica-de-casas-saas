"use client";

import { useState } from "react";

export function BotaoMemorial({ modulo, email }: { modulo: string; email: string }) {
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function exportar() {
    setAviso(null);
    setGerando(true);
    try {
      // o gerador arrasta o rasterizador do gráfico e a preparação dos blocos: fora
      // do bundle compartilhado, que é carregado por quem só abre uma calculadora
      const { gerarMemorial } = await import("./gerar");
      const resultado = await gerarMemorial(modulo, email);
      if (!resultado.ok) setAviso(resultado.motivo);
      else if (resultado.avisos.length > 0) setAviso(resultado.avisos.join(" "));
    } catch (erro) {
      console.error("memorial não foi gerado", erro);
      const motivo = erro instanceof Error ? erro.message : String(erro);
      setAviso(`Não foi possível gerar o memorial: ${motivo}`);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => void exportar()}
        disabled={gerando}
        aria-label="Baixar o memorial de cálculo em PDF"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-amber/50 hover:text-amber disabled:opacity-60"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M11.5 2.5H5.5A1.5 1.5 0 004 4v12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0016 16V7l-4.5-4.5z" strokeLinejoin="round" />
          <path d="M11.5 2.5V7H16" strokeLinejoin="round" />
          <path d="M10 9.5v5m0 0l-2-2m2 2l2-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hidden sm:inline">{gerando ? "Gerando…" : "PDF"}</span>
      </button>

      {aviso && (
        <div
          role="status"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-amber/40 bg-ink-800 p-3 text-[11px] leading-relaxed text-zinc-200 shadow-xl"
        >
          {aviso}
          <button
            onClick={() => setAviso(null)}
            className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-amber"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
