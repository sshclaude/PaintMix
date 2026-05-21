import { useState, useCallback, useEffect } from 'react';
import chroma from 'chroma-js';
import { solveMix } from './solver';
import basePaints from './data/basePaints.json';
import hobbyPaints from './data/hobbyPaints.json';
import ColorInput from './components/ColorInput';
import TechniqueSelector from './components/TechniqueSelector';
import BatchSizeInput from './components/BatchSizeInput';
import RecipeCard from './components/RecipeCard';
import SavedRecipes from './components/SavedRecipes';
import PaintInventory from './components/PaintInventory';
import CalibrationFlow from './components/CalibrationFlow';
import ProgressionCard from './components/ProgressionCard';

const CORE_IDS = basePaints.filter(p => !p.extended).map(p => p.id);
const LS_RECIPES = 'paintmix_recipes';
const LS_INVENTORY = 'paintmix_inventory';
const LS_CALIBRATION = 'paintmix_calibration';

function loadLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

// Shift Lab chroma (C*) by deltaC while preserving hue angle
function shiftLabChroma(lab, deltaC) {
  const [L, a, b] = lab;
  const C = Math.sqrt(a * a + b * b);
  const newC = Math.max(0, C + deltaC);
  const hue = Math.atan2(b, a);
  return [L, newC * Math.cos(hue), newC * Math.sin(hue)];
}

