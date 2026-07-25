"use client";

import { useEffect, useRef, useState } from "react";

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

// Arredonda o cotovelo da série (pedido do cliente 25/jul: "muito retas, podia
// ser mais suavezinha"). Média móvel triangular de ±JANELA minutos sobre o Y de
// TELA, com a janela afunilando nas pontas pra não puxar o primeiro/último ponto.
// Em trecho de inclinação constante a média devolve o mesmo valor — reta segue
// reta, e é o certo: com a válvula termostática segurando a T. mistura o boiler
// esfria a °C/min constante. O que muda de verdade é a quebra onde um apoio liga,
// que deixa de ser bico. O traço sai no máx ~0,7 °C do valor calculado, e SÓ ali;
// tooltip e tabela minuto a minuto seguem exatos, e o marcador do crosshair é
// desenhado sobre esta curva pra não ficar solto no ar.
// JANELA é o botão de "curvar mais": subir arredonda mais e afasta mais o traço
// do dado calculado. Começou em 2, subiu pra 4 a pedido do cliente (25/jul).
const JANELA = 4;
function arredondar(ys: number[]): number[] {
  return ys.map((_, i) => {
    const jan = Math.min(JANELA, i, ys.length - 1 - i);
    let soma = 0;
    let peso = 0;
    for (let k = -jan; k <= jan; k++) {
      const w = 1 + jan - Math.abs(k);
      soma += ys[i + k] * w;
      peso += w;
    }
    return soma / peso;
  });
}

// Traça a série com curva suave em vez de polilinha (pedido do cliente 25/jul).
// Interpolação cúbica MONOTÔNICA (Fritsch-Carlson), não Catmull-Rom: a curva
// passa exatamente pelos pontos calculados e nunca faz overshoot entre dois
// minutos. Num gráfico de engenharia isso é obrigatório — uma barriga pra baixo
// invadiria a zona de banho frio ou cruzaria a T. mistura num cenário que o
// indicador diz "Não cruza"; pra cima passaria do set point. Onde o dado é
// colinear (decaimento sem apoio) as tangentes se igualam e o traço volta a ser
// reto sozinho; o arredondamento aparece nas quebras (apoio ligando/desligando)
// e na entrada/saída do leque.
function pathSuave(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  const f = (v: number) => v.toFixed(1);
  if (n === 0) return "";
  if (n === 1) return `M${f(pts[0].x)},${f(pts[0].y)}`;
  if (n === 2) return `M${f(pts[0].x)},${f(pts[0].y)} L${f(pts[1].x)},${f(pts[1].y)}`;

  const h: number[] = []; // Δx do segmento
  const d: number[] = []; // inclinação da secante
  for (let k = 0; k < n - 1; k++) {
    h[k] = pts[k + 1].x - pts[k].x;
    d[k] = h[k] === 0 ? 0 : (pts[k + 1].y - pts[k].y) / h[k];
  }

  const m: number[] = new Array(n); // tangente em cada ponto
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) {
    // extremo local (secantes de sinais opostos) => tangente zero, o pico/vale
    // continua sendo o ponto real
    m[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
  }
  // limitador de Fritsch-Carlson: mantém cada segmento dentro do envelope dos
  // seus dois pontos
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const quad = a * a + b * b;
    if (quad > 9) {
      const t = 3 / Math.sqrt(quad);
      m[k] = t * a * d[k];
      m[k + 1] = t * b * d[k];
    }
  }

  let out = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let k = 0; k < n - 1; k++) {
    const c1x = pts[k].x + h[k] / 3;
    const c1y = pts[k].y + (m[k] * h[k]) / 3;
    const c2x = pts[k + 1].x - h[k] / 3;
    const c2y = pts[k + 1].y - (m[k + 1] * h[k]) / 3;
    out += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(pts[k + 1].x)},${f(pts[k + 1].y)}`;
  }
  return out;
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
  // Modo COMPACTO no celular (container < 480px): viewBox menor e mais alto —
  // como o SVG é escalado pra largura do container, texto/linhas ficam
  // proporcionalmente maiores e legíveis. Desktop segue com o viewBox largo.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState<number | null>(null);
  useEffect(() => {
    const medir = () => setWrapW(wrapRef.current?.offsetWidth ?? null);
    medir(); // largura no mount; depois só muda com resize da janela
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  const compact = wrapW !== null && wrapW < 480;

  const W = compact ? 360 : 640;
  const H = compact ? 300 : 340;
  const ml = compact ? 34 : 40; // margem esquerda (rótulos do eixo Y)
  const mr = compact ? 10 : 14;
  const mt = 14;
  const mb = compact ? 36 : 40; // margem inferior (eixo X + título)
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
  // A ordem DENTRO do leque é a ordem em que as séries vão divergir, não a ordem
  // do array: quem vai ficar por cima já entra por cima. Ordenando pela ordem do
  // array, as linhas se cruzavam todas no minuto em que o leque fecha e aquilo
  // virava um nó no meio do gráfico.
  const ordemDoLeque = (ks: number[], idx: number): number[] => {
    for (let j = idx + 1; j < duracao; j++) {
      const vals = ks.map((k) => (series[k].pontos[j] ?? NaN).toFixed(3));
      if (new Set(vals).size > 1) {
        return [...ks].sort((a, b) => (series[b].pontos[j] ?? 0) - (series[a].pontos[j] ?? 0));
      }
    }
    return ks; // nunca divergem: qualquer ordem serve
  };
  const offsets: number[][] = series.map(() => []);
  for (let idx = 0; idx < duracao; idx++) {
    const grupos = new Map<string, number[]>(); // valor -> índices das séries
    series.forEach((s, k) => {
      const key = (s.pontos[idx] ?? NaN).toFixed(3);
      grupos.set(key, [...(grupos.get(key) ?? []), k]);
    });
    grupos.forEach((ks) => {
      ordemDoLeque(ks, idx).forEach((k, pos) => {
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

  // Pontos de tela de cada série, com o offset do leque somado e o cotovelo
  // arredondado. É esta linha que vira o path E que o crosshair usa pra posicionar
  // o marcador, então os dois nunca se descolam.
  const linhas = series.map((s, sIdx) => {
    const ys = arredondar(s.pontos.map((v, idx) => yAt(v) + (offsets[sIdx][idx] ?? 0)));
    return ys.map((y, idx) => ({ x: xAt(idx), y }));
  });

  // eixo Y: ticks em passos bonitos (5 °C no caso típico; menos divisões no celular)
  const yStep = passoBonito(span, compact ? 6 : 7);
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 1e-9; v += yStep) yTicks.push(v);

  // eixo X: desktop ~30 marcações (de 2 em 2 até 60, como a referência);
  // celular ~6 (de 10 em 10) pra não virar poeira ilegível
  const xStep = passoBonito(duracao, compact ? 6 : 30);
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
    <div ref={wrapRef} className="w-full">
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
              d={pathSuave(linhas[sIdx])}
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
                  cy={linhas[k][hover.idx]?.y ?? yAt(v.v)}
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
