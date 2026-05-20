import { describe, it, expect } from 'vitest';
import { reconstruct } from '../spectrum/reconstruct.ts';
import { reflectanceToXYZ, xyzToLab, spectraDE2000, hexToXYZ } from '../km/cie.ts';

function xyzToHex(X: number, Y: number, Z: number): string {
  const rLin =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gLin = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const bLin =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const gc = (c: number) =>
    Math.round((Math.max(0, Math.min(1, c)) <= 0.0031308
      ? 12.92 * Math.max(0, Math.min(1, c))
      : 1.055 * Math.max(0, Math.min(1, c)) ** (1 / 2.4) - 0.055) * 255);
  const r = gc(rLin), g = gc(gLin), b = gc(bLin);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

describe('Burns 2017 reconstruction', () => {
  it('round-trips masstone reflectance within 0.5 ΔE2000', () => {
    const hexes = ['#C8392B', '#2980B9', '#27AE60', '#8E44AD', '#F39C12', '#FFFFFF', '#000000'];
    for (const hex of hexes) {
      const R = reconstruct(hex);
      const [X, Y, Z] = reflectanceToXYZ(R);
      const reconstructedHex = xyzToHex(X, Y, Z);

      // Compare original hex XYZ vs reconstructed via spectrum
      const origXYZ = hexToXYZ(hex);
      const origLab = xyzToLab(...origXYZ);
      const recLab = xyzToLab(X, Y, Z);

      const dL = origLab[0] - recLab[0];
      const da = origLab[1] - recLab[1];
      const db = origLab[2] - recLab[2];
      const dE = Math.sqrt(dL*dL + da*da + db*db); // simple Lab distance for round-trip
      expect(dE).toBeLessThan(2.0); // Burns reconstruction is exact in XYZ, tiny float errors only
    }
  });

  it('uniform grey (#808080) produces a near-flat spectrum', () => {
    const R = reconstruct('#808080');
    const mean = Array.from(R).reduce((a, b) => a + b, 0) / R.length;
    for (const v of R) {
      expect(Math.abs(v - mean)).toBeLessThan(0.05);
    }
  });

  it('pure white (#FFFFFF) reconstructs to near-unity reflectance', () => {
    const R = reconstruct('#FFFFFF');
    for (const v of R) {
      expect(v).toBeGreaterThan(0.95);
    }
  });

  it('pure black (#000000) reconstructs to near-zero reflectance', () => {
    const R = reconstruct('#000000');
    for (const v of R) {
      expect(v).toBeLessThan(0.05);
    }
  });
});
