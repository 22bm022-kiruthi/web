import React from 'react';

interface MeanAverageModalProps {
  isOpen: boolean;
  onClose: () => void;
  // full table data and columns
  columns: string[];
  data: Record<string, any>[];
  // mode and selection are owned by CanvasWidget but passed in so modal can update them
  mode: 'row' | 'column';
  setMode: (m: 'row' | 'column') => void;
  selectedRows: number[];
  setSelectedRows: (rows: number[]) => void;
  selectedCols: number[];
  setSelectedCols: (cols: number[]) => void;
}

const computeRowAverage = (row: Record<string, any>, columns: string[]) => {
  // Compute the average of numeric columns for this row.
  // Instead of blindly skipping the first column, include only those columns
  // whose values in this row are numeric.
  const vals = columns
    .map((c) => Number(row[c]))
    .filter((v) => !isNaN(v));
  if (!vals.length) return '';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Number(avg.toFixed(4));
};

const computeColumnAverage = (colName: string, data: Record<string, any>[]) => {
  const vals = data.map((r) => Number(r[colName])).filter((v) => !isNaN(v));
  if (!vals.length) return '';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Number(avg.toFixed(4));
};

const MeanAverageModal: React.FC<MeanAverageModalProps> = ({
  isOpen,
  onClose,
  columns,
  data,
  mode,
  setMode,
  selectedRows,
  setSelectedRows,
  selectedCols,
  setSelectedCols,
}) => {
  const [localRows, setLocalRows] = React.useState<number[]>(selectedRows || []);
  const [localCols, setLocalCols] = React.useState<number[]>(selectedCols || []);
  const [results, setResults] = React.useState<(number | string)[]>([]);

  React.useEffect(() => {
    setLocalRows(selectedRows || []);
  }, [selectedRows]);
  React.useEffect(() => {
    setLocalCols(selectedCols || []);
  }, [selectedCols]);

  // When modal opens, if nothing was selected yet, default to selecting all items for the active mode
  React.useEffect(() => {
    if (!isOpen) return;
    if (mode === 'row' && (!selectedRows || selectedRows.length === 0) && data && data.length > 0) {
      setLocalRows(data.map((_, i) => i));
    }
    if (mode === 'column' && (!selectedCols || selectedCols.length === 0) && columns && columns.length > 0) {
      setLocalCols(columns.map((_, i) => i));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleRow = (idx: number) => {
    setLocalRows((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };
  const toggleCol = (idx: number) => {
    setLocalCols((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };

  const selectAllRows = () => setLocalRows(data.map((_, i) => i));
  const clearRows = () => setLocalRows([]);
  const selectAllCols = () => setLocalCols(columns.map((_, i) => i));
  const clearCols = () => setLocalCols([]);

  const runCompute = () => {
    if (mode === 'row') {
      const r = localRows.map((rowIdx) => {
        const row = data[rowIdx] || {};
        return computeRowAverage(row, columns);
      });
      setResults(r);
    } else {
      const r = localCols.map((colIdx) => {
        const colName = columns[colIdx];
        return computeColumnAverage(colName, data);
      });
      setResults(r);
    }
  };

  const applyAndClose = () => {
    setSelectedRows(localRows);
    setSelectedCols(localCols);
    runCompute();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Mean / Average</h2>
          <button
            className="text-gray-500 hover:text-red-500 text-xl font-bold cursor-pointer"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <button
            className={`px-3 py-1 rounded ${mode === 'row' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
            onClick={() => setMode('row')}
          >
            Row
          </button>
          <button
            className={`px-3 py-1 rounded ${mode === 'column' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
            onClick={() => setMode('column')}
          >
            Column
          </button>
        </div>

        <div className="mb-4">
          {mode === 'row' ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Select Rows</div>
                <div className="flex gap-2">
                  <button className="text-xs text-blue-600" onClick={selectAllRows}>Select all</button>
                  <button className="text-xs text-gray-600" onClick={clearRows}>Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {data.map((_, i) => (
                  <label key={i} className="flex items-center gap-2">
                    <input type="checkbox" checked={localRows.includes(i)} onChange={() => toggleRow(i)} />
                    <span className="text-xs">Row {i + 1}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Select Columns</div>
                <div className="flex gap-2">
                  <button className="text-xs text-blue-600" onClick={selectAllCols}>Select all</button>
                  <button className="text-xs text-gray-600" onClick={clearCols}>Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {columns.map((c, i) => (
                  <label key={c + i} className="flex items-center gap-2">
                    <input type="checkbox" checked={localCols.includes(i)} onChange={() => toggleCol(i)} />
                    <span className="text-xs">{c}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mb-3">
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm cursor-pointer" onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('[MeanAverage] Compute clicked'); runCompute(); }}>Compute</button>
            <button className="px-3 py-1 bg-green-600 text-white rounded text-sm cursor-pointer" onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('[MeanAverage] Apply & Close clicked'); applyAndClose(); }}>Apply & Close</button>
            <button className="px-3 py-1 bg-gray-200 rounded text-sm cursor-pointer" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLocalRows(selectedRows || []); setLocalCols(selectedCols || []); setResults([]); }}>Reset</button>
          </div>
        </div>

        <div>
          {results && results.length > 0 ? (
            <ul className="space-y-2">
              {results.map((val, i) => (
                <li key={i} className="flex justify-between items-center border rounded px-2 py-1">
                  <span className="text-xs text-gray-600">{mode === 'row' ? `Row ${localRows[i] + 1}` : columns[localCols[i]]}</span>
                  <span className="font-semibold text-blue-700">{typeof val === 'number' ? Number(val).toFixed(4) : String(val)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-gray-500">No selection or no numeric data to compute average.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeanAverageModal;