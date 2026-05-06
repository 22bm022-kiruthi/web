import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Cell, ComposedChart
} from 'recharts';

interface BarChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Record<string, any>[];
  columns: string[];
}

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'
];

const MAX_POINTS = 2000;

function sampleData(rows: Record<string, any>[], maxPoints = MAX_POINTS) {
  if (!rows || rows.length <= maxPoints) return rows;
  const step = Math.ceil(rows.length / maxPoints);
  const out: Record<string, any>[] = [];
  for (let i = 0; i < rows.length; i += step) out.push(rows[i]);
  return out;
}

// When rendering bars for large numeric-X spectral data, aggregate into bins
function binByX(rows: Record<string, any>[], xKey: string, yKey: string, targetBins = 800) {
  if (!rows || rows.length === 0) return [];
  const xs = rows.map(r => Number(r[xKey])).filter(v => Number.isFinite(v));
  if (xs.length === 0) return [];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const bins = Math.max(1, Math.min(targetBins, rows.length));
  const binSize = (maxX - minX) / bins || 1;
  const accum: { sum: number; count: number; xSum: number }[] = new Array(bins).fill(null).map(() => ({ sum: 0, count: 0, xSum: 0 }));
  for (const r of rows) {
    const xv = Number(r[xKey]);
    const yv = Number(r[yKey]);
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((xv - minX) / binSize)));
    accum[idx].sum += yv;
    accum[idx].count += 1;
    accum[idx].xSum += xv;
  }
  const out: Record<string, any>[] = [];
  for (let i = 0; i < bins; i++) {
    if (accum[i].count === 0) continue;
    out.push({ x: accum[i].xSum / accum[i].count, y: accum[i].sum / accum[i].count });
  }
  return out;
}

