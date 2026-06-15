"use client";

// Gráfico de linha SVG simples (sem libs). Plota uma ou mais séries de
// temperatura x tempo, com uma linha tracejada de referência (T aciona apoio)
// e uma faixa sombreada abaixo de um limiar (zona de banho frio).

export interface Serie {
  nome: string;
  cor: string;
  pontos: number[]; // y por minuto (índice 0 = minuto 1)
}

export function LineChart({
  series,
  duracao,
  yMin,
  yMax,
  refLinha,
  refLabel,
  zonaAbaixoDe,
  zonaLabel,
  unidadeY = "°C",
}: {
  series: Serie[];
  duracao: number;
  yMin: number;
  yMax: number;
  refLinha?: number; // valor Y da linha tracejada
  refLabel?: string;
  zonaAbaixoDe?: number; // sombreia tudo abaixo desse Y
  zonaLabel?: string;
  unidadeY?: string;
}) {
  // viewBox e margens
  const W = 340;
  const H = 200;
  const ml = 30; // margem esquerda (eixo Y)
  const mr = 8;
  const mt = 10;
  const mb = 22; // margem inferior (eixo X)
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  const span = Math.max(1e-6, yMax - yMin);
  const xN = Math.max(1, duracao - 1);

  const xAt = (idx: number) => ml + (pw * idx) / xN;
  const yAt = (v: number) => mt + ph * (1 - (v - yMin) / span);

  const pathDe = (pts: number[]) =>
    pts
      .map((v, idx) => `${idx === 0 ? "M" : "L"}${xAt(idx).toFixed(1)},${yAt(v).toFixed(1)}`)
      .join(" ");

  // ticks do eixo Y (4 divisões)
  const yTicks = [0, 1, 2, 3, 4].map((k) => yMin + (span * k) / 4);
  // ticks do eixo X (~5)
  const passos = duracao <= 1 ? 1 : Math.max(1, Math.round(duracao / 5));
  const xTicks: number[] = [];
  for (let t = 1; t <= duracao; t += passos) xTicks.push(t);
  if (xTicks[xTicks.length - 1] !== duracao) xTicks.push(duracao);

  const zonaY = zonaAbaixoDe !== undefined ? yAt(Math.max(yMin, Math.min(yMax, zonaAbaixoDe))) : null;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="curva de temperatura x tempo">
        {/* faixa "zona de banho frio" */}
        {zonaY !== null && (
          <>
            <rect
              x={ml}
              y={zonaY}
              width={pw}
              height={Math.max(0, mt + ph - zonaY)}
              fill="#ef4444"
              opacity="0.08"
            />
            <line
              x1={ml}
              x2={W - mr}
              y1={zonaY}
              y2={zonaY}
              stroke="#ef4444"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.5"
            />
          </>
        )}

        {/* grade Y + rótulos */}
        {yTicks.map((v, k) => {
          const y = yAt(v);
          return (
            <g key={`y${k}`}>
              <line x1={ml} x2={W - mr} y1={y} y2={y} stroke="#3A3A36" strokeWidth="0.5" />
              <text x={ml - 4} y={y + 3} textAnchor="end" fontSize="8" fill="#71717a">
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {/* rótulos X */}
        {xTicks.map((t, k) => {
          const x = xAt(t - 1);
          return (
            <text key={`x${k}`} x={x} y={H - 6} textAnchor="middle" fontSize="8" fill="#71717a">
              {t}
            </text>
          );
        })}

        {/* linha tracejada de referência (T aciona apoio) */}
        {refLinha !== undefined && refLinha >= yMin && refLinha <= yMax && (
          <line
            x1={ml}
            x2={W - mr}
            y1={yAt(refLinha)}
            y2={yAt(refLinha)}
            stroke="#a1a1aa"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}

        {/* séries */}
        {series.map((s) => (
          <path key={s.nome} d={pathDe(s.pontos)} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>

      {/* legenda */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
        {series.map((s) => (
          <span key={s.nome} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: s.cor }} />
            {s.nome}
          </span>
        ))}
        {refLabel && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-3 border-t border-dashed border-zinc-400" />
            {refLabel}
          </span>
        )}
        {zonaLabel && zonaAbaixoDe !== undefined && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-red-500/20" />
            {zonaLabel}
          </span>
        )}
        <span className="ml-auto text-zinc-600">tempo (min) · T ({unidadeY})</span>
      </div>
    </div>
  );
}
