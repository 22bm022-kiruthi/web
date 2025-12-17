import React, { useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

interface KMeansResponse {
  success: boolean;
  labels?: number[];
  centroids?: number[][];
  inertia?: number;
  projection_2d?: number[][];
}

const defaultExample = `[[1.0,2.0],[1.5,1.8],[5.0,8.0],[8.0,8.0],[1.0,0.6],[9.0,11.0]]`;

const KMeansWidget: React.FC = () => {
  const [nClusters, setNClusters] = useState<number>(3);
  const [maxIter, setMaxIter] = useState<number>(300);
  const [input, setInput] = useState<string>(defaultExample);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KMeansResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runKMeans = async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const data = JSON.parse(input);
      const resp = await fetch('http://127.0.0.1:6010/api/analytics/kmeans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, n_clusters: nClusters, max_iter: maxIter }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error || JSON.stringify(json));
      } else {
        setResult(json as KMeansResponse);
      }
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const scatterData = (result?.projection_2d || []).map((p, i) => ({ x: p[0], y: p[1], label: result?.labels?.[i] }));

  return (
    <div className="p-4 w-full">
      <h3 className="text-sm font-semibold mb-2">KMeans Clustering</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="text-xs">Number of clusters
          <input className="ml-2 p-1 border rounded w-20" type="number" value={nClusters} onChange={(e) => setNClusters(parseInt(e.target.value || '1', 10))} />
        </label>
        <label className="text-xs">Max iterations
          <input className="ml-2 p-1 border rounded w-20" type="number" value={maxIter} onChange={(e) => setMaxIter(parseInt(e.target.value || '100', 10))} />
        </label>
      </div>

      <div className="mb-3">
        <div className="text-xs text-gray-600 mb-1">Input data (JSON array of numeric rows)</div>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="w-full h-28 p-2 border rounded text-xs font-mono" />
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={runKMeans} disabled={loading} className="px-3 py-1 bg-blue-600 text-white rounded">
          {loading ? 'Running...' : 'Run KMeans'}
        </button>
        <button onClick={() => setInput(defaultExample)} className="px-3 py-1 border rounded">Reset Example</button>
      </div>

      {error && <div className="text-red-600 text-sm mb-2">{error}</div>}

      {result && (
        <div>
          <div className="mb-2 text-sm">Inertia: <strong>{result.inertia?.toFixed(3)}</strong></div>

          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <ScatterChart>
                <CartesianGrid />
                <XAxis dataKey="x" name="x" />
                <YAxis dataKey="y" name="y" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                {result.labels && (
                  <Scatter name="clusters" data={scatterData} fill="#8884d8" />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default KMeansWidget;
