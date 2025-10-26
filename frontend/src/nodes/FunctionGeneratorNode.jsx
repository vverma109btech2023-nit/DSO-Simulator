import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';

function FunctionGeneratorNode({ data }) {
  const [frequency, setFrequency] = useState(500);
  const [amplitude, setAmplitude] = useState(5);
  const [waveform, setWaveform] = useState('sine');

  const generateSignal = () => {
    const signal = {
      type: 'analog',
      waveform,
      frequency,
      amplitude,
    };
    console.log('Generated signal:', signal);
    if (typeof data.onGenerate === 'function') {
      data.onGenerate(signal);
    }
  };

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg w-72 shadow-md">
      <Handle type="source" position={Position.Right} />
      <h3 className="text-lg font-semibold mb-2">Function Generator</h3>

      <label className="text-sm block mb-1">Frequency (Hz)</label>
      <input
        type="number"
        min={1}
        max={100000}
        step={1}
        value={frequency}
        onChange={(e) => {
          const val = Number(e.target.value);
          if (!Number.isNaN(val)) setFrequency(val);
        }}
        className="w-full bg-gray-700 text-white p-2 rounded mb-3"
      />

      <label className="text-sm block mb-1">Amplitude (V)</label>
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={amplitude}
        onChange={(e) => {
          const val = Number(e.target.value);
          if (!Number.isNaN(val)) setAmplitude(val);
        }}
        className="w-full bg-gray-700 text-white p-2 rounded mb-3"
      />

      <label className="text-sm block mb-1">Waveform</label>
      <select
        value={waveform}
        onChange={(e) => setWaveform(e.target.value)}
        className="w-full bg-gray-700 text-white p-2 rounded mb-3"
      >
        <option value="sine">Sine</option>
        <option value="square">Square</option>
        <option value="triangle">Triangle</option>
        <option value="sawtooth">Sawtooth</option>
      </select>

      <button
        onClick={generateSignal}
        className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded w-full"
      >
        Generate Signal
      </button>
    </div>
  );
}

export default FunctionGeneratorNode;
