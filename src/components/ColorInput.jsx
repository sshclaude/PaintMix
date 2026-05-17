import { useState, useRef, useEffect } from 'react';

export default function ColorInput({ value, onChange, hobbyPaints }) {
  const [tab, setTab] = useState('hex');
  const [hexInput, setHexInput] = useState(value);
  const [imageUrl, setImageUrl] = useState(null);
  const [sampled, setSampled] = useState(null);
  const [search, setSearch] = useState('');
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  const handleHexInput = (v) => {
    setHexInput(v);
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v);
  };

  const handlePickerChange = (v) => {
    setHexInput(v);
    onChange(v);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setSampled(null);
  };

  const handleImageClick = (e) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
    setSampled(hex);
    setHexInput(hex);
    onChange(hex);
  };

  const filtered = hobbyPaints
    ? hobbyPaints.filter(p =>
        search.length > 1 &&
        (`${p.brand} ${p.name}`.toLowerCase().includes(search.toLowerCase()))
      ).slice(0, 20)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-semibold uppercase tracking-widest text-[#7A7670]">
        Target Color
      </label>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[#2E2E2E]">
        {['hex', 'image', 'named'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-[#C8862A] text-[#C8862A]'
                : 'border-transparent text-[#7A7670] hover:text-[#E8E4DC]'
            }`}
          >
            {t === 'hex' ? 'Hex / Picker' : t === 'image' ? 'Image' : 'Named Paint'}
          </button>
        ))}
      </div>

      {/* Hex tab */}
      {tab === 'hex' && (
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded border border-[#2E2E2E] shrink-0"
            style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(hexInput) ? hexInput : '#888' }}
          />
          <input
            type="text"
            value={hexInput}
            onChange={e => handleHexInput(e.target.value)}
            placeholder="#RRGGBB"
            className="flex-1 bg-[#1A1A1A] border border-[#2E2E2E] rounded px-3 py-2 text-sm text-[#E8E4DC] font-mono focus:outline-none focus:border-[#C8862A]"
          />
          <input
            type="color"
            value={/^#[0-9A-Fa-f]{6}$/.test(hexInput) ? hexInput : '#000000'}
            onChange={e => handlePickerChange(e.target.value)}
            className="w-10 h-10 cursor-pointer rounded border border-[#2E2E2E] bg-transparent"
          />
        </div>
      )}

      {/* Image tab */}
      {tab === 'image' && (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded bg-[#1A1A1A] border border-[#2E2E2E] hover:border-[#C8862A] text-sm text-[#7A7670] hover:text-[#C8862A] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload image
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>

          {imageUrl && (
            <div className="relative">
              <p className="text-xs text-[#7A7670] mb-1">Click to sample a color:</p>
              <img
                ref={imgRef}
                src={imageUrl}
                alt="upload"
                className="max-w-full max-h-48 rounded border border-[#2E2E2E] cursor-crosshair"
                onClick={handleImageClick}
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          {sampled && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded border border-[#2E2E2E]" style={{ backgroundColor: sampled }} />
              <span className="text-sm text-[#E8E4DC] font-mono">{sampled}</span>
              <span className="text-xs text-[#7A7670]">sampled</span>
            </div>
          )}
        </div>
      )}

      {/* Named paint tab */}
      {tab === 'named' && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or brand…"
            className="bg-[#1A1A1A] border border-[#2E2E2E] rounded px-3 py-2 text-sm text-[#E8E4DC] focus:outline-none focus:border-[#C8862A]"
          />
          {filtered.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded border border-[#2E2E2E] bg-[#1A1A1A]">
              {filtered.map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSearch(`${p.brand} — ${p.name}`);
                    setHexInput(p.hex);
                    onChange(p.hex);
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2 hover:bg-[#242424] text-left"
                >
                  <div
                    className="w-5 h-5 rounded shrink-0 border border-[#2E2E2E]"
                    style={{ backgroundColor: p.hex }}
                  />
                  <span className="text-sm text-[#E8E4DC]">{p.name}</span>
                  <span className="text-xs text-[#7A7670] ml-auto">{p.brand}</span>
                </button>
              ))}
            </div>
          )}
          {search.length > 1 && filtered.length === 0 && (
            <p className="text-xs text-[#7A7670]">No paints found</p>
          )}
        </div>
      )}
    </div>
  );
}
