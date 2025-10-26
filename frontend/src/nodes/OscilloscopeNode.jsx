import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';

function OscilloscopeNode({ data = {} }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const lastTsRef = useRef(null);
  const phaseRef = useRef(0);
  const { signal } = data;

  // --- configurable constants (moved to component scope so UI can read them) ---
  const cyclesOnScreen = 3; // target visible cycles
  const oversampleFactor = 2;
  const divisionsX = 10;
  const divisionsY = 8;
  const pixelsPerVolt = 5;

  const [zoomX, setZoomX] = useState(1);
  const [zoomY, setZoomY] = useState(1);
  const [paused, setPaused] = useState(false);
  const clampZoom = useCallback((z) => Math.max(0.25, Math.min(12, z)), []);

  const zoomXIn = () => setZoomX((z) => clampZoom(z + 0.25));
  const zoomXOut = () => setZoomX((z) => clampZoom(z - 0.25));
  const zoomYIn = () => setZoomY((z) => clampZoom(z + 0.25));
  const zoomYOut = () => setZoomY((z) => clampZoom(z - 0.25));
  const zoomReset = () => {
    setZoomX(1);
    setZoomY(1);
  };
  const play = () => {
    lastTsRef.current = null;
    setPaused(false);
  };

  const pause = () => {
    setPaused(true);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  };

  const onWheel = (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = -e.deltaY;
    if (e.shiftKey) {
      setZoomY((z) => clampZoom(z + (delta > 0 ? 0.08 : -0.08)));
    } else {
      setZoomX((z) => clampZoom(z + (delta > 0 ? 0.08 : -0.08)));
    }
  };

  function formatTime(sec) {
    if (sec >= 1) return `${sec.toFixed(2)} s`;
    if (sec >= 0.001) return `${(sec * 1000).toFixed(2)} ms`;
    if (sec >= 0.000001) return `${(sec * 1e6).toFixed(2)} μs`;
    return `${(sec * 1e9).toFixed(2)} ns`;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const deviceWidth = canvas.width || 500;
    const deviceHeight = canvas.height || 300;

    // logical drawing area (per-axis zoom)
    const logicalWidth = deviceWidth / zoomX;
    const logicalHeight = deviceHeight / zoomY;

    // helper to convert various digital formats to 0/1 array
    const getQuantized = (sig) => {
      if (!sig) return null;
      if (Array.isArray(sig.quantized)) return sig.quantized.map((v) => (v ? 1 : 0));
      if (sig.bits !== undefined) {
        if (Array.isArray(sig.bits)) return sig.bits.map((v) => (v ? 1 : 0));
        const bitsStr = String(sig.bits);
        if (/^[01]+$/.test(bitsStr)) return Array.from(bitsStr).map((ch) => (ch === '1' ? 1 : 0));
        return Array.from(bitsStr).map((ch) => (Number(ch) ? 1 : 0));
      }
      if (Array.isArray(sig.samples)) return sig.samples.map((v) => (v ? 1 : 0));
      return null;
    };

    // DRAW GRID (with numeric voltage labels and tick marks)
    function drawGrid() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, deviceWidth, deviceHeight);
      ctx.setTransform(zoomX, 0, 0, zoomY, 0, 0);

      const stepX = logicalWidth / divisionsX;
      const stepY = logicalHeight / divisionsY;

      // weak grid lines
      ctx.strokeStyle = 'rgba(180,180,180,0.12)';
      ctx.lineWidth = 1 / Math.max(zoomX, zoomY);

      for (let i = 0; i <= divisionsX; i++) {
        const x = i * stepX;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, logicalHeight);
        ctx.stroke();
      }

      // draw horizontal lines and small left ticks in logical space
      ctx.strokeStyle = 'rgba(180,180,180,0.12)';
      for (let j = 0; j <= divisionsY; j++) {
        const y = j * stepY;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(logicalWidth, y);
        // emphasize center horizontal
        ctx.strokeStyle = j === Math.floor(divisionsY / 2) ? 'rgba(255,255,255,0.08)' : 'rgba(180,180,180,0.12)';
        ctx.stroke();
        // tick mark (small horizontal at left, logical length ~ 6 device px)
        ctx.strokeStyle = 'rgba(180,180,180,0.18)';
        const tickLenLogical = (6 / zoomX); // 6 device px → logical units
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(tickLenLogical, y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(180,180,180,0.12)';
      }

      // numeric labels: draw in device pixels for crisp text
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = '11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto';
      ctx.fillStyle = 'rgba(180,255,180,0.95)';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      // compute volts per division
      const voltsPerDiv = (stepY) / pixelsPerVolt;
      // center in logical coords
      const centerLogical = logicalHeight / 2;

      for (let j = 0; j <= divisionsY; j++) {
        const yLogical = j * stepY;
        const yDevice = Math.round(yLogical * zoomY);
        const volts = ((centerLogical - yLogical) / pixelsPerVolt);
        const vLabel = `${volts.toFixed(2)} V`;
        // place label slightly right of left edge (6 px)
        ctx.fillText(vLabel, 6, yDevice);
      }

      // time labels at top (device pixels)
      let timePerDiv = null;
      if (signal && signal.type === 'analog' && typeof signal.frequency === 'number') {
        const freq = Math.max(0.000001, signal.frequency);
        const timeWindow = (cyclesOnScreen / freq) / zoomX;
        timePerDiv = timeWindow / divisionsX;
      }

      for (let i = 0; i <= divisionsX; i++) {
        const xLogical = i * stepX;
        const xDevice = Math.round(xLogical * zoomX);
        const label = timePerDiv ? formatTime(timePerDiv * i) : '';
        ctx.fillText(label, xDevice + 4, 6);
      }
    }

    function drawAnalogFrame(timestamp) {
      if (!lastTsRef.current) lastTsRef.current = timestamp;
      const dt = Math.min(0.1, (timestamp - lastTsRef.current) / 1000);
      lastTsRef.current = timestamp;
      phaseRef.current += dt;

      drawGrid();

      ctx.strokeStyle = 'lime';
      ctx.lineWidth = 2 / Math.max(zoomX, zoomY);
      ctx.beginPath();

      const freq = Math.max(0.0001, signal.frequency || 1);
      const timeWindow = (cyclesOnScreen / freq) / zoomX;
      const samples = Math.max(4, Math.floor(logicalWidth * oversampleFactor));

      for (let i = 0; i < samples; i++) {
        const x = (i / (samples - 1)) * logicalWidth;
        const t = (i / (samples - 1)) * timeWindow - phaseRef.current;
        const omegaT = 2 * Math.PI * freq * t;

        let y = logicalHeight / 2;
        switch (signal.waveform) {
          case 'sine':
            y -= signal.amplitude * Math.sin(omegaT) * pixelsPerVolt;
            break;
          case 'square':
            y -= signal.amplitude * (Math.sin(omegaT) > 0 ? 1 : -1) * pixelsPerVolt;
            break;
          case 'triangle': {
            const p = (t * freq) % 1;
            const tri = 4 * Math.abs(p - 0.5) - 1;
            y -= signal.amplitude * tri * pixelsPerVolt;
            break;
          }
          case 'sawtooth': {
            const p = (t * freq) % 1;
            const saw = 2 * (p - 0.5);
            y -= signal.amplitude * saw * pixelsPerVolt;
            break;
          }
          default:
            break;
        }

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.stroke();
      if (!paused) rafRef.current = requestAnimationFrame(drawAnalogFrame);
    }

    function drawDigitalOnce() {
      drawGrid();

      ctx.strokeStyle = 'cyan';
      ctx.lineWidth = 2 / Math.max(zoomX, zoomY);
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';

      const q = getQuantized(signal);
      if (!q || q.length === 0) return;

      const step = logicalWidth / q.length;
      const topY = logicalHeight * 0.2;
      const bottomY = logicalHeight * 0.8;

      ctx.beginPath();
      ctx.moveTo(0, q[0] ? topY : bottomY);

      for (let i = 0; i < q.length; i++) {
        const xStart = i * step;
        const xEnd = (i + 1) * step;
        const y = q[i] ? topY : bottomY;
        ctx.lineTo(xStart, y);
        ctx.lineTo(xEnd, y);
      }

      ctx.stroke();
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastTsRef.current = null;

    // always draw grid, even with no signal
    if (!signal) {
      drawGrid();
      return;
    }

    if (signal.type === 'digital') {
      drawDigitalOnce();
    } else if (
      signal.type === 'analog' &&
      signal.waveform &&
      typeof signal.frequency === 'number' &&
      typeof signal.amplitude === 'number'
    ) {
      rafRef.current = requestAnimationFrame(drawAnalogFrame);
    } else {
      drawGrid();
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [signal, zoomX, zoomY, paused]);

  // compute right-panel values (use defaults if canvas not ready)
  const canvasW = canvasRef.current?.width ?? 500;
  const canvasH = canvasRef.current?.height ?? 300;
  const logicalW = canvasW / zoomX;
  const logicalH = canvasH / zoomY;
  const voltsPerDiv = (logicalH / divisionsY) / pixelsPerVolt;
  let timePerDiv = null;
  if (signal && signal.type === 'analog' && typeof signal.frequency === 'number') {
    const freq = Math.max(0.000001, signal.frequency);
    const timeWindow = (cyclesOnScreen / freq) / zoomX;
    timePerDiv = timeWindow / divisionsX;
  }

  return (
    <div className="bg-gray-900 text-white p-4 rounded-lg w-fit shadow-md">
      <Handle type="target" position={Position.Left} />
      <h3 className="text-lg font-semibold mb-2">Oscilloscope</h3>

      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={play}
          disabled={!paused}
          className={`px-3 py-1 rounded ${paused ? 'bg-green-600' : 'bg-gray-600'} disabled:opacity-50`}
        >
          Play
        </button>
        <button
          onClick={pause}
          disabled={paused}
          className={`px-3 py-1 rounded ${paused ? 'bg-gray-600' : 'bg-yellow-600'} disabled:opacity-50`}
        >
          Pause
        </button>

        <div className="flex items-center gap-1">
          <div className="text-xs text-gray-300 mr-1">X:</div>
          <button onClick={zoomXOut} className="bg-gray-700 px-2 py-1 rounded">
            −
          </button>
          <div className="px-2">{(zoomX * 100).toFixed(0)}%</div>
          <button onClick={zoomXIn} className="bg-gray-700 px-2 py-1 rounded">
            +
          </button>
        </div>

        <div className="flex items-center gap-1">
          <div className="text-xs text-gray-300 mr-1">Y:</div>
          <button onClick={zoomYOut} className="bg-gray-700 px-2 py-1 rounded">
            −
          </button>
          <div className="px-2">{(zoomY * 100).toFixed(0)}%</div>
          <button onClick={zoomYIn} className="bg-gray-700 px-2 py-1 rounded">
            +
          </button>
        </div>

        <button onClick={zoomReset} className="ml-2 bg-blue-600 px-2 py-1 rounded">
          Reset
        </button>
        <div className="text-xs text-gray-400 ml-4">Ctrl+Wheel = X, Ctrl+Shift+Wheel = Y</div>
      </div>

      {/* canvas + right info panel */}
      <div className="flex items-start gap-4">
        <canvas
          ref={canvasRef}
          width={500}
          height={300}
          onWheel={onWheel}
          className="bg-black rounded border border-gray-700"
        />

        <div className="w-48 bg-gray-800 p-3 rounded text-sm">
          <div className="font-medium mb-2">Grid / Measurements</div>
          <div className="mb-1"><span className="text-gray-300">Volts/div:</span> <span className="text-green-300">{voltsPerDiv.toFixed(3)} V</span></div>
          <div className="mb-1">
            <span className="text-gray-300">Time/div:</span>{' '}
            <span className="text-green-300">{timePerDiv ? formatTime(timePerDiv) : '—'}</span>
          </div>
          <div className="mb-1"><span className="text-gray-300">Divisions (X × Y):</span> <span className="text-green-300">{divisionsX} × {divisionsY}</span></div>
          <div className="mb-1"><span className="text-gray-300">Pixels / V:</span> <span className="text-green-300">{pixelsPerVolt}</span></div>
          <div className="mt-2 font-medium">Signal</div>
          <div className="mb-1"><span className="text-gray-300">Type:</span> <span className="text-green-300">{signal?.type ?? '—'}</span></div>
          <div className="mb-1"><span className="text-gray-300">Waveform:</span> <span className="text-green-300">{signal?.waveform ?? '—'}</span></div>
          <div className="mb-1"><span className="text-gray-300">Freq:</span> <span className="text-green-300">{signal?.frequency ?? '—'}</span></div>
          <div className="mb-1"><span className="text-gray-300">Amp:</span> <span className="text-green-300">{signal?.amplitude ?? '—'}</span></div>
          <div className="mb-1 break-words"><span className="text-gray-300">Bits:</span> <span className="text-green-300">{signal?.bits ?? '—'}</span></div>
        </div>
      </div>
    </div>
  );
}

export default OscilloscopeNode;
