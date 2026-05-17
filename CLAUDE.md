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
- mixbox — Kubelka-Munk pigment mixing model (npm package)
- chroma-js — color space conversions and ΔE2000
- localStorage — recipe and calibration persistence

## Key files

```
src/
  solver.js          ← Core mixing logic. Pure JS, no React. Touch with care.
  components/
    RecipeCard.jsx   ← Main output component
    ColorInput.jsx   ← Three-tab target color input (hex, image, named paint)
    TechniqueSelector.jsx
    BatchSizeInput.jsx
    SavedRecipes.jsx
    PaintInventory.jsx
    CalibrationFlow.jsx
  data/
    basePaints.json  ← 13 Golden Fluid Acrylics with hex, Lab, pigment codes
    hobbyPaints.json ← ~300 named hobby paint targets for lookup
  App.jsx
  main.jsx
```

## The solver — most important file

`src/solver.js` must stay a pure module. No React imports. No side effects.

It exposes two functions:

**`predictMix(paints, fractions)`**
- `paints`: array of sRGB hex strings
- `fractions`: array of volume fractions (must sum to 1.0)
- Returns: sRGB hex string of the predicted mixed color
- Uses Mixbox latent space blending internally

**`solveMix(targetHex, activePaints, batchSizeMl)`**
- `targetHex`: sRGB hex string of the target color
- `activePaints`: array of paint objects from basePaints.json
- `batchSizeMl`: number (e.g. 0.5)
- Returns: object with shape:
  ```js
  {
    components: [
      { paint: paintObject, volumeMl: 0.35 },
      { paint: paintObject, volumeMl: 0.15 },
    ],
    predictedHex: "#4A8BC2",
    deltaE: 1.4,
    accuracy: "Good match, minor variation visible up close"
  }
  ```
- Components use at most 4 paints
- All volumes are absolute mL rounded to nearest 0.05
- Components always sum exactly to batchSizeMl (adjust largest if rounding drifts)

## Volume output rules — strict

The user requested that all output be in definite volumes, not percentages.

- NEVER show percentages or fractions in the recipe output UI
- ALWAYS show mL values (e.g., "0.35 mL")
- Thinner volume is always shown as a separate line below the pigmented
  components, derived from the technique selector's ratio × batchSizeMl
- Total volume line = sum of components + thinner, labeled clearly
- The batch size input controls pigmented paint only — thinner is on top of it

## Color math rules

- All internal color comparisons use Lab (D65 illuminant)
- Convert sRGB → Lab: `chroma(hex).lab()`
- ΔE2000: `chroma.deltaE(lab1, lab2, 1, 1, 1)`
- Mixbox works in sRGB — convert target Lab to sRGB before passing to solver:
  `chroma.lab(...labValues).hex()`
- Wet paint is approximately ΔL* 5-10 darker than dry. The app does not
  correct for this in MVP — note it in the UI near the accuracy indicator.

## Paint data

`basePaints.json` contains the 13 Golden Fluid Acrylics base paints.
`hobbyPaints.json` contains ~300 named hobby paint targets (Citadel, Vallejo,
Pro Acryl, Army Painter) for the named paint lookup feature.

Named hobby paints are TARGETS ONLY — they appear in the lookup dropdown so
the user can say "I want to match Macragge Blue" but they are never used as
base paints in the solver. Do not confuse the two datasets.

Spectral ground truth for Golden paints: realtimerendering.com/golden.html
(freely released by Golden Artist Colors). Use this as the source for Lab
values in basePaints.json where available.

## UI / design

- Dark theme. Background near-black (#0F0F0F). Accent: warm amber/ochre.
- Three columns on desktop, single column on mobile.
- Color swatches are the primary communication element — make them prominent.
- Recipe card is always visible (placeholder state when no recipe calculated).
- Painters work in dim rooms — avoid harsh whites and bright backgrounds.

## What NOT to do

- Do not add a backend or any fetch() calls to external APIs
- Do not attempt to recipe metallics or fluorescents — show a clear message
- Do not show percentages anywhere in recipe output
- Do not let solver components not sum to batchSizeMl
- Do not put color math logic inside React components — keep it in solver.js
- Do not use heavy body paint hex values for Golden Fluid — viscosity differs
  but pigment hex is the same; the distinction matters for documentation only

## Development

```bash
npm run dev    # local dev server
npm run build  # production build — must succeed with no errors
```

Deployed to Vercel. Every push to main triggers a redeploy automatically.
The live URL works on iPhone Safari — that is a hard requirement.

## First build order

1. solver.js — test in isolation before any UI
2. RecipeCard.jsx — wire solver output to a static display
3. ColorInput.jsx — connect target color to solver
4. BatchSizeInput.jsx + TechniqueSelector.jsx
5. SavedRecipes.jsx
6. PaintInventory.jsx
7. CalibrationFlow.jsx (last — least critical for MVP)
