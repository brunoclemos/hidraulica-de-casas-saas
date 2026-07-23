"use client";

import { useRef, useState } from "react";

// Gráfico de linha SVG (sem libs) — temperatura × tempo, minuto a minuto.
// Grade pontilhada nos dois eixos, rótulos de grau no Y, linhas de referência
// tracejadas com etiqueta (ex.: T. mistura, acionamento do apoio), zona
// sombreada de banho frio e crosshair com leitura de todas as séries no
// minuto sob o cursor.

export interface Serie {
  nome: string;
  cor: string;
  pontos: number[]; // y por minuto (índice 0 = minuto 1)
}

export interface RefLinha {
  valor: number; // °C
  label: string;
  cor: string;
}

// Passo "bonito" pro eixo: 1/2/5×10^k que gera <= maxTicks divisões.
function passoBonito(span: number, maxTicks: number): number {
  const bruto = span / Math.max(1, maxTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(bruto, 1e-9))));
  for (const m of [1, 2, 5, 10]) {
    if (mag * m >= bruto) return mag * m;
  }
  return mag * 10;
}

export function LineChart({
  series,
  duracao,
  yMin,
  yMax,
  refs = [],
  zonaAbaixoDe,
  zonaLabel,
  unidadeY = "°C",
}: {
  series: Serie[];
  duracao: number;
  yMin: number;
  yMax: number;
  refs?: RefLinha[];
  zonaAbaixoDe?: number; // sombreia tudo abaixo desse Y
  zonaLabel?: string;
  unidadeY?: string;
}) {
  const W = 640;
  const H = 340;
  const ml = 40; // margem esquerda (rótulos do eixo Y)
  const mr = 14;
  const mt = 14;
  const mb = 40; // margem inferior (eixo X + título)
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  const span = Math.max(1e-6, yMax - yMin);
  const xN = Math.max(1, duracao - 1);

  const xAt = (idx: number) => ml + (pw * idx) / xN;
  const yAt = (v: number) => mt + ph * (1 - (v - yMin) / span);

  // Séries com valores IGUAIS num minuto ficariam empilhadas (só a de cima
  // aparece — ex.: todos os cenários caem juntos até o apoio ligar). Onde os
  // valores coincidem, abrimos um leque de ±SEP px em paralelo: as linhas
  // aparecem lado a lado e voltam a se sobrepor à trajetória exata quando
  // divergem de verdade.
  const SEP = 2.6;
  const offsets: number[][] = series.map(() => []);
  for (let idx = 0; idx < duracao; idx++) {
    const grupos = new Map<string, number[]>(); // valor -> índices das séries
    series.forEach((s, k) => {
      const key = (s.pontos[idx] ?? NaN).toFixed(3);
      grupos.set(key, [...(grupos.get(key) ?? []), k]);
    });
    grupos.forEach((ks) => {
      ks.forEach((k, pos) => {
        offsets[k][idx] = ks.length > 1 ? (pos - (ks.length - 1) / 2) * SEP : 0;
      });
    });
  }
  // suaviza a entrada/saída do leque (média móvel 2×) pra não formar "nó"
  // no minuto em que as curvas divergem
  for (let pass = 0; pass < 2; pass++) {
    offsets.forEach((off) => {
      const orig = [...off];
      for (let idx = 0; idx < orig.length; idx++) {
        const a = orig[idx - 1] ?? orig[idx];
        const b = orig[idx + 1] ?? orig[idx];
        off[idx] = (a + orig[idx] + b) / 3;
      }
    });
  }

  const pathDe = (pts: number[], sIdx: number) =>
    pts
      .map(
        (v, idx) =>
          `${idx === 0 ? "M" : "L"}${xAt(idx).toFixed(1)},${(yAt(v) + (offsets[sIdx][idx] ?? 0)).toFixed(1)}`,
      )
      .join(" ");

  // eixo Y: ticks em passos bonitos (5 °C no caso típico)
  const yStep = passoBonito(span, 7);
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 1e-9; v += yStep) yTicks.push(v);

  // eixo X: passo bonito visando ~30 marcações (referência: de 2 em 2 min até 60)
  const xStep = passoBonito(duracao, 30);
  const xTicks: number[] = [];
  for (let t = xStep; t <= duracao; t += xStep) xTicks.push(t);
  if (xTicks[xTicks.length - 1] !== duracao) xTicks.push(duracao);

  const zonaY = zonaAbaixoDe !== undefined ? yAt(Math.max(yMin, Math.min(yMax, zonaAbaixoDe))) : null;

  // ----- crosshair -----
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W; // coords do viewBox
    const idx = Math.round(((x - ml) / pw) * xN);
    setHoverIdx(idx >= 0 && idx < duracao ? idx : null);
  }

  const hover =
    hoverIdx !== null
      ? {
          idx: hoverIdx,
          x: xAt(hoverIdx),
          valores: series.map((s) => ({ nome: s.nome, cor: s.cor, v: s.pontos[hoverIdx] })),
        }
      : null;

  return (
    <div className="w-full">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          role="img"
          aria-label="curva de temperatura x tempo"
          onPointerMove={onMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          {/* zona de banho frio */}
          {zonaY !== null && (
            <rect x={ml} y={zonaY} width={pw} height={Math.max(0, mt + ph - zonaY)} fill="#ef4444" opacity="0.035" />
          )}

          {/* grade + rótulos Y */}
          {yTicks.map((v, k) => {
            const y = yAt(v);
            return (
              <g key={`y${k}`}>
                <line x1={ml} x2={W - mr} y1={y} y2={y} stroke="#3A3A36" strokeWidth="0.6" strokeDasharray="1.5 3" />
                <text x={ml - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#8a8a85">
                  {Math.round(v)}°
                </text>
              </g>
            );
          })}

          {/* grade + rótulos X */}
          {xTicks.map((t, k) => {
            const x = xAt(t - 1);
            return (
              <g key={`x${k}`}>
                <line x1={x} x2={x} y1={mt} y2={mt + ph} stroke="#2E2E2B" strokeWidth="0.5" strokeDasharray="1.5 3" />
                <text x={x} y={H - mb + 14} textAnchor="middle" fontSize="9" fill="#8a8a85">
                  {t}
                </text>
              </g>
            );
          })}
          <text x={ml + pw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#71717a">
            Tempo (min)
          </text>

          {/* linhas de referência tracejadas com etiqueta (estilo da planilha) */}
          {refs
            .filter((r) => r.valor >= yMin && r.valor <= yMax)
            .map((r, k) => {
              const y = yAt(r.valor);
              return (
                <g key={`ref${k}`}>
                  <line x1={ml} x2={W - mr} y1={y} y2={y} stroke={r.cor} strokeWidth="1.2" strokeDasharray="6 4" opacity="0.8" />
                  {/* halo escuro pra etiqueta não brigar com as curvas por baixo */}
                  <text
                    x={W - mr - 2}
                    y={y - 4}
                    textAnchor="end"
                    fontSize="9.5"
                    fill={r.cor}
                    stroke="#1B1B19"
                    strokeWidth="3"
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {r.label}
                  </text>
                </g>
              );
            })}

          {/* séries */}
          {series.map((s, sIdx) => (
            <path
              key={s.nome}
              d={pathDe(s.pontos, sIdx)}
              fill="none"
              stroke={s.cor}
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* crosshair */}
          {hover && (
            <g>
              <line x1={hover.x} x2={hover.x} y1={mt} y2={mt + ph} stroke="#e4e4e7" strokeWidth="0.8" opacity="0.5" />
              {hover.valores.map((v, k) => (
                <circle
                  key={v.nome}
                  cx={hover.x}
                  cy={yAt(v.v) + (offsets[k][hover.idx] ?? 0)}
                  r="3.4"
                  fill={v.cor}
                  stroke="#1B1B19"
                  strokeWidth="1.4"
                />
              ))}
            </g>
          )}
        </svg>

        {/* tooltip do crosshair (div sobreposta pra tipografia melhor) */}
        {hover && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-xl border border-ink-600 bg-ink-900/95 px-3 py-2 text-[11px] shadow-lg backdrop-blur"
            style={hover.x < W / 2 ? { left: `${((hover.x + 16) / W) * 100}%` } : { right: `${((W - hover.x + 16) / W) * 100}%` }}
          >
            <div className="mb-1 font-semibold text-zinc-300">min {hover.idx + 1}</div>
            {[...hover.valores]
              .sort((a, b) => b.v - a.v)
              .map((v) => (
                <div key={v.nome} className="flex items-center gap-1.5 whitespace-nowrap text-zinc-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: v.cor }} />
                  {v.nome}: <span className="font-semibold text-zinc-200">{v.v.toFixed(1)} {unidadeY}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* legenda estilo referência: traço—ponto—traço */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-400">
        {series.map((s) => (
          <span key={s.nome} className="inline-flex items-center gap-1.5">
            <svg width="26" height="8" aria-hidden>
              <line x1="0" x2="26" y1="4" y2="4" stroke={s.cor} strokeWidth="2" />
              <circle cx="13" cy="4" r="3" fill="#1B1B19" stroke={s.cor} strokeWidth="1.8" />
            </svg>
            {s.nome}
          </span>
        ))}
        {zonaLabel && zonaAbaixoDe !== undefined && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-red-500/20" />
            {zonaLabel}
          </span>
        )}
      </div>
    </div>
  );
}
