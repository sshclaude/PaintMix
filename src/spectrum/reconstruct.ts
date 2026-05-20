/**
 * Burns 2017 spectral reconstruction: given an sRGB hex, returns a
 * 36-band reflectance spectrum (380–730 nm, 10 nm step) that
 *   1. produces the correct CIE XYZ under D65, and
 *   2. has minimum sum-of-squared first differences (least-slope-squared).
 *
 * S.A. Burns, "Generating spectral power distributions from constrained
 * sRGB values", Color Research & Application, 2017.
 *
 * The algorithm solves the KKT system for the unconstrained QP, then
 * iteratively fixes any out-of-[0,1] wavelength bands (active-set method)
 * until the solution is feasible.
 */

import { N_BANDS, W, hexToXYZ } from '../km/cie.ts';

// ---------------------------------------------------------------------------
// Gaussian elimination with partial pivoting — O(n³), sufficient for ≤42×42
// ---------------------------------------------------------------------------
function gaussElim(M: number[][], rhs: number[]): number[] {
  const n = M.length;
  // Augmented matrix [M | rhs]
  const A: number[][] = M.map((row, i) => [...row, rhs[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col, maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(A[row][col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxRow !== col) [A[col], A[maxRow]] = [A[maxRow], A[col]];
    if (Math.abs(A[col][col]) < 1e-15) continue;

    for (let row = col + 1; row < n; row++) {
      const f = A[row][col] / A[col][col];
      for (let j = col; j <= n; j++) A[row][j] -= f * A[col][j];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = A[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= A[i][j] * x[j];
    if (Math.abs(A[i][i]) > 1e-15) x[i] /= A[i][i];
  }
  return x;
}

// ---------------------------------------------------------------------------
// Core KKT solve for free variables
// ---------------------------------------------------------------------------
/**
 * Solve the reduced KKT system:
 *   [2·Q_ff   A_free^T] [R_free]   [rhs_R]
 *   [A_free   0       ] [μ     ] = [rhs_c]
 *
 * Returns the full 36-band reflectance with fixed values inserted.
 */
function solveKKT(
  xyz: [number, number, number],
  fixed: boolean[],
  fixedVal: number[],
): Float64Array {
  const n = N_BANDS;
  const freeIdx: number[] = [];
  for (let i = 0; i < n; i++) if (!fixed[i]) freeIdx.push(i);
  const nF = freeIdx.length;

  const R = new Float64Array(n);
  for (let i = 0; i < n; i++) if (fixed[i]) R[i] = fixedVal[i];
  if (nF === 0) return R;

  const dim = nF + 3;
  const M: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const rhs: number[] = new Array<number>(dim).fill(0);

  // ── Top-left block: 2·Q_ff (tridiagonal second-difference) ──────────────
  for (let ii = 0; ii < nF; ii++) {
    const li = freeIdx[ii];
    // Diagonal: 2 for interior, 1 for endpoints (standard DᵀD)
    const diag = (li === 0 || li === n - 1) ? 1 : 2;
    M[ii][ii] = 2 * diag;

    // Off-diagonal: adjacent free pairs
    if (ii + 1 < nF && freeIdx[ii + 1] === li + 1) {
      M[ii][ii + 1] = M[ii + 1][ii] = -2;
    }

    // RHS contribution from fixed neighbours: −2·Q[li,j]·fixedVal[j]
    // Q[i, i±1] = −1, so the contribution is +2·fixedVal[j]
    if (li > 0     && fixed[li - 1]) rhs[ii] += 2 * fixedVal[li - 1];
    if (li < n - 1 && fixed[li + 1]) rhs[ii] += 2 * fixedVal[li + 1];
  }

  // ── Constraint block (A_free, adjusted for fixed columns) ───────────────
  const bAdj: number[] = [xyz[0], xyz[1], xyz[2]];
  for (let j = 0; j < n; j++) {
    if (!fixed[j]) continue;
    bAdj[0] -= W[0][j] * fixedVal[j];
    bAdj[1] -= W[1][j] * fixedVal[j];
    bAdj[2] -= W[2][j] * fixedVal[j];
  }
  for (let ii = 0; ii < nF; ii++) {
    const li = freeIdx[ii];
    for (let k = 0; k < 3; k++) {
      M[ii][nF + k] = W[k][li];   // Aᵀ
      M[nF + k][ii] = W[k][li];   // A
    }
  }
  for (let k = 0; k < 3; k++) rhs[nF + k] = bAdj[k];

  const sol = gaussElim(M, rhs);
  for (let ii = 0; ii < nF; ii++) R[freeIdx[ii]] = sol[ii];
  return R;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reconstruct a minimum-curvature reflectance spectrum from an sRGB hex.
 * Returns a Float64Array of 36 reflectance values in [0, 1] (380–730 nm).
 *
 * Highly saturated colours outside the reflectance locus will clamp some
 * bands to 0 or 1 and may not perfectly reproduce the original sRGB values
 * when re-converted — this is a fundamental limit of physical reflectance.
 */
export function reconstruct(hex: string): Float64Array {
  const xyz = hexToXYZ(hex);
  const fixed: boolean[] = new Array<boolean>(N_BANDS).fill(false);
  const fixedVal: number[] = new Array<number>(N_BANDS).fill(0);

  for (let iter = 0; iter < N_BANDS + 4; iter++) {
    const R = solveKKT(xyz, fixed, fixedVal);

    let newlyFixed = false;
    for (let i = 0; i < N_BANDS; i++) {
      if (fixed[i]) continue;
      if (R[i] < -1e-9) {
        fixed[i] = true; fixedVal[i] = 0; newlyFixed = true;
      } else if (R[i] > 1 + 1e-9) {
        fixed[i] = true; fixedVal[i] = 1; newlyFixed = true;
      }
    }
    if (!newlyFixed) {
      // Clamp tiny numerical noise
      for (let i = 0; i < N_BANDS; i++) R[i] = Math.max(0, Math.min(1, R[i]));
      return R;
    }
  }

  // Fallback (should rarely be reached): clamp whatever we have
  const R = solveKKT(xyz, fixed, fixedVal);
  for (let i = 0; i < N_BANDS; i++) R[i] = Math.max(0, Math.min(1, R[i]));
  return R;
}
