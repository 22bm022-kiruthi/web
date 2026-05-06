import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import DataTableModal from './DataTableModal';

interface FileRecord {
  _id: string;
  filename: string;
  uploadDate: string;
  active: boolean;
}

const FilesModal: React.FC<{ isOpen: boolean; onClose: () => void; onUseFile?: (file: any) => void }> = ({ isOpen, onClose, onUseFile }) => {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
   fetch('https://spectral-api-jji3.onrender.com/api/upload')
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(text || `Failed to load files (status ${r.status})`);
        try {
          const json = text ? JSON.parse(text) : {};
          return json;
        } catch (e) {
          throw new Error('Server returned invalid JSON: ' + text);
        }
      })
      .then((data) => setFiles(data.files || []))
      .catch((err) => setError(err?.message || 'Failed to load files'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const activate = async (id: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/upload/${id}/activate`, { method: 'POST' });
      if (!res.ok) throw new Error('Activation failed');
      await res.json();
      // update list locally
      setFiles((prev) => prev.map((f) => ({ ...f, active: f._id === id })));
      // fetch full file and optionally pass to caller
      if (onUseFile) {
        try {
          const r2 = await fetch(`/api/upload/${id}`);
          if (!r2.ok) throw new Error('Failed to fetch file');
          const j2 = await r2.json();
          onUseFile(j2.file);
        } catch (err) {
          console.error('use-file fetch failed', err);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Activation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-40" onClick={onClose}></div>
      <div className="bg-white rounded shadow-lg p-6 z-50 w-96">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Uploaded Files</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        {loading && <div className="text-sm text-gray-500">Loading...</div>}
        {error && <div className="text-sm text-red-500">{error}</div>}

        <ul className="space-y-2 max-h-72 overflow-auto">
          {files.map((f) => (
            <li key={f._id} className="flex items-center justify-between p-2 border rounded">
              <div>
                <div className="font-medium">{f.filename}</div>
                <div className="text-xs text-gray-500">{new Date(f.uploadDate).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-2">
                {f.active && <span className="text-xs text-green-600 font-medium">Active</span>}
                <button onClick={() => activate(f._id)} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">Activate</button>
                <button
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      const r = await fetch(`/api/upload/${f._id}`);
                      if (!r.ok) throw new Error('Failed to fetch file');
                      const j = await r.json();
                      setPreviewData(j.file?.parsedData || j.parsedData || []);
                      setPreviewOpen(true);
                    } catch (err: any) {
                      setError(err?.message || 'Preview failed');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-2 py-1 bg-gray-200 text-xs rounded"
                >
                  Preview
                </button>
              </div>
            </li>
          ))}
        </ul>
        {previewOpen && (
          <DataTableModal
            isOpen={previewOpen}
            data={previewData || []}
            onClose={() => { setPreviewOpen(false); setPreviewData(null); }}
          />
        )}
      </div>
    </div>
  );
};

export default FilesModal;
