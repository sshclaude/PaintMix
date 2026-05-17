export default function BatchSizeInput({ value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-widest text-[#7A7670]">
        Batch Size
      </label>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min="0.1"
          max="5.0"
          step="0.05"
          value={value}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= 0.1 && v <= 5.0) onChange(v);
          }}
          className="w-24 bg-[#1A1A1A] border border-[#2E2E2E] rounded px-3 py-2 text-[#E8E4DC] text-sm focus:outline-none focus:border-[#C8862A]"
        />
        <span className="text-sm text-[#7A7670]">mL pigmented paint</span>
      </div>
      <input
        type="range"
        min="0.1"
        max="5.0"
        step="0.05"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#C8862A]"
      />
      <div className="flex justify-between text-xs text-[#7A7670]">
        <span>0.1 mL</span>
        <span>5.0 mL</span>
      </div>
    </div>
  );
}
