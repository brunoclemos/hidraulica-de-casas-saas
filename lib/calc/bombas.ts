// Motor de curvas de bomba × sistema — regressão quadrática, cruzamento e amostragem
// para plotagem. Compartilhado entre "Cálculo de Circuladores" (bombas circuladoras
// Texius) e "PVC/CPVC, Bombas & Pressão" (bombas de pressurização).
//
// A curva de uma bomba vem como pontos (Q, H) do catálogo e é ajustada por mínimos
// quadrados a H = a + b·Q + c·Q². A curva do sistema é a perda de carga × vazão nos
// cenários (também quadrática). O ponto de operação é a interseção das duas.

export interface Quadratica {
  a: number; // intercepto
  b: number; // coef. Q
  c: number; // coef. Q²
}

/** Ajusta y = a + b·x + c·x² por mínimos quadrados (normal equations 3x3). */
export function ajustaQuadratica(pts: [number, number][]): Quadratica {
  let n = 0, sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0;
  for (const [x, y] of pts) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++;
    const x2 = x * x;
    sx += x; sx2 += x2; sx3 += x2 * x; sx4 += x2 * x2;
    sy += y; sxy += x * y; sx2y += x2 * y;
  }
  // Sistema:
  // [ n   sx   sx2 ] [a]   [ sy   ]
  // [ sx  sx2  sx3 ] [b] = [ sxy  ]
  // [ sx2 sx3  sx4 ] [c]   [ sx2y ]
  const M = [
    [n, sx, sx2, sy],
    [sx, sx2, sx3, sxy],
    [sx2, sx3, sx4, sx2y],
  ];
  const sol = resolve3x3(M);
  return { a: sol[0], b: sol[1], c: sol[2] };
}

/** Eliminação de Gauss para sistema 3x3 aumentado ([3][4]). */
function resolve3x3(m: number[][]): number[] {
  const a = m.map((r) => r.slice());
  for (let i = 0; i < 3; i++) {
    // pivô parcial
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(a[k][i]) > Math.abs(a[p][i])) p = k;
    [a[i], a[p]] = [a[p], a[i]];
    const piv = a[i][i];
    if (Math.abs(piv) < 1e-12) continue;
    for (let k = 0; k < 3; k++) {
      if (k === i) continue;
      const fator = a[k][i] / piv;
      for (let j = i; j < 4; j++) a[k][j] -= fator * a[i][j];
    }
  }
  return [0, 1, 2].map((i) => (Math.abs(a[i][i]) < 1e-12 ? 0 : a[i][3] / a[i][i]));
}

/** Curva quadrática de uma bomba do catálogo (a partir dos pontos Q,H). */
export function curvaBomba(pontos: [number, number][]): Quadratica & { qMax: number } {
  const q = ajustaQuadratica(pontos);
  const qMax = Math.max(...pontos.map((p) => p[0]));
  return { ...q, qMax };
}

/** Menor raiz positiva da interseção sistema × bomba, dentro de [0, qMaxBomba]. */
export function interseccao(sistema: Quadratica, bomba: Quadratica & { qMax: number }): number | null {
  // (c_s - c_b) Q² + (b_s - b_b) Q + (a_s - a_b) = 0
  const A = sistema.c - bomba.c;
  const B = sistema.b - bomba.b;
  const C = sistema.a - bomba.a;
  const raizes: number[] = [];
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) > 1e-12) raizes.push(-C / B);
  } else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      raizes.push((-B + s) / (2 * A), (-B - s) / (2 * A));
    }
  }
  const validas = raizes.filter((q) => q > 0 && q <= bomba.qMax).sort((x, y) => x - y);
  return validas.length ? validas[0] : null;
}

/** Amostra a curva do sistema e de uma bomba para plotagem. */
export function amostraCurvas(
  sistema: Quadratica,
  bomba: { pontos: [number, number][] },
  qMaxSistema: number,
  qOp: number | null
): { q: number; hSistema: number; hBomba: number | null }[] {
  const curva = curvaBomba(bomba.pontos);
  const qMaxGraf = Math.max(qMaxSistema * 1.8, (qOp ?? 0) * 1.3, qMaxSistema + 5, curva.qMax * 0.6);
  const N = 40;
  const passo = qMaxGraf / N;
  const pts: { q: number; hSistema: number; hBomba: number | null }[] = [];
  for (let i = 0; i <= N; i++) {
    const q = i * passo;
    const hSistema = sistema.a + sistema.b * q + sistema.c * q * q;
    const hBomba = q <= curva.qMax ? curva.a + curva.b * q + curva.c * q * q : null;
    pts.push({ q, hSistema, hBomba });
  }
  return pts;
}
