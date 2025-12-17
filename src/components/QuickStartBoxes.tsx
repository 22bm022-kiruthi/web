import React from 'react';

interface QuickStartBoxesProps {
  onQuickAdd: (type: string) => void;
}

const QuickStartBoxes: React.FC<QuickStartBoxesProps> = ({ onQuickAdd }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-6 pointer-events-auto">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-semibold">Welcome to DeepSpectrum</h2>
        <p className="text-sm text-gray-500">Get started quickly by adding a component</p>
      </div>

      <div className="flex flex-wrap justify-center gap-6">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onQuickAdd('supabase')}
            className="w-56 h-36 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex flex-col items-center justify-center text-center transform hover:scale-105 transition"
            aria-label="Add Supabase Source widget"
          >
            <div className="text-4xl mb-2">🗄️</div>
            <div className="font-medium">Supabase</div>
            <div className="text-xs text-gray-400 mt-1">Fetch rows from Supabase</div>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onQuickAdd('blank-remover')}
          className="w-56 h-36 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex flex-col items-center justify-center text-center transform hover:scale-105 transition"
          aria-label="Add Preprocessing widget"
        >
          <div className="text-4xl mb-2">🧹</div>
          <div className="font-medium">Preprocessing</div>
          <div className="text-xs text-gray-400 mt-1">Clean and prepare data</div>
        </button>

        <button
          type="button"
          onClick={() => onQuickAdd('line-chart')}
          className="w-56 h-36 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex flex-col items-center justify-center text-center transform hover:scale-105 transition"
          aria-label="Add Visualization widget"
        >
          <div className="text-4xl mb-2">📈</div>
          <div className="font-medium">Visualization</div>
          <div className="text-xs text-gray-400 mt-1">Create charts and plots</div>
        </button>
      </div>
    </div>
  );
};

export default QuickStartBoxes;

