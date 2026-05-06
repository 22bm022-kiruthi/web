import React from 'react';

interface BoxPlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Record<string, any>[];
  columns: string[];
}

function getBoxPlotStats(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q2 = sorted[Math.floor(sorted.length * 0.5)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { min, q1, q2, q3, max };
}

const BoxPlotModal: React.FC<BoxPlotModalProps> = ({
  isOpen,
  onClose,
  data,
  columns,
}) => {
  if (!isOpen) return null;
  if (!data || data.length === 0 || columns.length < 1) return <div>No data</div>;

  // Prepare box plot data for each column
  const boxPlotData = columns.map((col) => {
    const values = data.map(row => Number(row[col])).filter(v => !isNaN(v));
    const stats = getBoxPlotStats(values);
    return stats ? { name: col, ...stats } : null;
  }).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[600px] max-w-[90vw]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Box Plot Stats</h2>
          <button
            className="px-3 py-1 bg-gray-200 rounded text-sm text-gray-700 hover:bg-gray-300"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
          >
            Close
          </button>
        </div>
        <div style={{ width: '100%', height: 400, overflow: 'auto' }}>
          <table className="min-w-full border">
            <thead>
              <tr>
                <th className="border px-2 py-1">Column</th>
                <th className="border px-2 py-1">Min</th>
                <th className="border px-2 py-1">Q1</th>
                <th className="border px-2 py-1">Median</th>
                <th className="border px-2 py-1">Q3</th>
                <th className="border px-2 py-1">Max</th>
              </tr>
            </thead>
            <tbody>
              {boxPlotData.map((stat) =>
                stat ? (
                  <tr key={stat.name}>
                    <td className="border px-2 py-1">{stat.name}</td>
                    <td className="border px-2 py-1">{stat.min}</td>
                    <td className="border px-2 py-1">{stat.q1}</td>
                    <td className="border px-2 py-1">{stat.q2}</td>
                    <td className="border px-2 py-1">{stat.q3}</td>
                    <td className="border px-2 py-1">{stat.max}</td>
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BoxPlotModal;