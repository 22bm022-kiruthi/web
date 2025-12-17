import React from 'react';
import {
  BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

interface PCAResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pcaResults: {
    transformed: Array<Record<string, number>>;
    explained_variance_ratio: number[];
    cumulative_variance: number[];
    components_matrix?: number[][];
    used_columns?: string[];
  } | null;
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const PCAResultsModal: React.FC<PCAResultsModalProps> = ({
  isOpen,
  onClose,
  pcaResults,
}) => {
  console.log('[PCAResultsModal] isOpen:', isOpen, 'pcaResults:', pcaResults);
  if (!isOpen) return null;
  if (!pcaResults || !pcaResults.transformed || pcaResults.transformed.length === 0) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-40" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white rounded-lg shadow-lg p-6 min-w-[400px]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">PCA Results</h2>
            <button
              className="text-gray-500 hover:text-red-500 text-xl font-bold"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <p className="text-gray-600">No PCA results available. Please run PCA analysis first.</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const { transformed, explained_variance_ratio, cumulative_variance } = pcaResults;
  const numComponents = explained_variance_ratio.length;

  // Prepare scree plot data
  const screeData = explained_variance_ratio.map((variance, i) => ({
    component: `PC${i + 1}`,
    variance: (variance * 100).toFixed(2),
    varianceNum: variance * 100,
    cumulative: cumulative_variance ? (cumulative_variance[i] * 100).toFixed(2) : null,
  }));

  // Prepare 2D scatter data (PC1 vs PC2)
  const scatterData = transformed.map((row, i) => ({
    PC1: row.PC1 || 0,
    PC2: row.PC2 || 0,
    index: i,
  }));

  // Build variance summary text
  const varianceSummary = explained_variance_ratio
    .slice(0, Math.min(5, numComponents))
    .map((v, i) => `PC${i + 1} explains ${(v * 100).toFixed(1)}% variance`)
    .join(', ');

  const totalVariance = cumulative_variance && cumulative_variance.length > 0
    ? (cumulative_variance[Math.min(1, cumulative_variance.length - 1)] * 100).toFixed(1)
    : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-70 overflow-auto p-2" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-[99vw] h-[99vh] overflow-y-auto relative z-[10000]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-5xl font-extrabold text-gray-900">PCA Analysis Results</h2>
          <button
            className="text-gray-500 hover:text-red-600 text-5xl font-bold leading-none px-4"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Variance Summary Text */}
        <div className="mb-10 p-8 bg-blue-100 rounded-xl border-4 border-blue-400">
          <h3 className="text-4xl font-extrabold text-gray-900 mb-4">Variance Explained</h3>
          <p className="text-2xl text-gray-900 font-bold">{varianceSummary}</p>
          {totalVariance && numComponents >= 2 && (
            <p className="text-2xl text-gray-800 mt-3">
              First 2 components explain <strong className="text-3xl text-blue-700">{totalVariance}%</strong> of total variance
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Scree Plot */}
          <div className="bg-gray-100 p-8 rounded-xl border-4 border-gray-400">
            <h3 className="text-4xl font-extrabold text-gray-900 mb-6">Scree Plot</h3>
            <p className="text-xl text-gray-700 mb-4 font-bold">Variance explained by each principal component</p>
            <div style={{ width: '100%', height: 600 }}>
              <ResponsiveContainer>
                <BarChart data={screeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="component" />
                  <YAxis label={{ value: 'Variance (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: any) => `${Number(value).toFixed(2)}%`} />
                  <Bar dataKey="varianceNum" name="Variance Explained (%)">
                    {screeData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2D Scatter Plot (PC1 vs PC2) */}
          <div className="bg-gray-100 p-8 rounded-xl border-4 border-gray-400">
            <h3 className="text-4xl font-extrabold text-gray-900 mb-6">PC1 vs PC2 Scatter</h3>
            <p className="text-xl text-gray-700 mb-4 font-bold">First two principal components</p>
            <div style={{ width: '100%', height: 600 }}>
              <ResponsiveContainer>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="PC1" 
                    name="PC1" 
                    type="number"
                    domain={['auto', 'auto']}
                    label={{ value: 'PC1', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis 
                    dataKey="PC2" 
                    name="PC2" 
                    type="number"
                    domain={['auto', 'auto']}
                    label={{ value: 'PC2', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter 
                    name="Samples" 
                    data={scatterData} 
                    fill="#8884d8"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-600">
          <p><strong>Total samples:</strong> {transformed.length}</p>
          <p><strong>Components computed:</strong> {numComponents}</p>
          {pcaResults.used_columns && pcaResults.used_columns.length > 0 && (
            <p><strong>Features used:</strong> {pcaResults.used_columns.slice(0, 5).join(', ')}
              {pcaResults.used_columns.length > 5 && ` (+ ${pcaResults.used_columns.length - 5} more)`}
            </p>
          )}
        </div>

        {/* Close Button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PCAResultsModal;
