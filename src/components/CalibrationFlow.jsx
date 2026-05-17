import { useState, useRef } from 'react';
import mixbox from 'mixbox';
import chroma from 'chroma-js';

const STEPS = ['Upload white swatch', 'Upload black swatch', 'Done'];

function SwatchCapture({ label, onCapture }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [sampled, setSampled] = useState(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageUrl(URL.createObjectURL(file));
    setSampled(null);
  };

  const handleClick = (e) => {
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
    setSampled({ hex, r, g, b });
    onCapture({ hex, r, g, b });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-[#7A7670]">{label}</p>
      <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded bg-[#1A1A1A] border border-[#2E2E2E] hover:border-[#C8862A] text-sm text-[#7A7670] hover:text-[#C8862A] transition-colors w-fit">
        Upload photo
        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </label>
      {imageUrl && (
        <div>
          <p className="text-xs text-[#7A7670] mb-1">Click center of swatch:</p>
          <img
            ref={imgRef}
            src={imageUrl}
            alt="swatch"
            className="max-w-full max-h-40 rounded border border-[#2E2E2E] cursor-crosshair"
            onClick={handleClick}
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
      {sampled && (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded border border-[#2E2E2E]" style={{ backgroundColor: sampled.hex }} />
          <span className="text-xs font-mono text-[#E8E4DC]">{sampled.hex}</span>
          <span className="text-xs text-green-400">✓ sampled</span>
        </div>
      )}
    </div>
  );
}

export default function CalibrationFlow({ paints, calibration, onCalibrate, onReset }) {
  const [selectedPaint, setSelectedPaint] = useState(paints[0]?.id || '');
  const [whiteRgb, setWhiteRgb] = useState(null);
  const [blackRgb, setBlackRgb] = useState(null);

  const paint = paints.find(p => p.id === selectedPaint);
  const isCalibrated = paint && calibration[paint.id];

  const handleCalibrate = () => {
    if (!whiteRgb || !blackRgb || !paint) return;
    const latentWhite = mixbox.rgbToLatent(whiteRgb.r, whiteRgb.g, whiteRgb.b);
    const latentBlack = mixbox.rgbToLatent(blackRgb.r, blackRgb.g, blackRgb.b);
    onCalibrate(paint.id, { latentWhite, latentBlack, hexWhite: whiteRgb.hex, hexBlack: blackRgb.hex });
    setWhiteRgb(null);
    setBlackRgb(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[#7A7670]">
        Calibrate base paints to your specific batch. Paint a swatch on white and black card, photograph each, and click the center of the dry paint area.
      </p>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-widest text-[#7A7670]">Paint to calibrate</label>
        <div className="flex flex-wrap gap-1">
          {paints.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPaint(p.id)}
              className={`px-2 py-1 text-xs rounded flex items-center gap-1.5 transition-colors ${
                selectedPaint === p.id
                  ? 'bg-[#C8862A] text-white'
                  : 'bg-[#1A1A1A] border border-[#2E2E2E] text-[#7A7670] hover:border-[#C8862A]'
              }`}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.hex }} />
              {p.name.split(' ').slice(-2).join(' ')}
              {calibration[p.id] && <span className="text-green-400">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {paint && (
        <div className="flex flex-col gap-3 p-3 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border border-[#2E2E2E]" style={{ backgroundColor: paint.hex }} />
            <span className="text-sm text-[#E8E4DC]">{paint.name}</span>
            {isCalibrated && <span className="text-xs text-green-400 ml-auto">Calibrated</span>}
          </div>

          <SwatchCapture label="1. Swatch on white card (photographed dry):" onCapture={setWhiteRgb} />
          <SwatchCapture label="2. Swatch on black card (photographed dry):" onCapture={setBlackRgb} />

          <div className="flex gap-2">
            <button
              disabled={!whiteRgb || !blackRgb}
              onClick={handleCalibrate}
              className="flex-1 py-2 rounded bg-[#C8862A] text-white text-sm font-medium hover:bg-[#E09D3A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply Calibration
            </button>
            {isCalibrated && (
              <button
                onClick={() => onReset(paint.id)}
                className="px-3 py-2 rounded bg-[#1A1A1A] border border-[#2E2E2E] text-xs text-[#7A7670] hover:text-red-400 hover:border-red-900 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
