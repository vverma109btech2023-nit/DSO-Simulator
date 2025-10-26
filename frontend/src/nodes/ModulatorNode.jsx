import React, { useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';

function ModulatorNode({ id, data = {} }) {
  const [modulationType, setModulationType] = useState(data.modulationType || 'ASK');
  const [loading, setLoading] = useState(false);
  const backendUrl = data.backendUrl ?? 'http://127.0.0.1:8000/modulate';

  const parseBits = useCallback((message) => {
    if (!message) return [];
    if (Array.isArray(message.bits)) return message.bits.map((b) => (b ? 1 : 0));
    if (typeof message.bits === 'string') return message.bits.split('').map((ch) => (ch === '1' ? 1 : 0));
    if (message.bits !== undefined) return String(message.bits).split('').map((ch) => (ch === '1' ? 1 : 0));
    return [];
  }, []);

  // Local fallback modulator (keeps same output shape as backend)
  const localModulate = useCallback((type, carrier, bits, cycles_per_symbol = 3, samples_per_symbol = 64) => {
    const fc = (carrier?.frequency) ?? 1000;
    const amp = (carrier?.amplitude) ?? 1;
    const samples = [];
    const bitArray = bits.length ? bits : [1];

    for (let i = 0; i < bitArray.length; i++) {
      const bit = bitArray[i] ? 1 : 0;
      for (let s = 0; s < samples_per_symbol; s++) {
        const t = (s / samples_per_symbol) * (cycles_per_symbol / Math.max(1e-6, fc));
        let val = 0;
        const omega = 2 * Math.PI * fc;
        switch (type) {
          case 'ASK': {
            const A = bit ? amp : amp * 0.05;
            val = A * Math.sin(omega * t);
            break;
          }
          case 'PSK': {
            const phase = bit ? Math.PI : 0;
            val = amp * Math.sin(omega * t + phase);
            break;
          }
          case 'FSK': {
            const f = bit ? fc * 1.25 : fc * 0.8;
            val = amp * Math.sin(2 * Math.PI * f * t);
            break;
          }
          case 'PWM': {
            const duty = bit ? 0.75 : 0.25;
            val = (s / samples_per_symbol) < duty ? amp : 0;
            break;
          }
          case 'PPM': {
            const pulseWidth = Math.max(1, Math.floor(samples_per_symbol * 0.08));
            const pos = bit ? Math.floor(samples_per_symbol * 0.7) : Math.floor(samples_per_symbol * 0.2);
            val = (s >= pos && s < pos + pulseWidth) ? amp : 0;
            break;
          }
          default:
            val = amp * Math.sin(omega * t);
        }
        samples.push(val);
      }
    }

    return {
      type: 'analog',
      waveform: 'modulated',
      samples,
      source: type,
      frequency: fc,
      amplitude: amp,
      samples_per_symbol,
    };
  }, []);

  const handleModulate = useCallback(async () => {
    const carrier = data.carrier ?? {};
    const message = data.message ?? {};
    const onModulate = data.onModulate;

    if (!carrier && !message) {
      console.warn('Modulator: no inputs available');
      return;
    }

    const bits = parseBits(message);
    // prepare payload
    const payload = {
      modulation: modulationType,
      carrier: {
        frequency: carrier.frequency ?? 1000,
        amplitude: carrier.amplitude ?? 1,
        waveform: carrier.waveform ?? 'sine',
      },
      message: { bits: Array.isArray(bits) ? bits : bits },
      cycles_per_symbol: data.cycles_per_symbol ?? 3,
      samples_per_symbol: data.samples_per_symbol ?? 64,
    };

    setLoading(true);
    try {
      const res = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`backend ${res.statusText}`);
      const modulated = await res.json();
      if (typeof onModulate === 'function') onModulate(modulated, id);
    } catch (err) {
      console.warn('Backend modulation failed, using local fallback:', err);
      const fallback = localModulate(modulationType, carrier, bits, payload.cycles_per_symbol, payload.samples_per_symbol);
      if (typeof onModulate === 'function') onModulate(fallback, id);
    } finally {
      setLoading(false);
    }
  }, [data, modulationType, backendUrl, parseBits, localModulate, id]);

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg w-72 shadow-md relative">
      {/* Inputs */}
      <Handle type="target" position={Position.Left} id="carrier" />
      <Handle type="target" position={Position.Top} id="message" />
      <Handle type="source" position={Position.Right} id="out" />

      <h3 className="text-lg font-semibold mb-2">Modulator</h3>

      <div className="text-xs text-gray-300 mb-2">
        Inputs: <span className="text-green-300">Top = digital message</span>, <span className="text-green-300">Left = analog carrier</span>
      </div>

      <label className="text-sm block mb-1">Modulation</label>
      <select
        value={modulationType}
        onChange={(e) => setModulationType(e.target.value)}
        className="w-full bg-gray-700 text-white p-2 rounded mb-3"
      >
        <option value="ASK">ASK</option>
        <option value="PSK">PSK</option>
        <option value="FSK">FSK</option>
        <option value="PWM">PWM</option>
        <option value="PPM">PPM</option>
      </select>

      <button
        onClick={handleModulate}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded w-full"
      >
        {loading ? 'Modulating...' : 'Modulate'}
      </button>

      <div className="mt-2 text-xs text-gray-300">
        Carrier: {data.carrier ? `${data.carrier.frequency ?? '—'}Hz, ${data.carrier.amplitude ?? '—'}V` : '—'}
        <br />
        Message: {Array.isArray(data.message?.bits) ? data.message.bits.join('') : String(data.message?.bits ?? '—')}
      </div>
    </div>
  );
}

export default ModulatorNode;
