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
import { BotaoMemorial } from "@/components/pdf/BotaoMemorial";

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
        {/* com PDF + Perfil + Clientes + Sair a linha só cabe a partir de 420px:
            abaixo disso quebra em duas em vez de empurrar o "Sair" pra fora da tela */}
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3 max-[419px]:flex-wrap">
          <Link href="/dashboard">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {moduloAtual && sessao && <BotaoMemorial modulo={moduloAtual} email={sessao.email} />}
            <Link
              href="/perfil"
              className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-amber/50 hover:text-amber"
            >
              Perfil
            </Link>
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

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6">{children}</main>
    </div>
  );
}
