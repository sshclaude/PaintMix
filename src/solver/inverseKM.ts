/**
 * Spectral inverse Kubelka–Munk solver.
 *
 * Algorithm (fully deterministic):
 *
 * 1. Reconstruct target reflectance from hex via Burns 2017 → R_target(λ).
 * 2. For k ∈ {2, 3, 4}: enumerate every C(N, k) support.
 *    For each support, grid-search concentrations on the k-simplex to find
 *    the point that minimises Lab² distance from the target (fast proxy for
 *    ΔE₂₀₀₀). Confirm the winner with full spectraDE2000.
 *    Grid step: k=2 → 0.05 (21 pts), k=3 → 0.10 (66 pts), k=4 → 0.20 (56 pts).
 *    k=4 is only attempted when the best ΔE after k=2+3 is in (2, 10] —
 *    i.e., when a 4th pigment is plausibly useful.
 * 3. Rank all supports by ΔE₂₀₀₀ ascending, then k ascending, then ‖c‖₂.
 * 4. Scale winning fractions to volumes, round to 0.05 mL.
 *    Recompute predicted colour from final volumes.
 *    Drop any component that rounds to 0.00 mL before output.
 *
 * NO Math.random. NO Date.now. Fully deterministic.
 */

import { reconstruct } from '../spectrum/reconstruct.ts';
import { reflectanceFromConcentrations, DEFAULT_K1, DEFAULT_K2 } from '../km/forward.ts';
import { spectraDE2000, reflectanceToXYZ, xyzToLab, N_BANDS } from '../km/cie.ts';
import { getPigments, type PigmentData } from '../km/pigments.ts';

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
// Per-support grid search
// ---------------------------------------------------------------------------

interface SupportResult {
  c: Float64Array;   // concentrations (sum = 1)
  deltaE: number;
}