const BarChartModal: React.FC<BarChartModalProps> = ({
  isOpen,
  onClose,
  data,
  columns,
}) => {
  const [viewMode, setViewMode] = useState<'bar' | 'line'>('bar');

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [onClose]);

  if (!isOpen) return null;
  if (!data || data.length === 0 || columns.length < 1) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[300px] max-w-[90vw]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Bar Chart</h2>
          <button className="px-3 py-1 bg-gray-200 rounded text-sm text-gray-700 hover:bg-gray-300" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>Close</button>
        </div>
        <div className="p-4">No data</div>
      </div>
    </div>
  );

  // If data is very large, down-sample to keep the browser responsive
  const sampled = sampleData(data, MAX_POINTS);

  // Detect spectral two-column case (common: wavenumber/intensity)
  const lowerCols = columns.map(c => c.toLowerCase());
  const hasWavenumber = lowerCols.includes('wavenumber') || lowerCols.includes('raman shift') || lowerCols.includes('position') || lowerCols.includes('x');
  const hasIntensity = lowerCols.includes('intensity') || lowerCols.includes('y') || lowerCols.includes('value');

  const isSpectralTwoColumn = columns.length >= 2 && hasWavenumber && hasIntensity;
  // Choose view mode for spectral data: default to 'bar' to meet user's request

  if (isSpectralTwoColumn) {
    // prefer explicit keys from original columns array
    const xIdx = lowerCols.indexOf('wavenumber') >= 0 ? lowerCols.indexOf('wavenumber') : (lowerCols.indexOf('x') >= 0 ? lowerCols.indexOf('x') : 0);
    const yIdx = lowerCols.indexOf('intensity') >= 0 ? lowerCols.indexOf('intensity') : (lowerCols.indexOf('y') >= 0 ? lowerCols.indexOf('y') : 1);
    const xKey = columns[xIdx] ?? columns[0];
    const yKey = columns[yIdx] ?? columns[1];
    // build numeric rows and down-sample
    const numericRows = sampled.map((r) => ({ [xKey]: Number(r[xKey]), [yKey]: Number(r[yKey]) }));
    const chartRows = sampleData(numericRows, MAX_POINTS);
    // For bar rendering, if we still have many points, bin them to avoid huge SVG DOM
    const needBinning = chartRows.length > 1200;
    const binned = needBinning ? binByX(chartRows as any, xKey, yKey, 800) : chartRows.map(r => ({ x: r[xKey], y: r[yKey] }));

    // Compute stable Y domain to avoid axis rescaling/flicker
    const yVals = (needBinning ? binned.map(b => Number(b.y)) : chartRows.map(r => Number(r[yKey] || r[y]))).filter(v => Number.isFinite(v));
    const rawYMin = yVals.length ? Math.min(...yVals) : 0;
    const rawYMax = yVals.length ? Math.max(...yVals) : 1;
    const yRange = rawYMax - rawYMin || Math.abs(rawYMax) || 1;
    const yPad = yRange * 0.05;
    const yDomain = [Math.round((rawYMin - yPad) * 1e6) / 1e6, Math.round((rawYMax + yPad) * 1e6) / 1e6];

    const formatTick = (v: any) => {
      if (!Number.isFinite(Number(v))) return String(v);
      const n = Number(v);
      if (Math.abs(n) >= 1) return n.toFixed(3).replace(/\.0+$|(?<=\.[0-9]*?)0+$/,'');
      return n.toExponential(3);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
        <div className="bg-white rounded-lg shadow-lg p-6 min-w-[600px] max-w-[95vw]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Spectral Chart</h2>
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-600 mr-2">View:</div>
              <button
                className={`px-2 py-1 rounded ${viewMode === 'bar' ? 'bg-gray-200' : 'bg-white'}`}
                onMouseDown={() => setViewMode('bar')}
              >Bar</button>
              <button
                className={`px-2 py-1 rounded ${viewMode === 'line' ? 'bg-gray-200' : 'bg-white'}`}
                onMouseDown={() => setViewMode('line')}
              >Line</button>
                <button className="px-3 py-1 bg-gray-200 rounded text-sm text-gray-700 hover:bg-gray-300" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>Close</button>
            </div>
          </div>
          <div style={{ width: '100%', height: 420 }}>
            <ResponsiveContainer>
              {viewMode === 'bar' ? (
                  // Use ComposedChart with binned data for performance
                  <ComposedChart data={binned}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="x" type="number" name={xKey} domain={["dataMin", "dataMax"]} tickFormatter={(v) => Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : String(v)} />
                    <YAxis name={yKey} domain={yDomain} tickFormatter={formatTick} />
                    <Tooltip formatter={(value: any) => (Number.isFinite(Number(value)) ? String(value) : value)} />
                    <Bar dataKey="y" fill={COLORS[0]} barSize={Math.max(1, Math.floor(800 / (binned.length || 1)))} isAnimationActive={false} />
                  </ComposedChart>
                ) : (
                  <LineChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey={xKey} type="number" name={xKey} domain={["dataMin", "dataMax"]} tickFormatter={(v) => Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : String(v)} />
                    <YAxis name={yKey} domain={yDomain} tickFormatter={formatTick} />
                    <Tooltip formatter={(value: any) => (Number.isFinite(Number(value)) ? String(value) : value)} />
                    <Line type="monotone" dataKey={yKey} stroke="#8884d8" dot={false} isAnimationActive={false} />
                  </LineChart>
                )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // Default: bar chart with sampled rows
  const chartData = sampled.map((row, i) => {
    const obj: Record<string, number> = { index: i };
    columns.forEach(col => { obj[col] = Number(row[col]); });
    return obj;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[600px] max-w-[95vw]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Bar Chart</h2>
          <button className="px-3 py-1 bg-gray-200 rounded text-sm text-gray-700 hover:bg-gray-300" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>Close</button>
        </div>
        <div style={{ width: '100%', height: 420 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="index" label={{ value: 'Row', position: 'insideBottom', offset: -5 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              {columns.map((key, idx) => (
                <Bar key={key} dataKey={key} fill={COLORS[idx % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default BarChartModal;