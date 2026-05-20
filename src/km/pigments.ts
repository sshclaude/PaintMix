/**
 * Pigment K(λ) and S(λ) coefficients for each paint in basePaints.json.
 *
 * K/S source priority:
 *   1. Measured: Golden Heavy Body spectrophotometer data (goldenSpectra.json),
 *      10 mil drawdowns over white, D65/10°. K/S is concentration-invariant,
 *      so HB measurements apply directly to Fluid Acrylics of the same pigment.
 *   2. Derived: Burns 2017 minimum-curvature reflectance reconstruction from the
 *      paint's hex value (used for Titanium White and any paint not in the
 *      measured dataset).
 *
 * In both cases the S_scalar (scattering magnitude prior) is derived from the
 * opacity field, and K(λ) = KoS(λ) × S_scalar, S(λ) = S_scalar.
 */

import { reconstruct } from '../spectrum/reconstruct.ts';
import { apparentToKoS, DEFAULT_K1, DEFAULT_K2 } from './forward.ts';
import { N_BANDS } from './cie.ts';
import basePaintsRaw from '../data/basePaints.json' assert { type: 'json' };
import goldenSpectraRaw from '../data/goldenSpectra.json' assert { type: 'json' };

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
  /** 'measured' if from spectrophotometer data, 'derived' if from hex via Burns 2017 */
  source: 'measured' | 'derived';
}

// ---------------------------------------------------------------------------
// Opacity → S scalar
// ---------------------------------------------------------------------------

const OPACITY_S: Record<string, number> = {
  opaque: 1.0,
  'semi-opaque': 0.5,
  'semi-transparent': 0.2,
  transparent: 0.08,
};

// ---------------------------------------------------------------------------
// Measured K/S table (Golden HB spectrophotometer data)
// ---------------------------------------------------------------------------

const GOLDEN_SPECTRA = goldenSpectraRaw as Record<string, { ks: number[] }>;

// ---------------------------------------------------------------------------
// Build pigment table at module load
// ---------------------------------------------------------------------------

function buildPigment(p: PaintRecord, k1: number, k2: number): PigmentData {
  const Sscalar = OPACITY_S[p.opacity] ?? 0.2;
  const K = new Float64Array(N_BANDS);
  const S = new Float64Array(N_BANDS);

  const measured = GOLDEN_SPECTRA[p.id];
  if (measured) {
    // Use real measured K/S from Golden spectrophotometer data
    for (let i = 0; i < N_BANDS; i++) {
      S[i] = Sscalar;
      K[i] = measured.ks[i] * Sscalar;
    }
    // Derive masstone reflectance from measured K/S via Saunderson
    const masstone = new Float64Array(N_BANDS);
    for (let i = 0; i < N_BANDS; i++) {
      const ks = measured.ks[i];
      const R_KM = ks > 0 ? 1 + ks - Math.sqrt(ks * ks + 2 * ks) : 1;
      const den = 1 - (1 - k1) * (1 - k2) / (1 - k2 * R_KM) * (1 - k1);
      // Saunderson forward: R_app = k1 + (1-k1)(1-k2)*R_KM / (1-k2*R_KM)
      masstone[i] = Math.max(0, Math.min(1,
        k1 + (1 - k1) * (1 - k2) * R_KM / (1 - k2 * R_KM)));
    }
    return { paint: p as PaintRecord, K, S, masstone, source: 'measured' };
  }

  // Fall back to Burns 2017 reconstruction from hex
  const masstone = reconstruct(p.hex);
  for (let i = 0; i < N_BANDS; i++) {
    const KoS = apparentToKoS(masstone[i], k1, k2);
    S[i] = Sscalar;
    K[i] = KoS * Sscalar;
  }
  return { paint: p as PaintRecord, K, S, masstone, source: 'derived' };
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
