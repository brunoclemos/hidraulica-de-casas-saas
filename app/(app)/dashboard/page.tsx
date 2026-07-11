"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandIcon } from "@/components/Brand";
import { MODULOS } from "@/lib/modulos";
import { ehAcessoInterno } from "@/lib/auth";

export default function Dashboard() {
  // Acesso interno (dono/dev/cliente) enxerga todos os módulos liberados. Lido no
  // client (localStorage) via effect pra não quebrar a hidratação do export estático.
  const [interno, setInterno] = useState(false);
  useEffect(() => setInterno(ehAcessoInterno()), []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-zinc-100">
          Ferramentas de Dimensionamento
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Suas planilhas do Módulo 04, agora num lugar só. Toque para abrir.
        </p>
      </div>

      <Link
        href="/clientes"
        className="mb-5 flex items-center gap-3 rounded-2xl border border-amber/30 bg-ink-800 p-4 transition hover:border-amber/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber/15">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
              stroke="#FABA0D"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold text-zinc-100">Clientes</span>
          <span className="block text-[12px] text-zinc-500">
            Cada cliente numa pasta, com todos os cálculos juntos. Abra e continue de onde parou.
          </span>
        </span>
        <span className="text-zinc-600">→</span>
      </Link>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODULOS.map((m) => {
          const disponivel = m.liberado || interno;
          const card = (
            <div
              className={`group relative h-full overflow-hidden rounded-2xl border p-5 transition ${
                disponivel
                  ? "border-amber/30 bg-ink-800 hover:border-amber/60"
                  : "border-ink-700 bg-ink-800/40"
              }`}
            >
              <div className="absolute -right-6 -top-6 opacity-[0.06]">
                <BrandIcon className="h-24 w-24" color="#FABA0D" />
              </div>
              <div className="relative">
                <div className="mb-3 flex items-center justify-between">
                  <BrandIcon className="h-6 w-6" color={disponivel ? "#FABA0D" : "#4A4A45"} />
                  {disponivel ? (
                    <span className="rounded-full bg-amber/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
                      Disponível
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-100/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Em breve
                    </span>
                  )}
                </div>
                <h2
                  className={`font-display text-base font-bold leading-tight ${
                    disponivel ? "text-zinc-100" : "text-zinc-400"
                  }`}
                >
                  {m.nome}
                </h2>
                <p className="mt-1.5 text-sm leading-snug text-zinc-500">{m.desc}</p>
              </div>
            </div>
          );

          return disponivel ? (
            <Link key={m.slug} href={`/modulos/${m.slug}`}>
              {card}
            </Link>
          ) : (
            <div key={m.slug} className="cursor-not-allowed" aria-disabled title="Em breve">
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}
