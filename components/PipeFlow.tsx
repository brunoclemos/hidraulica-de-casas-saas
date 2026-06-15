"use client";

// Cano com água âmbar correndo (técnica stroke-dashoffset, inspirada na ref).
// A velocidade da animação reflete a velocidade calculada da água.
// `progresso` (0..1) mostra o quanto da água quente já preencheu o tubo.

export function PipeFlow({
  velocidade,
  progresso = 1,
  label,
}: {
  velocidade: number; // m/s
  progresso?: number; // 0..1
  label?: string;
}) {
  // mais rápido => dur menor; clamp entre 0.4s e 2.4s
  const dur = Math.min(2.4, Math.max(0.4, 1.2 / Math.max(velocidade, 0.05)));
  const fillW = Math.max(0, Math.min(1, progresso)) * 100;

  return (
    <div className="relative w-full">
      <svg viewBox="0 0 340 60" className="w-full" role="img" aria-label={label || "fluxo de água"}>
        <defs>
          <linearGradient id="agua" x1="0" x2="1">
            <stop offset="0" stopColor="#FFD45E" />
            <stop offset="1" stopColor="#FABA0D" />
          </linearGradient>
          <clipPath id="tubo">
            <rect x="8" y="22" width="324" height="16" rx="8" />
          </clipPath>
        </defs>

        {/* corpo do tubo */}
        <rect x="8" y="22" width="324" height="16" rx="8" fill="#2C2C29" stroke="#3A3A36" />

        {/* água preenchida */}
        <g clipPath="url(#tubo)">
          <rect x="8" y="22" height="16" width={`${(fillW / 100) * 324}`} fill="url(#agua)" opacity="0.9" />
          {/* linha de fluxo correndo */}
          <line
            x1="8"
            y1="30"
            x2="332"
            y2="30"
            stroke="#21211F"
            strokeWidth="2.5"
            strokeDasharray="6 22"
            strokeLinecap="round"
            opacity="0.55"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="-28"
              dur={`${dur}s`}
              repeatCount="indefinite"
            />
          </line>
        </g>

        {/* flanges */}
        <rect x="2" y="18" width="8" height="24" rx="2" fill="#4A4A45" />
        <rect x="330" y="18" width="8" height="24" rx="2" fill="#4A4A45" />
        {/* torneira na ponta */}
        <path d="M332 30 h10 v-8 h4 v8 a4 4 0 0 1 -4 4 h-6 z" fill="#FABA0D" />
      </svg>
    </div>
  );
}
