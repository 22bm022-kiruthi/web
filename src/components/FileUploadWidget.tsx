import React, { useRef, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const FileUploadWidget: React.FC<Props> = ({ open, onClose }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);

  if (!open) return null;

  const onChoose = () => inputRef.current?.click();

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
    if (e.target.files && e.target.files.length) {
      // simple feedback — in a real app we'd upload to backend
      console.log('Selected files:', Array.from(e.target.files).map(f => f.name));
    }
  };

  const close = () => {
    setFiles(null);
    onClose();
  };

  return (
    <div className="absolute right-4 top-16 z-50 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <strong className="text-sm">File Upload</strong>
        <button onClick={close} className="text-gray-500 hover:text-gray-800">✕</button>
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-300 mb-3">Upload CSV or sample files for analysis.</div>
      <input ref={inputRef} type="file" className="hidden" onChange={onChange} accept=".csv,.txt,.json,image/*" multiple />
      <div className="flex space-x-2">
        <button onClick={onChoose} className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md">Choose files</button>
        <button onClick={close} className="px-3 py-2 border rounded-md">Close</button>
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
  );
};

export default FileUploadWidget;
