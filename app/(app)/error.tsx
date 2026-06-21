"use client";

// Error boundary de ROTA (Next App Router). Diferente do <ErrorBoundary> de componente,
// este é montado ACIMA da página, então captura também throws no CORPO de render da
// página (ex.: um cálculo que estoura antes do JSX montar) — caso contrário viraria a
// tela cheia "Application error: a client-side exception has occurred".
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
        <div className="font-display text-sm font-bold uppercase tracking-wider text-red-400">
          Algo quebrou nesta tela
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Costuma ser um projeto salvo em formato antigo. Tente recarregar — seus outros
          projetos continuam salvos.
        </p>
        <p className="mt-2 break-words text-[11px] text-zinc-600">{error?.message}</p>
        <button
          onClick={reset}
          className="mt-4 rounded-xl bg-amber px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-900 active:scale-95"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
