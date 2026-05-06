import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
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

const PCAResultsModal: React.FC<PCAResultsModalProps> = ({ isOpen, onClose, pcaResults }) => {
  useEffect(() => {
    if (!isOpen) return;
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  if (!pcaResults || !pcaResults.transformed || pcaResults.transformed.length === 0) {
    if (typeof document === 'undefined') return null;
    const noResultsModal = (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40" style={{ zIndex: 2147483647 }} onClick={onClose}>
        <div className="bg-white rounded-lg shadow-lg p-6 min-w-[400px]" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">PCA Results</h2>
            <button
              className="px-3 py-1 bg-gray-200 rounded text-sm text-gray-700 hover:bg-gray-300"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
            >
              Close
            </button>
          </div>
          <p className="text-gray-600">No PCA results available. Please run PCA analysis first.</p>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
    return createPortal(noResultsModal, document.body);
  }

  const { transformed, explained_variance_ratio, cumulative_variance } = pcaResults;
  const numComponents = explained_variance_ratio.length;

  const screeData = explained_variance_ratio.map((variance, i) => {
    const v = Number(variance) || 0;
    const pct = Number.isFinite(v) ? v * 100 : 0;
    return {
      component: `PC${i + 1}`,
      variance: pct.toFixed(2),
      varianceNum: Number(pct.toFixed(6)),
      cumulative: cumulative_variance ? Number((Number(cumulative_variance[i] || 0) * 100).toFixed(2)) : null,
    };
  });

  // Normalize transformed rows: handle rows that may be objects with PC keys or arrays
  const scatterData = (() => {
    if (!transformed || !transformed.length) return [];
    const first = transformed[0];
    if (typeof first === 'object' && !Array.isArray(first)) {
      return transformed.map((row: any, i: number) => {
        const keys = Object.keys(row);
        const k1 = row.hasOwnProperty('PC1') ? 'PC1' : keys[0];
        const k2 = row.hasOwnProperty('PC2') ? 'PC2' : (keys.length > 1 ? keys[1] : keys[0]);
        const x = Number(row[k1]);
        const y = Number(row[k2]);
        return { PC1: Number.isFinite(x) ? x : 0, PC2: Number.isFinite(y) ? y : 0, index: i };
      });
    }
    // rows are arrays
    return transformed.map((row: any, i: number) => {
      const x = Number(row[0]);
      const y = Number(row[1]);
      return { PC1: Number.isFinite(x) ? x : 0, PC2: Number.isFinite(y) ? y : 0, index: i };
    });
  })();

  const varianceSummary = explained_variance_ratio
    .slice(0, Math.min(5, numComponents))
    .map((v, i) => `PC${i + 1} explains ${(v * 100).toFixed(1)}% variance`)
    .join(', ');

  const totalVariance = cumulative_variance && cumulative_variance.length > 0
    ? (cumulative_variance[Math.min(1, cumulative_variance.length - 1)] * 100).toFixed(1)
    : null;

  if (typeof document === 'undefined') return null;
  // debug: ensure data shapes are visible in console
  try { console.debug('[PCAResultsModal] screeData sample:', screeData, 'scatterData sample:', scatterData.slice(0,5)); } catch (e) {}

  const modal = (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40" style={{ zIndex: 2147483647 }} onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[600px] max-w-[90vw] max-h-[90vh] overflow-auto" style={{ zIndex: 2147483648 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">PCA Analysis Results</h2>
          <button
            className="px-3 py-1 bg-gray-200 rounded text-sm text-gray-700 hover:bg-gray-300"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            aria-label="Close PCA results"
          >
            Close
          </button>
        </div>

        <div className="mb-4 p-4 bg-blue-100 rounded">
          <h3 className="text-md font-bold">Variance Explained</h3>
          <p className="text-sm text-gray-900 font-medium">{varianceSummary}</p>
          {totalVariance && numComponents >= 2 && (
            <p className="text-sm text-gray-800 mt-2">
              First 2 components explain <strong className="text-sm text-blue-700">{totalVariance}%</strong> of total variance
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-100 p-4 rounded">
            <h3 className="text-md font-bold mb-2">Scree Plot</h3>
            <p className="text-xs text-gray-700 mb-2">Variance explained by each principal component</p>
            <div style={{ width: '100%', height: 400 }}>
              <ResponsiveContainer>
                <BarChart data={screeData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="component" />
                  <YAxis label={{ value: 'Variance (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: any) => `${Number(value).toFixed(2)}%`} />
                  <Bar dataKey="varianceNum" name="Variance Explained (%)" barSize={40}>
                    {screeData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-gray-100 p-4 rounded">
            <h3 className="text-md font-bold mb-2">PC1 vs PC2 Scatter</h3>
            <p className="text-xs text-gray-700 mb-2">First two principal components</p>
            <div style={{ width: '100%', height: 400 }}>
              <ResponsiveContainer>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="PC1"
                    name="PC1"
                    type="number"
                    domain={[ 'auto', 'auto' ]}
                    label={{ value: 'PC1', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis
                    dataKey="PC2"
                    name="PC2"
                    type="number"
                    domain={[ 'auto', 'auto' ]}
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

        <div className="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-600">
          <p><strong>Total samples:</strong> {transformed.length}</p>
          <p><strong>Components computed:</strong> {numComponents}</p>
          {pcaResults.used_columns && pcaResults.used_columns.length > 0 && (
            <p><strong>Features used:</strong> {pcaResults.used_columns.slice(0, 5).join(', ')}{pcaResults.used_columns.length > 5 && ` (+ ${pcaResults.used_columns.length - 5} more)`}</p>
          )}
        </div>

        <details className="mt-3 p-3 bg-gray-50 rounded text-xs text-gray-600">
          <summary className="cursor-pointer font-medium">Debug: PCA data preview (first 5 rows)</summary>
          <pre className="whitespace-pre-wrap text-[11px] mt-2" style={{ maxHeight: 200, overflow: 'auto' }}>
            {JSON.stringify({ explained_variance_ratio: explained_variance_ratio.slice(0,10), transformed_sample: transformed.slice(0,5) }, null, 2)}
          </pre>
        </details>

        <div className="mt-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default PCAResultsModal;
