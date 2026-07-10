"use client";

import Link from "next/link";
import { BrandIcon } from "@/components/Brand";

const MODULOS = [
  {
    slug: "recirculacao",
    nome: "Tempo de Recirculação & Perda Térmica",
    desc: "Tempo até a água quente chegar, desperdício e resfriamento. Manifold × Convencional.",
    ativo: true,
  },
  {
    slug: "perfil-boiler",
    nome: "Perfil Térmico do Boiler",
    desc: "Simula minuto a minuto se o boiler segura banhos simultâneos. Gás × elétrica.",
    ativo: true,
  },
  {
    slug: "caixa-boiler-solar",
    nome: "Caixa d'Água, Boiler & Solar",
    desc: "Volume do boiler e nº de coletores solares, corrigidos por clima e orientação.",
    ativo: true,
  },
  {
    slug: "pvc-cpvc-pressao",
    nome: "PVC/CPVC, Bombas & Pressão",
    desc: "Dimensionamento trecho a trecho (NBR 5626) e pressão residual no ponto.",
    ativo: true,
  },
  {
    slug: "vaso-expansao",
    nome: "Vaso de Expansão",
    desc: "Volume do vaso por NBR 16057 e Caleffi, lado a lado.",
    ativo: true,
  },
  {
    slug: "circuladores",
    nome: "Cálculo de Circuladores",
    desc: "Perda de carga trecho a trecho, curva do sistema e seleção do circulador de recirculação.",
    ativo: true,
  },
  {
    slug: "balanco-vazao",
    nome: "Balanço de Vazão (Anel 1 × Anel 2)",
    desc: "Divide a vazão do tronco entre dois anéis em paralelo e mostra o tempo de recirculação de cada um.",
    ativo: true,
  },
  {
    slug: "tempo-espera",
    nome: "Tempo de Espera (Purga)",
    desc: "Tempo até a água quente chegar, somando vários trechos em série.",
    ativo: true,
  },
];

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
                m.ativo
                  ? "border-amber/30 bg-ink-800 hover:border-amber/60"
                  : "border-ink-700 bg-ink-800/40"
              }`}
            >
              <div className="absolute -right-6 -top-6 opacity-[0.06]">
                <BrandIcon className="h-24 w-24" color="#FABA0D" />
              </div>
              <div className="relative">
                <div className="mb-3 flex items-center justify-between">
                  <BrandIcon className="h-6 w-6" color={m.ativo ? "#FABA0D" : "#4A4A45"} />
                  {m.ativo ? (
                    <span className="rounded-full bg-amber/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
                      Disponível
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-100/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Em breve
                    </span>
                  )}
                </div>
                <h2 className="font-display text-base font-bold leading-tight text-zinc-100">
                  {m.nome}
                </h2>
                <p className="mt-1.5 text-sm leading-snug text-zinc-400">{m.desc}</p>
              </div>
            </div>
          );
          return m.ativo ? (
            <Link key={m.slug} href={`/modulos/${m.slug}`}>
              {card}
            </Link>
          ) : (
            <div key={m.slug} className="cursor-not-allowed">
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}
