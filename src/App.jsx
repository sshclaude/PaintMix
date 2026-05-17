import { useState, useCallback, useEffect } from 'react';
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

const CORE_IDS = basePaints.filter(p => !p.extended).map(p => p.id);
const LS_RECIPES = 'paintmix_recipes';
const LS_INVENTORY = 'paintmix_inventory';
const LS_CALIBRATION = 'paintmix_calibration';

function loadLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
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
  const [panel, setPanel] = useState('recipes'); // 'recipes' | 'inventory' | 'calibration'

  useEffect(() => {
    localStorage.setItem(LS_RECIPES, JSON.stringify(savedRecipes));
  }, [savedRecipes]);

  useEffect(() => {
    localStorage.setItem(LS_INVENTORY, JSON.stringify(activePaintIds));
  }, [activePaintIds]);

  useEffect(() => {
    localStorage.setItem(LS_CALIBRATION, JSON.stringify(calibration));
  }, [calibration]);

  const handleSolve = useCallback(() => {
    setSolving(true);
    const activePaints = basePaints.filter(p => activePaintIds.includes(p.id));
    setTimeout(() => {
      const result = solveMix(targetHex, activePaints, batchSizeMl);
      setRecipe(result);
      setSolving(false);
    }, 0);
  }, [targetHex, activePaintIds, batchSizeMl]);

  const handleSaveRecipe = ({ name, recipe: r, technique: t, batchSizeMl: b }) => {
    setSavedRecipes(prev => [...prev, { name, recipe: r, technique: t, batchSizeMl: b }]);
  };

  const handleLoadRecipe = (entry) => {
    setRecipe(entry.recipe);
    setTechnique(entry.technique);
    setBatchSizeMl(entry.batchSizeMl);
  };

  const handleDeleteRecipe = (i) => {
    setSavedRecipes(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleCalibrate = (paintId, data) => {
    setCalibration(prev => ({ ...prev, [paintId]: data }));
  };

  const handleResetCalibration = (paintId) => {
    setCalibration(prev => {
      const next = { ...prev };
      delete next[paintId];
      return next;
    });
  };

  // Check if target is likely metallic (very dark and low saturation is fine, but gold/silver hues)
  const isMetallic = false; // no heuristic for MVP; user sees note in UI

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
            <ColorInput
              value={targetHex}
              onChange={setTargetHex}
              hobbyPaints={hobbyPaints}
            />

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

          {/* Center column: recipe card */}
          <div className="bg-[#1A1A1A] rounded-xl border border-[#2E2E2E] p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#7A7670] mb-4">Recipe</h2>
            <RecipeCard
              recipe={recipe}
              targetHex={targetHex}
              technique={technique}
              batchSizeMl={batchSizeMl}
              onSave={handleSaveRecipe}
            />
          </div>

          {/* Right column: panel */}
          <div className="bg-[#1A1A1A] rounded-xl border border-[#2E2E2E] p-4">
            {panel === 'recipes' && (
              <SavedRecipes
                recipes={savedRecipes}
                onLoad={handleLoadRecipe}
                onDelete={handleDeleteRecipe}
              />
            )}
            {panel === 'inventory' && (
              <PaintInventory
                paints={basePaints}
                activePaintIds={activePaintIds}
                onChange={setActivePaintIds}
              />
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
    </div>
  );
}
