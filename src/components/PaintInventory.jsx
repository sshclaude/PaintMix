export default function PaintInventory({ paints, activePaintIds, onChange }) {
  const corePaints = paints.filter(p => !p.extended);
  const extendedPaints = paints.filter(p => p.extended);

  const togglePaint = (id) => {
    if (activePaintIds.includes(id)) {
      if (activePaintIds.length <= 1) return;
      onChange(activePaintIds.filter(pid => pid !== id));
    } else {
      onChange([...activePaintIds, id]);
    }
  };

  const PaintRow = ({ paint }) => {
    const active = activePaintIds.includes(paint.id);
    return (
      <button
        onClick={() => togglePaint(paint.id)}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-left w-full ${
          active
            ? 'bg-[#1A1A1A] border-[#2E2E2E] text-[#E8E4DC]'
            : 'bg-[#0F0F0F] border-[#1A1A1A] text-[#7A7670] opacity-50'
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full border shrink-0 ${active ? 'border-[#C8862A]' : 'border-[#2E2E2E]'}`}
          style={{ backgroundColor: active ? paint.hex : 'transparent' }}
        />
        <span className="text-xs flex-1">{paint.name}</span>
        <span className="text-xs text-[#7A7670]">{paint.pigmentCode}</span>
        {active && <span className="w-2 h-2 rounded-full bg-[#C8862A] shrink-0" />}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#7A7670]">Paint Inventory</span>
        <div className="flex gap-2">
          <button
            onClick={() => onChange(paints.map(p => p.id))}
            className="text-xs text-[#7A7670] hover:text-[#C8862A] transition-colors"
          >
            All
          </button>
          <span className="text-[#2E2E2E]">|</span>
          <button
            onClick={() => onChange(corePaints.map(p => p.id))}
            className="text-xs text-[#7A7670] hover:text-[#C8862A] transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Core mixing set */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-[#7A7670] mb-1">
          Mixing Set ({corePaints.length})
        </span>
        {corePaints.map(p => <PaintRow key={p.id} paint={p} />)}
      </div>

      {/* Extended palette */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-[#7A7670] mb-1">
          Extended Palette ({extendedPaints.length})
        </span>
        {extendedPaints.map(p => <PaintRow key={p.id} paint={p} />)}
      </div>
    </div>
  );
}
