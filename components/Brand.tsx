// Ícone "H" da marca (recriado em React a partir do SVG do brandbook), recolorível.
export function BrandIcon({
  className = "h-8 w-8",
  color = "#FABA0D",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg viewBox="0 0 694 663" className={className} fill="none" aria-hidden>
      <path d="M0 314.005L231.06 226.617V660.596H0V314.005Z" fill={color} />
      <path d="M462.121 315.486L693.181 228.098V662.077H462.121V315.486Z" fill={color} />
      <path d="M231.06 87.3882L462.121 0V539.141L231.06 433.979V87.3882Z" fill={color} />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <BrandIcon className="h-7 w-7" />
      <div className="leading-none">
        <div className="font-display text-sm font-bold uppercase tracking-[0.18em] text-zinc-100">
          Hidráulica
        </div>
        <div className="font-display text-[10px] font-semibold uppercase tracking-[0.42em] text-amber">
          de Casas
        </div>
      </div>
    </div>
  );
}
