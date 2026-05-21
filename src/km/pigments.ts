/**
 * Pigment K(λ) and S(λ) coefficients for each paint in basePaints.json.
 *
 * All K/S data comes from goldenSpectra.json, which contains measured
 * spectrophotometer data (Golden Heavy Body, 10 mil drawdowns over white,
 * D65/10°) at 400–700 nm (31 bands, 10 nm step).
 *
 * K/S ratios are concentration-invariant, so Heavy Body measurements
 * apply directly to the Fluid Acrylics of the same pigment.
 *
 * Two special cases (not in the drawdown dataset):
 *   GF01 Titanium White — hardcoded as the K-M reference white
 *                         (K=0.0026 flat, S=1.0, R≈95%)
 *   GF05 Benz. Yellow Medium — Diarylide Yellow (prod #1147) used as
 *         spectral proxy; PY83 and diarylide family are visually similar.
 *         User calibration will give the most accurate results here.
 */

import { apparentToKoS, saunderson, DEFAULT_K1, DEFAULT_K2 } from './forward.ts';
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
  /** K[band] absorption coefficient (length = N_BANDS) */
  K: Float64Array;
  /** S[band] scattering coefficient (length = N_BANDS) */
  S: Float64Array;
  /** Apparent masstone reflectance, forward-computed from K/S via Saunderson */
  masstone: Float64Array;
}

// ---------------------------------------------------------------------------
// Opacity → S scalar (scattering magnitude prior)
// ---------------------------------------------------------------------------

const OPACITY_S: Record<string, number> = {
  opaque: 1.0,
  'semi-opaque': 0.5,
  'semi-transparent': 0.2,
  transparent: 0.08,
};

// ---------------------------------------------------------------------------
// Measured K/S table
// ---------------------------------------------------------------------------

const GOLDEN_SPECTRA = goldenSpectraRaw as Record<string, { ks: number[] }>;

// ---------------------------------------------------------------------------
// Build pigment table
// ---------------------------------------------------------------------------

function buildPigment(p: PaintRecord): PigmentData {
  const Sscalar = OPACITY_S[p.opacity] ?? 0.2;
  const spec = GOLDEN_SPECTRA[p.id];

  if (!spec || spec.ks.length !== N_BANDS) {
    throw new Error(
      `goldenSpectra.json missing or wrong-length entry for ${p.id} (${p.name}). ` +
      `Expected ${N_BANDS} bands, got ${spec?.ks.length ?? 0}.`,
    );
  }

  const K = new Float64Array(N_BANDS);
  const S = new Float64Array(N_BANDS);
  const masstone = new Float64Array(N_BANDS);

  for (let i = 0; i < N_BANDS; i++) {
    const ks = spec.ks[i];
    S[i] = Sscalar;
    K[i] = ks * Sscalar;
    // Forward K-M + Saunderson to get apparent reflectance for diagnostics
    const R_KM = ks > 0 ? 1 + ks - Math.sqrt(ks * ks + 2 * ks) : 1;
    masstone[i] = saunderson(R_KM, DEFAULT_K1, DEFAULT_K2);
  }

  return { paint: p as PaintRecord, K, S, masstone };
}

export const PIGMENTS: PigmentData[] = (basePaintsRaw as PaintRecord[]).map(buildPigment);

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
