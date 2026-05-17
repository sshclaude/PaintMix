import { useState } from 'react';
import chroma from 'chroma-js';
import { TECHNIQUES } from './TechniqueSelector';

const WELLS = [
  { id: 'detail',   label: 'Detail (8mm)',   area: 0.5 },
  { id: 'general',  label: 'General (12mm)', area: 1.1 },
  { id: 'basecoat', label: 'Basecoat (18mm)',area: 2.5 },
];

const HUMIDITY = [
  { id: 'dry',    label: 'Dry (<40%)',      modifier: 1.6 },
  { id: 'normal', label: 'Normal (40–60%)', modifier: 1.0 },
  { id: 'humid',  label: 'Humid (>60%)',    modifier: 0.6 },
];

function FillBar({ fraction }) {
  return (
    <div className="h-1.5 bg-[#2E2E2E] rounded-full overflow-hidden flex-1">
      <div
        className="h-full bg-[#C8862A] rounded-full"
        style={{ width: `${Math.min(100, fraction * 100)}%` }}
      />
    </div>
  );
}

function findClosestPaint(hex, paints) {
  let best = null, bestDE = Infinity;
  for (const p of paints) {
    const de = chroma.deltaE(hex, p.hex, 1, 1, 1);
    if (de < bestDE) { bestDE = de; best = p; }
  }
  return best && bestDE < 5 ? { paint: best, deltaE: Math.round(bestDE * 10) / 10 } : null;
}

function scaleRecipe(recipe, originalBatch, newBatch) {
  const ratio = newBatch / originalBatch;
  let scaled = recipe.components.map(c => ({
    ...c,
    volumeMl: Math.round(c.volumeMl * ratio / 0.05) * 0.05,
  }));
  const sum = scaled.reduce((acc, c) => acc + c.volumeMl, 0);
  const diff = Math.round((newBatch - sum) * 100) / 100;
  if (Math.abs(diff) >= 0.001) {
    const maxIdx = scaled.reduce((iMax, c, i, arr) => c.volumeMl > arr[iMax].volumeMl ? i : iMax, 0);
    scaled[maxIdx] = {
      ...scaled[maxIdx],
      volumeMl: Math.round((scaled[maxIdx].volumeMl + diff) * 100) / 100,
    };
  }
  return { ...recipe, components: scaled };
}

function computeRehydration(batchMl, wellId, humidityId) {
  const well = WELLS.find(w => w.id === wellId) || WELLS[1];
  const hum = HUMIDITY.find(h => h.id === humidityId) || HUMIDITY[1];
  const rate = 0.003 * well.area * hum.modifier;
  const minutes = Math.round((batchMl * 0.10) / rate / 5) * 5;
  const volume = Math.round((batchMl * 0.05) / 0.05) * 0.05;
  return { minutes, volume, well, hum };
}

