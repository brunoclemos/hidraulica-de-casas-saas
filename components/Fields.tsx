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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
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
          className="w-full bg-transparent px-3 py-3 text-base font-semibold text-zinc-100 outline-none"
        />
        {unit && <span className="px-3 text-sm font-medium text-zinc-500">{unit}</span>}
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
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
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
          className="w-full appearance-none bg-transparent px-3 py-3 text-base font-semibold text-zinc-100 outline-none"
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

export function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-ink-600 bg-ink-800/60">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-display text-sm font-semibold uppercase tracking-wider text-zinc-200">
        {title}
        <span className="text-amber transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="space-y-4 px-4 pb-4">{children}</div>
    </details>
  );
}
