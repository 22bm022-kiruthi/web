import React, { useRef, useState } from 'react';
import { Upload, Code } from 'lucide-react';

const RightDock: React.FC = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [code, setCode] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [collapsed, setCollapsed] = useState<boolean>(true);
  // Panels shown by default to match reference design

  const onChoose = () => inputRef.current?.click();
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
    if (e.target.files && e.target.files.length) {
      console.log('Selected files (RightDock):', Array.from(e.target.files).map(f => f.name));
    }
  };

  const run = () => {
    window.dispatchEvent(new CustomEvent('runCustomCode', { detail: { code } }));
    setOutput('Code dispatched. Check console or backend for execution.');
    console.log('Custom code payload (RightDock):', code);
  };

  return (
    <div className="absolute right-6 top-20 z-40 flex flex-col items-start gap-6 pointer-events-auto">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Open widgets"
          className="w-36 h-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg flex items-center justify-center"
        >
          <span className="text-lg font-bold text-gray-700 dark:text-gray-200">+</span>
        </button>
      ) : (
        <>
          {/* File Upload panel (visible) */}
          <div className="w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-5">
            <div className="flex items-start gap-4 mb-3">
              <div className="-ml-2 -mt-1">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-100 shadow-sm">
                  <Upload className="h-5 w-5" />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-semibold">File Upload</strong>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">Upload CSV or sample files for analysis.</div>
              </div>
            </div>
            <input ref={inputRef} type="file" className="hidden" onChange={onChange} accept=".csv,.txt,.json,image/*" multiple />
            <div className="mt-3">
              <button onClick={onChoose} className="w-full px-4 py-3 bg-blue-600 text-white rounded-full text-base font-medium">Choose files</button>
            </div>
            {files && (
              <div className="mt-3 text-xs text-gray-700 dark:text-gray-200">
                <div className="font-medium">Selected:</div>
                <ul className="list-disc ml-4">
                  {Array.from(files).map((f) => (
                    <li key={f.name}>{f.name} ({Math.round(f.size/1024)} KB)</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Custom Code panel (visible) */}
          <div className="w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-white text-gray-700 border">
                <Code className="h-4 w-4" />
              </div>
              <strong className="text-sm font-semibold">Custom Code</strong>
            </div>
            <div className="p-4">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={`// Write code to dispatch`}
                className="w-full h-28 p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100"
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
          </div>

          <div className="w-full flex justify-end">
            <button aria-label="Collapse widgets" onClick={() => setCollapsed(true)} className="mt-2 px-3 py-1 border rounded bg-gray-50 dark:bg-gray-700 text-lg font-semibold">-</button>
          </div>
        </>
      )}
    </div>
  );
};

export default RightDock;
