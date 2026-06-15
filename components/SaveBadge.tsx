"use client";

// Indicador de estado de salvamento (requisito: o aluno tem que entender
// na hora se está salvo ou não). Usa o pulso liveDot da ref.

export type EstadoSalvo = "salvo" | "nao-salvo" | "salvando";

export function SaveBadge({
  estado,
  quando,
}: {
  estado: EstadoSalvo;
  quando?: string;
}) {
  if (estado === "salvando") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-amber/10 px-3 py-1 text-xs font-medium text-amber">
        <span className="h-2 w-2 animate-live-dot rounded-full bg-amber" />
        Salvando…
      </span>
    );
  }
  if (estado === "salvo") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        Salvo {quando ? quando : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100/5 px-3 py-1 text-xs font-medium text-zinc-400">
      <span className="h-2 w-2 animate-live-dot rounded-full bg-amber" />
      Alterações não salvas
    </span>
  );
}
