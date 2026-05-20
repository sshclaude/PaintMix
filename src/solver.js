import mixbox from 'mixbox';
import chroma from 'chroma-js';
import { solveMixKM } from './solver/inverseKM.ts';

// Forward model: blend paints in mixbox latent space (UI gradient previews only)
export function predictMix(paints, fractions) {
  const latents = paints.map(p => {
    const [r, g, b] = chroma(p).rgb();
    return mixbox.rgbToLatent(r, g, b);
  });

  const blended = new Array(mixbox.LATENT_SIZE).fill(0);
  latents.forEach((l, i) => {
    l.forEach((v, j) => {
      blended[j] += fractions[i] * v;
    });
  });

  const [r, g, b] = mixbox.latentToRgb(blended);
  return chroma(r, g, b).hex();
}

// Inverse solver — deterministic spectral K-M pipeline
export function solveMix(targetHex, activePaints, batchSizeMl) {
  if (!activePaints || activePaints.length === 0) return null;
  const ids = activePaints.map(p => p.id);
  return solveMixKM(targetHex, ids, batchSizeMl);
}
