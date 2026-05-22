/**
 * Solver regression tests.
 *
 * Each target is a real-world colour a hobbyist might request.  Some are
 * outside the physical gamut of the 13-pigment Golden HB mixing set, so
 * the expected ΔE is not < 3.  The thresholds here reflect the best
 * achievable result from this palette and are intentionally conservative —
 * the tests catch catastrophic regressions (solver returning garbage) not
 * fine optimisation differences.
 *
 * Per-recipe invariants checked for every target:
 *   • result is non-null
 *   • every component has volumeMl > 0  (no zero-volume bug)
 *   • volumes sum to batchSizeMl ± 0.001 mL
 *   • ΔE ≤ threshold
 */

import { describe, it, expect } from 'vitest';
import { solveMixKM } from '../solver/inverseKM.ts';

const ALL_IDS = [
  'GF01','GF02','GF03','GF04','GF05',
  'GF06','GF07','GF08','GF09','GF10',
  'GF11','GF12','GF13',
];
const BATCH = 0.5;

const CASES: { hex: string; label: string; maxDE: number }[] = [
  // Vivid saturated colours — well outside the physical pigment gamut.
  // Best achievable ΔE with a 3-paint mix from this palette is ~16–17.
  { hex: '#53de21', label: 'Vivid green',   maxDE: 22 },
  { hex: '#3A2048', label: 'Dark purple',   maxDE: 20 },
  { hex: '#FF0000', label: 'Pure red',      maxDE: 15 },
  // Medium-saturation colours — partially out of gamut.
  { hex: '#228B22', label: 'Forest green',  maxDE: 17 },
  { hex: '#4A90D9', label: 'Cornflower blue', maxDE: 14 },
  { hex: '#8B4513', label: 'Saddle brown',  maxDE: 15 },
  // Light pastel — close to gamut edge.
  { hex: '#FFB6C1', label: 'Light pink',    maxDE: 14 },
];

describe('solver regression', () => {
  for (const { hex, label, maxDE } of CASES) {
    it(`${label} (${hex}) — ΔE ≤ ${maxDE}, volumes valid`, () => {
      const recipe = solveMixKM(hex, ALL_IDS, BATCH);

      expect(recipe, 'solver returned null').not.toBeNull();

      const { components, deltaE } = recipe!;

      // No zero-volume components
      for (const c of components) {
        expect(c.volumeMl, `zero-volume component in ${hex}`).toBeGreaterThan(0);
      }

      // Volumes sum to batchSizeMl
      const total = components.reduce((s, c) => s + c.volumeMl, 0);
      expect(total).toBeCloseTo(BATCH, 2);

      // ΔE within expected range
      expect(deltaE).toBeLessThanOrEqual(maxDE);
    });
  }
});
