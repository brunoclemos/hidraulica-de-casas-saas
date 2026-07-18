"use client";

// Gráfico Q × H (curva do sistema × curva da bomba) — SVG puro, sem dependência externa.
// Compartilhado entre "Cálculo de Circuladores" e "PVC/CPVC, Bombas & Pressão".
// A curva da bomba (amarela) e o ponto de operação só aparecem quando há hBomba/qOp.

export function QHChart({
  pontos,
  qOp,
  hOp,
  qMin,
  qMax,
  nomeBomba,
}: {
  pontos: { q: number; hSistema: number; hBomba: number | null }[];
  qOp: number | null;
  hOp: number | null;
  qMin: number;
  qMax: number;
  nomeBomba: string;
}) {
  const W = 340;
  const H = 210;
  const ml = 34;
  const mr = 10;
  const mt = 12;
  const mb = 26;
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  const xMax = Math.max(1e-6, ...pontos.map((p) => p.q));
  const yMax = Math.max(
    1e-6,
    ...pontos.map((p) => Math.max(p.hSistema, p.hBomba ?? 0))
  ) * 1.05;

  const xAt = (q: number) => ml + (pw * q) / xMax;
  const yAt = (h: number) => mt + ph * (1 - Math.max(0, h) / yMax);

  const path = (sel: (p: (typeof pontos)[number]) => number | null) => {
    let d = "";
    let started = false;
    for (const p of pontos) {
      const v = sel(p);
      if (v === null || !Number.isFinite(v)) {
        started = false;
        continue;
      }
      d += `${started ? "L" : "M"}${xAt(p.q).toFixed(1)},${yAt(v).toFixed(1)} `;
      started = true;
    }
    return d.trim();
  };

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * xMax);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * yMax);

  return (
    <div className="mt-4 w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="curva do sistema × curva da bomba">
        {/* faixa útil de vazão (mín–máx do sistema) */}
        {qMax > qMin && (
          <rect
            x={xAt(qMin)}
            y={mt}
            width={Math.max(0, xAt(qMax) - xAt(qMin))}
            height={ph}
            fill="#FABA0D"
            opacity="0.06"
          />
        )}

        {/* grade + rótulos Y */}
        {yTicks.map((v, k) => (
          <g key={`y${k}`}>
            <line x1={ml} x2={W - mr} y1={yAt(v)} y2={yAt(v)} stroke="#3A3A36" strokeWidth="0.5" />
            <text x={ml - 4} y={yAt(v) + 3} textAnchor="end" fontSize="8" fill="#71717a">
              {v.toFixed(v < 10 ? 1 : 0)}
            </text>
          </g>
        ))}

        {/* rótulos X */}
        {xTicks.map((v, k) => (
          <text key={`x${k}`} x={xAt(v)} y={H - 8} textAnchor="middle" fontSize="8" fill="#71717a">
            {v.toFixed(v < 10 ? 1 : 0)}
          </text>
        ))}

        {/* curvas */}
        <path d={path((p) => p.hSistema)} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
        <path d={path((p) => p.hBomba)} fill="none" stroke="#FABA0D" strokeWidth="2" strokeLinejoin="round" />

        {/* ponto de operação */}
        {qOp !== null && hOp !== null && qOp <= xMax && (
          <>
            <line x1={xAt(qOp)} x2={xAt(qOp)} y1={mt} y2={mt + ph} stroke="#e4e4e7" strokeWidth="0.75" strokeDasharray="3 3" />
            <circle cx={xAt(qOp)} cy={yAt(hOp)} r="4" fill="#e4e4e7" stroke="#18181b" strokeWidth="1.5" />
          </>
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#60a5fa" }} />
          Sistema
        </span>
        {nomeBomba && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#FABA0D" }} />
            {nomeBomba}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-amber/20" />
          Faixa útil
        </span>
        <span className="ml-auto text-zinc-600">vazão (L/min) · pressão (mca)</span>
      </div>
    </div>
  );
}