function searchSupport(
  support: number[],
  R_target: Float64Array,
  xyzTarget: [number, number, number],
  pigments: PigmentData[],
  k1: number,
  k2: number,
  step: number,
): SupportResult | null {
  const k = support.length;
  const Ks = support.map(pi => pigments[pi].K);
  const Ss = support.map(pi => pigments[pi].S);
  const N = Math.round(1 / step);

  const [Xt, Yt, Zt] = xyzTarget;

  let bestDistSq = Infinity;
  let bestC: number[] | null = null;

  const c = new Array<number>(k);

  if (k === 2) {
    for (let i = 0; i <= N; i++) {
      c[0] = i / N; c[1] = 1 - c[0];
      const cf = new Float64Array(c);
      const R = reflectanceFromConcentrations(cf, Ks, Ss, k1, k2);
      const [X, Y, Z] = reflectanceToXYZ(R);
      const d = (X-Xt)**2 + (Y-Yt)**2 + (Z-Zt)**2;
      if (d < bestDistSq) { bestDistSq = d; bestC = c.slice(); }
    }
  } else if (k === 3) {
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N - i; j++) {
        c[0] = i / N; c[1] = j / N; c[2] = 1 - c[0] - c[1];
        const cf = new Float64Array(c);
        const R = reflectanceFromConcentrations(cf, Ks, Ss, k1, k2);
        const [X, Y, Z] = reflectanceToXYZ(R);
        const d = (X-Xt)**2 + (Y-Yt)**2 + (Z-Zt)**2;
        if (d < bestDistSq) { bestDistSq = d; bestC = c.slice(); }
      }
    }
  } else {
    // k === 4
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N - i; j++) {
        for (let l = 0; l <= N - i - j; l++) {
          c[0] = i / N; c[1] = j / N; c[2] = l / N; c[3] = 1 - c[0] - c[1] - c[2];
          const cf = new Float64Array(c);
          const R = reflectanceFromConcentrations(cf, Ks, Ss, k1, k2);
          const [X, Y, Z] = reflectanceToXYZ(R);
          const d = (X-Xt)**2 + (Y-Yt)**2 + (Z-Zt)**2;
          if (d < bestDistSq) { bestDistSq = d; bestC = c.slice(); }
        }
      }
    }
  }

  if (!bestC) return null;

  // Compute definitive ΔE2000 for the winner
  const cf = new Float64Array(bestC);
  const R_pred = reflectanceFromConcentrations(cf, Ks, Ss, k1, k2);
  const dE = spectraDE2000(R_pred, R_target);

  return { c: cf, deltaE: dE };
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
  const xyzTarget = reflectanceToXYZ(R_target);

  const kMax = Math.min(4, n);

  interface Candidate {
    deltaE: number;
    k: number;
    norm2: number;
    support: number[];
    c: Float64Array;
  }

  let best: Candidate | null = null;

  // k=2 and k=3 always; k=4 only when a 4th pigment might help
  for (let k = 2; k <= Math.min(3, kMax); k++) {
    const step = k === 2 ? 0.05 : 0.10;
    for (const support of combinations(n, k)) {
      const result = searchSupport(support, R_target, xyzTarget, pigments, k1, k2, step);
      if (!result) continue;
      const { c, deltaE: dE } = result;
      const norm2 = c.reduce((acc, v) => acc + v * v, 0);
      if (
        best === null || dE < best.deltaE - 1e-6 ||
        (Math.abs(dE - best.deltaE) < 1e-6 && k < best.k) ||
        (Math.abs(dE - best.deltaE) < 1e-6 && k === best.k && norm2 < best.norm2 - 1e-9)
      ) {
        best = { deltaE: dE, k, norm2, support, c };
      }
    }
  }

  // k=4 only when 3-paint solution leaves a meaningful gap (not excellent, not hopeless)
  if (kMax >= 4 && best !== null && best.deltaE > 2.0 && best.deltaE <= 10.0) {
    for (const support of combinations(n, 4)) {
      const result = searchSupport(support, R_target, xyzTarget, pigments, k1, k2, 0.20);
      if (!result) continue;
      const { c, deltaE: dE } = result;
      const norm2 = c.reduce((acc, v) => acc + v * v, 0);
      if (
        dE < best.deltaE - 1e-6 ||
        (Math.abs(dE - best.deltaE) < 1e-6 && norm2 < best.norm2 - 1e-9)
      ) {
        best = { deltaE: dE, k: 4, norm2, support, c };
      }
    }
  }

  if (!best) return null;

  // Scale to mL, round to 0.05, filter zeros, rebalance
  const rawVolumes = Array.from(best.c).map(f => roundTo005(f * batchSizeMl));

  const kept = best.support
    .map((pi, i) => ({ pi, vol: rawVolumes[i] }))
    .filter(e => e.vol > 0);

  if (kept.length === 0) return null;

  const total = Math.round(kept.reduce((s, e) => s + e.vol, 0) * 1000) / 1000;
  const targetVol = Math.round(batchSizeMl * 1000) / 1000;
  const diff = Math.round((targetVol - total) * 1000) / 1000;
  if (Math.abs(diff) > 0.001) {
    const maxIdx = kept.reduce((mi, e, i) => e.vol > kept[mi].vol ? i : mi, 0);
    kept[maxIdx].vol = Math.round((kept[maxIdx].vol + diff) * 1000) / 1000;
  }

  // Recompute predicted colour from final (rounded) fractions
  const finalFracs = new Float64Array(kept.map(e => e.vol / batchSizeMl));
  const finalKs = kept.map(e => pigments[e.pi].K);
  const finalSs = kept.map(e => pigments[e.pi].S);
  const R_final = reflectanceFromConcentrations(finalFracs, finalKs, finalSs, k1, k2);
  const finalDeltaE = spectraDE2000(R_final, R_target);
  const [Xf, Yf, Zf] = reflectanceToXYZ(R_final);

  return {
    components: kept.map(e => ({
      paint: pigments[e.pi].paint as RecipeComponent['paint'],
      volumeMl: e.vol,
    })),
    predictedHex: xyzToHex(Xf, Yf, Zf),
    deltaE: Math.round(finalDeltaE * 10) / 10,
    accuracy: accuracyLabel(finalDeltaE),
  };
}
