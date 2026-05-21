import { useState } from 'react';
import chroma from 'chroma-js';
import { TECHNIQUES } from './TechniqueSelector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDiff(fromRecipe, toRecipe) {
  if (!fromRecipe || !toRecipe) return [];
  const allIds = new Set([
    ...fromRecipe.components.map(c => c.paint.id),
    ...toRecipe.components.map(c => c.paint.id),
  ]);
  return [...allIds].map(id => {
    const from = fromRecipe.components.find(c => c.paint.id === id);
    const to   = toRecipe.components.find(c => c.paint.id === id);
    const fromVol = from ? from.volumeMl : 0;
    const toVol   = to   ? to.volumeMl   : 0;
    const diff = Math.round((toVol - fromVol) * 1000) / 1000;
    return { paint: (from || to).paint, diff };
  });
}

function findClosestHobbyPaint(predictedHex, hobbyPaints) {
  if (!hobbyPaints || hobbyPaints.length === 0) return null;
  let best = null;
  let bestDeltaE = Infinity;
  for (const p of hobbyPaints) {
    try {
      const dE = chroma.deltaE(predictedHex, p.hex, 1, 1, 1);
      if (dE < bestDeltaE) {
        bestDeltaE = dE;
        best = p;
      }
    } catch {
      // skip malformed hex
    }
  }
  if (best && bestDeltaE < 5) return { paint: best, deltaE: bestDeltaE };
  return null;
}

function sumPositiveDiffs(diffs) {
  return diffs.reduce((acc, d) => (d.diff > 0 ? acc + d.diff : acc), 0);
}

// ---------------------------------------------------------------------------
// Print helper
// ---------------------------------------------------------------------------

