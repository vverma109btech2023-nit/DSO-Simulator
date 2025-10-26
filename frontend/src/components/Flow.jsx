import { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import FunctionGeneratorNode from './../nodes/FunctionGeneratorNode.jsx';
import DigitalFunctionGeneratorNode from './../nodes/DigitalFunctionGeneratorNode.jsx';
import ModulatorNode from './../nodes/ModulatorNode.jsx';
import OscilloscopeNode from './../nodes/OscilloscopeNode.jsx';

function Flow() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  // MOVE: define onModulate first so onGenerate can reference it
  const onModulate = useCallback((modulatedSignal) => {
    console.log('Modulated signal:', modulatedSignal);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === 'scope'
          ? {
              ...node,
              data: {
                ...node.data,
                signal: modulatedSignal,
              },
            }
          : node
      )
    );
  }, []);

  // Update generator node state AND propagate to targets already connected
  const onGenerate = useCallback(
    (signal) => {
      console.log('Digital Generator emitted:', signal);

      setNodes((nds) => {
        // 1) update the generator node itself (store its signal)
        const updated = nds.map((node) =>
          node.id === 'dg' ? { ...node, data: { ...node.data, signal } } : node
        );

        // 2) propagate to any node that has an incoming edge from 'dg'
        edges.forEach((edge) => {
          if (edge.source === 'dg') {
            const idx = updated.findIndex((n) => n.id === edge.target);
            if (idx !== -1) {
              const target = updated[idx];
              // If modulator, set a message field (your ModulatorNode may expect message)
              if (target.type === 'modulator' || target.id === 'mod') {
                updated[idx] = {
                  ...target,
                  data: { ...target.data, message: signal, onModulate },
                };
              } else {
                // otherwise set the generic signal field so oscilloscopes and others see it
                updated[idx] = {
                  ...target,
                  data: { ...target.data, signal },
                };
              }
            }
          }
        });

        return updated;
      });
    },
    [edges, onModulate]
  );

  // ✅ Oscilloscope receives analog signal only if connected
  const onAnalogGenerate = useCallback(
    (signal) => {
      const isConnected = edges.some(
        (edge) => edge.source === 'fg' && edge.target === 'scope'
      );

      if (!isConnected) {
        console.log('Function Generator not connected to Oscilloscope — signal ignored');
        return;
      }

      console.log('Function Generator emitted:', signal);
      setNodes((nds) =>
        nds.map((node) =>
          node.id === 'scope'
            ? {
                ...node,
                data: {
                  ...node.data,
                  signal,
                },
              }
            : node
        )
      );
    },
    [edges]
  );

  // ✅ Initialize nodes AFTER callbacks are defined
  useEffect(() => {
    setNodes([
      {
        id: 'fg',
        type: 'functionGenerator',
        position: { x: 100, y: 100 },
        data: { label: 'Function Generator', onGenerate: onAnalogGenerate },
      },
      {
        id: 'dg',
        type: 'digitalGenerator',
        position: { x: 100, y: 300 },
        data: { label: 'Digital Generator', onGenerate },
      },
      {
        id: 'mod',
        type: 'modulator',
        position: { x: 400, y: 100 },
        data: { label: 'Modulator', onModulate },
      },
      {
        id: 'scope',
        type: 'oscilloscope',
        position: { x: 700, y: 100 },
        data: { label: 'Oscilloscope' },
      },
    ]);
  }, [onAnalogGenerate, onGenerate, onModulate]);

  const nodeTypes = {
    functionGenerator: FunctionGeneratorNode,
    digitalGenerator: DigitalFunctionGeneratorNode,
    modulator: ModulatorNode,
    oscilloscope: OscilloscopeNode,
  };

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, animated: true }, eds));

    setNodes((nds) => {
      const sourceNode = nds.find((n) => n.id === params.source);
      const signal = sourceNode?.data?.signal;

      return nds.map((node) => {
        if (node.id === params.target) {
          const inputType = params.targetHandle || 'signal';
          return {
            ...node,
            data: {
              ...node.data,
              [inputType]: signal,
              onModulate,
            },
          };
        }
        return node;
      });
    });
  }, [onModulate]);



  return (
    <div style={{ height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        nodeTypes={nodeTypes}
      >
        <Background color="skyblue" variant="lines" />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default Flow;
