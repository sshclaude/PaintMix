import { useState } from 'react';
import { TECHNIQUES } from './TechniqueSelector';

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

export default function RecipeCard({ recipe, targetHex, technique, batchSizeMl, onSave }) {
  const [copied, setCopied] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const tech = TECHNIQUES.find(t => t.id === technique) || TECHNIQUES[0];
  const thinnerMl = Math.round(batchSizeMl * tech.ratio * 100) / 100;
  const totalMl = Math.round((batchSizeMl + thinnerMl) * 100) / 100;

  const handleCopy = () => {
    if (!recipe) return;
    const lines = [
      `Paint Recipe — ${new Date().toLocaleDateString()}`,
      `Target: ${recipe.predictedHex}  ΔE ${recipe.deltaE} — ${recipe.accuracy}`,
      '',
      ...recipe.components.map(c => `  ${c.paint.name}: ${c.volumeMl.toFixed(2)} mL`),
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
    if (!recipe || !saveName.trim()) return;
    onSave({ name: saveName.trim(), recipe, technique, batchSizeMl });
    setSaveName('');
    setShowSaveInput(false);
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

  const maxVol = Math.max(...recipe.components.map(c => c.volumeMl));

  return (
    <div className="flex flex-col gap-4">
      {/* Color comparison */}
      <div className="flex gap-3">
        <div className="flex-1 flex flex-col gap-1">
          <span className="text-xs text-[#7A7670] uppercase tracking-wider">Target</span>
          <div
            className="h-20 rounded-lg border border-[#2E2E2E]"
            style={{ backgroundColor: targetHex || recipe.predictedHex }}
          />
          <span className="text-xs font-mono text-[#E8E4DC]">{targetHex || '—'}</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 px-2">
          <span className="text-lg font-bold text-[#C8862A]">ΔE {recipe.deltaE}</span>
          <span className="text-xs text-[#7A7670] text-center max-w-20">{recipe.accuracy}</span>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <span className="text-xs text-[#7A7670] uppercase tracking-wider">Predicted</span>
          <div
            className="h-20 rounded-lg border border-[#2E2E2E]"
            style={{ backgroundColor: recipe.predictedHex }}
          />
          <span className="text-xs font-mono text-[#E8E4DC]">{recipe.predictedHex}</span>
        </div>
      </div>

      <p className="text-xs text-[#7A7670] italic">
        Wet paint dries ~ΔL* 5–10 darker — mix may lighten slightly as it dries.
      </p>

      {/* Components */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#7A7670] mb-1">Components</span>
        {recipe.components.map((c, i) => (
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

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 py-2 rounded bg-[#1A1A1A] border border-[#2E2E2E] text-sm text-[#7A7670] hover:text-[#E8E4DC] hover:border-[#7A7670] transition-colors"
        >
          {copied ? 'Copied!' : 'Copy Recipe'}
        </button>
        {!showSaveInput ? (
          <button
            onClick={() => setShowSaveInput(true)}
            className="flex-1 py-2 rounded bg-[#C8862A] text-white text-sm font-medium hover:bg-[#E09D3A] transition-colors"
          >
            Save Recipe
          </button>
        ) : (
          <div className="flex flex-1 gap-1">
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
