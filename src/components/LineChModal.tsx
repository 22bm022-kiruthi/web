import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface LineChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Record<string, any>[];
  columns: string[];
}

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'
];

import { useEffect } from 'react';

const LineChartModal: React.FC<LineChartModalProps> = ({
  isOpen,
  onClose,
  data,
  columns,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  if (!data || data.length === 0 || columns.length < 1) return <div>No data</div>;

  // Coerce numeric-looking strings into numbers so recharts receives numeric values
  const processedData = React.useMemo(() => {
    if (!data || !data.length) return [] as Record<string, any>[];
    return data.map((row) => {
      const out: Record<string, any> = {};
      Object.keys(row).forEach((k) => {
        const v = row[k];
        if (typeof v === 'string') {
          const t = v.trim();
          if (t !== '' && !Number.isNaN(Number(t))) {
            out[k] = Number(t);
            return;
          }
        }
        out[k] = v;
      });
      return out;
    });
  }, [data]);

  const procColumns = processedData && processedData.length > 0 ? Object.keys(processedData[0]) : columns;

  console.log('[LineChart] ========== MODAL OPENED ==========');
  console.log('[LineChart] Available columns:', procColumns);
  console.log('[LineChart] Data sample:', processedData[0]);

  // Prefer an explicit "x"-like column if present
  // For Raman spectroscopy, prioritize shift/wavenumber columns
  const lowerCols = procColumns.map((c) => (c || '').toLowerCase());
  let xKey: string | null = null;
  
  // First priority: Raman-specific x-axis columns
  const ramanXNames = ['raman shift', 'shift', 'wavenumber', 'shift x axis', 'raman_shift', 'wavenumber_cm'];
  console.log('[LineChart] Searching for X-axis column in priority order...');
  for (const name of ramanXNames) {
    // More robust matching: remove all non-alphanumeric characters for comparison
    const cleanName = name.replace(/[^a-z0-9]/g, '');
    console.log(`[LineChart]   Trying "${name}" (clean: "${cleanName}")...`);
    const matchCol = procColumns.find(c => {
      const cleanCol = c.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matches = cleanCol.includes(cleanName) || cleanName.includes(cleanCol);
      if (matches) console.log(`[LineChart]     ✅ MATCHED: "${c}" (clean: "${cleanCol}")`);
      return matches;
    });
    if (matchCol) {
      xKey = matchCol;
      console.log(`[LineChart] ✅ X-axis auto-selected: "${matchCol}" (matched "${name}")`);
      break;
    }
  }
  
  // Second priority: generic x-axis names
  if (!xKey) {
    const preferNames = ['x', 'index', 'time', 'label', 'idx'];
    for (const name of preferNames) {
      const i = lowerCols.indexOf(name);
      if (i >= 0) {
        xKey = procColumns[i];
        console.log(`[LineChart] X-axis auto-selected: "${xKey}" (generic match)`);
        break;
      }
    }
  }

  // If no explicit x-like column, pick the first NUMERIC column as x
  // Avoid text columns like "Sample name"
  if (!xKey) {
    const firstRow = processedData[0] || {};
    for (const col of procColumns) {
      const v = firstRow[col];
      // Skip if undefined, null, or non-numeric (like "Sample name")
      if (v === undefined || v === null || isNaN(Number(v))) continue;
      xKey = col;
      console.log(`[LineChart] X-axis auto-selected: "${xKey}" (first numeric)`);
      break;
    }
  }
  // final fallback
  if (!xKey) {
    xKey = '___index___';
    console.log(`[LineChart] X-axis fallback to row index`);
  }

  // Choose a single Y column to plot (prefer Raman intensity names first, then common intensity names)
  const lowerColsMap = procColumns.reduce<Record<string, string>>((acc, c) => { acc[c.toLowerCase()] = c; return acc; }, {} as Record<string, string>);
  
  // First priority: Raman-specific intensity columns
  const ramanYNames = ['raman intensity', 'intensity y axis', 'raman_intensity', 'intensity_y_axis', 'intensity'];
  let yKey: string | null = null;
  for (const name of ramanYNames) {
    // More robust matching: remove all non-alphanumeric characters for comparison
    const cleanName = name.replace(/[^a-z0-9]/g, '');
    const matchCol = procColumns.find(c => {
      const cleanCol = c.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanCol.includes(cleanName) || cleanName.includes(cleanCol);
    });
    if (matchCol && matchCol !== xKey) {
      yKey = matchCol;
      console.log(`[LineChart] Y-axis auto-selected: "${matchCol}" (matched "${name}")`);
      break;
    }
  }
  
  // Second priority: generic intensity columns
  if (!yKey) {
    const preferYNames = ['intensity', 'int', 'y', 'signal', 'counts', 'intensity_counts'];
    for (const name of preferYNames) {
      // match exact lower-case keys or substring
      const exact = lowerColsMap[name];
      if (exact) { yKey = exact; break; }
    }
    if (!yKey) {
      // try substring match
      for (const col of procColumns) {
        const lc = col.toLowerCase();
        if (preferYNames.some((p) => lc.includes(p))) { yKey = col; break; }
      }
    }
  }
  if (!yKey) {
    // fallback: pick first numeric column (excluding xKey)
    for (const col of procColumns) {
      if (col === xKey) continue;
      const v = processedData[0][col];
      if (v !== undefined && v !== null && !isNaN(Number(v))) { yKey = col; break; }
    }
  }
  // final fallback: use the first non-x column
  if (!yKey) {
    const others = procColumns.filter((c) => c !== xKey);
    yKey = others.length ? others[0] : null;
  }
  const yKeys = yKey ? [yKey] : [];

  // allow the user to override which columns are used for X and Y in the modal
  const [selectedX, setSelectedX] = useState<string>(xKey as string);
  const [selectedY, setSelectedY] = useState<string | null>(yKey);
  // debug UI removed per user request

  // recompute chartData when selection changes
  const chartData = useMemo(() => {
    const sx = selectedX || '___index___';
    const sy = selectedY || (yKeys.length ? yKeys[0] : null);
    const rows = processedData.map((row: Record<string, any>, idx: number) => {
      const rawX = sx === '___index___' ? idx : (row[sx] !== undefined ? row[sx] : idx);
      const rawY = sy ? row[sy] : undefined;
      const parsedX = (rawX === null || rawX === undefined) ? rawX : (typeof rawX === 'number' ? rawX : (String(rawX).trim() === '' ? rawX : Number(rawX)));
      const parsedY = (rawY === null || rawY === undefined) ? rawY : (typeof rawY === 'number' ? rawY : (String(rawY).trim() === '' ? rawY : Number(rawY)));
      const out: Record<string, any> = { [sx]: Number.isFinite(parsedX) ? parsedX : rawX };
      if (sy) {
        out[sy] = Number.isFinite(parsedY) ? parsedY : (rawY === null || rawY === undefined ? null : rawY);
      }
      return out;
    });
    const isXNumeric = rows.length > 0 && typeof rows[0][sx] === 'number';
    if (isXNumeric) rows.sort((a, b) => (a[sx] as number) - (b[sx] as number));
    // Debug sample to help diagnose empty chart issues
    try { console.debug('[LineChart] chartData sample:', rows.slice(0,3)); } catch (e) { /* ignore */ }
    return rows;
  }, [processedData, selectedX, selectedY]);

  // (chartData is computed via useMemo above)

  // Render modal into document.body to isolate it from parent click handlers
  if (typeof document === 'undefined') return null;

  const modal = (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40" style={{ zIndex: 2147483647, pointerEvents: 'auto' }} onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[600px] max-w-[90vw]" style={{ zIndex: 2147483648 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Line Chart</h2>
          <button
            type="button"
            className="px-3 py-1 bg-gray-200 rounded text-sm text-gray-700 hover:bg-gray-300"
            onMouseDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); console.log('[LineChart] Close button clicked - calling onClose'); onClose(); }}
            aria-label="Close chart"
          >
            Close
          </button>
        </div>
        <div className="mb-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs">X axis:</label>
            <select value={selectedX} onChange={(e) => setSelectedX(e.target.value)} className="border rounded px-2 py-1 text-sm">
              {/* include index fallback as option */}
              <option value={xKey as string}>{`Auto: ${xKey}`}</option>
              {columns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value={'___index___'}>index</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs">Y axis:</label>
            <select value={selectedY || ''} onChange={(e) => setSelectedY(e.target.value || null)} className="border rounded px-2 py-1 text-sm">
              <option value={yKeys.length ? yKeys[0] : ''}>{`Auto: ${yKeys.length ? yKeys[0] : 'none'}`}</option>
              {columns.filter((c) => c !== selectedX).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={selectedX as string} type={chartData.length > 0 && typeof chartData[0][selectedX as string] === 'number' ? 'number' : 'category'} />
              <YAxis />
              <Tooltip />
              <Legend />
              {selectedY && (
                <Line
                  key={selectedY}
                  type="monotone"
                  dataKey={selectedY}
                  stroke={COLORS[0]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={true}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Debug UI removed */}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default LineChartModal;