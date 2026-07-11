"use client";

import { useId } from "react";

// Campo "Cliente" da barra de salvar (todos os módulos). Um input com autocomplete
// (datalist) das pastas já existentes — o que agrupa os cálculos na tela de Clientes.

export function ClienteField({
  value,
  onChange,
  sugestoes,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  sugestoes: string[];
  className?: string;
}) {
  const listId = useId();
  return (
    <>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cliente"
        list={listId}
        aria-label="Cliente"
        className={`min-w-0 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber/60 ${className}`}
      />
      <datalist id={listId}>
        {sugestoes.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
