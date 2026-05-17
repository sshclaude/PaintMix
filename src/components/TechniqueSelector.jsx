const TECHNIQUES = [
  { id: 'basecoat', label: 'Basecoat', ratio: 0, note: 'Paint straight from recipe' },
  { id: 'layer', label: 'Layer', ratio: 0.12, note: 'Slight thinning for smooth application' },
  { id: 'wash', label: 'Wash', ratio: 1.5, note: 'Heavy thinning, flows into recesses' },
  { id: 'glaze', label: 'Glaze', ratio: 3.0, note: 'Very thin, transparent toning layer' },
  { id: 'airbrush', label: 'Airbrush', ratio: 0.8, note: 'Target ~40–60 cP for atomisation' },
];

export { TECHNIQUES };

export default function TechniqueSelector({ value, onChange }) {
  const selected = TECHNIQUES.find(t => t.id === value) || TECHNIQUES[0];

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-widest text-[#7A7670]">
        Technique
      </label>
      <div className="flex gap-1 flex-wrap">
        {TECHNIQUES.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              value === t.id
                ? 'bg-[#C8862A] text-white'
                : 'bg-[#1A1A1A] text-[#7A7670] border border-[#2E2E2E] hover:border-[#C8862A] hover:text-[#C8862A]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-[#7A7670] italic">{selected.note}</p>
    </div>
  );
}
