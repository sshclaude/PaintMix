export default function PaintInventory({ paints, activePaintIds, onChange }) {
  const togglePaint = (id) => {
    if (activePaintIds.includes(id)) {
      if (activePaintIds.length <= 1) return; // always keep at least one
      onChange(activePaintIds.filter(pid => pid !== id));
    } else {
      onChange([...activePaintIds, id]);
    }
  };

  return (
    <div className="flex flex-col gap-3">
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
            onClick={() => onChange([paints[0].id])}
            className="text-xs text-[#7A7670] hover:text-[#C8862A] transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {paints.map(paint => {
          const active = activePaintIds.includes(paint.id);
          return (
            <button
              key={paint.id}
              onClick={() => togglePaint(paint.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-left ${
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
              {active && (
                <span className="w-2 h-2 rounded-full bg-[#C8862A] shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
