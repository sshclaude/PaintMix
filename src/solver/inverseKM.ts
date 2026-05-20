/**
 * Spectral inverse Kubelka–Munk solver.
 *
 * Algorithm (fully deterministic):
 *
 * 1. Reconstruct target reflectance from hex via Burns 2017 → R_target(λ).
 * 2. Apply Saunderson inverse → R_KM(λ) → target K/S ratio x_target(λ).
 * 3. For k ∈ {2, 3, 4}: enumerate every C(N, k) support.
 *    For each support:
 *      a. Build A[λ, i] = K_i(λ) − x_target(λ) × S_i(λ)
 *      b. Augment with normalisation row (forces Σcᵢ ≈ 1)
 *      c. Solve NNLS: minimise ‖A_aug c − b_aug‖² s.t. c ≥ 0
 *      d. Normalise Σcᵢ = 1
 *      e. Forward-predict reflectance; compute ΔE₂₀₀₀
 * 4. Rank by ΔE ascending, then k ascending, then ‖c‖₂ ascending.
 * 5. Scale winning fractions to volumes, round to 0.05 mL.
 *
 * NO Math.random. NO Date.now. Fully deterministic.
 */

import { reconstruct } from '../spectrum/reconstruct.ts';
import { reflectanceFromConcentrations, apparentToKoS, DEFAULT_K1, DEFAULT_K2 } from '../km/forward.ts';
import { spectraDE2000, reflectanceToXYZ, xyzToLab, deltaE2000, hexToLab } from '../km/cie.ts';
import { getPigments, type PigmentData } from '../km/pigments.ts';
import { N_BANDS } from '../km/cie.ts';

// ---------------------------------------------------------------------------
// Types matching the legacy solveMix return shape
// ---------------------------------------------------------------------------

export interface RecipeComponent {
  paint: { id: string; name: string; hex: string; [key: string]: unknown };
  volumeMl: number;
}

