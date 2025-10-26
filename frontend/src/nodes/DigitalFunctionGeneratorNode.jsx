import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';

function DigitalFunctionGeneratorNode({ data }) {
  const [bitstream, setBitstream] = useState('');
  const [quantized, setQuantized] = useState([]);

  const handleInputChange = (e) => {
    const value = e.target.value.replace(/[^01]/g, '').slice(0, 8); // only 0s and 1s, max 8 bits
    setBitstream(value);
  };

  const quantize = () => {
    if (bitstream.length !== 8) {
      alert('Please enter exactly 8 bits (0s and 1s)');
      return;
    }

    const quantizedSignal = bitstream.split('').map((bit) => (bit === '1' ? 5 : 0));
    setQuantized(quantizedSignal);

    if (data.onGenerate) {
      data.onGenerate({
        type: 'digital',
        bits: bitstream,
        quantized: quantizedSignal,
      });
    }
  };


  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg w-72 shadow-md">
      <Handle type="source" position={Position.Right} />
      <h3 className="text-lg font-semibold mb-2">Digital Function Generator</h3>

      <input
        type="text"
        value={bitstream}
        onChange={handleInputChange}
        placeholder="Enter 8-bit signal (e.g. 10110010)"
        className="w-full bg-gray-700 text-white p-2 rounded mb-2"
      />

      <button
        onClick={quantize}
        className="bg-pink-600 hover:bg-pink-700 px-3 py-1 rounded w-full"
      >
        Quantize
      </button>

      {quantized.length > 0 && (
        <div className="mt-2 text-sm text-green-400">
          <p>Bits: {bitstream}</p>
        </div>
      )}
    </div>
  );
}

export default DigitalFunctionGeneratorNode;
