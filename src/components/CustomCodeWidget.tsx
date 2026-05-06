import React, { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CustomCodeWidget: React.FC<Props> = ({ open, onClose }) => {
  const [code, setCode] = useState<string>('');
  const [output, setOutput] = useState<string>('');

  if (!open) return null;

  const run = () => {
    // For safety we don't eval user code. Emit event so parent can handle it.
    window.dispatchEvent(new CustomEvent('runCustomCode', { detail: { code } }));
    setOutput('Code dispatched. Check console or backend for execution.');
    console.log('Custom code payload:', code);
  };

  return (
    <div className="absolute right-4 top-16 z-50 w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <strong className="text-sm">Custom Code</strong>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
      </div>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={`// Write JS to run (dispatched as event).`}
        className="w-full h-36 p-2 border rounded bg-gray-50 dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100"
      />
      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-gray-600 dark:text-gray-300">Dispatches code safely to listeners.</div>
        <div className="flex items-center space-x-2">
          <button onClick={() => { setCode(''); setOutput(''); }} className="px-3 py-1 border rounded">Clear</button>
          <button onClick={run} className="px-3 py-1 bg-green-600 text-white rounded">Dispatch</button>
        </div>
      </div>
      {output && <div className="mt-2 text-xs text-gray-700 dark:text-gray-200">{output}</div>}
    </div>
  );
};

export default CustomCodeWidget;
