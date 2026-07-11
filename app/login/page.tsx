"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { BrandIcon } from "@/components/Brand";
import { PipeFlow } from "@/components/PipeFlow";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (carregando) return;
    setCarregando(true);
    setErro(null);
    const r = await login(email);
    if (!r.ok) {
      setErro(r.erro || "Não foi possível entrar.");
      setCarregando(false);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* brilho âmbar de fundo */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-amber/20 blur-[120px]" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandIcon className="h-16 w-16" />
          <h1 className="mt-4 font-display text-2xl font-bold uppercase tracking-[0.16em] text-zinc-100">
            Hidráulica de Casas
          </h1>
          <p className="mt-1 font-display text-xs font-semibold uppercase tracking-[0.4em] text-amber">
            Ferramentas
          </p>
          <p className="mt-4 text-sm text-zinc-400">
            Acesso exclusivo para alunos do curso.
          </p>
        </div>

        <form onSubmit={entrar} className="glass rounded-3xl p-6">
          <label className="block">
            <span className="field-label">E-mail do aluno</span>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErro(null);
              }}
              placeholder="voce@email.com"
              className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-800 px-4 py-3.5 text-base text-zinc-100 outline-none focus:border-amber/60"
            />
          </label>
          {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}

          <button
            type="submit"
            disabled={carregando}
            className="mt-5 w-full rounded-xl bg-amber py-3.5 font-display text-sm font-bold uppercase tracking-wider text-ink-900 transition active:scale-[0.98] disabled:opacity-60"
          >
            {carregando ? "Verificando…" : "Entrar"}
          </button>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-500">
            Use o mesmo e-mail da compra do curso.
            <br />
            <span className="text-zinc-600">
              Sua conta é liberada automaticamente ao adquirir o curso.
            </span>
          </p>
        </form>

        <div className="mt-10 opacity-70">
          <PipeFlow velocidade={1} progresso={1} label="água quente" />
        </div>
      </div>
    </main>
  );
}