const TODAY = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function printStep({ stepTitle, swatchHex, components, thinnerMl, techLabel, totalMl, deltaE, accuracy }) {
  const win = window.open('', '_blank');
  if (!win) return;

  const componentRows = components
    .map(
      ({ name, volumeMl, hex }) => `
        <tr>
          <td style="padding:4px 6px;">
            <span style="display:inline-block;width:18px;height:18px;background:${hex};border:1px solid #ccc;border-radius:3px;vertical-align:middle;margin-right:6px;"></span>
            ${name}
          </td>
          <td style="padding:4px 6px;text-align:right;font-family:monospace;">${Number(volumeMl).toFixed(2)} mL</td>
        </tr>`
    )
    .join('');

  const thinnerRow =
    thinnerMl > 0
      ? `<tr>
           <td style="padding:4px 6px;color:#555;">Thinner / water (${techLabel})</td>
           <td style="padding:4px 6px;text-align:right;font-family:monospace;color:#555;">${thinnerMl.toFixed(2)} mL</td>
         </tr>`
      : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${stepTitle}</title>
<style>
  @page { size: 4in 6in; margin: 0.25in; }
  * { box-sizing: border-box; }
  body {
    background: #fff;
    color: #000;
    font-family: Arial, sans-serif;
    font-size: 11pt;
    margin: 0;
    padding: 0;
  }
  h2 { font-size: 13pt; margin: 0 0 6px; }
  table { border-collapse: collapse; width: 100%; }
  td { font-size: 11pt; }
  .swatch {
    width: 2cm;
    height: 2cm;
    background: ${swatchHex};
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .total-row td { font-weight: bold; border-top: 1px solid #000; padding-top: 6px; }
  .test-swatch {
    width: 3cm;
    height: 3cm;
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #aaa;
    font-size: 9pt;
  }
  .meta { font-size: 9pt; color: #555; margin-top: 6px; }
</style>
</head>
<body>
  <h2>${stepTitle}</h2>
  <div class="swatch"></div>
  <table>
    <tbody>
      ${componentRows}
      ${thinnerRow}
      <tr class="total-row">
        <td style="padding:4px 6px;">Total</td>
        <td style="padding:4px 6px;text-align:right;font-family:monospace;">${totalMl.toFixed(2)} mL</td>
      </tr>
    </tbody>
  </table>
  <p class="meta">Technique: ${techLabel} &nbsp;|&nbsp; &Delta;E2000: ${deltaE} &nbsp;|&nbsp; ${accuracy}</p>
  <p class="meta">${TODAY}</p>
  <div class="test-swatch">Test swatch here</div>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 250);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ColorSwatch({ recipe, label, hobbyPaints }) {
  const closest = recipe ? findClosestHobbyPaint(recipe.predictedHex, hobbyPaints) : null;
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-xs uppercase tracking-widest text-[#7A7670]">{label}</span>
      {recipe ? (
        <>
          <div
            className="w-16 h-16 rounded border border-[#2E2E2E]"
            style={{ backgroundColor: recipe.predictedHex }}
          />
          <span className="text-xs font-mono text-[#C8862A]">ΔE {recipe.deltaE}</span>
          <span className="text-xs text-[#7A7670] text-center leading-tight">{recipe.accuracy}</span>
          {closest && (
            <span className="text-xs text-[#7A7670] italic text-center leading-tight">
              ≈ {closest.paint.name}
            </span>
          )}
        </>
      ) : (
        <>
          <div className="w-16 h-16 rounded border border-[#2E2E2E] bg-[#1A1A1A] flex items-center justify-center">
            <span className="text-[#4A4640] text-lg">?</span>
          </div>
          <span className="text-xs text-[#4A4640] text-center leading-tight">No solution</span>
        </>
      )}
    </div>
  );
}

function ComponentRow({ hex, name, volumeMl }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className="w-5 h-5 rounded shrink-0 border border-[#2E2E2E]"
        style={{ backgroundColor: hex }}
      />
      <span className="text-sm text-[#E8E4DC] flex-1">{name}</span>
      <span className="text-sm font-mono text-[#C8862A] w-16 text-right">
        {Number(volumeMl).toFixed(2)} mL
      </span>
    </div>
  );
}

function ThinnerRow({ thinnerMl, techLabel }) {
  if (thinnerMl <= 0) return null;
  return (
    <div className="flex items-center gap-3 py-1.5 border-t border-[#2E2E2E] mt-1">
      <div className="w-5 h-5 rounded shrink-0 border border-[#2E2E2E] bg-[#1A1A1A] flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-[#7A7670]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.5 2a.5.5 0 01.5.5V5h8V2.5a.5.5 0 011 0V5h.5A1.5 1.5 0 0117 6.5v8A1.5 1.5 0 0115.5 16h-11A1.5 1.5 0 013 14.5v-8A1.5 1.5 0 014.5 5H5V2.5a.5.5 0 01.5-.5z" clipRule="evenodd" />
        </svg>
      </div>
      <span className="text-sm text-[#7A7670] flex-1">Thinner / water ({techLabel})</span>
      <span className="text-sm font-mono text-[#7A7670] w-16 text-right">
        {thinnerMl.toFixed(2)} mL
      </span>
    </div>
  );
}

function TotalRow({ totalMl }) {
  return (
    <div className="flex items-center justify-between pt-2 border-t border-[#2E2E2E] mt-1">
      <span className="text-sm font-semibold text-[#E8E4DC]">Total</span>
      <span className="text-sm font-mono font-bold text-[#E8E4DC]">{totalMl.toFixed(2)} mL</span>
    </div>
  );
}

function PrintButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="mt-2 px-3 py-1.5 rounded bg-[#1A1A1A] border border-[#2E2E2E] text-xs text-[#7A7670] hover:text-[#E8E4DC] hover:border-[#7A7670] transition-colors"
    >
      Print card
    </button>
  );
}

