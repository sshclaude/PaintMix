# CLAUDE.md — Paint Recipe Calculator

## What this project is

A client-side React web app that calculates miniature paint mixing recipes
for tabletop hobby painters. The user specifies a target color and a batch
size in milliliters. The app outputs the exact volume (in mL) of each base
paint to pull into a syringe.

No backend. No API calls. Runs entirely in the browser. Deploys to Vercel
as a static build.

## Stack

- React 18 + Vite
- Tailwind CSS
- mixbox — Kubelka-Munk pigment mixing (npm package)
- chroma-js — color space conversions and ΔE2000

Nothing else. No Anthropic API. No fetch calls.

## Key files

```
src/
  solver.js               ← Core mixing logic. Pure JS, no React. Touch carefully.
  components/
    RecipeCard.jsx         ← Main output component
    ColorInput.jsx         ← Three-tab target color input
    TechniqueSelector.jsx
    BatchSizeInput.jsx
    SavedRecipes.jsx
    PaintInventory.jsx
    CalibrationFlow.jsx
  data/
    basePaints.json        ← Exactly 10 Golden Fluid Acrylics Mixing Set paints
    hobbyPaints.json       ← ~300 named hobby paint targets for lookup only
  App.jsx
  main.jsx
```

## Base paints — exactly these 10, no others

GF01  Titanium White                PW6
GF02  Carbon Black                  PBk7
GF03  Quinacridone Magenta          PR122
GF04  Naphthol Red Light            PR112
GF05  Benzimidazolone Yellow Medium PY83
GF06  Benzimidazolone Yellow Light  PY3
GF07  Phthalo Blue (Red Shade)      PB15:1
GF08  Phthalo Blue (Green Shade)    PB15:3
GF09  Phthalo Green (Blue Shade)    PG7
GF10  Phthalo Green (Yellow Shade)  PG36

Do not add paints outside this set. Do not add Burnt Sienna, Yellow Ochre,
Dioxazine Purple, or any other supplementary paints.

The hobbyPaints.json file contains named hobby paint targets (Citadel, Vallejo,
etc.) for the search dropdown — these are TARGETS ONLY, never base paints.

## The solver — most important file

src/solver.js must be a pure module. No React imports. No side effects.

Exposes two functions:

predictMix(paints, fractions)
  paints: array of sRGB hex strings
  fractions: array of volume fractions summing to 1.0
  Returns: sRGB hex string of predicted mixed color
  Uses Mixbox latent space blending

solveMix(targetHex, activePaints, batchSizeMl)
  targetHex: sRGB hex of target color
  activePaints: array of paint objects from basePaints.json
  batchSizeMl: number (e.g. 0.5)
  Returns:
  {
    components: [{ paint, volumeMl }, ...],  // max 4 entries
    predictedHex: "#RRGGBB",
    deltaE: 1.4,
    accuracy: "Good match, minor variation visible up close"
  }

## Volume output rules — strict

- NEVER show percentages anywhere in the recipe output UI
- ALWAYS show mL values (e.g. "0.35 mL")
- Components rounded to nearest 0.05 mL
- Components must sum exactly to batchSizeMl — adjust largest if rounding drifts
- Thinner is a separate output line: technique ratio × batchSizeMl
- Total volume line = sum of components + thinner

## Color math

- All internal comparisons use Lab (D65)
- sRGB to Lab: chroma(hex).lab()
- ΔE2000: chroma.deltaE(lab1, lab2, 1, 1, 1)
- Mixbox works in sRGB — convert target Lab to hex before passing to solver

## Spectral data source

Hex and Lab values in basePaints.json come from the Golden spectral data at
realtimerendering.com/golden.html — freely released by Golden Artist Colors,
measured from actual paint drawdowns. Use this, not guessed values.

## What NOT to do

- Do not add a backend or any fetch() / network calls
- Do not use the Anthropic API or any other external API
- Do not add paints beyond the Golden Fluid Mixing Set of 10
- Do not show percentages in recipe output
- Do not let solver components fail to sum to batchSizeMl
- Do not put color math logic inside React components — keep it in solver.js
- Do not attempt to recipe metallic or fluorescent colors

## Development

```
npm run dev    # local dev server
npm run build  # production build — must succeed with no errors
```

Deployed to Vercel. Every push to main triggers a redeploy automatically.
The live URL must work on iPhone Safari.

## Build order

1. solver.js — test in isolation before any UI
2. RecipeCard.jsx
3. ColorInput.jsx
4. BatchSizeInput.jsx + TechniqueSelector.jsx
5. SavedRecipes.jsx
6. PaintInventory.jsx
7. CalibrationFlow.jsx (last, least critical for MVP)
