import React, { useCallback, useRef } from 'react';
import ReactFlow, {
  addEdge,
  Connection,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import CircleNode from './CircleNode';
import widgetRegistry from '../utils/widgetRegistry';

const nodeTypes = { circleNode: CircleNode };

type CustomNodeData = {
  widgetType: string;
  parsedData?: any;
  tableData?: any;
};

const FlowCanvas: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CustomNodeData>[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) =>
      addEdge(
        {
          ...params,
          type: 'straight',
          animated: true,
          style: { stroke: '#f97316', strokeWidth: 2 },
        },
        eds
      )
    );

    // propagate parsed data if available
    if (params.source && params.target) {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === params.target) {
            const src = nds.find((x) => x.id === params.source);
            const parsed = src && (src.data as any)?.parsedData;
            if (parsed) {
              return { ...n, data: { ...n.data, tableData: parsed } } as Node;
            }
          }
          return n;
        })
      );
    }
  }, []);

  const addNode = (typeId: string, position = { x: 100, y: 100 }) => {
    const id = `node-${Date.now()}`;
    const node: Node = {
      id,
      type: 'circleNode',
      position,
      data: { widgetType: typeId },
      width: 80,
      height: 80,
    };
    setNodes((nds) => nds.concat(node));
  };

  return (
    <ReactFlowProvider>
      <div ref={reactFlowWrapper} className="w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onConnect={onConnect}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.Straight}
          fitView
        />
      </div>

      <div className="absolute bottom-4 left-4 z-40">
        {widgetRegistry
          .slice(0, 6)
          .filter((w) => w.id !== 'file-upload' && w.id !== 'custom-code')
          .map((w) => (
            <button key={w.id} onClick={() => addNode(w.id)} className="mr-2 p-2 bg-blue-500 text-white rounded">
              Add {w.name}
            </button>
          ))}
      </div>
    </ReactFlowProvider>
  );
};

export default FlowCanvas;
