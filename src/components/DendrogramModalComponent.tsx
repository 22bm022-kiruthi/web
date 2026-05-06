import React, { useMemo, useState } from 'react';

export default function DendrogramModalComponent({
  isOpen,
  onClose,
  linkage,
  n,
  heights,
  onCut,
  initialK,
  allowRenderFull,
  onOpenScatter,
}: {
  isOpen: boolean;
  onClose: () => void;
  linkage: Array<[number, number, number, number]>;
  n: number;
  heights: number[];
  onCut: (k: number) => void;
  initialK?: number;
  allowRenderFull?: boolean;
  onOpenScatter?: () => void;
}) {
  const modalRef = React.useRef<HTMLDivElement>(null);
  const [k, setK] = useState<number>(initialK || Math.max(2, Math.min(n, 3)));

  const handleClose = React.useCallback(() => {
    if (modalRef.current) {
      modalRef.current.style.display = 'none';
    }
    setTimeout(() => onClose(), 0);
  }, [onClose]);

  console.log('[Dendrogram] n=', n, 'linkage length=', linkage?.length, 'heights=', heights);
  if (linkage && linkage.length > 0) {
    console.log('[Dendrogram] First 3 linkages:', linkage.slice(0, 3));
    console.log('[Dendrogram] All distances:', linkage.map(l => l[2]));
  }

  const maxH = heights && heights.length ? Math.max(...heights) : 1;
  console.log('[Dendrogram] maxH=', maxH);
  const width = Math.min(1200, Math.max(600, n * 12));
  const height = Math.max(240, (heights?.length || 0) * 12 + 120);

  const tree = useMemo(() => {
    const nodes = new Map<number, any>();
    for (let i = 0; i < n; i++) nodes.set(i, { id: i, children: [], members: [i], dist: 0 });
    for (let m = 0; m < (linkage || []).length; m++) {
      const [a, b, d] = linkage[m];
      const newId = n + m;
      const left = nodes.get(a) || { id: a, children: [], members: [a], dist: 0 };
      const right = nodes.get(b) || { id: b, children: [], members: [b], dist: 0 };
      const merged = { id: newId, children: [left, right], members: (left.members || []).concat(right.members || []), dist: d };
      nodes.set(newId, merged);
    }
    return nodes;
  }, [linkage, n]);

  const leafIds = Array.from({ length: n }, (_, i) => i);
  const leafX = new Map<number, number>();
  const margin = 40;
  leafIds.forEach((id, idx) => {
    const x = margin + (idx * (width - margin * 2)) / Math.max(1, n - 1);
    leafX.set(id, x);
  });

  const positions = new Map<number, { x: number; y: number }>();
  const computePos = (node: any) => {
    if (!node) return { x: 0, y: height - 40 };
    if (!node.children || node.children.length === 0) {
      const x = leafX.get(node.id) || 0;
      const y = height - 40;
      positions.set(node.id, { x, y });
      return { x, y };
    }
    const left = computePos(node.children[0]);
    const right = computePos(node.children[1]);
    const x = (left.x + right.x) / 2;
    const y = height - 40 - ((node.dist || 0) / Math.max(maxH, 1)) * (height - 120);
    positions.set(node.id, { x, y });
    return { x, y };
  };
  const rootId = n + Math.max(0, (linkage || []).length - 1);
  const root = tree.get(rootId);
  if (isOpen && root) computePos(root);

  if (!isOpen) return null;
  const MAX_RENDER_LEAVES = 800;
  const canRenderFull = typeof allowRenderFull === 'boolean' ? allowRenderFull : (n <= MAX_RENDER_LEAVES);

  if (!canRenderFull) {
    return (
      <div ref={modalRef} className="fixed inset-0 z-[10050] flex items-center justify-center bg-black bg-opacity-40">
      <div 
        className="bg-white rounded-lg shadow-lg p-4 min-w-[480px] max-w-[95vw] max-h-[90vh] overflow-auto z-[10051]"
        style={{ pointerEvents: 'auto' }}
      >
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">Dendrogram</h3>
            <div>
              <button 
                type="button"
                className="px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 cursor-pointer" 
                style={{ pointerEvents: 'auto' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleClose();
                }}
              >
                Close
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-700 mb-3">The dataset contains {n} leaves which is too large to render as a full SVG in the browser without freezing the page.</div>
          <div className="flex gap-2">
            <button 
              type="button"
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer" 
              style={{ pointerEvents: 'auto' }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClose();
                alert('✓ Clustering Complete!\n\n' +
                      'Your data has been clustered into ' + (initialK || 3) + ' groups.\n\n' +
                      'To view the results:\n' +
                      '1. Check the "Cluster" column in the data table below\n' +
                      '2. Click "Export CSV" to download all clustered data\n' +
                      '3. Use "Full Scatter" or "Full Table" buttons for other views\n\n' +
                      'Note: Full dendrogram visualization is disabled for large datasets (>50 samples) to prevent browser freezing.');
              }}
            >
              View Results Guide
            </button>
            <button 
              type="button"
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer" 
              style={{ pointerEvents: 'auto' }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTimeout(() => {
                  try {
                    const payload = { linkage: linkage || [], n, heights: heights || [] };
                    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); 
                    a.href = url; 
                    a.download = `dendrogram-linkage-n${n}.json`; 
                    a.click(); 
                    URL.revokeObjectURL(url);
                  } catch (err) { 
                    console.error('[Warning Modal] Download linkage failed', err); 
                    alert('Failed to download linkage'); 
                  }
                }, 50);
                handleClose();
              }}
            >
              Download JSON
            </button>
            <button 
              type="button"
              className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 cursor-pointer" 
              style={{ pointerEvents: 'auto' }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClose();
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div 
      ref={modalRef}
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40"
      style={{ zIndex: 999999 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-lg p-4 min-w-[600px] max-w-[95vw] max-h-[90vh] flex flex-col"
        style={{ zIndex: 1000000 }}
      >
        <div className="flex justify-between items-center mb-3 pb-3 border-b-2 border-gray-300">
          <h3 className="font-semibold text-lg">Dendrogram</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Clusters (k):</label>
            <input 
              type="number" 
              value={k} 
              min={1} 
              max={Math.max(1, n)} 
              onChange={(e) => {
                const newK = Math.max(1, Math.min(n, Number(e.target.value) || 1));
                setK(newK);
              }}
              className="w-16 text-sm p-1 border rounded"
            />
            <button 
              className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded hover:bg-blue-700" 
              onClick={(e) => {
                e.stopPropagation();
                const selectedK = k;
                handleClose();
                setTimeout(() => {
                  try {
                    onCut(selectedK);
                  } catch (err) {
                    console.error('Apply error:', err);
                  }
                }, 100);
              }}
            >
              Apply
            </button>
            <button 
              className="px-4 py-2 text-sm font-semibold bg-gray-500 text-white rounded hover:bg-gray-600" 
              onMouseDown={(e) => {
                e.stopPropagation();
                handleClose();
              }}
            >
              Close
            </button>
          </div>
        </div>
        <div className="overflow-auto flex-1">
          <svg width={width} height={height}>
            {linkage && linkage.map((ln, idx) => {
              const a = ln[0], b = ln[1];
              const parentId = n + idx;
              const p = positions.get(parentId);
              const pa = positions.get(a);
              const pb = positions.get(b);
              if (!p || !pa || !pb) return null;
              return (
                <g key={idx}>
                  <line x1={pa.x} y1={pa.y} x2={pa.x} y2={p.y} stroke="#333" />
                  <line x1={pb.x} y1={pb.y} x2={pb.x} y2={p.y} stroke="#333" />
                  <line x1={pa.x} y1={p.y} x2={pb.x} y2={p.y} stroke="#333" />
                </g>
              );
            })}
            {leafIds.map((id) => {
              const pos = positions.get(id);
              if (!pos) return null;
              return (
                <g key={`leaf-${id}`}>
                  <circle cx={pos.x} cy={pos.y} r={3} fill="#1f2937" />
                  <text x={pos.x} y={pos.y + 14} fontSize={10} textAnchor="middle" fill="#111">{id}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
