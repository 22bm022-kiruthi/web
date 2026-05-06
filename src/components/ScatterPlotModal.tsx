import React from 'react';

interface ScatterPlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Record<string, any>[];
  columns: string[];
}

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'
];

const ScatterPlotModal = React.memo<ScatterPlotModalProps>(({
  isOpen,
  onClose,
  data,
  columns,
}) => {
  const modalRef = React.useRef<HTMLDivElement>(null);

  // Handle close - force immediate DOM hide
  const handleClose = React.useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    console.log('[ScatterPlotModal] Closing modal - hiding immediately');
    
    // Force immediate hide via DOM manipulation
    if (modalRef.current) {
      modalRef.current.style.display = 'none';
    }
    
    // Then call onClose after a tick
    setTimeout(() => onClose(), 0);
  }, [onClose]);

  // Pre-process data to avoid re-mapping on every render - always call hooks
  const { points: scatterData, xKey: chosenXKey, yKey: chosenYKey } = React.useMemo(() => {
    if (!data || data.length === 0) return { points: [], xKey: 'x', yKey: 'y' };

    // If rows already include `x`/`y`, use them. Otherwise infer two numeric columns
    const firstRow = data[0] || {};
    const availableKeys = (columns && columns.length > 0) ? columns : Object.keys(firstRow);

    // Prefer common spectral names first (match BarChartModal logic)
    const prefer = (keys: string[]) => {
      for (const k of keys) {
        const idx = availableKeys.findIndex(a => a.toLowerCase() === k.toLowerCase());
        if (idx >= 0) return availableKeys[idx];
      }
      return null;
    };

    const spectralX = prefer(['wavenumber', 'raman shift', 'position', 'shift', 'x']);
    const spectralY = prefer(['intensity', 'y', 'value', 'counts']);

    let xKey = 'x';
    let yKey = 'y';

    if (spectralX && spectralY) {
      xKey = spectralX;
      yKey = spectralY;
    } else {
      const hasX = Object.prototype.hasOwnProperty.call(firstRow, 'x');
      const hasY = Object.prototype.hasOwnProperty.call(firstRow, 'y');
      if (hasX && hasY) {
        xKey = 'x';
        yKey = 'y';
      } else {
        // pick two numeric-like keys from availableKeys (based on first row values)
        const numericCandidates = availableKeys.filter((k) => {
          const v = firstRow[k];
          return v !== undefined && v !== null && !Number.isNaN(Number(v));
        });
        if (numericCandidates.length >= 2) {
          xKey = numericCandidates[0];
          yKey = numericCandidates[1];
        } else if (numericCandidates.length === 1) {
          xKey = numericCandidates[0];
          yKey = numericCandidates[0];
        } else {
          // fallback to first two keys or keep x/y
          xKey = availableKeys[0] ?? 'x';
          yKey = availableKeys[1] ?? availableKeys[0] ?? 'y';
        }
      }
    }

    // Normalize numeric parsing and drop invalid points
    const processedRaw = data.map((row, i) => ({
      rawX: row[xKey] ?? row.x,
      rawY: row[yKey] ?? row.y,
      cluster: row.cluster ?? row.cluster_id ?? 0,
      index: row.index ?? i,
    }));

    const processed = processedRaw.map((r) => ({
      x: Number(r.rawX),
      y: Number(r.rawY),
      cluster: r.cluster ?? 0,
      index: r.index
    })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

    // Log chosen keys and a small sample of values for debugging
    console.debug('[ScatterPlotModal] chosen keys:', { xKey, yKey, points: processed.length });
    console.debug('[ScatterPlotModal] sample points:', processed.slice(0, 10));
    return { points: processed, xKey, yKey };
  }, [data, columns]);

  // Calculate stable axis domains once - ROUND ALL VALUES to prevent floating point drift - always call hooks
  const { xMin, xMax, yMin, yMax, xTicks, yTicks } = React.useMemo(() => {
    if (scatterData.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1, xTicks: [0, 1], yTicks: [0, 1] };
    const xValues = scatterData.map(d => d.x);
    const yValues = scatterData.map(d => d.y);
    const rawXMin = Math.min(...xValues);
    const rawXMax = Math.max(...xValues);
    const rawYMin = Math.min(...yValues);
    const rawYMax = Math.max(...yValues);
    
    // Round to prevent floating-point drift
    const xMin = Math.round(rawXMin * 1000) / 1000;
    const xMax = Math.round(rawXMax * 1000) / 1000;
    const yMin = Math.round(rawYMin * 1000) / 1000;
    const yMax = Math.round(rawYMax * 1000) / 1000;
    
    // Generate exactly 5 fixed tick values for each axis - ALL ROUNDED
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const xTicks = [
      Math.round((xMin - xRange * 0.1) * 1000) / 1000,
      Math.round((xMin + xRange * 0.15) * 1000) / 1000,
      Math.round((xMin + xRange * 0.5) * 1000) / 1000,
      Math.round((xMin + xRange * 0.85) * 1000) / 1000,
      Math.round((xMax + xRange * 0.1) * 1000) / 1000
    ];
    const yTicks = [
      Math.round((yMin - yRange * 0.1) * 1000) / 1000,
      Math.round((yMin + yRange * 0.15) * 1000) / 1000,
      Math.round((yMin + yRange * 0.5) * 1000) / 1000,
      Math.round((yMin + yRange * 0.85) * 1000) / 1000,
      Math.round((yMax + yRange * 0.1) * 1000) / 1000
    ];
    
    return { xMin, xMax, yMin, yMax, xTicks, yTicks };
  }, [scatterData]);

  // Create stable tick formatter - memoized to same reference
  const tickFormatter = React.useCallback((value: number) => {
    return value.toFixed(3);
  }, []);

  // Memoize domain values to prevent recalculation
  const xDomain = React.useMemo(() => [
    Math.round((xMin - (xMax - xMin) * 0.1) * 1000) / 1000,
    Math.round((xMax + (xMax - xMin) * 0.1) * 1000) / 1000
  ], [xMin, xMax]);

  const yDomain = React.useMemo(() => [
    Math.round((yMin - (yMax - yMin) * 0.1) * 1000) / 1000,
    Math.round((yMax + (yMax - yMin) * 0.1) * 1000) / 1000
  ], [yMin, yMax]);

  // NOW check conditions AFTER all hooks have been called
  if (!isOpen) {
    return null;
  }
  
  if (!data || data.length === 0) {
    return (
      <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black bg-opacity-40">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-semibold mb-4">No Data</h2>
          <p>No scatter plot data available.</p>
          <button onMouseDown={handleClose} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Close</button>
        </div>
      </div>
    );
  }

  // Use row index as X, plot all columns as series
  return (
    <div 
      ref={modalRef}
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 p-4"
      style={{ pointerEvents: 'auto', zIndex: 9999999, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-lg p-8" 
        style={{ pointerEvents: 'auto', maxWidth: '1200px', width: 'auto', maxHeight: '90vh', overflow: 'auto', zIndex: 10000000, position: 'relative' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Clustered Scatter Plot ({scatterData.length} points)</h2>
          <button
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 font-semibold"
            style={{ pointerEvents: 'auto', cursor: 'pointer', zIndex: 10000001, position: 'relative' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleClose(e);
            }}
            type="button"
          >
            Close
          </button>
        </div>
        <div style={{ width: '1000px', height: '600px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {(() => {
            // Simple SVG scatter plot
            const xs = scatterData.map(d => d.x);
            const ys = scatterData.map(d => d.y);
            const xMin = Math.min(...xs);
            const xMax = Math.max(...xs);
            const yMin = Math.min(...ys);
            const yMax = Math.max(...ys);
            
            const width = 900;
            const height = 550;
            const padding = 70;
            
            // Scale functions
            const scaleX = (x: number) => padding + ((x - xMin) / (xMax - xMin || 1)) * (width - 2 * padding);
            const scaleY = (y: number) => height - padding - ((y - yMin) / (yMax - yMin || 1)) * (height - 2 * padding);
            
            // Group by cluster
            const clusters = new Map<number, typeof scatterData>();
            scatterData.forEach(p => {
              const c = p.cluster ?? 0;
              if (!clusters.has(c)) clusters.set(c, []);
              clusters.get(c)!.push(p);
            });
            
            const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
            
            return (
              <svg width={width} height={height} style={{ background: '#fafafa' }}>
                {/* Grid */}
                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#ddd" strokeWidth="1" />
                <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#ddd" strokeWidth="1" />
                
                {/* Axes */}
                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#666" strokeWidth="2" />
                <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#666" strokeWidth="2" />
                
                {/* Points by cluster */}
                {Array.from(clusters.entries()).map(([clusterId, points]) => (
                  <g key={clusterId}>
                    {points.map((p, i) => (
                      <circle
                        key={i}
                        cx={scaleX(p.x)}
                        cy={scaleY(p.y)}
                        r={6}
                        fill={COLORS[clusterId % COLORS.length]}
                        opacity={0.7}
                        stroke="#fff"
                        strokeWidth="1"
                      />
                    ))}
                  </g>
                ))}
                
                {/* Tick marks and labels (X) */}
                {xTicks && xTicks.map((tx, i) => {
                  const px = scaleX(tx);
                  return (
                    <g key={`xtick-${i}`}>
                      <line x1={px} y1={height - padding} x2={px} y2={height - padding + 6} stroke="#333" strokeWidth={1} />
                      <text x={px} y={height - padding + 20} textAnchor="middle" fontSize={12} fill="#333">{tickFormatter(tx)}</text>
                    </g>
                  );
                })}

                {/* Tick marks and labels (Y) */}
                {yTicks && yTicks.map((ty, i) => {
                  const py = scaleY(ty);
                  return (
                    <g key={`ytick-${i}`}>
                      <line x1={padding - 6} y1={py} x2={padding} y2={py} stroke="#333" strokeWidth={1} />
                      <text x={padding - 10} y={py + 4} textAnchor="end" fontSize={12} fill="#333">{tickFormatter(ty)}</text>
                    </g>
                  );
                })}

                {/* Axis labels */}
                <text x={width / 2} y={height - 20} textAnchor="middle" fontSize="14" fontWeight="600" fill="#333">{(typeof chosenXKey === 'string' && chosenXKey.length > 0) ? chosenXKey : 'X'}</text>
                <text x={25} y={height / 2} textAnchor="middle" fontSize="14" fontWeight="600" fill="#333" transform={`rotate(-90 25 ${height / 2})`}>{(typeof chosenYKey === 'string' && chosenYKey.length > 0) ? chosenYKey : 'Y'}</text>
                
                {/* Legend */}
                <g transform={`translate(${width - 100}, 20)`}>
                  {Array.from(clusters.keys()).map((clusterId, i) => (
                    <g key={clusterId} transform={`translate(0, ${i * 20})`}>
                      <circle cx={8} cy={8} r={5} fill={COLORS[clusterId % COLORS.length]} opacity={0.7} />
                      <text x={20} y={12} fontSize="12" fill="#333">Cluster {clusterId}</text>
                    </g>
                  ))}
                </g>
              </svg>
            );
          })()}
        </div>
      </div>
    </div>
  );
});

ScatterPlotModal.displayName = 'ScatterPlotModal';

export default ScatterPlotModal;