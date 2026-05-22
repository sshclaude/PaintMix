/**
 * Spectral inverse Kubelka–Munk solver — two-stage algorithm.
 *
 * Stage 1 (NNLS seed): For each C(N,k) support, build the linearised K/S
 *   system A·c ≈ 0 with perceptually-weighted rows and clamped x_target.
 *   NNLS gives a fast starting point on the concentration simplex. If it
 *   fails (sum < 1e-10), fall back to uniform 1/k.
 *
 * Stage 2 (coordinate descent): Minimise Lab² distance — a fast, smooth
 *   proxy for ΔE₂₀₀₀ — directly on the simplex via golden-section line
 *   search per coordinate. Parametrisation: vary c[i] ∈ [0,1] while
 *   rescaling all other concentrations proportionally (Σ=1 maintained,
 *   other ratios fixed). Stops after 10 iterations or when Lab² improvement
 *   per full pass < 0.01. Final ranking uses full spectraDE2000.
 *
 * Stage 3 (ranking): ΔE₂₀₀₀ ascending (dominant). Within ΔE tolerance
 *   of 1.0, prefer fewer pigments (k) then lower ‖c‖₂ (sparser recipe).
 *
 * k=4 is only attempted when the best k≤3 ΔE is in (2, 10].
 *
 * NO Math.random. NO Date.now. Fully deterministic.
 */

import { reconstruct } from '../spectrum/reconstruct.ts';
import {
  reflectanceFromConcentrations,
  apparentToKoS,
  DEFAULT_K1,
  DEFAULT_K2,
} from '../km/forward.ts';
import {
  spectraDE2000,
  reflectanceToXYZ,
  xyzToLab,
  CMF_Y,
  D65,
  N_BANDS,
} from '../km/cie.ts';
import { getPigments, type PigmentData } from '../km/pigments.ts';

// ---------------------------------------------------------------------------
// Types
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
  if (dE < 8.0) return 'Approximate — adjust by eye after mixing';
  return 'Out of gamut — best achievable approximation';
}

function roundTo005(v: number): number {
  return Math.round(v / 0.05) * 0.05;
}

function xyzToHex(X: number, Y: number, Z: number): string {
  const rLin =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gLin = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const bLin =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const gc = (c: number) => {
    const v = Math.max(0, Math.min(1, c));
    return Math.round(
      (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255,
    );
  };
  const r = gc(rLin), g = gc(gLin), b = gc(bLin);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** All C(n,k) index combinations from [0,n). */
function* combinations(n: number, k: number): Generator<number[]> {
  const combo = Array.from({ length: k }, (_, i) => i);
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
// Stage 1 — NNLS seed
// Builds the linearised K/S system with clamped x_target + perceptual
// band-weighting, then solves via exhaustive 2^k active-set enumeration.
// ---------------------------------------------------------------------------

function gaussElimSmall(M: number[][], rhs: number[]): number[] | null {
  const n = M.length;
  const A = M.map((row, i) => [...row, rhs[i]]);
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
  const k = A[0].length;
  const AtA = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) =>
      A.reduce((s, row) => s + row[i] * row[j], 0)));
  const Atb = Array.from({ length: k }, (_, i) =>
    b.reduce((s, bi, r) => s + A[r][i] * bi, 0));

  let bestObj = Infinity;
  let bestC = new Array<number>(k).fill(0);

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
    for (const row of A) {
      let res = 0;
      for (let i = 0; i < k; i++) res += row[i] * c[i];
      // b entry for this row is implicit from A (we compute AtA form above)
      obj; // obj computed below
    }
    // Recompute with b
    obj = 0;
    for (let r = 0; r < A.length; r++) {
      let res = b[r];
      for (let i = 0; i < k; i++) res -= A[r][i] * c[i];
      obj += res * res;
    }
    if (obj < bestObj) { bestObj = obj; bestC = c; }
  }
  return bestC;
}