export interface Recipe {
  components: RecipeComponent[];
  predictedHex: string;
  deltaE: number;
  accuracy: string;
  batchSizeMl?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function accuracyLabel(dE: number): string {
  if (dE < 1.0) return 'Excellent match';
  if (dE < 2.0) return 'Good match, minor variation visible up close';
  if (dE < 4.0) return 'Acceptable, noticeable in direct comparison';
  return 'Approximate — adjust by eye after mixing';
}

function roundTo005(v: number): number {
  return Math.round(v / 0.05) * 0.05;
}

function xyzToHex(X: number, Y: number, Z: number): string {
  // XYZ (D65) → linear sRGB → gamma sRGB → hex
  const rLin =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gLin = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const bLin =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const gc = (c: number) => {
    const v = Math.max(0, Math.min(1, c));
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
  };
  const r = gc(rLin), g = gc(gLin), b = gc(bLin);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** Generate all C(n, k) index combinations from [0, n). */
function* combinations(n: number, k: number): Generator<number[]> {
  const combo: number[] = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield combo.slice();
    let i = k - 1;
    while (i >= 0 && combo[i] === n - k + i) i--;
    if (i < 0) return;
    combo[i]++;
    for (let j = i + 1; j < k; j++) combo[j] = combo[j - 1] + 1;
  }
}

// ---------------------------------------------------------------------------
// Inline NNLS for small systems (k ≤ 4 variables, arbitrary rows)
// Enumerates all 2^k active-set masks — cycle-free and exact for k ≤ 4.
// ---------------------------------------------------------------------------

function gaussElimSmall(M: number[][], rhs: number[]): number[] | null {
  const n = M.length;
  const A: number[][] = M.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col, maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(A[row][col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxRow !== col) [A[col], A[maxRow]] = [A[maxRow], A[col]];
    if (Math.abs(A[col][col]) < 1e-14) return null;
    for (let row = col + 1; row < n; row++) {
      const f = A[row][col] / A[col][col];
      for (let j = col; j <= n; j++) A[row][j] -= f * A[col][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = A[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= A[i][j] * x[j];
    x[i] /= A[i][i];
  }
  return x;
}

function nnlsSmall(A: number[][], b: number[]): number[] {
  const m = A.length;
  const k = A[0].length;

  // Pre-compute normal-equation parts
  const AtA: number[][] = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) =>
      A.reduce((s, row) => s + row[i] * row[j], 0)));
  const Atb: number[] = Array.from({ length: k }, (_, i) =>
    b.reduce((s, bi, r) => s + A[r][i] * bi, 0));

  let bestObj = Infinity;
  let bestC: number[] = new Array<number>(k).fill(0);

  for (let mask = 1; mask < (1 << k); mask++) {
    const active: number[] = [];
    for (let i = 0; i < k; i++) if (mask & (1 << i)) active.push(i);

    const n = active.length;
    const M = active.map(i => active.map(j => AtA[i][j]));
    const rhs = active.map(i => Atb[i]);
    const z = gaussElimSmall(M, rhs);
    if (!z || z.some(v => v < -1e-10)) continue;

    const c = new Array<number>(k).fill(0);
    for (let ii = 0; ii < n; ii++) c[active[ii]] = Math.max(0, z[ii]);

    let obj = 0;
    for (let r = 0; r < m; r++) {
      let res = b[r];
      for (let i = 0; i < k; i++) res -= A[r][i] * c[i];
      obj += res * res;
    }
    if (obj < bestObj) { bestObj = obj; bestC = c; }
  }

  return bestC;
}

// ---------------------------------------------------------------------------
// Per-support NNLS solve
// ---------------------------------------------------------------------------

function solveSupport(
  support: number[],
  xTarget: Float64Array,
  pigments: PigmentData[],
): Float64Array | null {
  const k = support.length;
  // A[λ, i] = Kᵢ(λ) − x_target(λ) × Sᵢ(λ)
  const A_rows: number[][] = [];
  for (let lam = 0; lam < N_BANDS; lam++) {
    const row: number[] = [];
    for (const pi of support) {
      row.push(pigments[pi].K[lam] - xTarget[lam] * pigments[pi].S[lam]);
    }
    A_rows.push(row);
  }

  // Normalisation weight: 10 × max |A[λ,i]| ensures Σcᵢ ≈ 1 while clamping c ≥ 0
  let wMax = 0;
  for (const row of A_rows) for (const v of row) if (Math.abs(v) > wMax) wMax = Math.abs(v);
  const w = Math.max(wMax * 10, 1);

  A_rows.push(new Array<number>(k).fill(w));
  const b_vec: number[] = new Array<number>(N_BANDS).fill(0).concat([w]);

  const c_raw = nnlsSmall(A_rows, b_vec);

  const sum = c_raw.reduce((a, b) => a + b, 0);
  if (sum < 1e-10) return null;

  return new Float64Array(c_raw.map(v => v / sum));
}

// ---------------------------------------------------------------------------
// Main solver
// ---------------------------------------------------------------------------

export function solveMixKM(
  targetHex: string,
  activePaintIds: string[],
  batchSizeMl: number,
  k1: number = DEFAULT_K1,
  k2: number = DEFAULT_K2,
): Recipe | null {
  const pigments = getPigments(activePaintIds);
  const n = pigments.length;
  if (n < 2) return null;

  // Step 1 & 2: target K/S spectrum
  const R_target = reconstruct(targetHex);
  const xTarget = new Float64Array(N_BANDS);
  for (let i = 0; i < N_BANDS; i++) {
    xTarget[i] = apparentToKoS(R_target[i], k1, k2);
  }

  // Collect K and S arrays by pigment index (aligned with `pigments` array)
  // (already stored per pigment; we just reference them)

  // Step 3: enumerate supports for k = 2, 3, 4
  const kMax = Math.min(4, n);

  interface Candidate {
    deltaE: number;
    k: number;
    norm2: number;
    support: number[];
    c: Float64Array;
    predictedHex: string;
  }

  let best: Candidate | null = null;

  for (let k = 2; k <= kMax; k++) {
    for (const support of combinations(n, k)) {
      const c = solveSupport(support, xTarget, pigments);
      if (!c) continue;

      const R_pred = reflectanceFromConcentrations(
        c,
        support.map(pi => pigments[pi].K),
        support.map(pi => pigments[pi].S),
        k1, k2,
      );

      const dE = spectraDE2000(R_pred, R_target);

      // Rank: ΔE ascending, then k ascending, then ‖c‖₂ ascending, then support lex
      const norm2 = c.reduce((acc, v) => acc + v * v, 0);
      if (
        best === null ||
        dE < best.deltaE - 1e-6 ||
        (Math.abs(dE - best.deltaE) < 1e-6 && k < best.k) ||
        (Math.abs(dE - best.deltaE) < 1e-6 && k === best.k && norm2 < best.norm2 - 1e-9)
      ) {
        const [X, Y, Z] = reflectanceToXYZ(R_pred);
        best = { deltaE: dE, k, norm2, support, c, predictedHex: xyzToHex(X, Y, Z) };
      }
    }
  }

  if (!best) return null;

  // Step 5: scale to mL, round to 0.05
  let volumes = Array.from(best.c).map(f => roundTo005(f * batchSizeMl));
  const total = Math.round(volumes.reduce((a, b) => a + b, 0) * 1000) / 1000;
  const target = Math.round(batchSizeMl * 1000) / 1000;
  const diff = Math.round((target - total) * 1000) / 1000;
  if (Math.abs(diff) > 0.001) {
    const maxIdx = volumes.reduce((mi, v, i) => v > volumes[mi] ? i : mi, 0);
    volumes[maxIdx] = Math.round((volumes[maxIdx] + diff) * 1000) / 1000;
  }

  return {
    components: best.support.map((pi, i) => ({
      paint: pigments[pi].paint as RecipeComponent['paint'],
      volumeMl: volumes[i],
    })),
    predictedHex: best.predictedHex,
    deltaE: Math.round(best.deltaE * 10) / 10,
    accuracy: accuracyLabel(best.deltaE),
  };
}
