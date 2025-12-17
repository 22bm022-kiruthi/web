import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { WidgetType } from '../types';

interface WidgetSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (widgetTypeId: string) => void;
  registry: WidgetType[];
  onCreateLinked?: (widgetTypeId: string) => void;
}

const WidgetSelectorModal: React.FC<WidgetSelectorModalProps> = ({ isOpen, onClose, onSelect, registry, onCreateLinked }) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registry;
    return registry.filter((w) => w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q));
  }, [query, registry]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-md shadow-lg w-96 max-h-[70vh] overflow-auto p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search className="h-4 w-4 text-gray-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search widgets..."
            className="flex-1 px-2 py-1 border rounded"
          />
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-red-500 text-2xl font-bold leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <ul className="space-y-2">
          {filtered.map((w) => (
            <li key={w.id}>
              <div className="flex items-center gap-3 p-2 rounded hover:bg-blue-50">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(w.id);
                    onClose();
                  }}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">{w.name.charAt(0)}</div>
                    <div className="flex-1">
                      <div className="font-medium">{w.name}</div>
                      <div className="text-xs text-gray-500">{w.description}</div>
                    </div>
                  </div>
                </button>
                {typeof (onCreateLinked as any) === 'function' && (
                  <button
                    type="button"
                    onClick={() => {
                      (onCreateLinked as any)(w.id);
                      onClose();
                    }}
                    className="px-2 py-1 text-sm bg-blue-500 text-white rounded"
                  >
                    Create & connect
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default WidgetSelectorModal;
