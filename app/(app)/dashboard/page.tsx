"use client";

import Link from "next/link";
import { BrandIcon } from "@/components/Brand";
import { MODULOS } from "@/lib/modulos";

export default function Dashboard() {
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

      <div className="grid gap-3 sm:grid-cols-2">
        {MODULOS.map((m) => {
          const card = (
            <div
              className={`group relative h-full overflow-hidden rounded-2xl border p-5 transition ${
                m.liberado
                  ? "border-amber/30 bg-ink-800 hover:border-amber/60"
                  : "border-ink-700 bg-ink-800/40"
              }`}
            >
              <div className="absolute -right-6 -top-6 opacity-[0.06]">
                <BrandIcon className="h-24 w-24" color="#FABA0D" />
              </div>
              <div className="relative">
                <div className="mb-3 flex items-center justify-between">
                  <BrandIcon className="h-6 w-6" color={m.liberado ? "#FABA0D" : "#4A4A45"} />
                  {m.liberado ? (
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
                    m.liberado ? "text-zinc-100" : "text-zinc-400"
                  }`}
                >
                  {m.nome}
                </h2>
                <p className="mt-1.5 text-sm leading-snug text-zinc-500">{m.desc}</p>
              </div>
            </div>
          );

          return m.liberado ? (
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