function nnlsSeed(
  support: number[],
  xTarget: Float64Array,
  pigments: PigmentData[],
): Float64Array {
  const k = support.length;
  const A_rows: number[][] = [];

  for (let lam = 0; lam < N_BANDS; lam++) {
    // Clamp x_target to max pigment K/S: prevents near-zero-reflectance bands
    // (where x_target → 1e6) from making A entries enormous.
    let maxKoS = 0;
    for (const pi of support) {
      const ks = pigments[pi].K[lam] / pigments[pi].S[lam];
      if (ks > maxKoS) maxKoS = ks;
    }
    const xClamped = Math.min(xTarget[lam], Math.max(maxKoS, 1.0));

    // Perceptual band weight: de-emphasise UV bands where we have no pigments
    // that can absorb strongly enough to match the target.
    const bw = Math.sqrt(D65[lam] * CMF_Y[lam] + 1e-6);

    const row: number[] = [];
    for (const pi of support) {
      row.push(bw * (pigments[pi].K[lam] - xClamped * pigments[pi].S[lam]));
    }
    A_rows.push(row);
  }

  // Normalisation row: softly enforces Σcᵢ ≈ 1
  let wMax = 0;
  for (const row of A_rows) for (const v of row) if (Math.abs(v) > wMax) wMax = Math.abs(v);
  const w = Math.max(wMax * 10, 1);
  A_rows.push(new Array<number>(k).fill(w));
  const b_vec = new Array<number>(N_BANDS).fill(0).concat([w]);

  const c_raw = nnlsSmall(A_rows, b_vec);
  const sum = c_raw.reduce((a, b) => a + b, 0);
  if (sum < 1e-10) {
    // NNLS failed — fall back to uniform
    return new Float64Array(k).fill(1 / k);
  }
  return new Float64Array(c_raw.map(v => v / sum));
}

// ---------------------------------------------------------------------------
// Stage 2 — coordinate descent on the simplex
// Minimises Lab² distance (fast proxy for ΔE₂₀₀₀).
// Parametrisation: vary c[coord] ∈ [0,1], rescale others proportionally.
// ---------------------------------------------------------------------------

function goldenSection(
  f: (t: number) => number,
  a: number,
  b: number,
  maxIter = 12,
): number {
  const phi = 0.6180339887; // (√5−1)/2
  if (b - a < 1e-8) return (a + b) / 2;
  let x1 = b - phi * (b - a), x2 = a + phi * (b - a);
  let f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < maxIter; i++) {
    if (b - a < 1e-7) break;
    if (f1 < f2) {
      b = x2; x2 = x1; f2 = f1;
      x1 = b - phi * (b - a); f1 = f(x1);
    } else {
      a = x1; x1 = x2; f1 = f2;
      x2 = a + phi * (b - a); f2 = f(x2);
    }
  }
  return f1 < f2 ? x1 : x2;
}

function coordinateDescent(
  seed: Float64Array,
  Ks: Float64Array[],
  Ss: Float64Array[],
  labTarget: [number, number, number],
  k1: number,
  k2: number,
  maxIter = 10,
): Float64Array {
  const k = seed.length;
  const c = Float64Array.from(seed);
  const [Lt, at, bt] = labTarget;

  const labDist = (ct: Float64Array): number => {
    const R = reflectanceFromConcentrations(ct, Ks, Ss, k1, k2);
    const [L, a, b] = xyzToLab(...reflectanceToXYZ(R));
    return (L - Lt) ** 2 + (a - at) ** 2 + (b - bt) ** 2;
  };

  for (let iter = 0; iter < maxIter; iter++) {
    let passImprovement = 0;

    for (let coord = 0; coord < k; coord++) {
      // Sum of the other concentrations (budget for others)
      let S_other = 0;
      for (let j = 0; j < k; j++) if (j !== coord) S_other += c[j];

      // 1D objective: c[coord] = t, others scaled proportionally
      const f = (t: number): number => {
        const ct = new Float64Array(k);
        ct[coord] = t;
        if (S_other > 1e-10) {
          for (let j = 0; j < k; j++) {
            if (j !== coord) ct[j] = c[j] * (1 - t) / S_other;
          }
        } else {
          // All weight is currently on coord; spread the rest evenly
          const share = (1 - t) / (k - 1);
          for (let j = 0; j < k; j++) if (j !== coord) ct[j] = share;
        }
        return labDist(ct);
      };

      const dBefore = f(c[coord]);
      const tOpt = goldenSection(f, 0, 1, 12);
      const dAfter = f(tOpt);

      if (dBefore - dAfter > 1e-9) {
        passImprovement += dBefore - dAfter;
        // Apply the update
        c[coord] = tOpt;
        if (S_other > 1e-10) {
          for (let j = 0; j < k; j++) {
            if (j !== coord) c[j] = c[j] * (1 - tOpt) / S_other;
          }
        } else {
          const share = (1 - tOpt) / (k - 1);
          for (let j = 0; j < k; j++) if (j !== coord) c[j] = share;
        }
      }
    }

    // Stop when a full pass improves Lab² by less than 0.01
    // (≈ ΔE₂₀₀₀ improvement < 0.1)
    if (passImprovement < 0.01) break;
  }

  return c;
}

