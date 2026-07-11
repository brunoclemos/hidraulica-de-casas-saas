"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSessao, logout, Sessao } from "@/lib/auth";
import { Wordmark } from "@/components/Brand";
import { Marquee } from "@/components/Marquee";
import { moduloLiberado } from "@/lib/modulos";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const s = getSessao();
    if (!s) {
      router.replace("/login");
      return;
    }
    // guard: módulo bloqueado acessado por link direto -> volta ao dashboard
    const m = pathname?.match(/^\/modulos\/([^/]+)/);
    if (m && !moduloLiberado(m[1])) {
      router.replace("/dashboard");
      return;
    }
    setSessao(s);
    setPronto(true);
  }, [router, pathname]);

  if (!pronto) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-500">
        Carregando…
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/dashboard">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-3">
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
