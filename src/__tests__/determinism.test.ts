import { describe, it, expect } from 'vitest';
import { solveMixKM } from '../solver/inverseKM.ts';
import { getPigments } from '../km/pigments.ts';

const ALL_IDS = getPigments(
  ['GF01','GF02','GF03','GF04','GF05','GF06','GF07','GF08','GF09','GF10']
).map(p => p.paint.id);

describe('determinism', () => {
  it('returns identical results for 50 calls with the same input', () => {
    const results: string[] = [];
    for (let i = 0; i < 50; i++) {
      const r = solveMixKM('#7F4A8A', ALL_IDS, 1.0);
      expect(r).not.toBeNull();
      results.push(JSON.stringify(r));
    }
    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });

  it('returns identical results for a second colour 50 times', () => {
    const results: string[] = [];
    for (let i = 0; i < 50; i++) {
      const r = solveMixKM('#3A7D44', ALL_IDS, 0.5);
      expect(r).not.toBeNull();
      results.push(JSON.stringify(r));
    }
    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });
});