function printCard({ recipe, activeBatch, targetHex, tech, thinnerMl, totalMl, rehydration }) {
  const date = new Date().toLocaleDateString();
  const components = recipe.components.map(c =>
    `<tr><td style="padding:2px 8px 2px 0"><span style="display:inline-block;width:12px;height:12px;background:${c.paint.hex};border:1px solid #ccc;vertical-align:middle;margin-right:4px"></span>${c.paint.name}</td><td style="text-align:right;font-family:monospace">${c.volumeMl.toFixed(2)} mL</td></tr>`
  ).join('');
  const thinnerRow = thinnerMl > 0
    ? `<tr><td style="padding:2px 8px 2px 0;color:#555">Thinner / water (${tech.label})</td><td style="text-align:right;font-family:monospace;color:#555">${thinnerMl.toFixed(2)} mL</td></tr>`
    : '';
  const { minutes, volume, well, hum } = rehydration;
  const rehydText = `Add ${volume.toFixed(2)} mL water to a ${well.label.toLowerCase()} well. At ${hum.label.toLowerCase()} humidity, paint will stay workable ~${minutes} min. Top up with water if it thickens.`;

  const html = `<!DOCTYPE html><html><head><title>Paint Recipe</title><style>
    @page { size: 4in 6in; margin: 0.25in; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; margin: 0; padding: 0; }
    h1 { font-size: 14pt; margin: 0 0 6px 0; }
    table { border-collapse: collapse; width: 100%; }
    .swatch { width: 2.2cm; height: 2.2cm; border: 1px solid #ccc; display: inline-block; }
    .swatches { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
    .swatch-label { font-size: 9pt; color: #555; margin-top: 3px; }
    .test-box { border: 2px dashed #aaa; width: 3.2cm; height: 3.2cm; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 9pt; text-align: center; margin-top: 10px; }
    .meta { font-size: 9pt; color: #555; margin-top: 6px; }
    .rehydration { font-size: 9pt; color: #444; margin-top: 8px; border-top: 1px solid #ddd; padding-top: 6px; }
    hr { border: none; border-top: 1px solid #ddd; margin: 8px 0; }
  </style></head><body>
    <h1>PaintMix Recipe</h1>
    <div class="swatches">
      <div>
        <div class="swatch" style="background:${targetHex}"></div>
        <div class="swatch-label">Target<br>${targetHex}</div>
      </div>
      <div>
        <div class="swatch" style="background:${recipe.predictedHex}"></div>
        <div class="swatch-label">Predicted<br>${recipe.predictedHex}</div>
      </div>
    </div>
    <div class="meta">ΔE ${recipe.deltaE} — ${recipe.accuracy}</div>
    <hr>
    <table>
      ${components}
      ${thinnerRow}
      <tr style="border-top:1px solid #ddd"><td style="padding-top:4px"><strong>Total</strong></td><td style="text-align:right;font-family:monospace;font-weight:bold;padding-top:4px">${totalMl.toFixed(2)} mL</td></tr>
    </table>
    <div class="meta">Technique: ${tech.label} · Batch: ${activeBatch.toFixed(2)} mL · ${date}</div>
    <div class="rehydration"><strong>Rehydration:</strong> ${rehydText}</div>
    <div style="display:flex;gap:12px;align-items:flex-start;margin-top:10px">
      <div class="test-box">Test swatch<br>here</div>
      <div style="font-size:8pt;color:#888;align-self:flex-end">Test on scrap before<br>committing to model.</div>
    </div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=420,height=650');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 250);
}

export default function RecipeCard({ recipe, targetHex, technique, batchSizeMl, hobbyPaints, onSave }) {
  const [copied, setCopied] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  // Scaling state
  const [showScaleInput, setShowScaleInput] = useState(false);
  const [scaleInputVal, setScaleInputVal] = useState('');
  const [scaledRecipe, setScaledRecipe] = useState(null);
  const [scaledBatch, setScaledBatch] = useState(null);

  // Rehydration state
  const [showRehydration, setShowRehydration] = useState(false);
  const [wellId, setWellId] = useState('general');
  const [humidityId, setHumidityId] = useState('normal');

  const tech = TECHNIQUES.find(t => t.id === technique) || TECHNIQUES[0];
  const activeRecipe = scaledRecipe || recipe;
  const activeBatch = scaledBatch ?? batchSizeMl;
  const thinnerMl = Math.round(activeBatch * tech.ratio * 100) / 100;
  const totalMl = Math.round((activeBatch + thinnerMl) * 100) / 100;

  const closestPaint = recipe && hobbyPaints ? findClosestPaint(recipe.predictedHex, hobbyPaints) : null;

  const handleApplyScale = () => {
    const newBatch = parseFloat(scaleInputVal);
    if (!recipe || isNaN(newBatch) || newBatch <= 0) return;
    setScaledRecipe(scaleRecipe(recipe, batchSizeMl, newBatch));
    setScaledBatch(newBatch);
    setShowScaleInput(false);
    setScaleInputVal('');
  };

  const handleResetScale = () => {
    setScaledRecipe(null);
    setScaledBatch(null);
    setShowScaleInput(false);
    setScaleInputVal('');
  };

  const handleCopy = () => {
    if (!activeRecipe) return;
    const lines = [
      `Paint Recipe — ${new Date().toLocaleDateString()}`,
      `Target: ${activeRecipe.predictedHex}  ΔE ${activeRecipe.deltaE} — ${activeRecipe.accuracy}`,
      '',
      ...activeRecipe.components.map(c => `  ${c.paint.name}: ${c.volumeMl.toFixed(2)} mL`),
      thinnerMl > 0 ? `  Thinner (${tech.label}): ${thinnerMl.toFixed(2)} mL` : null,
      '',
      `  Total: ${totalMl.toFixed(2)} mL`,
    ].filter(l => l !== null).join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = () => {
    if (!activeRecipe || !saveName.trim()) return;
    onSave({ name: saveName.trim(), recipe: activeRecipe, technique, batchSizeMl: activeBatch });
    setSaveName('');
    setShowSaveInput(false);
  };

  const handlePrint = () => {
    if (!activeRecipe) return;
    const rehydration = computeRehydration(activeBatch, wellId, humidityId);
    printCard({ recipe: activeRecipe, activeBatch, targetHex, tech, thinnerMl, totalMl, rehydration });
  };

  if (!recipe) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed border-[#2E2E2E] text-[#7A7670] gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <p className="text-sm">Select a color and press Calculate</p>
      </div>
    );
  }

  const maxVol = Math.max(...activeRecipe.components.map(c => c.volumeMl));

  return (
    <div className="flex flex-col gap-4">
      {/* Color comparison */}
      <div className="flex gap-3">
        <div className="flex-1 flex flex-col gap-1">
          <span className="text-xs text-[#7A7670] uppercase tracking-wider">Target</span>
          <div
            className="h-20 rounded-lg border border-[#2E2E2E]"
            style={{ backgroundColor: targetHex || activeRecipe.predictedHex }}
          />
          <span className="text-xs font-mono text-[#E8E4DC]">{targetHex || '—'}</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 px-2">
          <span className="text-lg font-bold text-[#C8862A]">ΔE {activeRecipe.deltaE}</span>
          <span className="text-xs text-[#7A7670] text-center max-w-20">{activeRecipe.accuracy}</span>
          {closestPaint && (
            <span className="text-xs text-[#7A7670] text-center italic mt-1">
              ≈ {closestPaint.paint.name}
              <br />(ΔE {closestPaint.deltaE})
            </span>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <span className="text-xs text-[#7A7670] uppercase tracking-wider">Predicted</span>
          <div
            className="h-20 rounded-lg border border-[#2E2E2E]"
            style={{ backgroundColor: activeRecipe.predictedHex }}
          />
          <span className="text-xs font-mono text-[#E8E4DC]">{activeRecipe.predictedHex}</span>
        </div>
      </div>

      <p className="text-xs text-[#7A7670] italic">
        Wet paint dries ~ΔL* 5–10 lighter — mix may shift as it dries.
      </p>

      {/* Batch size row with scale controls */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#7A7670]">Batch: {activeBatch.toFixed(2)} mL</span>
        {scaledRecipe ? (
          <button
            onClick={handleResetScale}
            className="text-xs text-[#C8862A] hover:text-[#E09D3A] transition-colors"
          >
            Reset scale
          </button>
        ) : showScaleInput ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="number"
              min="0.1"
              max="50"
              step="0.05"
              value={scaleInputVal}
              onChange={e => setScaleInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleApplyScale(); if (e.key === 'Escape') setShowScaleInput(false); }}
              placeholder="New mL…"
              autoFocus
              className="w-24 px-2 py-1 rounded bg-[#0F0F0F] border border-[#C8862A] text-xs text-[#E8E4DC] focus:outline-none"
            />
            <button onClick={handleApplyScale} className="text-xs text-[#C8862A] hover:text-[#E09D3A]">Apply</button>
            <button onClick={() => setShowScaleInput(false)} className="text-xs text-[#7A7670] hover:text-[#E8E4DC]">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => { setShowScaleInput(true); setScaleInputVal(activeBatch.toFixed(2)); }}
            className="text-xs text-[#7A7670] hover:text-[#C8862A] transition-colors"
          >
            Scale…
          </button>
        )}
      </div>

      {/* Components */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#7A7670] mb-1">Components</span>
        {activeRecipe.components.map((c, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <div
              className="w-5 h-5 rounded shrink-0 border border-[#2E2E2E]"
              style={{ backgroundColor: c.paint.hex }}
            />
            <span className="text-sm text-[#E8E4DC] flex-1">{c.paint.name}</span>
            <FillBar fraction={c.volumeMl / maxVol} />
            <span className="text-sm font-mono text-[#C8862A] w-16 text-right">
              {c.volumeMl.toFixed(2)} mL
            </span>
          </div>
        ))}

        {/* Thinner row */}
        {thinnerMl > 0 && (
          <div className="flex items-center gap-3 py-1.5 border-t border-[#2E2E2E] mt-1">
            <div className="w-5 h-5 rounded shrink-0 border border-[#2E2E2E] bg-[#1A1A1A] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-[#7A7670]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.5 2a.5.5 0 01.5.5V5h8V2.5a.5.5 0 011 0V5h.5A1.5 1.5 0 0117 6.5v8A1.5 1.5 0 0115.5 16h-11A1.5 1.5 0 013 14.5v-8A1.5 1.5 0 014.5 5H5V2.5a.5.5 0 01.5-.5z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-sm text-[#7A7670] flex-1">Thinner / water ({tech.label})</span>
            <FillBar fraction={thinnerMl / (maxVol || 1)} />
            <span className="text-sm font-mono text-[#7A7670] w-16 text-right">
              {thinnerMl.toFixed(2)} mL
            </span>
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between pt-2 border-t border-[#2E2E2E] mt-1">
          <span className="text-sm font-semibold text-[#E8E4DC]">Total</span>
          <span className="text-sm font-mono font-bold text-[#E8E4DC]">{totalMl.toFixed(2)} mL</span>
        </div>
      </div>

      {/* Rehydration estimator */}
      <div className="border border-[#2E2E2E] rounded-lg overflow-hidden">
        <button
          onClick={() => setShowRehydration(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#7A7670] hover:text-[#E8E4DC] transition-colors"
        >
          <span className="font-semibold uppercase tracking-widest">Rehydration Estimator</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-3 h-3 transition-transform ${showRehydration ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showRehydration && (
          <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[#2E2E2E]">
            <div className="flex gap-2 mt-2">
              {WELLS.map(w => (
                <button
                  key={w.id}
                  onClick={() => setWellId(w.id)}
                  className={`flex-1 py-1 rounded text-xs transition-colors ${
                    wellId === w.id
                      ? 'bg-[#C8862A] text-white'
                      : 'bg-[#0F0F0F] border border-[#2E2E2E] text-[#7A7670] hover:border-[#C8862A]'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {HUMIDITY.map(h => (
                <button
                  key={h.id}
                  onClick={() => setHumidityId(h.id)}
                  className={`flex-1 py-1 rounded text-xs transition-colors ${
                    humidityId === h.id
                      ? 'bg-[#2E2E2E] text-[#E8E4DC]'
                      : 'bg-[#0F0F0F] border border-[#2E2E2E] text-[#7A7670] hover:border-[#C8862A]'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
            {(() => {
              const { minutes, volume, well, hum } = computeRehydration(activeBatch, wellId, humidityId);
              return (
                <p className="text-xs text-[#E8E4DC] leading-relaxed">
                  Add <span className="font-mono text-[#C8862A]">{volume.toFixed(2)} mL</span> of water to a {well.label.toLowerCase()} well.
                  At {hum.label.toLowerCase()} humidity, paint will stay workable ~<span className="font-mono text-[#C8862A]">{minutes} min</span>.
                  Top up with water if it thickens.
                </p>
              );
            })()}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleCopy}
          className="flex-1 py-2 rounded bg-[#1A1A1A] border border-[#2E2E2E] text-sm text-[#7A7670] hover:text-[#E8E4DC] hover:border-[#7A7670] transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={handlePrint}
          className="flex-1 py-2 rounded bg-[#1A1A1A] border border-[#2E2E2E] text-sm text-[#7A7670] hover:text-[#E8E4DC] hover:border-[#7A7670] transition-colors"
        >
          Print Card
        </button>
        {!showSaveInput ? (
          <button
            onClick={() => setShowSaveInput(true)}
            className="flex-1 py-2 rounded bg-[#C8862A] text-white text-sm font-medium hover:bg-[#E09D3A] transition-colors"
          >
            Save
          </button>
        ) : (
          <div className="flex w-full gap-1">
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveInput(false); }}
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
          </div>
        )}
      </div>
    </div>
  );
}
