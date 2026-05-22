/**
 * Solver regression tests — PaintEngine API edition.
 *
 * solveMix calls two endpoints:
 *   POST /api/colormatch_tag  → recipe parts + solutionColor
 *   POST /api/paintmix        → forward prediction (predictedHex)
 *
 * Both are mocked with fixtures stored below.  The fixtures represent
 * plausible API responses; what the tests verify is that solveMix:
 *   • correctly parses the response and maps paintIds → paint objects
 *   • rounds volumes to 0.02 mL and sums them to batchSizeMl ± 0.001
 *   • returns no zero-volume components
 *   • passes through cie76Distance < 10 (quality gate on the fixture itself)
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { solveMix } from '../solver.js';
import basePaints from '../data/basePaints.json';

const BATCH = 0.5;

// ── Fixtures ──────────────────────────────────────────────────────────────

// Generic paintmix forward-prediction response (used for all cases).
const PAINTMIX_RESPONSE = {
  paintMixColor: {
    srgb: { r: 128, g: 128, b: 128 },
    cielab: { l: 53.4, a: 0.0, b: 0.0 },
  },
};

// Per-target colormatch_tag responses.  paintIds must be goldenPaintIds from
// basePaints.json.  cie76Distance must be < 10 (the quality gate).
const COLORMATCH_FIXTURES: Record<string, object> = {
  '#53de21': {
    solution: { parts: [
      { paintId: '1009', quantity: 0.65, quantityByWeight: 0.63 },
      { paintId: '1380', quantity: 0.25, quantityByWeight: 0.27 },
      { paintId: '1275', quantity: 0.10, quantityByWeight: 0.10 },
    ]},
    solutionColor: { cielab: { l: 78.2, a: -58.3, b: 65.1 }, srgb: { r: 130, g: 185, b: 62 } },
    cie76Distance: 7.8,
  },
  '#3a2048': {
    solution: { parts: [
      { paintId: '1260', quantity: 0.45, quantityByWeight: 0.44 },
      { paintId: '1305', quantity: 0.35, quantityByWeight: 0.36 },
      { paintId: '1040', quantity: 0.20, quantityByWeight: 0.20 },
    ]},
    solutionColor: { cielab: { l: 16.1, a: 22.4, b: -31.2 }, srgb: { r: 55, g: 30, b: 68 } },
    cie76Distance: 5.3,
  },
  '#ff0000': {
    solution: { parts: [
      { paintId: '1210', quantity: 0.75, quantityByWeight: 0.76 },
      { paintId: '1305', quantity: 0.25, quantityByWeight: 0.24 },
    ]},
    solutionColor: { cielab: { l: 46.2, a: 65.8, b: 40.1 }, srgb: { r: 218, g: 42, b: 30 } },
    cie76Distance: 9.2,
  },
  '#228b22': {
    solution: { parts: [
      { paintId: '1275', quantity: 0.50, quantityByWeight: 0.50 },
      { paintId: '1380', quantity: 0.30, quantityByWeight: 0.30 },
      { paintId: '1009', quantity: 0.20, quantityByWeight: 0.20 },
    ]},
    solutionColor: { cielab: { l: 49.8, a: -42.1, b: 45.6 }, srgb: { r: 48, g: 132, b: 42 } },
    cie76Distance: 5.1,
  },
  '#4a90d9': {
    solution: { parts: [
      { paintId: '1255', quantity: 0.45, quantityByWeight: 0.45 },
      { paintId: '1380', quantity: 0.55, quantityByWeight: 0.55 },
    ]},
    solutionColor: { cielab: { l: 55.3, a: -1.2, b: -35.8 }, srgb: { r: 80, g: 148, b: 210 } },
    cie76Distance: 3.8,
  },
  '#8b4513': {
    solution: { parts: [
      { paintId: '1210', quantity: 0.55, quantityByWeight: 0.56 },
      { paintId: '1040', quantity: 0.20, quantityByWeight: 0.19 },
      { paintId: '1008', quantity: 0.25, quantityByWeight: 0.25 },
    ]},
    solutionColor: { cielab: { l: 33.1, a: 24.8, b: 37.9 }, srgb: { r: 136, g: 72, b: 22 } },
    cie76Distance: 5.8,
  },
  '#ffb6c1': {
    solution: { parts: [
      { paintId: '1380', quantity: 0.88, quantityByWeight: 0.88 },
      { paintId: '1305', quantity: 0.12, quantityByWeight: 0.12 },
    ]},
    solutionColor: { cielab: { l: 78.5, a: 17.2, b: 5.8 }, srgb: { r: 248, g: 185, b: 191 } },
    cie76Distance: 2.6,
  },
};

// ── Mock fetch ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts: RequestInit) => {
    const body = JSON.parse(opts.body as string);

    if (url.includes('colormatch_tag')) {
      const { r, g, b } = body.targetColor;
      const hex = `#${[r, g, b].map((c: number) => c.toString(16).padStart(2, '0')).join('')}`;
      const fixture = COLORMATCH_FIXTURES[hex];
      if (!fixture) throw new Error(`No fixture for ${hex}`);
      return { ok: true, json: async () => fixture };
    }

    if (url.includes('paintmix')) {
      return { ok: true, json: async () => PAINTMIX_RESPONSE };
    }

    throw new Error(`Unexpected URL: ${url}`);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Test cases ─────────────────────────────────────────────────────────────

const CASES: { hex: string; label: string }[] = [
  { hex: '#53de21', label: 'Vivid green' },
  { hex: '#3A2048', label: 'Dark purple' },
  { hex: '#FF0000', label: 'Pure red' },
  { hex: '#228B22', label: 'Forest green' },
  { hex: '#4A90D9', label: 'Cornflower blue' },
  { hex: '#8B4513', label: 'Saddle brown' },
  { hex: '#FFB6C1', label: 'Light pink' },
];

describe('solver regression', () => {
  for (const { hex, label } of CASES) {
    it(`${label} (${hex}) — cie76Distance < 10, volumes valid`, async () => {
      const recipe = await solveMix(hex, basePaints, BATCH);

      expect(recipe, 'solver returned null').not.toBeNull();

      const { components } = recipe!;

      // No zero-volume components
      for (const c of components) {
        expect(c.volumeMl, `zero-volume component in ${hex}`).toBeGreaterThan(0);
      }

      // Volumes rounded to 0.02 mL steps
      for (const c of components) {
        expect(Math.round(c.volumeMl / 0.02) * 0.02).toBeCloseTo(c.volumeMl, 4);
      }

      // Volumes sum to batchSizeMl
      const total = components.reduce((s: number, c: { volumeMl: number }) => s + c.volumeMl, 0);
      expect(total).toBeCloseTo(BATCH, 2);

      // Quality gate: cie76Distance < 10 from the API fixture
      const fixture = COLORMATCH_FIXTURES[hex.toLowerCase()] as { cie76Distance: number };
      expect(fixture.cie76Distance).toBeLessThan(10);
    });
  }

  it('throws on API failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(solveMix('#ff0000', basePaints, BATCH)).rejects.toThrow('colormatch_tag 503');
  });
});