// ---------------------------------------------------------------------------
// Per-support solve: NNLS seed → coordinate descent → spectraDE2000
// ---------------------------------------------------------------------------

interface SupportResult {
  c: Float64Array;
  deltaE: number;
}

function solveSupport(
  support: number[],
  xTarget: Float64Array,
  labTarget: [number, number, number],
  R_target: Float64Array,
  pigments: PigmentData[],
  k1: number,
  k2: number,
): SupportResult {
  const Ks = support.map(pi => pigments[pi].K);
  const Ss = support.map(pi => pigments[pi].S);

  const seed = nnlsSeed(support, xTarget, pigments);
  const c = coordinateDescent(seed, Ks, Ss, labTarget, k1, k2, 6);

  const R_pred = reflectanceFromConcentrations(c, Ks, Ss, k1, k2);
  const deltaE = spectraDE2000(R_pred, R_target);

  return { c, deltaE };
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

  const R_target = reconstruct(targetHex);
  const xTarget = new Float64Array(N_BANDS);
  for (let i = 0; i < N_BANDS; i++) {
    xTarget[i] = apparentToKoS(R_target[i], k1, k2);
  }
  const labTarget = xyzToLab(...reflectanceToXYZ(R_target));

  // Diagnostic: emit to console when solving the known test case
  const diag = targetHex.toLowerCase() === '#53de21';

  interface Candidate {
    deltaE: number;
    k: number;
    norm2: number;
    support: number[];
    c: Float64Array;
  }

  let best: Candidate | null = null;
  const kMax = Math.min(4, n);
  const allCandidates: Array<Candidate & { name: string }> = [];

  // k=2 and k=3 always; k=4 only when a 4th pigment could plausibly help
  for (let k = 2; k <= Math.min(3, kMax); k++) {
    let subsetCount = 0;
    for (const support of combinations(n, k)) {
      subsetCount++;
      const { c, deltaE: dE } = solveSupport(
        support, xTarget, labTarget, R_target, pigments, k1, k2,
      );
      const norm2 = c.reduce((acc, v) => acc + v * v, 0);
      const cand: Candidate = { deltaE: dE, k, norm2, support, c };

      if (diag) {
        const name = support.map(pi => pigments[pi].paint.id).join('+');
        allCandidates.push({ ...cand, name });
      }

      if (
        best === null ||
        dE < best.deltaE - 1e-6 ||
        (Math.abs(dE - best.deltaE) < 1.0 && k < best.k) ||
        (Math.abs(dE - best.deltaE) < 1e-6 && k === best.k && norm2 < best.norm2 - 1e-9)
      ) {
        best = cand;
      }
    }

    if (diag && k === 3) {
      console.log(`[PaintMix diag] #53de21 k=3: ${subsetCount} subsets evaluated`);
    }
  }

  // k=4 only when a 4th pigment plausibly helps (ΔE in mid-range)
  if (kMax >= 4 && best !== null && best.deltaE > 2.0 && best.deltaE <= 10.0) {
    for (const support of combinations(n, 4)) {
      const { c, deltaE: dE } = solveSupport(
        support, xTarget, labTarget, R_target, pigments, k1, k2,
      );
      const norm2 = c.reduce((acc, v) => acc + v * v, 0);
      const cand: Candidate = { deltaE: dE, k: 4, norm2, support, c };

      if (diag) {
        const name = support.map(pi => pigments[pi].paint.id).join('+');
        allCandidates.push({ ...cand, name });
      }

      if (
        dE < best.deltaE - 1e-6 ||
        (Math.abs(dE - best.deltaE) < 1.0 && norm2 < best.norm2 - 1e-9)
      ) {
        best = cand;
      }
    }
  }

  // Diagnostic output
  if (diag && allCandidates.length > 0) {
    console.log(`[PaintMix diag] #53de21: ${allCandidates.length} total candidates`);
    const top10 = [...allCandidates].sort((a, b) => a.deltaE - b.deltaE).slice(0, 10);
    console.log('[PaintMix diag] Top 10 candidates:');
    for (let i = 0; i < top10.length; i++) {
      const { name, deltaE, k, c } = top10[i];
      console.log(
        `  #${i + 1}: ΔE=${deltaE.toFixed(2)} k=${k} [${name}]` +
        ` fracs=[${Array.from(c).map(v => v.toFixed(3)).join(', ')}]`,
      );
    }
    const winner = best!;
    const winnerName = winner.support.map(pi => pigments[pi].paint.id).join('+');
    console.log(
      `[PaintMix diag] Winner: ΔE=${winner.deltaE.toFixed(2)} k=${winner.k} [${winnerName}]` +
      ` fracs=[${Array.from(winner.c).map(v => v.toFixed(3)).join(', ')}]`,
    );
  }

  if (!best) return null;

  // Sanity check: verify solver ΔE matches forward K-M prediction
  const Ks_w = best.support.map(pi => pigments[pi].K);
  const Ss_w = best.support.map(pi => pigments[pi].S);
  const R_check = reflectanceFromConcentrations(best.c, Ks_w, Ss_w, k1, k2);
  const dE_check = spectraDE2000(R_check, R_target);
  if (Math.abs(dE_check - best.deltaE) > 0.5) {
    console.warn(
      `[PaintMix] ΔE sanity mismatch for ${targetHex}: ` +
      `solver=${best.deltaE.toFixed(3)}, forward=${dE_check.toFixed(3)}`,
    );
  }

  // Predicted colour from solver's continuous concentrations (before rounding).
  // Rounding can drop small components entirely, making the predicted hex and ΔE
  // look wrong. We always report the solver's pre-rounding ΔE and predicted colour.
  const R_best = reflectanceFromConcentrations(best.c, Ks_w, Ss_w, k1, k2);
  const [Xb, Yb, Zb] = reflectanceToXYZ(R_best);

  // Scale to mL, round to 0.05, filter zeros, rebalance
  const rawVols = Array.from(best.c).map(f => roundTo005(f * batchSizeMl));
  const kept = best.support
    .map((pi, i) => ({ pi, vol: rawVols[i] }))
    .filter(e => e.vol > 0);

  if (kept.length === 0) return null;

  const total = Math.round(kept.reduce((s, e) => s + e.vol, 0) * 1000) / 1000;
  const targetVol = Math.round(batchSizeMl * 1000) / 1000;
  const diff = Math.round((targetVol - total) * 1000) / 1000;
  if (Math.abs(diff) > 0.001) {
    const maxIdx = kept.reduce((mi, e, i) => e.vol > kept[mi].vol ? i : mi, 0);
    kept[maxIdx].vol = Math.round((kept[maxIdx].vol + diff) * 1000) / 1000;
  }

  return {
    components: kept.map(e => ({
      paint: pigments[e.pi].paint as RecipeComponent['paint'],
      volumeMl: e.vol,
    })),
    predictedHex: xyzToHex(Xb, Yb, Zb),
    deltaE: Math.round(best.deltaE * 10) / 10,
    accuracy: accuracyLabel(best.deltaE),
  };
}
