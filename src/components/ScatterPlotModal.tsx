import React from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface ScatterPlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Record<string, any>[];
  columns: string[];
}

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'
];

const ScatterPlotModal: React.FC<ScatterPlotModalProps> = ({
  isOpen,
  onClose,
  data,
  columns,
}) => {
  console.log('[ScatterPlotModal] Rendering with:', { isOpen, dataLength: data?.length, columns });
  
  if (!isOpen) {
    console.log('[ScatterPlotModal] Not open, returning null');
    return null;
  }
  
  if (!data || data.length === 0) {
    console.log('[ScatterPlotModal] No data available');
    return (
      <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black bg-opacity-40">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-semibold mb-4">No Data</h2>
          <p>No scatter plot data available.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Close</button>
        </div>
      </div>
    );
  }

  // Pre-process data to avoid re-mapping on every render
  const scatterData = React.useMemo(() => {
    console.log('[ScatterPlotModal] RAW data received:', data);
    console.log('[ScatterPlotModal] First 3 items:', data.slice(0, 3));
    console.log('[ScatterPlotModal] Columns:', columns);
    
    // Data is already in the format { x, y, index, cluster }
    // Just ensure numbers are properly formatted
    const processed = data.map((row, i) => {
      const point = {
        x: Number(row.x ?? 0),
        y: Number(row.y ?? 0),
        cluster: row.cluster ?? 0,
        index: row.index ?? i
      };
      return point;
    });
    console.log('[ScatterPlotModal] Processed points:', processed);
    return processed;
  }, [data, columns]);

  console.log('[ScatterPlotModal] Final scatter data:', scatterData.length, 'points');
  if (scatterData.length > 0) {
    console.log('[ScatterPlotModal] X range:', Math.min(...scatterData.map(d => d.x)), 'to', Math.max(...scatterData.map(d => d.x)));
    console.log('[ScatterPlotModal] Y range:', Math.min(...scatterData.map(d => d.y)), 'to', Math.max(...scatterData.map(d => d.y)));
  }

  // Use row index as X, plot all columns as series
  return (
    <div 
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black bg-opacity-40"
      style={{ pointerEvents: 'auto' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[600px] max-w-[90vw] z-[10051]" style={{ pointerEvents: 'auto' }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Clustered Scatter Plot ({scatterData.length} points)</h2>
          <button
            className="text-gray-500 hover:text-red-500 text-xl font-bold"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            ×
          </button>
        </div>
        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" name="PC1" type="number" domain={['dataMin', 'dataMax']} label={{ value: "PC1", position: "insideBottom", offset: -5 }} />
              <YAxis dataKey="y" name="PC2" type="number" domain={['dataMin', 'dataMax']} label={{ value: "PC2", angle: -90, position: "insideLeft" }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              <Scatter
                name="Clustered Data"
                data={scatterData}
                fill="#8884d8"
                shape="circle"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ScatterPlotModal;