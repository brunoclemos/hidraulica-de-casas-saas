"use client";

// Estrela de favoritar conexão (áudio do cliente 22/jul): favoritas sobem pro topo.
export function EstrelaFavorita({ ativa, onClick }: { ativa: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      aria-label={ativa ? "Remover conexão dos favoritos" : "Favoritar conexão"}
      className="-m-1 shrink-0 rounded-lg p-2 active:scale-95"
    >
      <svg
        viewBox="0 0 20 20"
        className={ativa ? "h-4 w-4 fill-amber text-amber" : "h-4 w-4 fill-none text-zinc-600"}
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          d="M10 2.5l2.32 4.7 5.18.75-3.75 3.66.89 5.16L10 14.33l-4.64 2.44.89-5.16L2.5 7.95l5.18-.75L10 2.5z"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
