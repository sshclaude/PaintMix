/** CIE 1931 2° observer and D65 illuminant data at 380–730 nm, 10 nm step (36 bands). */

export const NM_MIN = 380;
export const NM_STEP = 10;
export const N_BANDS = 36; // 380, 390, ... 730

// CIE 1931 2° CMFs: x̄, ȳ, z̄  (source: CIE 1931 standard tables)
export const CMF_X = new Float64Array([
  0.001368, 0.004243, 0.014310, 0.043510, 0.134380, 0.283900, 0.348280, 0.336200, 0.290800,
  0.195360, 0.095640, 0.032010, 0.004900, 0.009300, 0.063270, 0.165500, 0.290400, 0.433450,
  0.594500, 0.762100, 0.916300, 1.026300, 1.062200, 1.002600, 0.854450, 0.642400, 0.447900,
  0.283500, 0.164900, 0.087400, 0.046770, 0.022700, 0.011359, 0.005790, 0.002899, 0.001440,
]);

export const CMF_Y = new Float64Array([
  0.000039, 0.000120, 0.000396, 0.001210, 0.004000, 0.011600, 0.023000, 0.038000, 0.060000,
  0.090980, 0.139020, 0.208020, 0.323000, 0.503000, 0.710000, 0.862000, 0.954000, 0.994950,
  0.995000, 0.952000, 0.870000, 0.757000, 0.631000, 0.503000, 0.381000, 0.265000, 0.175000,
  0.107000, 0.061000, 0.032000, 0.017000, 0.008210, 0.004102, 0.002091, 0.001047, 0.000520,
]);

export const CMF_Z = new Float64Array([
  0.006450, 0.020050, 0.067850, 0.207400, 0.645600, 1.385600, 1.747060, 1.772110, 1.669200,
  1.287640, 0.812950, 0.465180, 0.272000, 0.158200, 0.078250, 0.042160, 0.020300, 0.008750,
  0.003900, 0.002100, 0.001650, 0.001100, 0.000800, 0.000340, 0.000190, 0.000050, 0.000020,
  0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000,
]);

// CIE D65 relative spectral power distribution (normalised so peak ≈ 100 at 560 nm)
export const D65 = new Float64Array([
  50.0000, 54.6482, 82.7549, 91.4860, 93.4318, 86.6823, 104.865, 117.008, 117.812, 114.861,
  115.923, 108.811, 109.354, 107.802, 104.790, 107.689, 104.405, 104.046, 100.000, 96.3342,
  95.7880, 88.6856,  90.006,  89.599,  87.699,  83.289,  83.699,  80.027,  80.215,  82.278,
   78.284,  69.721,  71.609,  74.349,  61.605,  69.890,
]);

// Pre-compute W[j][i] = CMF_j(λᵢ) × D65(λᵢ) × Δλ, normalised so perfect white → Y=1
const _raw = [new Float64Array(N_BANDS), new Float64Array(N_BANDS), new Float64Array(N_BANDS)];
let _Yn = 0;
for (let i = 0; i < N_BANDS; i++) {
  _raw[0][i] = CMF_X[i] * D65[i] * NM_STEP;
  _raw[1][i] = CMF_Y[i] * D65[i] * NM_STEP;
  _raw[2][i] = CMF_Z[i] * D65[i] * NM_STEP;
  _Yn += _raw[1][i];
}
/** W[0..2][0..35] — spectral weighting matrix for XYZ (normalised, D65). */
export const W: [Float64Array, Float64Array, Float64Array] = [
  _raw[0].map(v => v / _Yn) as Float64Array,
  _raw[1].map(v => v / _Yn) as Float64Array,
  _raw[2].map(v => v / _Yn) as Float64Array,
];

/** Integrate a reflectance spectrum against D65 CMFs → [X, Y, Z] in [0,1]. */
export function reflectanceToXYZ(R: Float64Array): [number, number, number] {
  let X = 0, Y = 0, Z = 0;
  for (let i = 0; i < N_BANDS; i++) {
    X += W[0][i] * R[i];
    Y += W[1][i] * R[i];
    Z += W[2][i] * R[i];
  }
  return [X, Y, Z];
}

/** sRGB (D65) → linear sRGB: apply inverse gamma curve. */
export function sRGBExpand(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** linear sRGB → sRGB gamma. */
export function sRGBCompress(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** sRGB hex string → linear XYZ (D65). */
export function hexToXYZ(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  const r = sRGBExpand(((v >> 16) & 0xff) / 255);
  const g = sRGBExpand(((v >>  8) & 0xff) / 255);
  const b = sRGBExpand(( v        & 0xff) / 255);
  // IEC 61966-2-1 sRGB→XYZ (D65) matrix
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
    0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
  ];
}

/** XYZ (D65, Y∈[0,1]) → CIELAB. */
export function xyzToLab(X: number, Y: number, Z: number): [number, number, number] {
  // D65 white: Xn=0.95047, Yn=1.0, Zn=1.08883
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787037 * t + 16 / 116;
  const fx = f(X / 0.95047), fy = f(Y / 1.0), fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIELAB → XYZ (D65). */
export function labToXYZ(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const cube = (t: number) => t * t * t;
  const inv = (t: number) => cube(t) > 0.008856 ? cube(t) : (t - 16 / 116) / 7.787037;
  return [inv(fx) * 0.95047, inv(fy), inv(fz) * 1.08883];
}

/** CIE ΔE2000 between two Lab tuples (kL=kC=kH=1). */
export function deltaE2000(lab1: [number, number, number], lab2: [number, number, number]): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cavg = (C1 + C2) / 2;
  const Cavg7 = Cavg ** 7;
  const g = 0.5 * (1 - Math.sqrt(Cavg7 / (Cavg7 + 25 ** 7)));
  const a1p = a1 * (1 + g), a2p = a2 * (1 + g);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  let h1p = Math.atan2(b1, a1p) * (180 / Math.PI); if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * (180 / Math.PI); if (h2p < 0) h2p += 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p > 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp: number;
  if (C1p * C2p === 0) {
    hbp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbp = (h1p + h2p) / 2;
  } else {
    hbp = (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2;
  }
  const T = 1
    - 0.17 * Math.cos((hbp - 30) * Math.PI / 180)
    + 0.24 * Math.cos(2 * hbp * Math.PI / 180)
    + 0.32 * Math.cos((3 * hbp + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * hbp - 63) * Math.PI / 180);
  const SL = 1 + 0.015 * (Lbp - 50) ** 2 / Math.sqrt(20 + (Lbp - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const Cbp7 = Cbp ** 7;
  const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + 25 ** 7));
  const dt = -30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const RT = -Math.sin(2 * dt * Math.PI / 180) * RC;
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

/** Compute ΔE2000 from two reflectance spectra. */
export function spectraDE2000(R1: Float64Array, R2: Float64Array): number {
  return deltaE2000(xyzToLab(...reflectanceToXYZ(R1)), xyzToLab(...reflectanceToXYZ(R2)));
}

/** Hex → Lab (via spectral reconstruction would be ideal; here we use XYZ directly). */
export function hexToLab(hex: string): [number, number, number] {
  return xyzToLab(...hexToXYZ(hex));
}
