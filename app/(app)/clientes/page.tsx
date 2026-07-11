"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandIcon } from "@/components/Brand";
import { moduloNome, moduloLiberado } from "@/lib/modulos";
import { ehAcessoInterno } from "@/lib/auth";
import {
  listarClientes,
  listarPorCliente,
  excluirProjeto,
  renomearCliente,
  tempoRelativo,
  PastaCliente,
  Projeto,
} from "@/lib/projetos";

export default function ClientesPage() {
  const router = useRouter();
  const [pastas, setPastas] = useState<PastaCliente[]>([]);
  const [aberta, setAberta] = useState<string | null>(null); // cliente da pasta aberta (null = lista de pastas)
  const [editando, setEditando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [interno, setInterno] = useState(false); // acesso interno abre cálculo de qualquer módulo

  const refresh = () => setPastas(listarClientes());
  useEffect(() => {
    refresh();
    setInterno(ehAcessoInterno());
  }, []);

  const itens = useMemo(
    () => (aberta === null ? [] : listarPorCliente(aberta)),
    [aberta, pastas]
  );

  function abrirCalculo(p: Projeto) {
    if (!moduloLiberado(p.modulo) && !interno) return;
    router.push(`/modulos/${p.modulo}?projeto=${p.id}`);
  }

  function excluir(p: Projeto) {
    excluirProjeto(p.id);
    refresh();
  }

  function confirmarRenomear() {
    const alvo = aberta ?? "";
    const destino = novoNome.trim();
    if (destino && destino !== alvo) {
      renomearCliente(alvo, destino);
      setAberta(destino);
    }
    setEditando(false);
    refresh();
  }

  const rotulo = (c: string) => c || "Sem cliente";

  // ---------------------------------------------------------------- lista de pastas
  if (aberta === null) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
              ← Ferramentas
            </Link>
            <h1 className="mt-1 font-display text-2xl font-bold text-zinc-100">Clientes</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Cada pasta reúne todos os cálculos de um cliente — de qualquer ferramenta.
            </p>
          </div>
        </div>

        {pastas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-600 p-8 text-center">
            <BrandIcon className="mx-auto h-10 w-10 opacity-30" color="#FABA0D" />
            <p className="mt-3 text-sm text-zinc-400">
              Nenhum cálculo salvo ainda. Abra uma ferramenta, faça um cálculo e informe o
              <span className="text-amber"> cliente</span> ao salvar — ele aparece aqui.
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block rounded-xl bg-amber px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-900"
            >
              Ver ferramentas
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {pastas.map((pasta) => (
              <li key={pasta.cliente || "__sem__"}>
                <button
                  onClick={() => {
                    setAberta(pasta.cliente);
                    setEditando(false);
                  }}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-ink-700 bg-ink-800 p-4 text-left transition hover:border-amber/50"
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      pasta.cliente ? "bg-amber/15" : "bg-zinc-100/5"
                    }`}
                  >
                    <PastaIcon color={pasta.cliente ? "#FABA0D" : "#71717a"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-display text-base font-bold ${
                        pasta.cliente ? "text-zinc-100" : "text-zinc-400 italic"
                      }`}
                    >
                      {rotulo(pasta.cliente)}
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      {pasta.qtd} {pasta.qtd === 1 ? "cálculo" : "cálculos"} · mexido{" "}
                      {tempoRelativo(pasta.atualizadoEm)}
                    </span>
                  </span>
                  <span className="text-zinc-600 transition group-hover:text-amber">→</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- pasta aberta
  return (
    <div className="space-y-5">
      <div>
        <button
          onClick={() => {
            setAberta(null);
            setEditando(false);
          }}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Clientes
        </button>

        {editando ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              autoFocus
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarRenomear();
                if (e.key === "Escape") setEditando(false);
              }}
              className="min-w-0 flex-1 rounded-xl border border-amber/50 bg-ink-800 px-3 py-2 font-display text-lg font-bold text-zinc-100 outline-none"
            />
            <button onClick={confirmarRenomear} className="shrink-0 text-sm font-bold text-amber">
              salvar
            </button>
            <button
              onClick={() => setEditando(false)}
              className="shrink-0 text-sm text-zinc-500 hover:text-zinc-300"
            >
              cancelar
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-3">
            <h1
              className={`font-display text-2xl font-bold ${
                aberta ? "text-zinc-100" : "text-zinc-400 italic"
              }`}
            >
              {rotulo(aberta)}
            </h1>
            {aberta && (
              <button
                onClick={() => {
                  setNovoNome(aberta);
                  setEditando(true);
                }}
                className="text-xs text-zinc-500 hover:text-amber"
              >
                renomear
              </button>
            )}
          </div>
        )}
        <p className="mt-1 text-sm text-zinc-400">
          {itens.length} {itens.length === 1 ? "cálculo" : "cálculos"} nesta pasta.
        </p>
      </div>

      {itens.length === 0 ? (
        <p className="text-sm text-zinc-500">Esta pasta ficou vazia.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((p) => {
            const liberado = moduloLiberado(p.modulo) || interno;
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-800 px-3 py-3"
              >
                <button
                  onClick={() => abrirCalculo(p)}
                  disabled={!liberado}
                  className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                >
                  <div className="truncate text-sm font-semibold text-zinc-100">{p.nome}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
                      {moduloNome(p.modulo)}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      salvo {tempoRelativo(p.atualizadoEm)}
                    </span>
                  </div>
                </button>
                {liberado ? (
                  <button
                    onClick={() => abrirCalculo(p)}
                    className="shrink-0 rounded-lg bg-amber px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-900 active:scale-95"
                  >
                    Abrir
                  </button>
                ) : (
                  <span className="shrink-0 text-[11px] text-zinc-600">em breve</span>
                )}
                <button
                  onClick={() => excluir(p)}
                  className="shrink-0 text-xs text-zinc-500 hover:text-red-400"
                >
                  excluir
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PastaIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
