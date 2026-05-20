/**
 * Pigment K(λ) and S(λ) coefficients for each paint in basePaints.json.
 *
 * Derivation (all deterministic, no random elements):
 *
 * 1. Masstone spectrum: Burns 2017 reconstruction from the paint's `hex` value.
 *    This gives the minimum-curvature reflectance that produces the correct colour
 *    under D65 — fully determined by the hex value.
 *
 * 2. S_scalar (scattering magnitude prior): derived from the `opacity` field.
 *    Opaque pigments have high S (TiO₂-like scattering); transparent pigments
 *    have low S (like phthalo dyes dispersed in acrylic medium).
 *    This approximation is the principal limitation; real measurements via the
 *    calibration flow (twoSubstrate.ts) will replace it.
 *
 * 3. Walowit/McCarthy/Berns 1987 two-constant extraction: given the masstone
 *    K/S ratio and S_scalar, we set K(λ) = KoS(λ) × S_scalar and
 *    S(λ) = S_scalar (uniform scattering per unit concentration).
 *
 * Note: TiO₂ white is taken as the reference substrate with S_white = 1.0.
 */

import { reconstruct } from '../spectrum/reconstruct.ts';
import { apparentToKoS, DEFAULT_K1, DEFAULT_K2 } from './forward.ts';
import { N_BANDS } from './cie.ts';
import basePaintsRaw from '../data/basePaints.json' assert { type: 'json' };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaintRecord {
  id: string;
  name: string;
  hex: string;
  lab: [number, number, number];
  opacity: string;
  extended?: boolean;
}

export interface PigmentData {
  paint: PaintRecord;
  /** K[band] absorption coefficient */
  K: Float64Array;
  /** S[band] scattering coefficient */
  S: Float64Array;
  /** Masstone reflectance spectrum (36 bands) */
  masstone: Float64Array;
}

// ---------------------------------------------------------------------------
// Opacity → S scalar
// ---------------------------------------------------------------------------

// S scalars chosen so that phthalo transparent pigments (S≈0.1) blend correctly
// with TiO₂ white (S=1.0 reference).
const OPACITY_S: Record<string, number> = {
  opaque: 1.0,
  'semi-opaque': 0.5,
  'semi-transparent': 0.2,
  transparent: 0.08,
};

// ---------------------------------------------------------------------------
// Build pigment table at module load (purely functional, no side-effects)
// ---------------------------------------------------------------------------

function buildPigment(p: PaintRecord, k1: number, k2: number): PigmentData {
  const masstone = reconstruct(p.hex);
  const K = new Float64Array(N_BANDS);
  const S = new Float64Array(N_BANDS);
  const Sscalar = OPACITY_S[p.opacity] ?? 0.2;

  for (let i = 0; i < N_BANDS; i++) {
    const KoS = apparentToKoS(masstone[i], k1, k2);
    S[i] = Sscalar;
    K[i] = KoS * Sscalar;
  }

  return { paint: p as PaintRecord, K, S, masstone };
}

export const PIGMENTS: PigmentData[] = (basePaintsRaw as PaintRecord[]).map(p =>
  buildPigment(p, DEFAULT_K1, DEFAULT_K2),
);

/** Return pigment data for a specific paint id. */
export function getPigment(id: string): PigmentData | undefined {
  return PIGMENTS.find(p => p.paint.id === id);
}

/**
 * Return pigment data for a subset of paints by id.
 * Preserves the order from basePaints.json.
 */
export function getPigments(ids: string[]): PigmentData[] {
  const idSet = new Set(ids);
  return PIGMENTS.filter(p => idSet.has(p.paint.id));
}