export default function App() {
  const [targetHex, setTargetHex] = useState('#4A90D9');
  const [batchSizeMl, setBatchSizeMl] = useState(0.5);
  const [technique, setTechnique] = useState('layer');
  const [activePaintIds, setActivePaintIds] = useState(() => loadLS(LS_INVENTORY, CORE_IDS));
  const [recipe, setRecipe] = useState(null);
  const [solving, setSolving] = useState(false);
  const [savedRecipes, setSavedRecipes] = useState(() => loadLS(LS_RECIPES, []));
  const [calibration, setCalibration] = useState(() => loadLS(LS_CALIBRATION, {}));
  const [panel, setPanel] = useState('recipes');
  const [referenceIsDry, setReferenceIsDry] = useState(true);
  const [progressionMode, setProgressionMode] = useState(false);
  const [progression, setProgression] = useState(null);

  useEffect(() => { localStorage.setItem(LS_RECIPES, JSON.stringify(savedRecipes)); }, [savedRecipes]);
  useEffect(() => { localStorage.setItem(LS_INVENTORY, JSON.stringify(activePaintIds)); }, [activePaintIds]);
  useEffect(() => { localStorage.setItem(LS_CALIBRATION, JSON.stringify(calibration)); }, [calibration]);

  const handleSolve = useCallback(() => {
    setSolving(true);
    const activePaints = basePaints.filter(p => activePaintIds.includes(p.id));

    // Wet-to-dry correction: wet reference appears ~7 L* darker than dry result
    let solveTargetHex = targetHex;
    if (!referenceIsDry) {
      const lab = chroma(targetHex).lab();
      const adjustedL = Math.min(95, Math.max(5, lab[0] + 7));
      solveTargetHex = chroma.lab(adjustedL, lab[1], lab[2]).hex();
    }

    const solvedBatch = batchSizeMl;

    setTimeout(() => {
      // Always compute all three — single color shows midtone, progression shows all three
      const targetLab = chroma(solveTargetHex).lab();
      const clamp = l => Math.max(5, Math.min(95, l));
      const shadowLab    = shiftLabChroma([clamp(targetLab[0] - 15), targetLab[1], targetLab[2]], +5);
      const highlightLab = shiftLabChroma([clamp(targetLab[0] + 15), targetLab[1], targetLab[2]], -5);
      const shadowHex    = chroma.lab(...shadowLab).hex();
      const highlightHex = chroma.lab(...highlightLab).hex();

      const midtoneRecipe   = solveMix(solveTargetHex, activePaints, solvedBatch);
      const shadowRecipe    = solveMix(shadowHex,       activePaints, solvedBatch);
      const highlightRecipe = solveMix(highlightHex,    activePaints, solvedBatch);

      if (midtoneRecipe) midtoneRecipe.batchSizeMl = solvedBatch;

      setRecipe(midtoneRecipe);
      setProgression({
        shadow:      { recipe: shadowRecipe,    targetHex: shadowHex },
        midtone:     { recipe: midtoneRecipe,   targetHex: solveTargetHex },
        highlight:   { recipe: highlightRecipe, targetHex: highlightHex },
        batchSizeMl: solvedBatch,
      });
      setSolving(false);
    }, 0);
  }, [targetHex, activePaintIds, batchSizeMl, referenceIsDry]);

  const handleSaveRecipe = ({ name, recipe: r, technique: t, batchSizeMl: b }) => {
    setSavedRecipes(prev => [...prev, { name, recipe: r, technique: t, batchSizeMl: b }]);
  };

  const handleLoadRecipe = (entry) => {
    setRecipe(entry.recipe);
    setTechnique(entry.technique);
    setBatchSizeMl(entry.batchSizeMl);
    // Loaded recipes have no shadow/highlight context — clear progression and switch to single view
    setProgression(null);
    setProgressionMode(false);
  };

  const handleDeleteRecipe = (i) => {
    setSavedRecipes(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleCalibrate = (paintId, data) => {
    setCalibration(prev => ({ ...prev, [paintId]: data }));
  };

  const handleResetCalibration = (paintId) => {
    setCalibration(prev => { const next = { ...prev }; delete next[paintId]; return next; });
  };

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-[#E8E4DC]">
      {/* Header */}
      <header className="border-b border-[#2E2E2E] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded" style={{
            background: 'linear-gradient(135deg, #E83228 0%, #F5B800 33%, #0D4F8B 66%, #1E7028 100%)'
          }} />
          <h1 className="text-base font-bold tracking-tight text-[#E8E4DC]">PaintMix</h1>
          <span className="text-xs text-[#7A7670]">Paint Recipe Calculator</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setPanel(p => p === 'inventory' ? 'recipes' : 'inventory')}
            title="Paint Inventory"
            className={`p-2 rounded transition-colors ${panel === 'inventory' ? 'text-[#C8862A]' : 'text-[#7A7670] hover:text-[#E8E4DC]'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </button>
          <button
            onClick={() => setPanel(p => p === 'calibration' ? 'recipes' : 'calibration')}
            title="Calibration"
            className={`p-2 rounded transition-colors ${panel === 'calibration' ? 'text-[#C8862A]' : 'text-[#7A7670] hover:text-[#E8E4DC]'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">

          {/* Left column: inputs */}
          <div className="flex flex-col gap-5 bg-[#1A1A1A] rounded-xl border border-[#2E2E2E] p-4">
            <ColorInput value={targetHex} onChange={setTargetHex} hobbyPaints={hobbyPaints} />

            {/* Wet-to-dry toggle */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReferenceIsDry(true)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    referenceIsDry
                      ? 'bg-[#C8862A] text-white'
                      : 'bg-[#0F0F0F] border border-[#2E2E2E] text-[#7A7670] hover:border-[#C8862A]'
                  }`}
                >
                  Reference is dry
                </button>
                <button
                  onClick={() => setReferenceIsDry(false)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    !referenceIsDry
                      ? 'bg-[#C8862A] text-white'
                      : 'bg-[#0F0F0F] border border-[#2E2E2E] text-[#7A7670] hover:border-[#C8862A]'
                  }`}
                >
                  Reference is wet
                </button>
              </div>
              {!referenceIsDry && (
                <p className="text-xs text-[#7A7670] italic">
                  Wet acrylic dries approximately 5–10 L* lighter than it appears wet.
                </p>
              )}
            </div>

            <div className="border-t border-[#2E2E2E]" />

            <TechniqueSelector value={technique} onChange={setTechnique} />

            <div className="border-t border-[#2E2E2E]" />

            <BatchSizeInput value={batchSizeMl} onChange={setBatchSizeMl} />

            <button
              onClick={handleSolve}
              disabled={solving}
              className="w-full py-3 rounded-lg bg-[#C8862A] text-white font-semibold hover:bg-[#E09D3A] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {solving ? 'Calculating…' : 'Calculate Recipe'}
            </button>
          </div>

          {/* Center column: recipe / progression */}
          <div className="bg-[#1A1A1A] rounded-xl border border-[#2E2E2E] p-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 mb-4">
              {['Single color', 'Progression'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => setProgressionMode(i === 1)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    progressionMode === (i === 1)
                      ? 'bg-[#2E2E2E] text-[#E8E4DC]'
                      : 'text-[#7A7670] hover:text-[#E8E4DC]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {progressionMode ? (
              progression ? (
                <ProgressionCard
                  progression={progression}
                  technique={technique}
                  hobbyPaints={hobbyPaints}
                  onSave={handleSaveRecipe}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-[#7A7670] gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-sm text-center">Calculate a recipe first</p>
                </div>
              )
            ) : (
              <RecipeCard
                recipe={recipe}
                targetHex={targetHex}
                technique={technique}
                batchSizeMl={batchSizeMl}
                hobbyPaints={hobbyPaints}
                onSave={handleSaveRecipe}
              />
            )}
          </div>

          {/* Right column: panel */}
          <div className="bg-[#1A1A1A] rounded-xl border border-[#2E2E2E] p-4">
            {panel === 'recipes' && (
              <SavedRecipes recipes={savedRecipes} onLoad={handleLoadRecipe} onDelete={handleDeleteRecipe} />
            )}
            {panel === 'inventory' && (
              <PaintInventory paints={basePaints} activePaintIds={activePaintIds} onChange={setActivePaintIds} />
            )}
            {panel === 'calibration' && (
              <CalibrationFlow
                paints={basePaints}
                calibration={calibration}
                onCalibrate={handleCalibrate}
                onReset={handleResetCalibration}
              />
            )}
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#2E2E2E] mt-8 px-4 py-3 flex items-center justify-between text-[#4A4640]">
        <span className="text-xs font-mono">v{__APP_VERSION__}</span>
        <span className="text-xs">Spectral K-M solver · Golden HB dataset</span>
      </footer>
    </div>
  );
}
