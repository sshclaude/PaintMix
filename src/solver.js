import mixbox from 'mixbox';
import chroma from 'chroma-js';

// Forward model: blend paints in mixbox latent space
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

// Project a vector onto the probability simplex (sum=1, all>=0)
function projectToSimplex(v) {
  const n = v.length;
  const sorted = [...v].sort((a, b) => b - a);
  let cumSum = 0;
  let rho = 0;
  for (let i = 0; i < n; i++) {
    cumSum += sorted[i];
    if (sorted[i] - (cumSum - 1) / (i + 1) > 0) rho = i;
  }
  const theta = (sorted.slice(0, rho + 1).reduce((s, x) => s + x, 0) - 1) / (rho + 1);
  return v.map(vi => Math.max(0, vi - theta));
}

// Generate a random point on the n-simplex
function randomSimplex(n) {
  const v = Array.from({ length: n }, () => -Math.log(Math.random() + 1e-10));
  const sum = v.reduce((a, b) => a + b, 0);
  return v.map(x => x / sum);
}

// Nelder-Mead optimizer constrained to the probability simplex
function nelderMead(objective, n, x0, maxIter = 300) {
  const alpha = 1.0, gamma = 2.0, rho = 0.5, sigma = 0.5;

  // Build initial simplex: x0 plus n perturbations
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += 0.15;
    simplex.push(projectToSimplex(p));
  }

  let values = simplex.map(p => objective(p));

  for (let iter = 0; iter < maxIter; iter++) {
    // Sort ascending by function value
    const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    simplex = order.map(([, i]) => simplex[i]);
    values = order.map(([v]) => v);

    const best = simplex[0];
    const worst = simplex[n];
    const secondWorstVal = values[n - 1];

    // Centroid of all but worst
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    }

    // Reflection
    const xr = projectToSimplex(centroid.map((c, j) => c + alpha * (c - worst[j])));
    const vr = objective(xr);

    if (vr < values[0]) {
      // Try expansion
      const xe = projectToSimplex(centroid.map((c, j) => c + gamma * (xr[j] - c)));
      const ve = objective(xe);
      simplex[n] = ve < vr ? xe : xr;
      values[n] = ve < vr ? ve : vr;
    } else if (vr < secondWorstVal) {
      simplex[n] = xr;
      values[n] = vr;
    } else {
      // Contraction
      const xc = projectToSimplex(centroid.map((c, j) => c + rho * (worst[j] - c)));
      const vc = objective(xc);
      if (vc < values[n]) {
        simplex[n] = xc;
        values[n] = vc;
      } else {
        // Shrink toward best
        for (let i = 1; i <= n; i++) {
          simplex[i] = projectToSimplex(
            simplex[i].map((v, j) => best[j] + sigma * (v - best[j]))
          );
          values[i] = objective(simplex[i]);
        }
      }
    }
  }

  // Return best
  const minIdx = values.reduce((mi, v, i) => v < values[mi] ? i : mi, 0);
  return simplex[minIdx];
}

function roundTo005(v) {
  return Math.round(v / 0.05) * 0.05;
}

function accuracyLabel(dE) {
  if (dE < 1.0) return 'Excellent match';
  if (dE < 2.0) return 'Good match, minor variation visible up close';
  if (dE < 4.0) return 'Acceptable, noticeable in direct comparison';
  return 'Approximate — adjust by eye after mixing';
}

// Inverse solver: find paint fractions that minimize ΔE2000 to targetHex
export function solveMix(targetHex, activePaints, batchSizeMl) {
  if (!activePaints || activePaints.length === 0) return null;

  const hexes = activePaints.map(p => p.hex);
  const n = activePaints.length;

  let bestFractions = null;
  let bestPaints = null;
  let bestDeltaE = Infinity;
  let bestPredictedHex = null;

  const makeObjective = (paintHexes) => (f) => {
    const sum = f.reduce((a, b) => a + b, 0);
    if (sum < 1e-10) return 1000;
    const nf = f.map(x => x / sum);
    const pH = predictMix(paintHexes, nf);
    return chroma.deltaE(targetHex, pH);
  };

  for (let restart = 0; restart < 5; restart++) {
    let fractions = randomSimplex(n);

    // Full optimization pass
    fractions = nelderMead(makeObjective(hexes), n, fractions);

    // Normalize
    const s0 = fractions.reduce((a, b) => a + b, 0);
    if (s0 < 1e-10) continue;
    fractions = fractions.map(x => x / s0);

    // Zero out below threshold and keep top 4
    fractions = fractions.map(f => (f < 0.03 ? 0 : f));
    const nonZero = fractions.map((f, i) => [f, i]).filter(([f]) => f > 0);
    if (nonZero.length > 4) {
      nonZero.sort((a, b) => b[0] - a[0]);
      const keepIdx = new Set(nonZero.slice(0, 4).map(([, i]) => i));
      fractions = fractions.map((f, i) => (keepIdx.has(i) ? f : 0));
    }

    const s1 = fractions.reduce((a, b) => a + b, 0);
    if (s1 < 1e-10) continue;
    fractions = fractions.map(x => x / s1);

    // Extract active subset and re-optimize
    const subPaints = activePaints.filter((_, i) => fractions[i] > 0);
    let subFractions = fractions.filter(f => f > 0);
    const subHexes = subPaints.map(p => p.hex);
    const m = subPaints.length;

    if (m === 0) continue;

    subFractions = nelderMead(makeObjective(subHexes), m, subFractions, 400);

    const s2 = subFractions.reduce((a, b) => a + b, 0);
    if (s2 < 1e-10) continue;
    subFractions = subFractions.map(x => x / s2);

    const predictedHex = predictMix(subHexes, subFractions);
    const dE = chroma.deltaE(targetHex, predictedHex);

    if (dE < bestDeltaE) {
      bestDeltaE = dE;
      bestPredictedHex = predictedHex;
      bestFractions = subFractions;
      bestPaints = subPaints;
    }
  }

  if (!bestPaints) return null;

  // Scale to mL and round to nearest 0.05
  let volumes = bestFractions.map(f => roundTo005(f * batchSizeMl));

  // Adjust largest component so volumes sum exactly to batchSizeMl
  const total = Math.round(volumes.reduce((a, b) => a + b, 0) * 1000) / 1000;
  const target = Math.round(batchSizeMl * 1000) / 1000;
  const diff = Math.round((target - total) * 1000) / 1000;
  if (Math.abs(diff) > 0.001) {
    const largestIdx = volumes.reduce((mi, v, i) => (v > volumes[mi] ? i : mi), 0);
    volumes[largestIdx] = Math.round((volumes[largestIdx] + diff) * 1000) / 1000;
  }

  return {
    components: bestPaints.map((paint, i) => ({ paint, volumeMl: volumes[i] })),
    predictedHex: bestPredictedHex,
    deltaE: Math.round(bestDeltaE * 10) / 10,
    accuracy: accuracyLabel(bestDeltaE),
  };
}
