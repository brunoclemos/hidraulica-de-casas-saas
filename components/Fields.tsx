"use client";

import { ReactNode } from "react";

export function NumberField({
  label,
  value,
  onChange,
  unit,
  step = 1,
  min,
  max,
  hint,
  compact,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
  /** Colunas estreitas (3 campos lado a lado em meia página): padding e fonte menores. */
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="mt-1 flex items-center rounded-xl border border-ink-600 bg-ink-800 focus-within:border-amber/60">
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          // Scroll da página com o campo focado incrementava o valor em silêncio
          // (comportamento nativo do input number no Chrome). Blur devolve o
          // scroll pra página e o valor digitado fica intacto.
          onWheel={(e) => e.currentTarget.blur()}
          className={`w-full bg-transparent font-semibold text-zinc-100 outline-none ${compact ? "px-2 py-2.5 text-sm" : "px-3 py-3 text-base"}`}
        />
        {unit && (
          <span className={`font-medium text-zinc-500 ${compact ? "pr-2 text-[10px]" : "px-3 text-sm"}`}>
            {unit}
          </span>
        )}
      </div>
      {hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

export function SelectField<T extends string | number>({
  label,
  value,
  onChange,
  options,
  hint,
  compact,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
  /** Colunas estreitas (3 campos lado a lado em meia página): padding e fonte menores. */
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="mt-1 rounded-xl border border-ink-600 bg-ink-800 focus-within:border-amber/60">
        <select
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            const num = Number(raw);
            onChange((typeof value === "number" ? (num as T) : (raw as T)));
          }}
          className={`w-full appearance-none bg-transparent font-semibold text-zinc-100 outline-none ${compact ? "px-2 py-2.5 text-sm" : "px-3 py-3 text-base"}`}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={o.value} className="bg-ink-800">
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = 12,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-12 w-12 rounded-xl border border-ink-600 bg-ink-800 text-xl font-bold text-amber active:scale-95"
        >
          −
        </button>
        <div className="flex h-12 flex-1 items-center justify-center rounded-xl border border-ink-600 bg-ink-800 text-lg font-bold text-zinc-100">
          {value}
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-12 w-12 rounded-xl border border-ink-600 bg-ink-800 text-xl font-bold text-amber active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  );
}

// Switch acessível pra usar no header do Accordion (não abre/fecha o details).
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault(); // dentro de <summary>: não abrir/fechar o accordion
        e.stopPropagation();
        onChange(!checked);
      }}
      className="-my-2 py-2"
    >
      <span
        className={`relative block h-6 w-11 rounded-full border transition-colors ${
          checked ? "border-amber bg-amber" : "border-ink-600 bg-ink-800"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full transition-transform ${
            checked ? "translate-x-5 bg-ink-900" : "bg-zinc-500"
          }`}
        />
      </span>
    </button>
  );
}

export function Accordion({
  title,
  children,
  defaultOpen = false,
  extra,
  dimmed = false,
  open,
  onOpenChange,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  extra?: ReactNode; // controle no header (ex.: Toggle de apoio)
  dimmed?: boolean; // título esmaecido (ex.: apoio desligado)
  open?: boolean; // modo CONTROLADO: estado React é a única fonte de abertura
  onOpenChange?: (v: boolean) => void;
}) {
  // No modo controlado o clique nativo do <summary> é bloqueado: sem isso o DOM
  // muda details.open por fora do React e o atributo dessincroniza (o vdom não
  // re-patcha open={true} -> open={true}).
  const controlado = open !== undefined;
  return (
    <details
      open={controlado ? open : defaultOpen}
      className="group rounded-2xl border border-ink-600 bg-ink-800/60"
    >
      <summary
        onClick={(e) => {
          if (controlado) {
            e.preventDefault();
            onOpenChange?.(!open);
          }
        }}
        className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-display text-sm font-semibold uppercase tracking-wider"
      >
        <span className={dimmed ? "text-zinc-500" : "text-zinc-200"}>{title}</span>
        <span className="flex items-center gap-3">
          {extra}
          <span className="text-amber transition-transform group-open:rotate-45">+</span>
        </span>
      </summary>
      <div className="space-y-4 px-4 pb-4">{children}</div>
    </details>
  );
}
