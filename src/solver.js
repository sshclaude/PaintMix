import chroma from 'chroma-js';

const API_BASE = 'https://paintengineacrylic.goldenartistcolors.com/api';

function accuracyLabel(dE) {
  if (dE < 1.0) return 'Excellent match';
  if (dE < 2.0) return 'Good match, minor variation visible up close';
  if (dE < 4.0) return 'Acceptable, noticeable in direct comparison';
  if (dE < 8.0) return 'Approximate — adjust by eye after mixing';
  return 'Out of gamut — best achievable approximation';
}

function roundTo002(v) {
  return Math.round(v / 0.02) * 0.02;
}

function srgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// Forward model: given an array of {paint, volumeMl} components, return predicted hex.
// Used for gradient previews in ProgressionCard and CalibrationFlow.
export async function predictMix(components) {
  const total = components.reduce((s, c) => s + c.volumeMl, 0);
  if (total <= 0) return '#808080';

  const parts = components.map(({ paint, volumeMl }) => {
    const { r, g, b } = hexToRgb(paint.hex);
    return {
      paintId: paint.goldenPaintId,
      name: paint.name,
      r, g, b,
      quantity: volumeMl / total,
      quantityHdths: 100,
    };
  });

  const res = await fetch(`${API_BASE}/paintmix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts }),
  });
  if (!res.ok) throw new Error(`paintmix ${res.status}`);
  const data = await res.json();
  const { r, g, b } = data.paintMixColor.srgb;
  return srgbToHex(r, g, b);
}

// Inverse solver: find the recipe that best matches targetHex.
// Returns null on failure; throws on network/API error.
export async function solveMix(targetHex, activePaints, batchSizeMl) {
  if (!activePaints || activePaints.length === 0) return null;

  const [tr, tg, tb] = chroma(targetHex).rgb();

  // ── 1. Inverse solve ────────────────────────────────────────────────────
  const cmRes = await fetch(`${API_BASE}/colormatch_tag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetColor: { r: Math.round(tr), g: Math.round(tg), b: Math.round(tb) },
      cie76MatchingBound: 1,
      maxPaints: 4,
      paletteTag: 'Fluid_Mixing',
    }),
  });
  if (!cmRes.ok) throw new Error(`colormatch_tag ${cmRes.status}`);
  const cmData = await cmRes.json();

  const { solution, solutionColor } = cmData;

  // ── 2. Map paintIds → our paint objects ─────────────────────────────────
  const paintByGoldenId = Object.fromEntries(
    activePaints.filter(p => p.goldenPaintId).map(p => [p.goldenPaintId, p])
  );
  const mappedParts = (solution.parts || [])
    .filter(p => paintByGoldenId[p.paintId])
    .map(p => ({ paint: paintByGoldenId[p.paintId], quantity: p.quantity }));

  if (mappedParts.length === 0) return null;

  // Normalise quantities to a fraction that sums to 1
  const qTotal = mappedParts.reduce((s, p) => s + p.quantity, 0);
  const fractions = mappedParts.map(p => p.quantity / qTotal);

  // ── 3. Scale to mL, round to 0.02, rebalance ───────────────────────────
  let components = mappedParts
    .map(({ paint }, i) => ({
      paint,
      volumeMl: roundTo002(fractions[i] * batchSizeMl),
    }))
    .filter(c => c.volumeMl > 0);

  if (components.length === 0) return null;

  const volSum = Math.round(components.reduce((s, c) => s + c.volumeMl, 0) * 1000) / 1000;
  const diff   = Math.round((batchSizeMl - volSum) * 1000) / 1000;
  if (Math.abs(diff) > 0.001) {
    const maxIdx = components.reduce((mi, c, i, arr) => c.volumeMl > arr[mi].volumeMl ? i : mi, 0);
    components[maxIdx].volumeMl = Math.round((components[maxIdx].volumeMl + diff) * 1000) / 1000;
  }

  // ── 4. Forward prediction (actual rounded recipe) ───────────────────────
  const roundedTotal = components.reduce((s, c) => s + c.volumeMl, 0);
  const mixParts = components.map(({ paint, volumeMl }) => {
    const { r, g, b } = hexToRgb(paint.hex);
    return {
      paintId: paint.goldenPaintId,
      name: paint.name,
      r, g, b,
      quantity: volumeMl / roundedTotal,
      quantityHdths: 100,
    };
  });

  const pmRes = await fetch(`${API_BASE}/paintmix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts: mixParts }),
  });
  if (!pmRes.ok) throw new Error(`paintmix ${pmRes.status}`);
  const pmData = await pmRes.json();

  const { r, g, b } = pmData.paintMixColor.srgb;
  const predictedHex = srgbToHex(r, g, b);

  // ── 5. ΔE2000 from solutionColor.cielab vs target Lab ──────────────────
  const { l, a: ca, b: cb } = solutionColor.cielab;
  const deltaE = chroma.deltaE(
    chroma(targetHex),
    chroma.lab(l, ca, cb),
    1, 1, 1,
  );

  console.log(
    `[PaintMix] ${targetHex} → ΔE=${deltaE.toFixed(2)}` +
    ` [${components.map(c => `${c.paint.id}:${c.volumeMl}`).join('+')}]`,
  );

  return {
    components,
    predictedHex,
    deltaE: Math.round(deltaE * 10) / 10,
    accuracy: accuracyLabel(deltaE),
    batchSizeMl,
  };
}
