/**
 * Two-constant Kubelka–Munk forward model with Saunderson correction.
 *
 * K-M infinite-thickness (opaque film) equation:
 *   R_KM(λ) = 1 + K/S - √((K/S)² + 2·K/S)
 *
 * Saunderson correction (accounts for interface reflections):
 *   R_apparent = k1 + (1 − k1)(1 − k2)·R_KM / (1 − k2·R_KM)
 *
 * Defaults:  k1 = 0.04 (≈ Fresnel reflection at air/paint interface)
 *            k2 = 0.60 (≈ internal total-internal-reflection fraction)
 */

import { N_BANDS } from './cie.ts';

export const DEFAULT_K1 = 0.04;
export const DEFAULT_K2 = 0.60;

/** Single-band K-M reflectance from K/S ratio. */
export function kmReflectance(KoS: number): number {
  if (KoS <= 0) return 1;
  return 1 + KoS - Math.sqrt(KoS * KoS + 2 * KoS);
}

/** Saunderson correction: R_KM → R_apparent. */
export function saunderson(R_KM: number, k1: number, k2: number): number {
  return k1 + (1 - k1) * (1 - k2) * R_KM / (1 - k2 * R_KM);
}

/** Inverse Saunderson: R_apparent → R_KM. */
export function saundersonInverse(R_app: number, k1: number, k2: number): number {
  const num = R_app - k1;
  const den = (1 - k1) * (1 - k2) + k2 * num;
  if (den <= 0) return 0;
  return num / den;
}

/**
 * Predict the apparent reflectance spectrum for a mixture of pigments.
 *
 * @param c    Concentration vector (length = number of pigments), must sum to 1.
 * @param K    K[pigment] — absorption coefficient spectrum per pigment (length N_BANDS each).
 * @param S    S[pigment] — scattering coefficient spectrum per pigment (length N_BANDS each).
 * @param k1   Saunderson k1 (default 0.04).
 * @param k2   Saunderson k2 (default 0.60).
 */
export function reflectanceFromConcentrations(
  c: Float64Array,
  K: Float64Array[],
  S: Float64Array[],
  k1: number = DEFAULT_K1,
  k2: number = DEFAULT_K2,
): Float64Array {
  const nBands = N_BANDS;
  const result = new Float64Array(nBands);
  for (let i = 0; i < nBands; i++) {
    let Kmix = 0, Smix = 0;
    for (let j = 0; j < c.length; j++) {
      Kmix += c[j] * K[j][i];
      Smix += c[j] * S[j][i];
    }
    const R_KM = kmReflectance(Smix > 1e-12 ? Kmix / Smix : 1e6);
    result[i] = saunderson(R_KM, k1, k2);
  }
  return result;
}

/**
 * Convert a single-band apparent reflectance to K/S (Saunderson-corrected).
 * Used when computing pigment K and S from masstone measurements.
 */
export function apparentToKoS(R_app: number, k1: number, k2: number): number {
  const R_KM = saundersonInverse(R_app, k1, k2);
  if (R_KM <= 0) return 1e6;
  if (R_KM >= 1) return 0;
  return (1 - R_KM) * (1 - R_KM) / (2 * R_KM);
}
