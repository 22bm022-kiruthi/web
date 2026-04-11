import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Save, Settings } from 'lucide-react';
import { Widget, Theme } from '../types';

interface ConfigModalProps {
  isOpen: boolean;
  widget: Widget | null;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Widget>) => void;
  theme: Theme;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, widget, onClose, onUpdate, theme }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [running, setRunning] = useState(false);
  const [currentPredState, setCurrentPredState] = useState<string | null>(widget?.data?.prediction || null);
  const [lastResponseState, setLastResponseState] = useState<any>(widget?.data?.predictionMeta?.lastResponse || null);
  const [showPredictParams, setShowPredictParams] = useState(false);

  useEffect(() => {
    // prefer canvas mount when available
    const canvasEl = document.querySelector('.orange-canvas');
    setMountNode((canvasEl as HTMLElement) || document.body);
  }, []);

  // Listen for prediction completions and update modal state (do not auto-close)
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const wid = ev?.detail?.widgetId;
        if (!wid) return;
        if (widget && widget.id === wid) {
          const pred = ev?.detail?.prediction || ev?.detail?.raw?.prediction || null;
          const raw = ev?.detail?.raw || null;
          const payload = ev?.detail?.payload || widget.data?.predictionMeta?.lastPayload || null;
          setCurrentPredState(pred || widget.data?.prediction || null);
          setLastResponseState(raw || widget.data?.predictionMeta?.lastResponse || null);
          setRunning(false);
          try {
            if (pred && onUpdate) {
              onUpdate(widget.id, { data: { ...(widget.data || {}), prediction: pred, predictionMeta: { ...(widget.data?.predictionMeta || {}), lastResponse: raw || widget.data?.predictionMeta?.lastResponse, lastPayload: payload || widget.data?.predictionMeta?.lastPayload } } });
            }
          } catch (e) { /* ignore */ }
          try {
            console.debug('[ConfigModal] predictDone event detail:', ev?.detail);
            const src = ev?.detail?.source || (raw ? 'server' : 'local');
            const peaks = payload?.peaks ?? raw?.peaks ?? ev?.detail?.peaks ?? widget.data?.predictionMeta?.lastPayload?.peaks ?? 'N/A';
            const max = payload?.max ?? raw?.max ?? ev?.detail?.max ?? widget.data?.predictionMeta?.lastPayload?.max ?? 'N/A';
            const avg = payload?.avg ?? raw?.avg ?? ev?.detail?.avg ?? widget.data?.predictionMeta?.lastPayload?.avg ?? 'N/A';
            if (src === 'server') {
              let msg = `Prediction: ${String(pred || '—')}`;
              msg += `\nMax: ${String(max)}`;
              msg += `\nPeaks: ${String(peaks)}`;
              msg += `\nAvg: ${String(avg)}`;
              if (raw?.test_output) msg += `\nTest: ${String(raw.test_output)}`;
              if (raw?.sample_prediction) msg += `\nSample: ${String(raw.sample_prediction)}`;
              // If any key is missing/undefined, include the whole detail for debugging
              if (peaks === 'N/A' || max === 'N/A' || avg === 'N/A') {
                msg += `\n\nDETAILS:\n${JSON.stringify(ev?.detail, null, 2)}`;
              }
              alert(msg);
            } else {
              console.debug('[ConfigModal] local prediction - updating UI without popup');
            }
          } catch (e) { console.error('[ConfigModal] failed to show predict popup', e); }
        }
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('predictDone', handler as EventListener);
    return () => window.removeEventListener('predictDone', handler as EventListener);
  }, [widget, onUpdate]);

  // Timeout guard: if running stays true for too long, clear it and show message
  useEffect(() => {
    if (!running) return;
    console.debug('[ConfigModal] prediction started, setting timeout guard');
    const t = setTimeout(() => {
      try {
        if (running) {
          console.warn('[ConfigModal] prediction timeout — clearing running state');
          setRunning(false);
          alert('Prediction timed out. Check backend is running and open the browser Console for details.');
        }
      } catch (e) { /* ignore */ }
    }, 10000);
    return () => clearTimeout(t);
  }, [running]);

  // Close modal on Escape key
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [onClose]);

  if (!isOpen || !widget) return null;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Use VITE_API_URL if available
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const uploadUrl = apiUrl ? `${apiUrl}/upload` : '/api/upload';
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Upload failed (status ${response.status})`);
      }
      let result: any = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch (e) {
        throw new Error('Upload succeeded but returned invalid JSON: ' + text);
      }

      onUpdate(widget.id, {
        data: {
          filename: file.name,
          fileId: result.fileId,
          type: file.type,
          parsedData: result.parsedData,
        },
      });
    } catch (error: any) {
      setUploadError(error?.message || 'File upload failed');
      alert('File upload failed');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    onClose();
  };

  const renderWidgetConfig = () => {
    switch (widget.type) {
      
      case 'supabase':
        return (
          <div className="space-y-4">
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              Table Name
            </label>
            <input
              type="text"
              placeholder="raman_data"
              defaultValue={(widget.data && widget.data.supabaseTable) || 'raman_data'}
              onChange={(e) => onUpdate(widget.id, { data: { ...(widget.data || {}), supabaseTable: e.target.value } })}
              className="w-full px-3 py-2 border rounded"
            />
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              Supabase Credentials (optional)
            </label>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="SUPABASE_URL"
                defaultValue={(widget.data && widget.data.supabaseUrl) || import.meta.env.VITE_SUPABASE_URL || ''}
                onChange={(e) => onUpdate(widget.id, { data: { ...(widget.data || {}), supabaseUrl: e.target.value } })}
                className="w-full px-3 py-2 border rounded"
              />
              <input
                type="text"
                placeholder="SUPABASE_KEY"
                defaultValue={(widget.data && widget.data.supabaseKey) || import.meta.env.VITE_SUPABASE_KEY || ''}
                onChange={(e) => onUpdate(widget.id, { data: { ...(widget.data || {}), supabaseKey: e.target.value } })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div className="text-sm text-gray-500">
              You can leave these blank to use app-level Vite env values or the built-in demo project values. Credentials will be stored in the widget data only for this workspace.
            </div>
          </div>
        );
        case 'predict':
          {
            const currentPred = currentPredState || widget.data?.prediction || null;
            const lastResp = lastResponseState || widget.data?.predictionMeta?.lastResponse || null;
            return (
              <div className="space-y-4">
                <div className="px-2 py-2 rounded border bg-gray-50">
                  <div className="text-sm font-medium">Result</div>
                  <div className="text-lg font-semibold mt-1">{currentPred ? String(currentPred) : '—'}</div>
                  {lastResp?.test_output && (
                    <div className="text-xs text-gray-500 mt-1">Test: {String(lastResp.test_output)}</div>
                  )}
                  {lastResp?.sample_prediction && (
                    <div className="text-xs text-gray-500">Sample: {String(lastResp.sample_prediction)}</div>
                  )}
                </div>

                <div className="flex gap-3 items-center">
                  <button
                    onClick={() => {
                      try {
                        // ensure widget has data before running
                        const sources = [widget.data?.parsedData, widget.data?.tableData, widget.data?.tableDataProcessed, widget.data?.tableDataForecast];
                        const best = sources.reduce((b, s) => (Array.isArray(s) && s.length > (Array.isArray(b) ? b.length : 0)) ? s : b, widget.data?.parsedData || widget.data?.tableData || widget.data?.tableDataProcessed || widget.data?.tableDataForecast || []);
                        const tableData = Array.isArray(best) ? best : [];
                        if (!tableData || tableData.length === 0) { alert('No input data available for prediction. Connect a data source first.'); return; }
                        setRunning(true);
                        window.dispatchEvent(new CustomEvent('predictNow', { detail: { widgetId: widget.id } }));
                      } catch (e) { setRunning(false); }
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded"
                    disabled={running}
                  >
                    {running ? 'Running…' : 'Run'}
                  </button>
                  <button
                    onClick={() => setShowPredictParams((s) => !s)}
                    className="px-3 py-2 bg-gray-200 text-gray-800 rounded"
                  >
                    Configure
                  </button>
                </div>

                {showPredictParams && (
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Rule</label>
                      <select
                        defaultValue={(widget.data?.predictionMeta?.rule) || 'max_threshold'}
                        onChange={(e) => onUpdate(widget.id, { data: { ...(widget.data || {}), predictionMeta: { ...(widget.data?.predictionMeta || {}), rule: e.target.value } } })}
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="max_threshold">Max value greater than threshold → Abnormal</option>
                        <option value="peaks_count">Number of peaks greater-or-equal to minimum → Abnormal</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Max Threshold</label>
                      <input
                        type="number"
                        defaultValue={(widget.data?.predictionMeta?.maxThreshold !== undefined ? widget.data.predictionMeta.maxThreshold : 5000)}
                        onChange={(e) => onUpdate(widget.id, { data: { ...(widget.data || {}), predictionMeta: { ...(widget.data?.predictionMeta || {}), maxThreshold: Number(e.target.value) } } })}
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Min Peaks</label>
                      <input
                        type="number"
                        defaultValue={(widget.data?.predictionMeta?.minPeaks !== undefined ? widget.data.predictionMeta.minPeaks : 1)}
                        onChange={(e) => onUpdate(widget.id, { data: { ...(widget.data || {}), predictionMeta: { ...(widget.data?.predictionMeta || {}), minPeaks: Number(e.target.value) } } })}
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          }
      default:
        return <p>Configuration options will appear here.</p>;
    }
  };

  // renderWidgetConfig will include Predict case below

  const isCanvasMount = mountNode && mountNode !== document.body && mountNode.classList && mountNode.classList.contains('orange-canvas');
  const wrapperClass = isCanvasMount ? 'absolute inset-0 z-50 flex items-center justify-center' : 'fixed inset-0 z-50 flex items-center justify-center';
  const backdropClass = isCanvasMount ? 'absolute inset-0 bg-black bg-opacity-30' : 'fixed inset-0 bg-black bg-opacity-50';

  const modal = (
    <div className={wrapperClass}>
      <div className={backdropClass} onClick={onClose}></div>
      <div
        className={`rounded-lg text-left bg-white shadow-xl transform transition-all sm:max-w-lg sm:w-full ${
          theme === 'dark' ? 'bg-gray-800 text-white' : ''
        }`}
        style={isCanvasMount ? { position: 'relative', zIndex: 99999 } : {}}
      >
        <div className="px-6 pt-6 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Settings className={`h-5 w-5 ${theme === 'dark' ? 'text-white' : 'text-blue-600'}`} />
            <h3 className="text-lg font-medium">
              Configure {widget.type.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Close configure modal" title="Close" className="p-2 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4">{renderWidgetConfig()}</div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg btn-outline">
            Cancel
          </button>
          <button onClick={() => {
            try {
              const sources = [widget.data?.parsedData, widget.data?.tableData, widget.data?.tableDataProcessed, widget.data?.tableDataForecast];
              const best = sources.reduce((b, s) => (Array.isArray(s) && s.length > (Array.isArray(b) ? b.length : 0)) ? s : b, widget.data?.parsedData || widget.data?.tableData || widget.data?.tableDataProcessed || widget.data?.tableDataForecast || []);
              const tableData = Array.isArray(best) ? best : [];
              if (!tableData || tableData.length === 0) { alert('No input data available for prediction. Connect a data source first.'); return; }
              setRunning(true);
              window.dispatchEvent(new CustomEvent('predictNow', { detail: { widgetId: widget.id } }));
            } catch (e) { setRunning(false); }
          }} className="px-4 py-2 rounded-lg btn-secondary">
            {running ? 'Running…' : 'Run'}
          </button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg btn-primary">
            <Save className="inline h-4 w-4 mr-1" />
            Save
          </button>
        </div>
      </div>
    </div>
  );

  return mountNode ? createPortal(modal, mountNode) : modal;
};

export default ConfigModal;