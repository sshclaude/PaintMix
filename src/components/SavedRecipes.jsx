import { useState } from 'react';

export default function SavedRecipes({ recipes, onLoad, onDelete }) {
  const [open, setOpen] = useState(true);

  if (recipes.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-[#7A7670]"
        >
          <span>Saved Recipes (0)</span>
          <span>{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <p className="text-xs text-[#7A7670] italic">No saved recipes yet. Calculate and save a recipe to see it here.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-[#7A7670]"
      >
        <span>Saved Recipes ({recipes.length})</span>
        <span className="text-[#C8862A]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
          {recipes.map((entry, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E] group"
            >
              <div
                className="w-8 h-8 rounded shrink-0 border border-[#2E2E2E]"
                style={{ backgroundColor: entry.recipe.predictedHex }}
              />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm text-[#E8E4DC] truncate">{entry.name}</span>
                <span className="text-xs text-[#7A7670]">
                  {entry.technique} · {entry.batchSizeMl} mL · ΔE {entry.recipe.deltaE}
                </span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onLoad(entry)}
                  className="px-2 py-1 text-xs bg-[#242424] text-[#C8862A] rounded hover:bg-[#C8862A] hover:text-white transition-colors"
                >
                  Load
                </button>
                <button
                  onClick={() => onDelete(i)}
                  className="px-2 py-1 text-xs bg-[#242424] text-[#7A7670] rounded hover:bg-red-900 hover:text-red-300 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
