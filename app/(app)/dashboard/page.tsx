"use client";

import Link from "next/link";
import { BrandIcon } from "@/components/Brand";
import { MODULOS } from "@/lib/modulos";

export default function Dashboard() {
  const liberados = MODULOS.filter((m) => m.liberado);

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
        {liberados.map((m) => (
          <Link key={m.slug} href={`/modulos/${m.slug}`}>
            <div className="group relative h-full overflow-hidden rounded-2xl border border-amber/30 bg-ink-800 p-5 transition hover:border-amber/60">
              <div className="absolute -right-6 -top-6 opacity-[0.06]">
                <BrandIcon className="h-24 w-24" color="#FABA0D" />
              </div>
              <div className="relative">
                <div className="mb-3 flex items-center justify-between">
                  <BrandIcon className="h-6 w-6" color="#FABA0D" />
                  <span className="rounded-full bg-amber/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
                    Disponível
                  </span>
                </div>
                <h2 className="font-display text-base font-bold leading-tight text-zinc-100">
                  {m.nome}
                </h2>
                <p className="mt-1.5 text-sm leading-snug text-zinc-400">{m.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