function Divider() {
  return <hr className="border-[#2E2E2E] my-4" />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ProgressionCard({
  progression,
  technique,
  hobbyPaints,
  onSave,
}) {
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState('');

  const tech = TECHNIQUES.find(t => t.id === technique) || TECHNIQUES[0];
  const { shadow, midtone, highlight, batchSizeMl } = progression;
  const thinnerMl = Math.round(batchSizeMl * tech.ratio * 100) / 100;

  // Step 1 total (paint components + thinner) — only meaningful when shadow recipe exists
  const step1Total = Math.round((batchSizeMl + thinnerMl) * 100) / 100;

  // Step 2: diff midtone − shadow (safe when either recipe is null → empty diff)
  const step2Diffs = computeDiff(shadow.recipe, midtone.recipe);
  const step2Added = Math.round(sumPositiveDiffs(step2Diffs) * 100) / 100;
  const step2Total = Math.round((step1Total + step2Added) * 100) / 100;

  // Step 3: diff highlight − midtone
  const step3Diffs = computeDiff(midtone.recipe, highlight.recipe);
  const step3Added = Math.round(sumPositiveDiffs(step3Diffs) * 100) / 100;
  const step3Total = Math.round((step2Total + step3Added) * 100) / 100;

  // ---------------------------------------------------------------------------
  // Print handlers
  // ---------------------------------------------------------------------------

  function handlePrintStep1() {
    if (!shadow.recipe) return;
    printStep({
      stepTitle: 'Step 1 — Shadow Batch',
      swatchHex: shadow.recipe.predictedHex,
      components: shadow.recipe.components.map(c => ({ name: c.paint.name, volumeMl: c.volumeMl, hex: c.paint.hex })),
      thinnerMl,
      techLabel: tech.label,
      totalMl: step1Total,
      deltaE: shadow.recipe.deltaE,
      accuracy: shadow.recipe.accuracy,
    });
  }

  function handlePrintStep2() {
    if (!midtone.recipe) return;
    const addedComponents = step2Diffs.filter(d => d.diff > 0).map(d => ({ name: d.paint.name, volumeMl: d.diff, hex: d.paint.hex }));
    printStep({
      stepTitle: 'Step 2 — Build the Midtone from the Shadow',
      swatchHex: midtone.recipe.predictedHex,
      components: addedComponents,
      thinnerMl: 0,
      techLabel: tech.label,
      totalMl: step2Total,
      deltaE: midtone.recipe.deltaE,
      accuracy: midtone.recipe.accuracy,
    });
  }

  function handlePrintStep3() {
    if (!highlight.recipe) return;
    const addedComponents = step3Diffs.filter(d => d.diff > 0).map(d => ({ name: d.paint.name, volumeMl: d.diff, hex: d.paint.hex }));
    printStep({
      stepTitle: 'Step 3 — Build the Highlight from the Midtone',
      swatchHex: highlight.recipe.predictedHex,
      components: addedComponents,
      thinnerMl: 0,
      techLabel: tech.label,
      totalMl: step3Total,
      deltaE: highlight.recipe.deltaE,
      accuracy: highlight.recipe.accuracy,
    });
  }

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------

  function handleSave() {
    if (!saveName.trim()) return;
    onSave({ name: saveName.trim(), recipe: midtone.recipe, technique, batchSizeMl });
    setSaveName('');
    setShowSaveInput(false);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 bg-[#1A1A1A] text-[#E8E4DC]">

      {/* Explanatory note */}
      <p className="text-xs text-[#7A7670] leading-relaxed">
        Mix dark to light. Start with the shadow batch, then add to it progressively.
        This avoids making three separate batches and matches how paint is used on the
        model — shadows first, then basecoat, then highlights.
      </p>

      {/* Swatch row */}
      <div className="flex gap-2 justify-around">
        <ColorSwatch recipe={shadow.recipe}    label="Shadow"    hobbyPaints={hobbyPaints} />
        <ColorSwatch recipe={midtone.recipe}   label="Midtone"   hobbyPaints={hobbyPaints} />
        <ColorSwatch recipe={highlight.recipe} label="Highlight" hobbyPaints={hobbyPaints} />
      </div>

      <Divider />

      {/* Step 1 — Shadow batch */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-[#C8862A] uppercase tracking-wider">
          Step 1 — Shadow Batch
        </span>
        {shadow.recipe ? (
          <>
            {shadow.recipe.components.map((c, i) => (
              <ComponentRow key={i} hex={c.paint.hex} name={c.paint.name} volumeMl={c.volumeMl} />
            ))}
            <ThinnerRow thinnerMl={thinnerMl} techLabel={tech.label} />
            <TotalRow totalMl={step1Total} />
            <PrintButton onClick={handlePrintStep1} />
          </>
        ) : (
          <p className="text-xs text-[#7A7670] italic">Could not solve shadow shade — try a less extreme target color.</p>
        )}
      </div>

      <Divider />

      {/* Step 2 — Build midtone from shadow */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-[#C8862A] uppercase tracking-wider">
          Step 2 — Build the Midtone from the Shadow
        </span>
        {midtone.recipe && shadow.recipe ? (
          <>
            <p className="text-xs text-[#7A7670] mb-1">
              Starting from{' '}
              <span className="font-mono text-[#E8E4DC]">{step1Total.toFixed(2)} mL</span>{' '}
              shadow:
            </p>
            {step2Diffs
              .filter(d => d.diff !== 0)
              .map((d, i) =>
                d.diff > 0 ? (
                  <div key={i} className="flex items-center gap-3 py-1.5">
                    <div className="w-5 h-5 rounded shrink-0 border border-[#2E2E2E]" style={{ backgroundColor: d.paint.hex }} />
                    <span className="text-sm text-[#E8E4DC] flex-1">Add {d.paint.name}</span>
                    <span className="text-sm font-mono text-[#C8862A] w-16 text-right">{d.diff.toFixed(2)} mL</span>
                  </div>
                ) : (
                  <div key={i} className="flex items-center gap-3 py-1 opacity-50">
                    <div className="w-5 h-5 rounded shrink-0 border border-[#2E2E2E]" style={{ backgroundColor: d.paint.hex }} />
                    <span className="text-sm text-[#7A7670] flex-1 italic">↓ {d.paint.name} will be diluted ({d.diff.toFixed(2)} mL)</span>
                  </div>
                )
              )}
            <div className="flex items-center justify-between pt-2 border-t border-[#2E2E2E] mt-1">
              <span className="text-sm font-semibold text-[#E8E4DC]">Total volume after this step</span>
              <span className="text-sm font-mono font-bold text-[#E8E4DC]">{step2Total.toFixed(2)} mL</span>
            </div>
            <PrintButton onClick={handlePrintStep2} />
          </>
        ) : (
          <p className="text-xs text-[#7A7670] italic">Could not solve midtone or shadow shade.</p>
        )}
      </div>

      <Divider />

      {/* Step 3 — Build highlight from midtone */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-[#C8862A] uppercase tracking-wider">
          Step 3 — Build the Highlight from the Midtone
        </span>
        {highlight.recipe && midtone.recipe ? (
          <>
            <p className="text-xs text-[#7A7670] mb-1">
              Starting from{' '}
              <span className="font-mono text-[#E8E4DC]">{step2Total.toFixed(2)} mL</span>{' '}
              midtone:
            </p>
            {step3Diffs
              .filter(d => d.diff !== 0)
              .map((d, i) =>
                d.diff > 0 ? (
                  <div key={i} className="flex items-center gap-3 py-1.5">
                    <div className="w-5 h-5 rounded shrink-0 border border-[#2E2E2E]" style={{ backgroundColor: d.paint.hex }} />
                    <span className="text-sm text-[#E8E4DC] flex-1">Add {d.paint.name}</span>
                    <span className="text-sm font-mono text-[#C8862A] w-16 text-right">{d.diff.toFixed(2)} mL</span>
                  </div>
                ) : (
                  <div key={i} className="flex items-center gap-3 py-1 opacity-50">
                    <div className="w-5 h-5 rounded shrink-0 border border-[#2E2E2E]" style={{ backgroundColor: d.paint.hex }} />
                    <span className="text-sm text-[#7A7670] flex-1 italic">↓ {d.paint.name} will be diluted ({d.diff.toFixed(2)} mL)</span>
                  </div>
                )
              )}
            <div className="flex items-center justify-between pt-2 border-t border-[#2E2E2E] mt-1">
              <span className="text-sm font-semibold text-[#E8E4DC]">Total volume after this step</span>
              <span className="text-sm font-mono font-bold text-[#E8E4DC]">{step3Total.toFixed(2)} mL</span>
            </div>
            <PrintButton onClick={handlePrintStep3} />
          </>
        ) : (
          <p className="text-xs text-[#7A7670] italic">Could not solve highlight or midtone shade.</p>
        )}
      </div>

      <Divider />

      {/* Save midtone */}
      <div>
        {!showSaveInput ? (
          <button
            onClick={() => setShowSaveInput(true)}
            className="w-full py-2 rounded bg-[#C8862A] text-white text-sm font-medium hover:bg-[#E09D3A] transition-colors"
          >
            Save Midtone
          </button>
        ) : (
          <div className="flex gap-1">
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setShowSaveInput(false);
              }}
              placeholder="Recipe name…"
              autoFocus
              className="flex-1 px-2 py-1.5 rounded bg-[#1A1A1A] border border-[#C8862A] text-sm text-[#E8E4DC] focus:outline-none"
            />
            <button
              onClick={handleSave}
              className="px-3 py-1.5 rounded bg-[#C8862A] text-white text-sm hover:bg-[#E09D3A] transition-colors"
            >
              ✓
            </button>
            <button
              onClick={() => setShowSaveInput(false)}
              className="px-3 py-1.5 rounded bg-[#1A1A1A] border border-[#2E2E2E] text-sm text-[#7A7670] hover:text-[#E8E4DC] transition-colors"
            >
              ✕
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
