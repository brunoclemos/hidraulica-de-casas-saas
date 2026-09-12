"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSessao, logout, ehAcessoInterno, Sessao } from "@/lib/auth";
import { Wordmark } from "@/components/Brand";
import { Marquee } from "@/components/Marquee";
import { moduloLiberado } from "@/lib/modulos";
import { iniciarHeartbeat, registrarEvento } from "@/lib/telemetria";
import { sincronizarProjetos } from "@/lib/projetos";
import { FolhaImpressao } from "@/components/FolhaImpressao";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [pronto, setPronto] = useState(false);
  const moduloAtual = pathname?.match(/^\/modulos\/([^/]+)/)?.[1] ?? null;

  useEffect(() => {
    const s = getSessao();
    if (!s) {
      router.replace("/login");
      return;
    }
    // guard: módulo bloqueado acessado por link direto -> volta ao dashboard.
    // Acesso interno (dono/dev/cliente) passa direto em qualquer módulo.
    if (moduloAtual && !moduloLiberado(moduloAtual) && !ehAcessoInterno(s.email)) {
      router.replace("/dashboard");
      return;
    }
    setSessao(s);
    setPronto(true);
  }, [router, pathname, moduloAtual]);

  // telemetria: heartbeat (tempo na plataforma) + sync inicial dos projetos
  useEffect(() => {
    const s = getSessao();
    if (!s) return;
    void sincronizarProjetos();
    return iniciarHeartbeat(s.email);
  }, []);

  // telemetria: registra abertura de módulo
  useEffect(() => {
    const s = getSessao();
    if (s && moduloAtual && moduloLiberado(moduloAtual)) {
      registrarEvento(s.email, "modulo_aberto", moduloAtual);
    }
  }, [moduloAtual]);

  if (!pronto) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-500">
        Carregando…
      </main>
    );
  }

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-900/80 backdrop-blur print:hidden">
        {/* abaixo de 360px o botão de PDF não cabe na linha: quebra em duas em vez
            de empurrar o "Sair" pra fora da tela */}
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3 max-[359px]:flex-wrap">
          <Link href="/dashboard">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {moduloAtual && (
              <button
                onClick={() => window.print()}
                aria-label="Exportar este dimensionamento em PDF"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-amber/50 hover:text-amber"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M6 7.5V3h8v4.5" strokeLinejoin="round" />
                  <path d="M6 14.5H4.5A1.5 1.5 0 013 13V9a1.5 1.5 0 011.5-1.5h11A1.5 1.5 0 0117 9v4a1.5 1.5 0 01-1.5 1.5H14" strokeLinejoin="round" />
                  <path d="M6 12h8v5H6z" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">PDF</span>
              </button>
            )}
            <Link
              href="/clientes"
              className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-amber/50 hover:text-amber"
            >
              Clientes
            </Link>
            <span className="hidden text-xs text-zinc-500 sm:block">
              {sessao?.email}
            </span>
            <button
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
            >
              Sair
            </button>
          </div>
        </div>
        <Marquee />
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 print:pt-0">
        {moduloAtual && sessao && <FolhaImpressao modulo={moduloAtual} email={sessao.email} />}
        {children}
      </main>
    </div>
  );
}
