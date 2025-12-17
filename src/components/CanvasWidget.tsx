import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDrag } from 'react-dnd';
import {
  Upload, 
  BarChart3,
  ScatterChart as Scatter3D,
  Box,
  Calculator,
  Filter,
  Database,
  LineChart,
  Settings,
  GripVertical,
  Code,
  Table,
  Search,
} from 'lucide-react';
import widgetRegistry from '../utils/widgetRegistry';
import DataTableModal from './DataTableModal';
import MeanAverageModal from './MeanAverageModal';
import LineChartModal from './LineChModal';
import ScatterPlotModal from './ScatterPlotModal';
import BoxPlotModal from './BoxPlotModal';
import WidgetSelectorModal from './WidgetSelectorModal';
import BarChartModal from './BarChartModal';
import PCAResultsModal from './PCAResultsModal';
import HierarchicalWidget from './HierarchicalWidget';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid, Legend, ZAxis } from 'recharts';
import { useTheme } from '../contexts/ThemeContext';
import OrangeStyleWidget from './OrangeStyleWidget';
import { getWidgetColors, getWidgetLabel, getWidgetCategory } from '../config/orangeColors';
import ParametersModal from './ParametersModal';

const iconMap: Record<string, React.ComponentType<any>> = {
  'file-upload': Upload,
  'supabase': Database,
  'data-table': Table,
  'line-chart': LineChart,
  'scatter-plot': Scatter3D,
  'box-plot': Box,
  'bar-chart': BarChart3,
  'mean-average': Calculator,
  'blank-remover': Filter,
  'noise-filter': Filter,
  'baseline-correction': Filter,
  'smoothing': Filter,
  'normalization': Filter,
  'custom-code': Code,
  'pca-analysis': Search,
  'hierarchical-clustering': Search,
  'kmeans-analysis': Scatter3D,
};

interface CanvasWidgetProps {
  widget: Widget;
  isConnecting: boolean;
  isConnectingFrom: boolean;
  onUpdatePosition: (position: { x: number; y: number }) => void;
  onDelete: () => void;
  onOpenConfig: () => void;
  onUpdateWidget?: (updates: Partial<Widget>) => void;
  // can pass a port string or an object with clientX/clientY to start from an exact point
  onStartConnection: (portOrPoint?: 'top' | 'left' | 'right' | 'bottom' | { clientX: number; clientY: number }) => void;
  highlightAngle?: number | null;
  onEndConnection: () => void;
  isHighlighted?: boolean;
  onRemoveConnections?: () => void;
  // onCreateConnection removed - Canvas manages final creation
  onRemoveConnection?: (fromId: string, toId: string) => void;
  isConnectedTo?: (toId: string) => boolean;
  uploadStatus?: 'uploading' | 'success' | 'error' | null;
  onCreateLinkedNode?: (sourceId: string, widgetTypeId: string) => void;
  onAddWidget?: (type: string, position: { x: number; y: number }, initialData?: any) => string | void;
}

const CanvasWidget: React.FC<CanvasWidgetProps> = ({
  widget,
  isConnecting,
  isConnectingFrom,
  onUpdatePosition,
  onDelete,
  onOpenConfig,
  onUpdateWidget,
  onStartConnection,
  highlightAngle,
  onEndConnection,
  isHighlighted,
  onRemoveConnections,
  onRemoveConnection,
  isConnectedTo,
  uploadStatus,
  onCreateLinkedNode,
  onAddWidget,
}) => {
  const [standardize, setStandardize] = useState<boolean>(widget.data?.pcaParams?.standardize ?? true);
  const [pcaRunning, setPcaRunning] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [showContextMenu, setShowContextMenu] = useState<boolean>(false);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [showParameters, setShowParameters] = useState<boolean>(false);
  const [showTableModal, setShowTableModal] = useState<boolean>(false);

  // Debug when showTableModal changes
  useEffect(() => {
    console.log('[CanvasWidget] showTableModal changed to:', showTableModal, 'for widget:', widget.id, 'type:', widget.type);
    if (showTableModal && widget.type === 'data-table') {
      console.log('[CanvasWidget] Data table modal OPENED for widget:', widget.id);
      console.trace('[CanvasWidget] Stack trace for modal opening:');
    }
  }, [showTableModal, widget.id, widget.type]);

  // NOTE: automatic open events are ignored for data-table widgets; users must click "Open" to view
  const [showTableInline, setShowTableInline] = useState<boolean>(false);
  const [nComponents, setNComponents] = useState<number>(widget.data?.pcaParams?.nComponents || 2);
  const [showSelector, setShowSelector] = useState<boolean>(false);
  const [iconLoadFailed, setIconLoadFailed] = useState<boolean>(false);

  const [showInlineResults, setShowInlineResults] = useState<boolean>(false);
  const [kmeansRunning, setKmeansRunning] = useState<boolean>(false);
  const [localAugmentedTable, setLocalAugmentedTable] = useState<any[] | null>(null);
  const [localKmeansResults, setLocalKmeansResults] = useState<any | null>(null);
  // runResultBanner removed: we show only the inline graph after Run
  const rootRef = useRef<HTMLDivElement | null>(null);
  const iconRef = useRef<HTMLDivElement | null>(null);
  const [iconCenter, setIconCenter] = useState<{ left: number; top: number } | null>(null);
  const [inlinePos, setInlinePos] = useState<{ left: number; top: number }>({ left: 100, top: 100 });
  const [inlineRelPos, setInlineRelPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [inlineSuppressOpen, setInlineSuppressOpen] = useState<boolean>(false);
  const [inlineDragging, setInlineDragging] = useState<boolean>(false);
  const inlineDragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const justClosedRef = useRef<boolean>(false);
  // Guard to prevent immediate reopen/close races when the modal mounts
  const tableModalLockRef = useRef<boolean>(false);

  const openTableModal = () => {
    try {
      // Defer setting visible to the next macrotask so the click that triggered
      // this opener doesn't immediately bubble to the backdrop and close it.
      setTimeout(() => {
        console.log('[CanvasWidget] openTableModal: setting showTableModal to true for widget:', widget.id);
        setShowTableModal(true);
        tableModalLockRef.current = true;
        // Longer lock to prevent accidental immediate closes
        setTimeout(() => { 
          tableModalLockRef.current = false; 
          console.log('[CanvasWidget] Modal lock released for widget:', widget.id);
        }, 1000);
      }, 0);
    } catch (e) { /* swallow */ }
  };

  const guardedCloseTableModal = (opts?: { setJustClosed?: boolean }) => {
    try {
      if (tableModalLockRef.current) {
        console.log('[CanvasWidget] guardedCloseTableModal: suppressed close due to lock for widget:', widget.id);
        return;
      }
      console.log('[CanvasWidget] guardedCloseTableModal: closing modal for widget:', widget.id);
      setShowTableModal(false);
      setLocalAugmentedTable(null);
      if (opts && opts.setJustClosed) {
        try { justClosedRef.current = true; setTimeout(() => { justClosedRef.current = false; }, 500); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* swallow */ }
  };
  const [showKmeansResultList, setShowKmeansResultList] = useState<boolean>(false);

  // Sync nComponents from widget data when it changes externally, but
  // avoid clobbering local edits: only update when the stored value
  // differs from the current local state.
  useEffect(() => {
    const stored = widget.data?.pcaParams?.nComponents;
    if (stored !== undefined && stored !== nComponents) {
      console.log('[PCA] Syncing nComponents from widget data (was', nComponents, '->', stored, ')');
      setNComponents(stored);
    }
  }, [widget.data?.pcaParams?.nComponents, nComponents]);

  // When opening inline results, compute position based on widget DOM node
  useEffect(() => {
    if (showInlineResults) {
      console.log('[InlineResults] computing inlinePos, rootRef:', !!rootRef.current);
      const panelWidth = 520;
      const panelHeight = 300;
      let left = 100, top = 100;
      if (rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect();
        // Default: below widget, left-aligned
        left = Math.round(rect.left);
        top = Math.round(rect.bottom + 12);
        // Clamp right edge
        if (left + panelWidth > window.innerWidth - 10) {
          left = window.innerWidth - panelWidth - 10;
        }
        // Clamp left edge
        if (left < 10) left = 10;
        // If not enough space below, try above
        if (top + panelHeight > window.innerHeight - 10) {
          const above = Math.round(rect.top - panelHeight - 12);
          if (above > 10) top = above;
          else top = window.innerHeight - panelHeight - 10;
        }
        // Clamp top edge
        if (top < 10) top = 10;
      } else {
        // Fallback: center-ish
        left = Math.max(10, Math.round(window.innerWidth / 2 - panelWidth / 2));
        top = Math.max(10, Math.round(window.innerHeight / 4));
      }
      setInlinePos({ left, top });
      console.log('[InlineResults] inlinePos set to', { left, top });
    } else {
      console.log('[InlineResults] showInlineResults false');
    }
  }, [showInlineResults]);

  // Inline panel drag handlers: allow mouse-drag to move the inline results panel
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!inlineDragging) return;
      const dx = (e.movementX || 0);
      const dy = (e.movementY || 0);
      setInlineRelPos((prev) => ({ left: prev.left + dx, top: Math.max(8, prev.top + dy) }));
      setInlinePos((prev) => ({ left: Math.max(8, prev.left + dx), top: Math.max(8, prev.top + dy) }));
    }
    function onUp() {
      console.log('[InlinePanel] drag end');
      setInlineDragging(false);
    }
    if (inlineDragging) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [inlineDragging]);

  // Compute inline panel position immediately (useful to avoid race conditions)
  const positionInlineBelowWidget = () => {
    try {
      // Compact inline panel is small (approx 260x120) — use matching sizes for positioning
      const panelWidth = 260;
      const panelHeight = 140;
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      // Prefer placing directly below the widget, centered horizontally relative to the widget
      const panelOffset = 0; // no gap between widget and panel

      // Compute absolute candidate position: center panel under widget
      let absLeft = Math.round(rect.left + (rect.width / 2) - (panelWidth / 2));
      let absTop = Math.round(rect.bottom + panelOffset);

      // If left would overflow right edge, shift left but prefer staying near widget
      if (absLeft + panelWidth > window.innerWidth - 10) {
        absLeft = Math.min(Math.round(rect.left), Math.max(10, window.innerWidth - panelWidth - 10));
      }
      if (absLeft < 10) absLeft = Math.max(10, Math.round(rect.left));

      // If not enough space below, try placing above; otherwise clamp to viewport
      if (absTop + panelHeight > window.innerHeight - 10) {
        const above = Math.round(rect.top - panelHeight - 12);
        if (above > 10) absTop = above;
        else absTop = Math.max(10, window.innerHeight - panelHeight - 10);
      }

      // Ensure the widget DOM node can contain absolutely positioned children
      try { if (rootRef.current && window.getComputedStyle(rootRef.current).position === 'static') { rootRef.current.style.position = 'relative'; } } catch (e) { /* ignore */ }

      // Recompute relative position so portal-aware rendering stays near widget
      relLeft = Math.max(0, absLeft - Math.round(rect.left));
      relTop = Math.max(0, absTop - Math.round(rect.top));
      setInlineRelPos({ left: relLeft, top: relTop });
      // Also set viewport-based inlinePos for fallback uses
      const left = Math.max(10, Math.min(absLeft, window.innerWidth - panelWidth - 10));
      const top = Math.max(10, Math.min(absTop, window.innerHeight - panelHeight - 10));
      setInlinePos({ left, top });
      console.log('[InlineResults] positioned below widget to (rel,abs)', { rel: { left: relLeft, top: relTop }, abs: { left, top } });
    } catch (e) {
      console.warn('[InlineResults] positionInlineBelowWidget failed', e);
    }
  };

  // Ensure compact kmeans result list is positioned when shown
  useEffect(() => {
    if (showKmeansResultList) {
      // compute immediately and also after a short timeout to handle layout shifts
      try { positionInlineBelowWidget(); } catch (e) { /* ignore */ }
      const t = setTimeout(() => { try { positionInlineBelowWidget(); } catch (e) { /* ignore */ } }, 80);

      const onWinChange = () => { try { positionInlineBelowWidget(); } catch (e) { /* ignore */ } };
      window.addEventListener('resize', onWinChange);
      window.addEventListener('scroll', onWinChange, true);
      return () => {
        clearTimeout(t);
        window.removeEventListener('resize', onWinChange);
        window.removeEventListener('scroll', onWinChange, true);
      };
    }
  }, [showKmeansResultList, widget.id, widget.position?.x, widget.position?.y]);

  // Debug: log when inline results visibility changes or when widget.pcaResults updates
  useEffect(() => {
    console.log('[PCA] Debug - showInlineResults:', showInlineResults, 'pcaResults present:', !!widget.data?.pcaResults);
  }, [showInlineResults, widget.data?.pcaResults]);

  // Compute icon center in viewport coordinates for input widgets so overlay can snap exactly
  useEffect(() => {
    const update = () => {
      try {
        const el = iconRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          const ic = { left: Math.round(r.left + r.width / 2), top: Math.round(r.top + r.height / 2) };
          setIconCenter(ic);
          try {
            // Persist icon center into widget data so the parent Canvas can align connection ports
            if (onUpdateWidget) {
              const existing = (widget.data && (widget.data as any).iconCenter) || null;
              if (!existing || existing.left !== ic.left || existing.top !== ic.top) {
                onUpdateWidget({ data: { iconCenter: ic } });
              }
            }
          } catch (err) {
            // swallow
          }
        } else {
          setIconCenter(null);
        }
      } catch (err) {
        setIconCenter(null);
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const obs = new MutationObserver(update);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      obs.disconnect();
    };
  }, [iconRef.current, widget.id]);

  useEffect(() => {
    const onGlobalClick = () => {
      setShowContextMenu(false);
      setContextPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowContextMenu(false);
        setEditingLabel(null);
      }
    };
    window.addEventListener('click', onGlobalClick);
    window.addEventListener('keydown', onKey);
    // Listen for requests to open this widget's Parameters modal from other UI pieces
    const paramsHandler = (ev: any) => {
      try {
        const id = ev?.detail?.widgetId;
        console.debug('[CanvasWidget] paramsHandler received event for', id, 'this widget:', widget.id);
        if (id && id === widget.id) {
          console.debug('[CanvasWidget] paramsHandler opening parameters for', widget.id);
          setShowParameters(true);
        }
      } catch (err) { console.error('[CanvasWidget] paramsHandler error', err); }
    };
    window.addEventListener('openWidgetParameters', paramsHandler as EventListener);
    // Listen for explicit request to open the Data Table modal for this widget
    const openTableHandler = (ev: any) => {
      try {
        const id = ev?.detail?.widgetId;
        if (id && id === widget.id && widget.type === 'data-table') {
          console.debug('[CanvasWidget] openDataTable event ignored - only manual opening allowed');
          // Automatic opening disabled - user must manually click "Open" to view data
          // setShowTableModal(true);
        }
      } catch (err) { /* ignore */ }
    };
    window.addEventListener('openDataTable', openTableHandler as EventListener);
    return () => {
      window.removeEventListener('click', onGlobalClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('openWidgetParameters', paramsHandler as EventListener);
      window.removeEventListener('openDataTable', openTableHandler as EventListener);
    };
  }, []);

  // Log showParameters changes for debugging visibility issues
  React.useEffect(() => {
    console.debug('[CanvasWidget] showParameters changed for', widget.id, '->', showParameters);
  }, [showParameters, widget.id]);

  // Helper to try multiple backend endpoints (relative -> 127.0.0.1:5003 -> localhost:5003)
  const fetchToBackend = async (path: string, options?: RequestInit) => {
    // Try the relative path first so Vite dev server proxy (if configured) can forward the request.
    // Fallback candidates include IPv4 localhost and hostname. Increase timeout slightly for local services.
    const perCandidateTimeout = 5000; // ms
    // Try the relative path first (Vite proxy). If that fails try explicit backend hosts.
    const candidates = [path, `http://127.0.0.1:5003${path}`, `http://localhost:5003${path}`];
    let lastError: any = null;
    for (const url of candidates) {
      // use AbortController to avoid long hanging fetches
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), perCandidateTimeout);
      try {
        console.debug('[CanvasWidget] fetchToBackend trying', url);
        // Warn about mixed-content: browser will block http requests from https pages
        try {
          if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:' && url.startsWith('http:')) {
            console.warn('[CanvasWidget] fetchToBackend candidate is insecure (http) while page is https — mixed-content may block the request:', url);
          }
        } catch (e) { /* ignore */ }
        const resp = await fetch(url, { ...(options || {}), signal: controller.signal });
        clearTimeout(to);
        // If the proxy returned an error (5xx) it may be because the dev-server couldn't connect to the backend
        // Some dev-server/proxy middlewares return an HTML/text error page containing the underlying error (e.g. ECONNREFUSED).
        // In that case, attempt the next candidate (direct backend host) rather than immediately returning the error response.
        if (!resp.ok && resp.status >= 500) {
          try {
            const txt = await resp.text();
            const lower = (txt || '').toLowerCase();
            if (lower.includes('econnrefused') || lower.includes('connection refused') || lower.includes('connect econnrefused') || lower.includes('cannot connect')) {
              console.debug('[CanvasWidget] fetchToBackend detected proxy connection-refused response, trying next candidate');
              // try next candidate
              continue;
            }
            // not a connection-refused case — return the response text as-is by creating a new Response
            return new Response(txt, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
          } catch (e) {
            // if we cannot read text, return the original response
            return resp;
          }
        }
        return resp; // return whatever the server returned (caller will parse JSON)
      } catch (err: any) {
        clearTimeout(to);
        lastError = err;
        // Detailed logging to aid debugging in the browser console
        if (err && err.name === 'AbortError') {
          console.debug('[CanvasWidget] fetchToBackend timed out for', url, `(timeout ${perCandidateTimeout}ms)`);
        } else if (err && err.name === 'TypeError' && String(err).includes('Failed to fetch')) {
          console.debug('[CanvasWidget] fetchToBackend network failure (likely backend down or CORS/mixed-content):', url, err.message || err);
        } else {
          console.debug('[CanvasWidget] fetchToBackend candidate failed:', url, err && (err.message || String(err)));
        }
        // try next candidate
      }
    }
    // all attempts failed — provide a helpful error
    const message = lastError?.message || String(lastError) || 'Failed to reach backend';
    // If we failed to reach any backend candidate, and the frontend has Vite-supplied
    // Supabase credentials (public anon key), try a direct Supabase REST call as a fallback
    try {
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').toString();
      const supabaseAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').toString();
      if (supabaseUrl && supabaseAnon && path.startsWith('/api/supabase')) {
        console.debug('[CanvasWidget] proxy/backends unreachable — attempting direct Supabase REST fallback');
        // path is like: /api/supabase/fetch?table=raman_data&limit=200
        const qsIndex = path.indexOf('?');
        const query = qsIndex >= 0 ? path.slice(qsIndex + 1) : '';
        const params = new URLSearchParams(query);
        const table = params.get('table') || 'raman_data';
        // Build supabase REST URL
        const restUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}${query ? ('?' + query) : ''}`;
        const headers: Record<string, string> = {
          apikey: supabaseAnon,
          Authorization: `Bearer ${supabaseAnon}`,
          Accept: 'application/json'
        };
        const resp = await fetch(restUrl, { method: options?.method || 'GET', headers });
        if (!resp.ok) {
          const txt = await resp.text();
          console.error('[CanvasWidget] direct Supabase REST fallback failed:', resp.status, txt);
          throw new Error(`Supabase REST returned ${resp.status}`);
        }
        console.debug('[CanvasWidget] direct Supabase REST fallback succeeded');
        return resp;
      }
    } catch (fbErr) {
      console.debug('[CanvasWidget] Supabase REST fallback failed or not available:', fbErr && fbErr.message ? fbErr.message : fbErr);
    }

    throw new Error(message);
  };

  // --- Mean Average Widget State ---
  // keep per-widget mode so each Mean/Average instance can independently use row/column
  const [widgetModes, setWidgetModes] = useState<Record<string, 'row' | 'column'>>({});
  const mode = widgetModes[widget.id] || 'row';
  const setMode = (val: 'row' | 'column') => setWidgetModes((prev) => ({ ...(prev || {}), [widget.id]: val }));
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [selectedCols, setSelectedCols] = useState<number[]>([]);
  const [showMeanModal, setShowMeanModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingLocal, setUploadingLocal] = useState(false);
  const [uploadErrorLocal, setUploadErrorLocal] = useState<string | null>(null);
  // Local file upload handler (moved here to avoid JSX parsing issues)
  const handleLocalFile = async (file: any) => {
    if (!file) return;
    setUploadingLocal(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const uploadUrl = apiUrl ? `${apiUrl}/upload` : '/api/upload';
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(uploadUrl, { method: 'POST', body: fd });
      if (!res.ok) {
        setUploadErrorLocal(`Upload failed (status ${res.status})`);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (onUpdateWidget) onUpdateWidget({ data: { filename: file.name, fileId: body.fileId, type: file.type, parsedData: body.parsedData } });
    } catch (err: any) {
      setUploadErrorLocal(String(err?.message || err));
      console.error('handleLocalFile error:', err);
    } finally {
      setUploadingLocal(false);
    }
  };
  const [showLineChartModal, setShowLineChartModal] = useState(false);
  const [modalPreviewData, setModalPreviewData] = useState<Record<string, any>[] | null>(null);
  const [showScatterModal, setShowScatterModal] = useState(false);
  const [showKmeansGraphModal, setShowKmeansGraphModal] = useState(false);
  const [showBoxPlotModal, setShowBoxPlotModal] = useState(false);
  const [showBarChartModal, setShowBarChartModal] = useState(false);
  const [showPCAResults, setShowPCAResults] = useState(false);
  const [isSupabaseHover, setIsSupabaseHover] = useState(false);
  // referenced to avoid unused-variable lint when hover state is not consumed yet
  void isSupabaseHover;
  void setIsSupabaseHover;
  // Local baseline params (keep as component-local editable copy and sync to widget.data)
  const [localBaselineParams, setLocalBaselineParams] = useState<Record<string, any>>(widget.data?.baselineParams || { method: 'min_subtract', window: 5, degree: 2 });
  useEffect(() => {
    // sync from external widget.data when it changes
    if (widget.data && widget.data.baselineParams) setLocalBaselineParams(widget.data.baselineParams);
  }, [widget.data?.baselineParams]);

  // Noise filter window size (used by noise-filter widget). Keep synced with widget.data.noiseParams if present.
  const [noiseWindow, setNoiseWindow] = useState<number>(widget.data?.noiseParams?.window || 5);
  const [noiseMethod, setNoiseMethod] = useState<string>(widget.data?.noiseParams?.method || 'moving_average');
  const [noiseSigma, setNoiseSigma] = useState<number>(widget.data?.noiseParams?.sigma || 1.0);
  const [noiseOrder, setNoiseOrder] = useState<number>(widget.data?.noiseParams?.order || 2);
  const [localNoiseParams, setLocalNoiseParams] = useState({
    window: widget.data?.noiseParams?.window || 5,
    method: widget.data?.noiseParams?.method || 'moving_average',
    sigma: widget.data?.noiseParams?.sigma || 1.0,
    order: widget.data?.noiseParams?.order || 2
  });
  void localNoiseParams;
  void setLocalNoiseParams;

  useEffect(() => {
    if (widget.data && widget.data.noiseParams) {
      if (typeof widget.data.noiseParams.window === 'number') setNoiseWindow(widget.data.noiseParams.window);
      if (widget.data.noiseParams.method) setNoiseMethod(widget.data.noiseParams.method);
      if (typeof widget.data.noiseParams.sigma === 'number') setNoiseSigma(widget.data.noiseParams.sigma);
      if (typeof widget.data.noiseParams.order === 'number') setNoiseOrder(widget.data.noiseParams.order);
      setLocalNoiseParams(widget.data.noiseParams);
    }
  }, [widget.data?.noiseParams]);

  const data: Record<string, any>[] = widget.data?.tableData || [];
  const columns: string[] = data.length > 0 ? Object.keys(data[0]) : [];

  // Reset selections when mode or data changes
  useEffect(() => {
    setSelectedRows([]);
    setSelectedCols([]);
  }, [mode, data.length, columns.join(',')]);

  // Removed auto-open behavior - data table only opens when user manually clicks "Open"

  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: 'canvas-widget',
    item: { id: widget.id },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));
  // Dragging is only available via the in-circle drag handle (attach `drag` to the handle).

  const IconComponent = iconMap[widget.type] || Upload;
  const showUploadStatus = widget.type === 'supabase';
  const customIconPath = `/${widget.type}.svg`;
  const isSupabase = widget.type === 'supabase';

  // Supabase widget state for manual fetch
  const [sbTableName, setSbTableName] = useState<string>(widget.data?.supabaseTable || 'raman_data');
  const [sbSampleFilter, setSbSampleFilter] = useState<string>(widget.data?.sampleFilter || '');
  const [sbFetching, setSbFetching] = useState(false);
  const [sbHasData, setSbHasData] = useState<boolean>(!!(widget.data?.tableData && widget.data.tableData.length > 0));

  // Manual fetch function for Supabase widget (uses server-side credentials from backend/.env)
  const fetchSupabaseData = async () => {
    console.log('🔵 [FETCH] fetchSupabaseData called!', { isSupabase, widgetId: widget.id, sbTableName });
    if (!isSupabase) return;
    setSbFetching(true);
    try {
      onUpdateWidget?.({ data: { ...(widget.data || {}), fetchStatus: 'fetching', fetchError: null, supabaseTable: sbTableName, sampleFilter: sbSampleFilter } });
      // Skip a separate health-check and rely on the main backend request below
      // (fetchToBackend has candidate retries and per-candidate timeouts and will produce helpful logs).

      // Build query with optional sample name filter (use fetchToBackend helper)
      let path = `/api/supabase/fetch?table=${encodeURIComponent(sbTableName)}&limit=200`;
      if (sbSampleFilter && sbSampleFilter.trim()) {
        path += `&filter=Sample name.eq.${encodeURIComponent(sbSampleFilter.trim())}`;
      }

      console.log('🔵 [FETCH] About to call fetchToBackend with path:', path);
      let res;
      try {
        res = await fetchToBackend(path, { method: 'GET' });
        console.log('🔵 [FETCH] fetchToBackend returned, status:', res.status, 'ok:', res.ok);
      } catch (fetchErr: any) {
        console.error('🔵 [FETCH ERROR] fetchToBackend failed:', fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr));
        onUpdateWidget?.({ data: { ...(widget.data || {}), fetchStatus: 'error', fetchError: String(fetchErr && fetchErr.message ? fetchErr.message : fetchErr) } });
        setSbFetching(false);
        return;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => `Status ${res.status}`);
        console.warn('🔵 [FETCH ERROR] backend returned error status for fetch:', res.status, txt?.slice ? txt.slice(0, 200) : txt);
        onUpdateWidget?.({ data: { ...(widget.data || {}), fetchStatus: 'error', fetchError: txt } });
        setSbFetching(false);
        return;
      }
      const body = await res.json().catch(() => ({}));
      let rows = body?.data || body || [];
      console.log('🔵 [FETCH SUCCESS] Got', rows.length, 'rows from backend');
      
      // CLIENT-SIDE FILTER: If backend filter didn't work, filter here
      if (sbSampleFilter && sbSampleFilter.trim()) {
        const filterValue = sbSampleFilter.trim();
        const beforeFilter = rows.length;
        rows = rows.filter((row: any) => row['Sample name'] === filterValue);
        console.log(`[Supabase] Client-side filter: ${beforeFilter} rows → ${rows.length} rows (Sample name = "${filterValue}")`);
      }
      
      // Auto-map to plotting format
      const sample = rows && rows.length ? rows[0] : {};
      const keys = Object.keys(sample || {});
      const lower = keys.map((k: string) => k.toLowerCase());
      const xCandidates = ['shift','x','wavenumber','wavenumber_cm','raman_shift'];
      const yCandidates = ['intensity','y','counts','value'];
      const pickCol = (cands: string[]) => {
        for (const c of cands) {
          const idx = lower.indexOf(c.toLowerCase());
          if (idx >= 0) return keys[idx];
        }
        return keys[0] || null;
      };
      const xCol = pickCol(xCandidates);
      const yCol = pickCol(yCandidates) || (keys[1] || keys[0]);
      
      const mapped = rows.map((r: Record<string, any>) => {
        const x = xCol ? Number(r[xCol]) : null;
        const y = yCol ? Number(r[yCol]) : null;
        return { shift: Number.isFinite(x) ? x : null, intensity: Number.isFinite(y) ? y : null, __raw: r };
      }).filter((d: any) => d.shift !== null && d.intensity !== null);
      
      console.log('🔵 [FETCH] Calling onUpdateWidget to store', rows.length, 'rows in widget.data.tableData');
      onUpdateWidget?.({ data: { ...(widget.data || {}), tableData: rows, tableDataProcessed: mapped, fetchStatus: 'success', supabaseTable: sbTableName } });
      console.log('🔵 [FETCH] onUpdateWidget called, setting sbHasData to true');
      try { setSbHasData(!!(rows && rows.length > 0)); } catch (e) { /* swallow */ }
      
      // After successful fetch, trigger auto-forwarding to connected downstream widgets
      if (rows && rows.length > 0) {
        console.debug('[Supabase] fetch successful, triggering data forward for', widget.id, 'with', rows.length, 'rows');
        // Small delay to ensure widget data is updated before triggering forward
        setTimeout(() => {
          try {
            // Dispatch a custom event to trigger the App's auto-forward logic
            window.dispatchEvent(new CustomEvent('triggerDataForward', { detail: { sourceWidgetId: widget.id } }));
          } catch (e) { /* ignore */ }
        }, 100);
      }
    } catch (err: any) {
      onUpdateWidget?.({ data: { ...(widget.data || {}), fetchStatus: 'error', fetchError: String(err) } });
    } finally {
      setSbFetching(false);
    }
  };

  // Listen for programmatic fetch requests (e.g. when a connection is created)
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const id = ev?.detail?.widgetId;
        if (id && id === widget.id) {
          // Only trigger if this is a supabase widget
          if (!isSupabase) return;
          // Avoid starting a new fetch if we're already fetching or already have data
          if (sbFetching) {
            console.debug('[CanvasWidget] fetchSupabase ignored: already fetching for', widget.id);
            return;
          }
          if (sbHasData) {
            console.debug('[CanvasWidget] fetchSupabase ignored: supabase already has data for', widget.id);
            return;
          }
          console.debug('[CanvasWidget] fetchSupabase event received for', widget.id);
          fetchSupabaseData();
        }
      } catch (err) {
        console.error('[CanvasWidget] fetchSupabase handler error', err);
      }
    };
    window.addEventListener('fetchSupabase', handler as EventListener);
    return () => window.removeEventListener('fetchSupabase', handler as EventListener);
  }, [widget.id, isSupabase, sbTableName]);

  // Connection handlers are provided by Canvas via props (onStartConnection/onEndConnection)

  // Dragging is available only via the drag handle (react-dnd `drag` ref).
  // Keep onUpdatePosition reference to avoid unused variable lint.
  void onUpdatePosition;
  // Mark onEndConnection as used to satisfy linter (actual handling is in Canvas)
  void onEndConnection;

  // Mean/Average modal data and selection are handled inside the modal.

  const renderWidgetContent = () => {
    if (widget.type === 'data-table') {
      const hasData = (widget.data?.tableData && widget.data.tableData.length > 0) || 
                      (widget.data?.parsedData && widget.data.parsedData.length > 0);
      
      // Always get the latest data regardless of timing issues
      // Prefer explicit `tableData`, then `tableDataProcessed` (from processing steps), then `parsedData` (file uploads)
      const displayData = widget.data?.tableData || widget.data?.tableDataProcessed || widget.data?.parsedData || [];

      console.log('[CanvasWidget] data-table renderWidgetContent debug:', {
        widgetId: widget.id,
        hasData,
        displayDataLength: displayData.length,
        tableDataExists: !!widget.data?.tableData,
        tableDataLength: widget.data?.tableData?.length || 0,
        tableDataProcessedExists: !!widget.data?.tableDataProcessed,
        tableDataProcessedLength: widget.data?.tableDataProcessed?.length || 0,
        parsedDataExists: !!widget.data?.parsedData,
        parsedDataLength: widget.data?.parsedData?.length || 0,
        showTableInline: showTableInline
      });
      
      const colors = getWidgetColors('data-table');
      
      // Render two connection port elements inside the icon for precise alignment
      const dataTablePorts = (
        <>
          <div
            role="button"
            aria-label="Start connection from left port"
            className="absolute rounded-full bg-white border-2 pointer-events-auto"
            onPointerDown={(e) => {
              try { e.stopPropagation(); e.preventDefault(); const tgt = e.currentTarget as HTMLElement; const r = tgt.getBoundingClientRect(); onStartConnection && onStartConnection({ clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2), portCenter: true }); } catch (err) { /* swallow */ }
            }}
            style={{ width: 8, height: 8, left: 14, top: '50%', transform: 'translateY(-50%)', borderColor: colors.main, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
          />
          <div
            role="button"
            aria-label="Start connection from right port"
            className="absolute rounded-full bg-white border-2 pointer-events-auto"
            onPointerDown={(e) => {
              try { e.stopPropagation(); e.preventDefault(); const tgt = e.currentTarget as HTMLElement; const r = tgt.getBoundingClientRect(); onStartConnection && onStartConnection({ clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2), portCenter: true }); } catch (err) { /* swallow */ }
            }}
            style={{ width: 8, height: 8, right: 14, top: '50%', transform: 'translateY(-50%)', borderColor: colors.main, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
          />
        </>
      );

      return (
        <OrangeStyleWidget
          icon={Table}
          label={getWidgetLabel('data-table')}
          iconRef={iconRef}
          portElements={dataTablePorts}
          statusText={hasData ? `${(widget.data?.tableData || widget.data?.parsedData || []).length} rows` : 'No Data'}
          statusColor={hasData ? 'green' : 'gray'}
          mainColor={colors.main}
          lightColor={colors.light}
          bgColor={colors.bg}
        >
          {/* Controls section - always visible when data exists */}
          {hasData && (
            <div className="mt-2 flex flex-col items-center gap-2">
              <button 
                onClick={(e) => { 
                  console.log('🔴 [DATA TABLE] BUTTON CLICKED!!! widget:', widget.id, 'showTableModal:', showTableModal);
                  e.stopPropagation(); 
                  e.preventDefault();
                  if (showTableModal) {
                    console.log('[CanvasWidget] Open button clicked while modal open — closing modal for:', widget.id);
                    guardedCloseTableModal({ setJustClosed: true });
                  } else {
                    console.log('[CanvasWidget] Open table button clicked, opening modal for:', widget.id);
                    openTableModal();
                  }
                }}
                onMouseDown={(e) => {
                  console.log('🔴 [DATA TABLE] MOUSEDOWN on button');
                  e.stopPropagation();
                  e.preventDefault();
                }} 
                style={{
                  backgroundColor: '#3B82F6',
                  color: '#FFFFFF',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: '600',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563EB';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3B82F6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {showTableModal ? 'Hide table' : 'Open table'}
              </button>
            </div>
          )}
          {/* Centered table modal with guarded opener/closer - portalled to canvas */}
          {showTableModal && (() => {
            const canvasEl = document.querySelector('.orange-canvas') as HTMLElement | null;
            console.log('[CanvasWidget] Rendering data table modal, showTableModal:', showTableModal, 'canvas found:', !!canvasEl, 'widget:', widget.id);
            if (!canvasEl) {
              console.warn('[CanvasWidget] canvas container (.orange-canvas) not found for data-table modal, falling back to body');
            } else {
              console.log('[CanvasWidget] Portal target canvas dimensions:', { width: canvasEl.offsetWidth, height: canvasEl.offsetHeight });
            }
            const portalTarget = canvasEl || document.body;
            
            const modalContent = (
              <div
                className="table-overlay-backdrop"
                style={{
                  position: 'absolute',
                  top: '0px',
                  left: '0px',
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  zIndex: 999999,
                  display: 'block'
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.target === e.currentTarget) {
                    console.log('Backdrop clicked - closing table modal');
                    guardedCloseTableModal({ setJustClosed: true });
                  }
                }}>
                <div 
                  className="table-content-container"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
                    padding: '28px',
                    width: '90vw',
                    maxWidth: '1200px',
                    maxHeight: '85vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                  onClick={(e) => e.stopPropagation()}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '24px',
                    borderBottom: '2px solid #E5E7EB',
                    paddingBottom: '16px'
                  }}>
                    <h2 style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: '#1F2937',
                      margin: 0
                    }}>
                      Data Table ({displayData.length} rows)
                    </h2>
                    <button 
                      onClick={() => {
                        console.log('Close button clicked - closing table modal');
                        guardedCloseTableModal({ setJustClosed: true });
                      }}
                      style={{
                        backgroundColor: '#EF4444',
                        border: 'none',
                        color: '#FFFFFF',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        borderRadius: '50%',
                        lineHeight: '1',
                        transition: 'all 0.2s',
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#DC2626';
                        e.currentTarget.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#EF4444';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      title="Close table"
                    >
                      ×
                    </button>
                  </div>
                  {displayData.length > 0 ? (
                  <div style={{ 
                    flex: 1, 
                    overflow: 'auto', 
                    border: '2px solid #E5E7EB', 
                    borderRadius: '8px',
                    backgroundColor: '#FAFAFA'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: '#F9FAFB' }}>
                        <tr>
                          {Object.keys(displayData[0] || {}).map((header, idx) => (
                            <th key={idx} style={{
                              border: '1px solid #D1D5DB',
                              padding: '12px 16px',
                              textAlign: 'left',
                              fontWeight: '600',
                              color: '#374151',
                              backgroundColor: '#F9FAFB',
                              fontSize: '14px'
                            }}>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayData.map((row, rowIdx) => (
                          <tr key={rowIdx} style={{
                            backgroundColor: rowIdx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#EBF8FF';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = rowIdx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
                          }}>
                            {Object.values(row).map((cell, cellIdx) => (
                              <td key={cellIdx} style={{
                                border: '1px solid #D1D5DB',
                                padding: '8px 16px',
                                color: '#374151',
                                fontSize: '14px'
                              }}>
                                {typeof cell === 'object' ? JSON.stringify(cell) : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#6B7280', padding: '48px 0' }}>
                      <p style={{ fontSize: '20px', marginBottom: '8px' }}>No data available</p>
                      <p style={{ color: '#9CA3AF' }}>Connect this widget to a Supabase or File Upload widget to display data</p>
                    </div>
                  )}
                </div>
              </div>
            );
            
            return createPortal(modalContent, portalTarget);
          })()}
        </OrangeStyleWidget>
      );
    }

    if (widget.type === 'file-upload') {
      const colors = getWidgetColors('file-upload');
      const hasData = widget.data?.parsedData && widget.data.parsedData.length > 0;
      
      const fileUploadPorts = (
        <>
          <div
            role="button"
            aria-label="Start connection from left port"
            className="absolute rounded-full bg-white border-2 pointer-events-auto"
            onPointerDown={(e) => {
              try { e.stopPropagation(); e.preventDefault(); const tgt = e.currentTarget as HTMLElement; const r = tgt.getBoundingClientRect(); onStartConnection && onStartConnection({ clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2), portCenter: true }); } catch (err) { /* swallow */ }
            }}
            style={{ width: 8, height: 8, left: 14, top: '50%', transform: 'translateY(-50%)', borderColor: colors.main, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
          />
          <div
            role="button"
            aria-label="Start connection from right port"
            className="absolute rounded-full bg-white border-2 pointer-events-auto"
            onPointerDown={(e) => {
              try { e.stopPropagation(); e.preventDefault(); const tgt = e.currentTarget as HTMLElement; const r = tgt.getBoundingClientRect(); onStartConnection && onStartConnection({ clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) }); } catch (err) { /* swallow */ }
            }}
            style={{ width: 8, height: 8, right: 14, top: '50%', transform: 'translateY(-50%)', borderColor: colors.main, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
          />
        </>
      );

      return (
        <OrangeStyleWidget
          icon={Upload}
          label="File Upload"
          iconRef={iconRef}
          portElements={fileUploadPorts}
          statusText={hasData ? 'File loaded' : uploadingLocal ? 'Uploading...' : 'No file'}
          statusColor={hasData ? 'green' : uploadingLocal ? 'orange' : 'gray'}
          mainColor={colors.main}
          lightColor={colors.light}
          bgColor={colors.bg}
        >
          <div className="mt-2 flex flex-col items-center gap-2">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                (fileInputRef.current as HTMLInputElement | null)?.click(); 
              }} 
              className="px-3 py-1.5 text-xs font-medium rounded transition-colors text-white"
              style={{ backgroundColor: colors.main }}
            >
              {hasData ? 'Change File' : 'Select File'}
            </button>
            {uploadErrorLocal && (
              <div className="text-xs text-red-600 text-center">{uploadErrorLocal}</div>
            )}
          </div>
          
          {/* hidden native input used to open file explorer */}
          <input
            ref={fileInputRef as any}
            type="file"
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={(ev) => handleLocalFile(ev.target.files ? ev.target.files[0] : null)}
          />
        </OrangeStyleWidget>
      );
      }
    
    if (widget.type === 'normalization') {
      const [method, setMethod] = useState<'minmax' | 'zscore'>('minmax');
      const [targetMin, setTargetMin] = useState<number>(0);
      const [targetMax, setTargetMax] = useState<number>(1);
      const [hasNormalized, setHasNormalized] = useState<boolean>(false);

      const runNormalization = () => {
        // Use processed data from previous widget (Noise Filter, Baseline, etc.)
        // Priority: tableDataProcessed (filtered/processed) > tableData (raw) > parsedData
        const tableData: Record<string, any>[] = 
          widget.data?.tableDataProcessed || 
          widget.data?.tableData || 
          widget.data?.parsedData || 
          [];
        
        if (!tableData || tableData.length === 0) {
          alert('⚠️ No input data!\n\nPlease connect a data source (File Upload, Supabase, Baseline, or Noise Filter) to this Normalization widget first.');
          return;
        }

        console.log(`[Normalization] ========== START NORMALIZATION ==========`);
        console.log(`[Normalization] Starting ${method} normalization on ${tableData.length} rows`);
        console.log(`[Normalization] Data source:`, widget.data?.tableDataProcessed ? 'tableDataProcessed (filtered/processed)' : widget.data?.tableData ? 'tableData (raw)' : 'parsedData (fallback)');
        console.log(`[Normalization] First row BEFORE normalization:`, tableData[0]);

        const columns = Object.keys(tableData[0]);
        const numericCols = columns.filter((c) => tableData.some((r) => !isNaN(Number(r[c]))));

        // FIXED LOGIC: Only exclude columns that are clearly X-axis (shift, wavenumber)
        // BUT if column name contains "intensity", always include it (even if it also contains "raman" or "shift")
        const xCandidates = ['shift', 'x', 'wavenumber', 'index', 'time', 'label', 's.no', 'id'];
        
        console.log(`[Normalization] 🔍 DEBUGGING COLUMN EXCLUSION:`);
        numericCols.forEach(col => {
          const lowerCol = col.toLowerCase();
          const hasIntensity = lowerCol.includes('intensity') || lowerCol.includes('int');
          const matchedCandidate = xCandidates.find(x => lowerCol.includes(x));
          console.log(`  - Column "${col}" (lowercase: "${lowerCol}")`);
          if (hasIntensity) {
            console.log(`    ✅ Will normalize! (contains "intensity")`);
          } else if (matchedCandidate) {
            console.log(`    ❌ Excluded (matched: "${matchedCandidate}")`);
          } else {
            console.log(`    ✅ Will normalize! (no exclusion match)`);
          }
        });
        
        // Include column if:
        // 1. It contains "intensity" OR
        // 2. It doesn't match any X-axis candidates
        const yCols = numericCols.filter((c) => {
          const lowerCol = c.toLowerCase();
          const hasIntensity = lowerCol.includes('intensity') || lowerCol.includes('int');
          const matchesXAxis = xCandidates.some((x) => lowerCol.includes(x));
          return hasIntensity || !matchesXAxis;
        });
        
        console.log(`[Normalization] All columns in data:`, columns);
        console.log(`[Normalization] All numeric columns:`, numericCols);
        console.log(`[Normalization] Columns to normalize (Y-axis only):`, yCols);
        console.log(`[Normalization] Excluded (X-axis):`, numericCols.filter(c => !yCols.includes(c)));
        
        if (yCols.length === 0) {
          alert('⚠️ ERROR: No intensity columns found to normalize!\n\nThe data might not have the expected column names.\n\nAvailable columns: ' + columns.join(', '));
          return;
        }

        let normalized: Record<string, any>[] = tableData.map((row) => ({ ...row }));

  if (method === 'minmax') {
          // compute min/max per column (only for Y columns)
          const mins: Record<string, number> = {};
          const maxs: Record<string, number> = {};
          yCols.forEach((col) => {
            const vals = tableData.map((r) => Number(r[col])).filter((v) => !isNaN(v));
            mins[col] = vals.length ? Math.min(...vals) : 0;
            maxs[col] = vals.length ? Math.max(...vals) : 0;
          });

          console.log(`[Normalization] Min-Max ranges:`, mins, maxs);
          console.log(`[Normalization] Target range: ${targetMin} → ${targetMax}`);

          // Do not round to fixed decimals so downstream charts show exact values
          // Only normalize Y columns, preserve X columns (Raman Shift, etc.)
          normalized = tableData.map((row, idx) => {
            const newRow: Record<string, any> = { ...row };
            yCols.forEach((col) => {
              const v = Number(row[col]);
              if (isNaN(v)) return;
              const min = mins[col];
              const max = maxs[col];
              if (max === min) {
                newRow[col] = (targetMin + targetMax) / 2;
              } else {
                const scaled = ((v - min) / (max - min)) * (targetMax - targetMin) + targetMin;
                newRow[col] = scaled;
                if (idx === 0) {
                  console.log(`[Normalization] First row ${col}: ${v} → ${scaled} (min=${min}, max=${max})`);
                }
              }
            });
            return newRow;
          });
          
          console.log(`[Normalization] First row AFTER normalization:`, normalized[0]);
        } else if (method === 'zscore') {
          // compute mean/std per column (only for Y columns)
          const means: Record<string, number> = {};
          const stds: Record<string, number> = {};
          yCols.forEach((col) => {
            const vals = tableData.map((r) => Number(r[col])).filter((v) => !isNaN(v));
            const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
            const variance = vals.length ? vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length : 0;
            means[col] = mean;
            stds[col] = Math.sqrt(variance);
          });

          console.log(`[Normalization] Z-score: means=`, means, 'stds=', stds);

          // Keep full precision for z-score as well
          // Only normalize Y columns, preserve X columns
          normalized = tableData.map((row) => {
            const newRow: Record<string, any> = { ...row };
            yCols.forEach((col) => {
              const v = Number(row[col]);
              if (isNaN(v)) return;
              const mean = means[col];
              const std = stds[col];
              newRow[col] = std === 0 ? 0 : (v - mean) / std;
            });
            return newRow;
          });
        }

        console.log(`[Normalization] ✅ Complete! Sample output (first 3 rows):`, normalized.slice(0, 3));

        // Calculate actual output range for verification
        const sampleIntensities = normalized.slice(0, 5).map(r => r['Raman intensity'] || r['Raman Intensity'] || r['intensity']);
        const outputMin = Math.min(...sampleIntensities.filter(v => v !== undefined));
        const outputMax = Math.max(...sampleIntensities.filter(v => v !== undefined));

        // CRITICAL: Set modal preview data FIRST before updating widget
        // This ensures the modal shows the normalized data immediately
        setModalPreviewData(normalized);
        setHasNormalized(true);
        console.log(`[Normalization] ✅ Saved to modalPreviewData: ${normalized.length} rows`);
        console.log(`[Normalization] ✅ Set hasNormalized flag to true`);

        if (onUpdateWidget) {
          onUpdateWidget({ data: { ...(widget.data || {}), tableDataProcessed: normalized, normalizationUsed: 'js', normalizationMethod: method, normalizationParams: { targetMin, targetMax } } });
        }

        // Show success message with actual output range
        alert(`✅ Normalization Applied!\n\nMethod: ${method === 'minmax' ? 'Min-Max' : 'Z-score'}\nRows processed: ${normalized.length}\n\n📊 OUTPUT PREVIEW:\nY-axis range: ${outputMin.toFixed(2)} to ${outputMax.toFixed(2)}\n${method === 'minmax' ? '(Should be 0-1)' : '(Z-score scaled)'}\n\n✅ NOW click green "View Data" button!`);
      };
      // compute overall range from available table data for display
      // Use processed data if available (from previous widget)
      const allTableData: Record<string, any>[] = 
        widget.data?.tableDataProcessed || 
        widget.data?.tableData || 
        widget.data?.parsedData || 
        [];
      let overallRangeText = '';
      if (allTableData && allTableData.length > 0) {
        const allCols = Object.keys(allTableData[0]);
        const allNumericCols = allCols.filter((c) => allTableData.some((r) => !isNaN(Number(r[c]))));
        const allVals: number[] = [];
        allNumericCols.forEach((col) => {
          allTableData.forEach((row) => {
            const v = Number(row[col]);
            if (!isNaN(v)) allVals.push(v);
          });
        });
        if (allVals.length) {
          const overallMin = Math.min(...allVals);
          const overallMax = Math.max(...allVals);
          overallRangeText = `${overallMin} → ${overallMax}`;
        }
      }

      // Function to preview normalization output
      const openNormalizationPreview = () => {
        console.log('[Normalization View] ============ START ============');
        console.log('[Normalization View] hasNormalized flag:', hasNormalized);
        console.log('[Normalization View] modalPreviewData:', modalPreviewData ? `${modalPreviewData.length} rows` : 'NONE');
        console.log('[Normalization View] widget.data.tableDataProcessed:', widget.data?.tableDataProcessed ? `${widget.data.tableDataProcessed.length} rows` : 'NONE');
        
        // First check: Has the user clicked "Apply" yet?
        if (!hasNormalized) {
          alert('⚠️ Normalization not applied yet!\n\nPlease click the blue "Apply" button first to normalize the data.\n\nThen click "View Data" to see the result.');
          console.log('[Normalization View] ❌ Blocked: hasNormalized is false');
          return;
        }
        
        // PRIORITY: Use modalPreviewData (set immediately after normalization)
        const processed = modalPreviewData;
        
        if (!processed || processed.length === 0) {
          alert('⚠️ No normalized data found!\n\nPlease click "Apply" button to run normalization.');
          console.log('[Normalization View] ❌ No data in modalPreviewData');
          return;
        }
        
        console.log('[Normalization View] ✅ Found normalized data:', processed.length, 'rows');
        
        // Check the actual values to verify normalization
        if (processed.length > 0) {
          const firstRow = processed[0];
          const cols = Object.keys(firstRow);
          const intensityCols = cols.filter(c => c.toLowerCase().includes('intensity'));
          
          if (intensityCols.length > 0) {
            const sampleValues = processed.slice(0, 5).map((r: any) => r[intensityCols[0]]);
            console.log('[Normalization View] Sample intensity values:', sampleValues);
            const minVal = Math.min(...sampleValues.map(Number));
            const maxVal = Math.max(...sampleValues.map(Number));
            console.log('[Normalization View] Min:', minVal);
            console.log('[Normalization View] Max:', maxVal);
            
            if (maxVal > 10) {
              console.log('[Normalization View] ❌ WARNING: Data not normalized!');
              alert(`⚠️ WARNING: Data appears NOT normalized!\n\nMax value found: ${maxVal.toFixed(2)}\nExpected: ~1.0\n\nTry clicking "Apply" button again.`);
              return;
            }
            
            console.log(`[Normalization View] ✅ Data is normalized! Range: ${minVal.toFixed(4)} to ${maxVal.toFixed(4)}`);
          }
        }
        
        console.log('[Normalization View] Opening modal with processed data...');
        setShowLineChartModal(true);
        console.log('[Normalization View] ============ END ============');
      };

      const colors = getWidgetColors('normalization');

      return (
        <>
          <OrangeStyleWidget
            icon={Calculator}
            label="Normalize"
            statusText={hasNormalized ? 'Normalized' : ''}
            statusColor={hasNormalized ? 'green' : 'gray'}
            mainColor={colors.main}
            lightColor={colors.light}
            bgColor={colors.bg}
          />

          {/* Parameters Modal */}
          <ParametersModal
            isOpen={showParameters}
            onClose={() => setShowParameters(false)}
            title="Normalization Parameters"
          >
            <div className="space-y-4">
              {/* Method Selector */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">Normalization Method</label>
                <select 
                  value={method} 
                  onChange={(e) => setMethod(e.target.value as any)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="minmax">Min-Max Normalization</option>
                  <option value="zscore">Z-score Standardization</option>
                </select>
              </div>

              {/* Min-Max Range Parameters */}
              {method === 'minmax' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Target Range</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      value={targetMin} 
                      onChange={(e) => setTargetMin(Number(e.target.value))} 
                      className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                      placeholder="Min"
                    />
                    <span className="text-gray-500 text-sm">to</span>
                    <input 
                      type="number" 
                      value={targetMax} 
                      onChange={(e) => setTargetMax(Number(e.target.value))} 
                      className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                      placeholder="Max"
                    />
                  </div>
                  <p className="text-xs text-gray-500">Scale to this range</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Normalization] Compute clicked');
                    runNormalization(); 
                  }} 
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  Compute
                </button>
                <button 
                  type="button" 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Normalization] Apply & Close clicked');
                    runNormalization(); 
                    setShowParameters(false); 
                  }} 
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  Apply & Close
                </button>
                <button 
                  type="button" 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Normalization] Reset clicked');
                    setMethod('minmax'); 
                    setTargetMin(0); 
                    setTargetMax(1); 
                  }} 
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  Reset
                </button>
              </div>
            </div>
          </ParametersModal>
        </>
      );
    }

    // Temporarily keep old rendering for reference
    if (false && widget.type === 'normalization-old') {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full cursor-default px-2" onClick={(e) => e.stopPropagation()}>

          {/* Outer connection circle */}
          <div className="rounded-full p-1 flex items-center justify-center" style={{ border: '2px dashed rgba(0,0,0,0.06)', borderRadius: 999 }}>
            {/* Inner icon circle */}
            <div
              className="rounded-full p-1 flex items-center justify-center"
              style={{ borderRadius: 999 }}
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center icon-outer`}
                style={{ width: 64, height: 64 }}
              >
                <Calculator className={`h-5 w-5 transition-transform duration-200 icon ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`} />
              </div>
            </div>
          </div>

          <div className="mt-2 text-[12px] font-medium text-center">Normalization</div>
          {/* Overall range text removed to avoid unused/undefined variable in legacy block */}
        </div>
      );
    }
    if (widget.type === 'future-extraction') {
      const [method, setMethod] = useState<'naive' | 'linear' | 'moving_average' | 'exponential' | 'pattern' | 'peak_detection' | 'statistical_features' | 'spectral_fingerprint'>('linear');
      const [horizon, setHorizon] = useState<number>(10);
      const [lookback, setLookback] = useState<number>(20);
      const [alpha, setAlpha] = useState<number>(0.3);
      const [minDistance, setMinDistance] = useState<number>(5);
      const [threshold, setThreshold] = useState<number>(0.3);
      const [numPeaks, setNumPeaks] = useState<number>(5);

      const runForecast = () => {
        const tableData: Record<string, any>[] = widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || [];
        if (!tableData || tableData.length === 0) {
          alert('⚠️ No data available for forecasting!\n\nPlease connect a data source first.');
          return;
        }

        console.log(`[Future Extraction] Starting ${method} with ${tableData.length} data points`);

        // Feature Extraction Methods (Peak Detection, Statistical Features, Spectral Fingerprinting)
        if (method === 'peak_detection' || method === 'statistical_features' || method === 'spectral_fingerprint') {
          // Try multiple possible column names for intensity and shift
          const intensityKeys = ['intensity', 'Raman intensity', 'Raman Intensity', 'raman intensity', 'Intensity', 'y', 'Y'];
          const shiftKeys = ['shift', 'Raman shift', 'Raman Shift', 'raman shift', 'Shift', 'x', 'X', 'wavenumber', 'Wavenumber'];
          
          let intensityKey = intensityKeys.find(key => tableData[0] && tableData[0][key] !== undefined);
          let shiftKey = shiftKeys.find(key => tableData[0] && tableData[0][key] !== undefined);
          
          if (!intensityKey) {
            // Fallback: find first numeric column
            const cols = Object.keys(tableData[0] || {});
            intensityKey = cols.find(col => !isNaN(Number(tableData[0][col])));
          }
          
          console.log(`[Future Extraction] Using columns: intensity="${intensityKey}", shift="${shiftKey}"`);
          
          const intensities = tableData.map(r => Number(r[intensityKey as string] || 0));
          const shifts = tableData.map((r, i) => shiftKey ? Number(r[shiftKey] || i) : i);
          
          // Validate data
          const validIntensities = intensities.filter(v => !isNaN(v) && v !== 0);
          console.log(`[Future Extraction] Data validation: ${validIntensities.length}/${intensities.length} valid intensity values`);
          console.log(`[Future Extraction] Intensity range: ${Math.min(...validIntensities)} to ${Math.max(...validIntensities)}`);
          
          if (validIntensities.length === 0) {
            alert(`⚠️ No valid intensity data found!\n\nPossible issues:\n1. Wrong data source\n2. Column names don't match\n3. Data not loaded\n\nAvailable columns: ${Object.keys(tableData[0] || {}).join(', ')}`);
            return;
          }
          
          let resultData: any[] = [];
          
          if (method === 'peak_detection') {
            // Peak Detection
            console.log('[Peak Detection] Starting peak detection...');
            console.log(`[Peak Detection] Parameters: threshold=${threshold}, minDistance=${minDistance}`);
            console.log(`[Peak Detection] Data points: ${intensities.length}`);
            console.log(`[Peak Detection] Intensity range: ${Math.min(...intensities)} to ${Math.max(...intensities)}`);
            console.log(`[Peak Detection] Sample intensities (first 10):`, intensities.slice(0, 10));
            
            const peaks: any[] = [];
            
            for (let i = minDistance; i < intensities.length - minDistance; i++) {
              let is_peak = true;
              
              if (intensities[i] <= threshold) continue;
              
              // Check left side
              for (let j = 1; j <= minDistance; j++) {
                if (intensities[i] <= intensities[i - j]) {
                  is_peak = false;
                  break;
                }
              }
              
              if (!is_peak) continue;
              
              // Check right side
              for (let j = 1; j <= minDistance; j++) {
                if (intensities[i] <= intensities[i + j]) {
                  is_peak = false;
                  break;
                }
              }
              
              if (is_peak) {
                peaks.push({
                  peak_number: peaks.length + 1,
                  position: shifts[i],
                  intensity: intensities[i],
                  index: i
                });
                console.log(`[Peak Detection] Found peak #${peaks.length}: intensity=${intensities[i]} at position=${shifts[i]}`);
              }
            }
            
            // Sort by intensity
            resultData = peaks.sort((a, b) => b.intensity - a.intensity);
            console.log(`[Peak Detection] Found ${resultData.length} peaks`);
            console.log('[Peak Detection] Final results:', resultData);
            
            if (resultData.length === 0) {
              const dataMax = Math.max(...intensities);
              const suggestedThreshold = dataMax > 10 ? (dataMax * 0.1).toFixed(2) : '0.3';
              alert(`⚠️ No peaks found!\n\n` +
                    `Current Settings:\n` +
                    `• Threshold: ${threshold}\n` +
                    `• Min Distance: ${minDistance}\n\n` +
                    `Data Info:\n` +
                    `• Range: ${Math.min(...intensities).toFixed(2)} to ${dataMax.toFixed(2)}\n` +
                    `• Data points: ${intensities.length}\n\n` +
                    `💡 SUGGESTIONS:\n` +
                    `${dataMax > 10 ? `• Your data appears to be raw (not normalized)\n• Try threshold: ${suggestedThreshold}` : '• Lower threshold or minDistance'}`);
              return;
            }
            
            alert(`✅ Peak Detection Complete!\n\n` +
                  `Found ${resultData.length} peaks\n\n` +
                  `Strongest peak:\n` +
                  `• Position: ${resultData[0].position.toFixed(2)}\n` +
                  `• Intensity: ${resultData[0].intensity.toFixed(4)}\n\n` +
                  `Check Data Table for all peaks!`);

            
          } else if (method === 'statistical_features') {
            // Statistical Features
            console.log('[Statistical Features] Calculating statistics...');
            const mean_intensity = intensities.reduce((a, b) => a + b, 0) / intensities.length;
            const sorted_intensities = [...intensities].sort((a, b) => a - b);
            const median_intensity = sorted_intensities[Math.floor(sorted_intensities.length / 2)];
            const variance = intensities.reduce((a, b) => a + Math.pow(b - mean_intensity, 2), 0) / intensities.length;
            const std_intensity = Math.sqrt(variance);
            const max_intensity = Math.max(...intensities);
            const min_intensity = Math.min(...intensities);
            const percentile_25 = sorted_intensities[Math.floor(sorted_intensities.length * 0.25)];
            const percentile_75 = sorted_intensities[Math.floor(sorted_intensities.length * 0.75)];
            const iqr = percentile_75 - percentile_25;
            const skewness = std_intensity > 0 ? intensities.reduce((a, b) => a + Math.pow((b - mean_intensity) / std_intensity, 3), 0) / intensities.length : 0;
            const kurtosis = std_intensity > 0 ? intensities.reduce((a, b) => a + Math.pow((b - mean_intensity) / std_intensity, 4), 0) / intensities.length : 0;
            
            // Calculate area using trapezoidal rule
            let total_area = 0;
            for (let i = 1; i < intensities.length; i++) {
              total_area += (shifts[i] - shifts[i-1]) * (intensities[i] + intensities[i-1]) / 2;
            }
            
            const features = {
              mean_intensity,
              median_intensity,
              std_intensity,
              variance,
              max_intensity,
              min_intensity,
              intensity_range: max_intensity - min_intensity,
              percentile_25,
              percentile_75,
              iqr,
              skewness,
              kurtosis,
              total_area,
              num_points: intensities.length,
              shift_range: `${shifts[0].toFixed(1)} - ${shifts[shifts.length-1].toFixed(1)}`
            };
            
            resultData = Object.entries(features).map(([key, value]) => ({
              feature: key,
              value: typeof value === 'number' ? parseFloat(value.toFixed(4)) : value,
              category: 'statistics'
            }));
            
            console.log(`[Statistical Features] Extracted ${resultData.length} features`);
            alert(`📊 Statistical Features Extracted!\n\nTotal features: ${resultData.length}\nMean: ${mean_intensity.toFixed(4)}\nStd Dev: ${std_intensity.toFixed(4)}\nRange: ${(max_intensity - min_intensity).toFixed(4)}`);
            
          } else if (method === 'spectral_fingerprint') {
            // Spectral Fingerprinting
            console.log('[Spectral Fingerprint] Creating fingerprint...');
            console.log(`[Spectral Fingerprint] Parameters: numPeaks=${numPeaks}, minDistance=${minDistance}`);
            console.log(`[Spectral Fingerprint] Data points: ${intensities.length}`);
            console.log(`[Spectral Fingerprint] Intensity range: ${Math.min(...intensities)} to ${Math.max(...intensities)}`);
            
            const peaks: any[] = [];
            
            // Find all peaks
            for (let i = minDistance; i < intensities.length - minDistance; i++) {
              let is_peak = true;
              
              for (let j = 1; j <= minDistance; j++) {
                if (intensities[i] <= intensities[i - j] || intensities[i] <= intensities[i + j]) {
                  is_peak = false;
                  break;
                }
              }
              
              const peakThreshold = Math.max(...intensities) > 10 ? Math.max(...intensities) * 0.01 : 0.1;
              if (is_peak && intensities[i] > peakThreshold) {
                peaks.push({
                  position: shifts[i],
                  intensity: intensities[i],
                  relative_intensity: 0
                });
                console.log(`[Spectral Fingerprint] Found peak: intensity=${intensities[i]} at position=${shifts[i]}`);
              }
            }
            
            console.log(`[Spectral Fingerprint] Total peaks found: ${peaks.length}`);
            
            // Sort and take top N
            const sorted_peaks = peaks.sort((a, b) => b.intensity - a.intensity);
            const fingerprint_peaks = sorted_peaks.slice(0, numPeaks);
            
            // Calculate relative intensities
            if (fingerprint_peaks.length > 0) {
              const max_int = fingerprint_peaks[0].intensity;
              fingerprint_peaks.forEach(p => {
                p.relative_intensity = max_int > 0 ? p.intensity / max_int : 0;
              });
            }
            
            // Sort by position
            fingerprint_peaks.sort((a, b) => a.position - b.position);
            
            resultData = fingerprint_peaks.map((p, i) => ({
              rank: i + 1,
              position: parseFloat(p.position.toFixed(1)),
              intensity: parseFloat(p.intensity.toFixed(4)),
              relative_intensity: parseFloat(p.relative_intensity.toFixed(3)),
              percentage: parseFloat((p.relative_intensity * 100).toFixed(1))
            }));
            
            const fingerprint_id = fingerprint_peaks.map(p => p.position.toFixed(0)).join('-');
            resultData.push({
              fingerprint_id,
              num_peaks: resultData.length,
              type: 'summary'
            });
            
            console.log(`[Spectral Fingerprint] Created fingerprint with ${fingerprint_peaks.length} peaks`);
            console.log('[Spectral Fingerprint] Final results:', resultData);
            
            if (fingerprint_peaks.length === 0) {
              alert(`⚠️ No peaks found for fingerprint!\n\n` +
                    `Total peaks detected: ${peaks.length}\n` +
                    `Requested top: ${numPeaks}\n` +
                    `Data range: ${Math.min(...intensities).toFixed(2)} to ${Math.max(...intensities).toFixed(2)}\n\n` +
                    `� Try lowering minDistance (currently ${minDistance})`);
              return;
            }
            
            alert(`✅ Spectral Fingerprint Created!\n\n` +
                  `Fingerprint ID: ${fingerprint_id}\n\n` +
                  `Characteristic peaks: ${fingerprint_peaks.length}\n` +
                  `Positions: ${fingerprint_peaks.map(p => p.position.toFixed(0)).join(', ')}\n\n` +
                  `Check Data Table for details!`);

          }
          
          if (onUpdateWidget) {
            onUpdateWidget({
              data: {
                ...(widget.data || {}),
                tableDataProcessed: resultData,
                featureExtractionMethod: method,
                featureExtractionParams: { threshold, minDistance, numPeaks }
              }
            });
          }
          
          return;
        }

        // Forecasting Methods (existing code)
        const columns = Object.keys(tableData[0]);
        const numericCols = columns.filter((c) => tableData.some((r) => !isNaN(Number(r[c]))));

        // Prepare forecasts per column
        const colForecasts: Record<string, number[]> = {};
        
        numericCols.forEach((col) => {
          const valsAll = tableData.map((r) => Number(r[col])).filter((v) => !isNaN(v));
          
          if (method === 'naive') {
            // Naive: Repeat last value
            const last = valsAll.length ? valsAll[valsAll.length - 1] : 0;
            colForecasts[col] = Array(horizon).fill(Number((last).toFixed(4)));
            
          } else if (method === 'moving_average') {
            // Moving Average: Average of last N points
            const windowSize = Math.min(5, valsAll.length);
            const recentValues = valsAll.slice(-windowSize);
            const avgValue = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
            colForecasts[col] = Array(horizon).fill(Number(avgValue.toFixed(4)));
            
          } else if (method === 'linear') {
            // Linear Regression: Fit trend line
            const lb = Math.max(2, Math.min(lookback, valsAll.length));
            const start = valsAll.length - lb;
            const xs: number[] = [];
            const ys: number[] = [];
            for (let i = 0; i < lb; i++) {
              xs.push(i);
              ys.push(valsAll[start + i]);
            }
            const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
            const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
            let num = 0;
            let den = 0;
            for (let i = 0; i < xs.length; i++) {
              num += (xs[i] - xMean) * (ys[i] - yMean);
              den += (xs[i] - xMean) * (xs[i] - xMean);
            }
            const slope = den === 0 ? 0 : num / den;
            const intercept = yMean - slope * xMean;
            const preds: number[] = [];
            for (let h = 0; h < horizon; h++) {
              const xi = lb + h;
              const pred = Math.max(0, slope * xi + intercept);
              preds.push(Number(pred.toFixed(4)));
            }
            colForecasts[col] = preds;
            
          } else if (method === 'exponential') {
            // Exponential Smoothing: Weighted average with trend
            const smoothed = [valsAll[0]];
            for (let i = 1; i < valsAll.length; i++) {
              const smoothedValue = alpha * valsAll[i] + (1 - alpha) * smoothed[i - 1];
              smoothed.push(smoothedValue);
            }
            
            const trendWindow = Math.min(10, smoothed.length);
            const trend = (smoothed[smoothed.length - 1] - smoothed[smoothed.length - trendWindow]) / trendWindow;
            
            const preds: number[] = [];
            let currentForecast = smoothed[smoothed.length - 1];
            for (let h = 0; h < horizon; h++) {
              currentForecast = Math.max(0, currentForecast + trend);
              preds.push(Number(currentForecast.toFixed(4)));
            }
            colForecasts[col] = preds;
            
          } else if (method === 'pattern') {
            // Pattern-Based: Detect periodicity and repeat pattern
            const patternLength = Math.min(30, valsAll.length);
            const recentData = valsAll.slice(-patternLength);
            
            // Detect peaks to find period
            const peaks: number[] = [];
            for (let i = 1; i < recentData.length - 1; i++) {
              if (recentData[i] > recentData[i - 1] && recentData[i] > recentData[i + 1]) {
                peaks.push(i);
              }
            }
            
            let isPeriodic = false;
            let avgPeriod = patternLength;
            
            if (peaks.length >= 2) {
              const periods: number[] = [];
              for (let i = 1; i < peaks.length; i++) {
                periods.push(peaks[i] - peaks[i - 1]);
              }
              avgPeriod = Math.round(periods.reduce((a, b) => a + b, 0) / periods.length);
              isPeriodic = true;
            }
            
            const preds: number[] = [];
            if (isPeriodic) {
              // Repeat pattern
              const pattern = valsAll.slice(-avgPeriod);
              for (let h = 0; h < horizon; h++) {
                const patternIndex = h % pattern.length;
                preds.push(Number(pattern[patternIndex].toFixed(4)));
              }
            } else {
              // Use polynomial fit
              const x = Array.from({ length: recentData.length }, (_, i) => i);
              // Simple quadratic approximation
              const xMean = x.reduce((a, b) => a + b, 0) / x.length;
              const yMean = recentData.reduce((a, b) => a + b, 0) / recentData.length;
              let slope = 0, denom = 0;
              for (let i = 0; i < x.length; i++) {
                slope += (x[i] - xMean) * (recentData[i] - yMean);
                denom += (x[i] - xMean) * (x[i] - xMean);
              }
              slope = denom !== 0 ? slope / denom : 0;
              const intercept = yMean - slope * xMean;
              
              for (let h = 0; h < horizon; h++) {
                const xFuture = recentData.length + h;
                const pred = Math.max(0, slope * xFuture + intercept);
                preds.push(Number(pred.toFixed(4)));
              }
            }
            colForecasts[col] = preds;
          }
        });

        // Build forecast rows
        const lastRow = tableData[tableData.length - 1] || {};
        const forecastRows: Record<string, any>[] = [];
        
        for (let h = 0; h < horizon; h++) {
          const newRow: Record<string, any> = { ...lastRow };
          newRow._forecast = true;
          newRow._forecastStep = h + 1;
          newRow._forecastMethod = method;
          
          numericCols.forEach((col) => {
            const preds = colForecasts[col] || [];
            newRow[col] = preds[h] !== undefined ? preds[h] : newRow[col];
          });
          
          forecastRows.push(newRow);
        }

        const appended = [...tableData, ...forecastRows];
        
        if (onUpdateWidget) {
          onUpdateWidget({ 
            data: { 
              ...(widget.data || {}), 
              tableDataForecast: forecastRows, 
              tableDataProcessed: appended,
              forecastMethod: method,
              forecastParams: { horizon, lookback, alpha }
            } 
          });
        }

        console.log(`[Future Extraction] Generated ${forecastRows.length} forecast points using ${method} method`);
        alert(`✅ Forecast Complete!\n\nMethod: ${method}\nGenerated: ${forecastRows.length} future points\n\nConnect to Line Chart to visualize!`);
      };

      const colors = getWidgetColors('future-extraction');
      const hasData = widget.data?.tableDataProcessed || widget.data?.tableDataForecast;

      return (
        <>
          <OrangeStyleWidget
            icon={LineChart}
            label="Future Extraction"
            statusText={hasData ? 'Extracted' : ''}
            statusColor={hasData ? 'green' : 'gray'}
            mainColor={colors.main}
            lightColor={colors.light}
            bgColor={colors.bg}
          />

          {/* Parameters Modal */}
          <ParametersModal
            isOpen={showParameters}
            onClose={() => setShowParameters(false)}
            title="Future Extraction Parameters"
          >
            <div className="space-y-4">
              {/* Method Selector */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">Method</label>
                <select 
                  value={method} 
                  onChange={(e) => setMethod(e.target.value as any)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <optgroup label="📈 Forecasting">
                    <option value="naive">Naive (Last Value)</option>
                    <option value="moving_average">Moving Average</option>
                    <option value="linear">Linear Trend</option>
                    <option value="exponential">Exponential Smoothing</option>
                    <option value="pattern">Pattern Detection</option>
                  </optgroup>
                  <optgroup label="🔍 Feature Extraction">
                    <option value="peak_detection">Peak Detection</option>
                    <option value="statistical_features">Statistical Features</option>
                    <option value="spectral_fingerprint">Spectral Fingerprinting</option>
                  </optgroup>
                </select>
              </div>

              {/* Forecasting parameters */}
              {['naive', 'moving_average', 'linear', 'exponential', 'pattern'].includes(method) && (
                <>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Horizon</label>
                    <input 
                      type="number" 
                      min={1} 
                      max={50}
                      value={horizon} 
                      onChange={(e) => setHorizon(Number(e.target.value))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    />
                    <p className="text-xs text-gray-500">Number of future steps</p>
                  </div>

                  {(method === 'linear' || method === 'exponential' || method === 'pattern') && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">Lookback</label>
                      <input 
                        type="number" 
                        min={2} 
                        max={100}
                        value={lookback} 
                        onChange={(e) => setLookback(Number(e.target.value))} 
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                      />
                      <p className="text-xs text-gray-500">Historical data points</p>
                    </div>
                  )}

                  {method === 'exponential' && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">Alpha (α)</label>
                      <input 
                        type="number" 
                        min={0.1} 
                        max={1}
                        step={0.1}
                        value={alpha} 
                        onChange={(e) => setAlpha(Number(e.target.value))} 
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                      />
                      <p className="text-xs text-gray-500">Smoothing factor (0.1-1.0)</p>
                    </div>
                  )}
                </>
              )}

              {/* Feature Extraction parameters */}
              {method === 'peak_detection' && (
                <>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Threshold</label>
                    <input 
                      type="number" 
                      min={0}
                      max={1}
                      step={0.1}
                      value={threshold} 
                      onChange={(e) => setThreshold(Number(e.target.value))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    />
                    <p className="text-xs text-gray-500">Minimum peak intensity</p>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Min Distance</label>
                    <input 
                      type="number" 
                      min={1}
                      max={20}
                      value={minDistance} 
                      onChange={(e) => setMinDistance(Number(e.target.value))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    />
                    <p className="text-xs text-gray-500">Min points between peaks</p>
                  </div>
                </>
              )}

              {method === 'spectral_fingerprint' && (
                <>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Top Peaks</label>
                    <input 
                      type="number" 
                      min={1}
                      max={10}
                      value={numPeaks} 
                      onChange={(e) => setNumPeaks(Number(e.target.value))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    />
                    <p className="text-xs text-gray-500">Number of peaks to extract</p>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Min Distance</label>
                    <input 
                      type="number" 
                      min={1}
                      max={20}
                      value={minDistance} 
                      onChange={(e) => setMinDistance(Number(e.target.value))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    />
                    <p className="text-xs text-gray-500">Min points between peaks</p>
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[PeakDetection] Compute clicked');
                    runForecast(); 
                  }} 
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  Compute
                </button>
                <button 
                  type="button" 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[PeakDetection] Apply & Close clicked');
                    runForecast(); 
                    setShowParameters(false); 
                  }} 
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  Apply & Close
                </button>
                <button 
                  type="button" 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[PeakDetection] Reset clicked');
                    setMethod('peak_detection'); 
                    setHorizon(10); 
                    setLookback(20); 
                    setAlpha(0.3);
                    setThreshold(0);
                    setMinDistance(5);
                    setNumPeaks(5);
                  }} 
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>
          </ParametersModal>
        </>
      );
    }
    if (widget.type === 'spectral-segmentation') {
      const [method, setMethod] = useState<'threshold' | 'kmeans'>('kmeans');
      const [threshold, setThreshold] = useState<number>(0);
      const [k, setK] = useState<number>(3);
      const [selectedCols, setSelectedCols] = useState<string[]>([]);

      const toggleCol = (col: string) => {
        setSelectedCols((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
      };
      // keep a reference to avoid unused-variable lint in some widget variants
      void toggleCol;

      const runSegmentation = () => {
        const tableData: Record<string, any>[] = widget.data?.tableData || widget.data?.parsedData || [];
        if (!tableData || tableData.length === 0) return;

        const allCols = Object.keys(tableData[0]);
        const cols = selectedCols.length ? selectedCols : allCols.filter((c) => tableData.some((r) => !isNaN(Number(r[c]))));
        if (cols.length === 0) return;

        const numericData = tableData.map((r) => cols.map((c) => Number(r[c]) || 0));

        let labels: number[] = [];

        if (method === 'threshold') {
          // simple threshold on the first selected column
          const col = cols[0];
          labels = tableData.map((r) => (Number(r[col]) >= threshold ? 1 : 0));
        } else {
          // simple k-means (Lloyd) on numericData
          const maxIters = 50;
          const n = numericData.length;
          const dims = numericData[0].length;
          // initialize centers by picking first k points (or random)
          const centers: number[][] = [];
          for (let i = 0; i < k; i++) {
            centers.push(numericData[i % n].slice());
          }

          labels = new Array(n).fill(0);
          for (let iter = 0; iter < maxIters; iter++) {
            let changed = false;
            // assign
            for (let i = 0; i < n; i++) {
              let best = 0;
              let bestDist = Infinity;
              for (let ci = 0; ci < centers.length; ci++) {
                const center = centers[ci];
                let dist = 0;
                for (let d = 0; d < dims; d++) {
                  const diff = numericData[i][d] - center[d];
                  dist += diff * diff;
                }
                if (dist < bestDist) {
                  bestDist = dist;
                  best = ci;
                }
              }
              if (labels[i] !== best) {
                labels[i] = best;
                changed = true;
              }
            }
            // update centers
            const sums: number[][] = Array(centers.length).fill(0).map(() => Array(dims).fill(0));
            const counts: number[] = Array(centers.length).fill(0);
            for (let i = 0; i < n; i++) {
              const lab = labels[i];
              counts[lab] += 1;
              for (let d = 0; d < dims; d++) sums[lab][d] += numericData[i][d];
            }
            for (let ci = 0; ci < centers.length; ci++) {
              if (counts[ci] === 0) continue;
              for (let d = 0; d < dims; d++) centers[ci][d] = sums[ci][d] / counts[ci];
            }
            if (!changed) break;
          }
        }

        // attach labels and summary
        const processed = tableData.map((r, i) => ({ ...r, _segment: labels[i] }));
        const segmentsSummary: Record<string, any> = {};
        labels.forEach((lab) => {
          segmentsSummary[lab] = (segmentsSummary[lab] || 0) + 1;
        });

        if (onUpdateWidget) {
          onUpdateWidget({ data: { ...(widget.data || {}), tableDataProcessed: processed, segments: segmentsSummary } });
        }
      };

      const colors = getWidgetColors('spectral-segmentation');
      const hasData = widget.data?.tableDataProcessed;

      return (
        <>
          <OrangeStyleWidget
            icon={Box}
            label="Segmentation"
            statusText={hasData ? 'Segmented' : ''}
            statusColor={hasData ? 'green' : 'gray'}
            mainColor={colors.main}
            lightColor={colors.light}
            bgColor={colors.bg}
          />

          {/* Parameters Modal */}
          <ParametersModal
            isOpen={showParameters}
            onClose={() => setShowParameters(false)}
            title="Spectral Segmentation Parameters"
          >
            <div className="space-y-4">
              {/* Method Selector */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">Method</label>
                <select 
                  value={method} 
                  onChange={(e) => setMethod(e.target.value as any)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="kmeans">K-means</option>
                  <option value="threshold">Threshold</option>
                </select>
              </div>

              {/* Threshold parameter */}
              {method === 'threshold' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Threshold Value</label>
                  <input 
                    type="number" 
                    value={threshold} 
                    onChange={(e) => setThreshold(Number(e.target.value))} 
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500">Threshold cutoff value</p>
                </div>
              )}

              {/* K parameter */}
              {method === 'kmeans' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Number of Clusters (K)</label>
                  <input 
                    type="number" 
                    min={2} 
                    value={k} 
                    onChange={(e) => setK(Number(e.target.value))} 
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500">Number of clusters (min: 2)</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Segmentation] Compute clicked');
                    runSegmentation(); 
                  }} 
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  Compute
                </button>
                <button 
                  type="button" 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Segmentation] Apply & Close clicked');
                    runSegmentation(); 
                    setShowParameters(false); 
                  }} 
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  Apply & Close
                </button>
                <button 
                  type="button" 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Segmentation] Reset clicked');
                    setMethod('kmeans'); 
                    setK(3); 
                    setThreshold(0); 
                  }} 
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>
          </ParametersModal>
        </>
      );
    }

    // PCA Analysis widget rendering
    if (widget.type === 'pca-analysis') {
      const runPCA = async () => {
        const tableData = widget.data?.tableData || widget.data?.parsedData || [];
        if (!tableData || tableData.length === 0) {
          alert('⚠️ No data available!\n\nPlease connect a data source (File Upload, Noise Filter, etc.) to this PCA widget.');
          return;
        }

        setPcaRunning(true);
        try {
          const response = await fetch('/api/pca', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tableData,
              params: {
                n_components: nComponents,
                standardize
              }
            })
          });

          if (!response.ok) {
            // Try to parse JSON error body; if that fails, fall back to plain text.
            let parsedErr: any = null;
            try {
              parsedErr = await response.json();
            } catch (parseErr) {
              try {
                const txt = await response.text();
                parsedErr = { error: txt || `HTTP ${response.status}` };
              } catch (txtErr) {
                parsedErr = { error: `HTTP ${response.status}` };
              }
            }
            throw new Error(parsedErr?.error || 'PCA computation failed');
          }

          const pcaResults = await response.json();
          
          // Store results in widget data
          onUpdateWidget && onUpdateWidget({
            data: {
              ...widget.data,
              pcaParams: { nComponents, standardize },
              pcaResults,
              tableDataProcessed: pcaResults.transformed
            }
          });

          // Do not auto-open results panel here — require explicit "View Results" click
          console.log('[PCA] ✅ PCA computed successfully:', pcaResults);

        } catch (err: any) {
          console.error('[PCA] ❌ Error:', err);
          alert(`PCA computation failed:\n\n${err.message}\n\nMake sure the PCA service is running on port 6005.`);
        } finally {
          setPcaRunning(false);
        }
      };

      const applyPCASettings = () => {
        // Store params on the widget for later pipeline use
        console.log('[PCA] Applying settings - nComponents:', nComponents, 'standardize:', standardize);
        onUpdateWidget && onUpdateWidget({
          data: {
            ...widget.data,
            pcaParams: { nComponents, standardize }
          }
        });
      };

      const colors = getWidgetColors('pca-analysis');
      const hasResults = widget.data?.pcaResults && widget.data.pcaResults.transformed;
      console.log('[PCA Widget] hasResults:', hasResults, 'pcaResults:', widget.data?.pcaResults);

      // Prepare small datasets for inline mini-charts
      const pcaLocal = widget.data?.pcaResults || null;
      const screeData = (pcaLocal?.explained_variance_ratio || []).map((v: any, i: number) => ({ name: `${i + 1}`, value: Number(v) }));
      const scatterData = (pcaLocal?.transformed || []).map((row: any) => {
        const vals = Object.values(row).map((x: any) => Number(x));
        return { x: vals[0] ?? 0, y: vals[1] ?? 0 };
      });

      return (
        <>
          <div ref={rootRef} onClick={(e) => {
            // Click on widget icon to open parameters
            const target = e.target as HTMLElement;
            if (!target.closest('button, input')) {
              e.stopPropagation();
              console.log('[PCA] Opening parameters modal');
              setShowParameters(true);
            }
          }}>
            <OrangeStyleWidget
              icon={Search}
              label={getWidgetLabel('pca-analysis')}
              statusText={hasResults ? `${widget.data.pcaResults.transformed.length} samples` : ''}
              statusColor={hasResults ? 'green' : 'gray'}
              mainColor={colors.main}
              lightColor={colors.light}
              bgColor={colors.bg}
            >
              {/* Controls section - shown on hover */}
              <div className="mt-2 flex flex-col items-center gap-2">
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setShowParameters(true); 
                  }} 
                  className="px-3 py-1.5 text-xs font-medium rounded transition-colors text-white"
                  style={{ backgroundColor: colors.main }}
                >
                  Configure PCA
                </button>
                {hasResults && (
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation();
                      console.log('[PCA] View Results clicked, pcaResults:', widget.data?.pcaResults);
                      setShowInlineResults(true); 
                    }} 
                    className="px-3 py-1.5 text-xs font-medium rounded transition-colors"
                    style={{
                      backgroundColor: colors.light,
                      color: colors.main,
                    }}
                  >
                    View Results
                  </button>
                )}
                {hasResults && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('[PCA] View Data clicked');
                      setModalPreviewData(widget.data?.pcaResults?.transformed || widget.data?.tableDataProcessed || []);
                      setShowLineChartModal(true);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded transition-colors text-white"
                    style={{ backgroundColor: colors.main }}
                  >
                    View Data
                  </button>
                )}
              </div>
            </OrangeStyleWidget>
          </div>

          {/* Parameters Modal */}
          <ParametersModal
            isOpen={showParameters}
            onClose={() => setShowParameters(false)}
            title="PCA Parameters"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Number of Components: <span className="text-blue-600 font-bold">{nComponents}</span></label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const val = Math.max(1, nComponents - 1);
                      console.log('[PCA] 🔢 Decreased to:', val);
                      setNComponents(val);
                      if (onUpdateWidget) {
                        onUpdateWidget({
                          data: {
                            ...widget.data,
                            pcaParams: { ...widget.data?.pcaParams, nComponents: val, standardize }
                          }
                        });
                      }
                    }}
                    className="px-3 py-2 bg-red-500 text-white text-xl font-bold rounded hover:bg-red-600 cursor-pointer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={nComponents}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                      console.log('[PCA] 🔢 Components changed to:', val);
                      setNComponents(val);
                      if (onUpdateWidget) {
                        onUpdateWidget({
                          data: {
                            ...widget.data,
                            pcaParams: { ...widget.data?.pcaParams, nComponents: val, standardize }
                          }
                        });
                      }
                    }}
                    className="flex-1 px-3 py-2 border-2 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-semibold text-center"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const val = Math.min(10, nComponents + 1);
                      console.log('[PCA] 🔢 Increased to:', val);
                      setNComponents(val);
                      if (onUpdateWidget) {
                        onUpdateWidget({
                          data: {
                            ...widget.data,
                            pcaParams: { ...widget.data?.pcaParams, nComponents: val, standardize }
                          }
                        });
                      }
                    }}
                    className="px-3 py-2 bg-green-500 text-white text-xl font-bold rounded hover:bg-green-600 cursor-pointer"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Use +/− buttons or type directly (1-10). Current: {nComponents}</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="pca-standardize"
                  type="checkbox"
                  checked={standardize}
                  onChange={(e) => setStandardize(e.target.checked)}
                />
                <label htmlFor="pca-standardize" className="text-sm">Standardize features (Z-score) before PCA</label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[PCA] Run PCA clicked with nComponents:', nComponents);
                    runPCA(); 
                  }}
                  disabled={pcaRunning}
                  className={`px-3 py-1 text-white rounded text-sm cursor-pointer ${pcaRunning ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                  style={{ pointerEvents: 'auto' }}
                >
                  {pcaRunning ? 'Running...' : 'Run PCA'}
                </button>
                <button
                  type="button"
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[PCA] Save Settings clicked');
                    applyPCASettings();
                    setShowParameters(false);
                  }}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  Apply & Close
                </button>
                {hasResults && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[PCA] View Results (from params modal) clicked');
                      console.log('[PCA] Results data:', widget.data?.pcaResults);
                      setShowParameters(false); // Close parameters modal first
                      setTimeout(() => {
                        setShowInlineResults(true); // Then open inline results panel
                      }, 100);
                    }}
                    className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 cursor-pointer"
                    style={{ pointerEvents: 'auto' }}
                  >
                    View Results
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[PCA] Reset clicked');
                    setNComponents(2); 
                    setStandardize(true); 
                  }}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  Reset
                </button>
              </div>
            </div>
          </ParametersModal>

          {/* Inline PCA Results panel (displayed directly under widget) */}
          {showInlineResults && widget.data?.pcaResults && (
            <div className="mt-4 w-full flex justify-center" onClick={(e) => e.stopPropagation()}>
              <div className="bg-white rounded-lg shadow-lg border p-4 w-[520px]">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold">PCA Results</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[PCA] Inline Close clicked');
                        setShowInlineResults(false);
                      }}
                      className="px-2 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300 cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[PCA] Open Fullscreen clicked');
                        setShowPCAResults(true);
                      }}
                      className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
                    >
                      Open Fullscreen
                    </button>
                  </div>
                </div>
                <div className="flex flex-row gap-8">
                  <div className="flex flex-col items-center p-2 bg-white rounded shadow" style={{ minWidth: 320 }}>
                    <p className="text-sm mb-2">Scree (explained variance)</p>
                    <div style={{ width: 320, height: 200 }}>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={screeData}>
                          <XAxis dataKey="name" hide />
                          <YAxis hide domain={[0, 'dataMax']} />
                          <Tooltip formatter={(val: any) => `${(val * 100).toFixed(1)}%`} />
                          <Bar dataKey="value" fill="#2563eb" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="flex flex-col items-center p-2 bg-white rounded shadow" style={{ minWidth: 320 }}>
                    <p className="text-sm mb-2">PC1 vs PC2 (scatter)</p>
                    <div style={{ width: 320, height: 200 }}>
                      <ResponsiveContainer width="100%" height={200}>
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="x" name="PC1" />
                          <YAxis dataKey="y" name="PC2" />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                          <Scatter data={scatterData} fill="#10b981" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PCA Results Modal (fullscreen, optional) */}
          <PCAResultsModal
            isOpen={showPCAResults}
            onClose={() => setShowPCAResults(false)}
            pcaResults={widget.data?.pcaResults || null}
          />
        </>
      );
    }

    if (widget.type === 'supabase') {
      // Use OrangeStyleWidget for consistency with other widgets
      const tableData: Record<string, any>[] = widget.data?.tableData || [];
      // Only show "View Data" button if we actually have data in widget.data.tableData
      const hasData = tableData && tableData.length > 0;
      console.log('🔵 [SUPABASE RENDER] widget.data exists:', !!widget.data, 'tableData length:', tableData.length, 'hasData:', hasData);
      const colors = getWidgetColors('supabase');

      const supabasePorts = (
        <>
          <div
            role="button"
            aria-label="Start connection from left port"
            className="absolute rounded-full pointer-events-auto"
            onPointerDown={(e) => {
              try {
                e.stopPropagation();
                e.preventDefault();
                const tgt = e.currentTarget as HTMLElement;
                const r = tgt.getBoundingClientRect();
                const cx = Math.round(r.left + r.width / 2);
                const cy = Math.round(r.top + r.height / 2);
                onStartConnection && onStartConnection({ clientX: cx, clientY: cy, portCenter: true });
              } catch (err) { /* swallow */ }
            }}
            style={{ width: 18, height: 18, left: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 70 }}
          >
            <div className="absolute rounded-full bg-white border-2" style={{ width: 8, height: 8, left: 5, top: '50%', transform: 'translateY(-50%)', borderColor: colors.main, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
          </div>
          <div
            role="button"
            aria-label="Start connection from right port"
            className="absolute rounded-full pointer-events-auto"
            onPointerDown={(e) => {
              try {
                e.stopPropagation();
                e.preventDefault();
                const tgt = e.currentTarget as HTMLElement;
                const r = tgt.getBoundingClientRect();
                const cx = Math.round(r.left + r.width / 2);
                const cy = Math.round(r.top + r.height / 2);
                onStartConnection && onStartConnection({ clientX: cx, clientY: cy, portCenter: true });
              } catch (err) { /* swallow */ }
            }}
            style={{ width: 18, height: 18, right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 70 }}
          >
            <div className="absolute rounded-full bg-white border-2" style={{ width: 8, height: 8, right: 5, top: '50%', transform: 'translateY(-50%)', borderColor: colors.main, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
          </div>
        </>
      );

      return (
        <OrangeStyleWidget
          icon={Database}
          label="Supabase Source"
          iconRef={iconRef}
          portElements={supabasePorts}
          statusText={hasData ? `${tableData.length} rows` : sbFetching ? 'Loading...' : 'No data'}
          statusColor={hasData ? 'green' : sbFetching ? 'orange' : 'gray'}
          mainColor={colors.main}
          lightColor={colors.light}
          bgColor={colors.bg}
          alwaysShowControls={true}
        >
          <div className="mt-2 flex flex-col items-center gap-2">
            {/* Show inputs when no data or when explicitly editing */}
            {!hasData && (
              <>
                <input 
                  className="w-full rounded px-2 py-1.5 text-xs border border-gray-200 focus:border-orange-400 focus:outline-none text-center bg-white text-gray-700 placeholder-gray-400" 
                  value={sbTableName} 
                  onChange={(e) => setSbTableName(e.target.value)} 
                  placeholder="raman_data" 
                />
                <input 
                  className="w-full rounded px-2 py-1.5 text-xs border border-gray-200 focus:border-orange-400 focus:outline-none text-center bg-white text-gray-700 placeholder-gray-400" 
                  value={sbSampleFilter} 
                  onChange={(e) => setSbSampleFilter(e.target.value)} 
                  placeholder="Sample" 
                />
                <div className="w-full flex flex-col items-center gap-2">
                  <button 
                    className="w-full px-2 py-1.5 rounded text-white text-xs font-medium hover:bg-opacity-90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors" 
                    style={{ backgroundColor: colors.main }}
                    onClick={(e) => { e.stopPropagation(); fetchSupabaseData(); }} 
                    disabled={sbFetching || !sbTableName}
                  >
                    {sbFetching ? 'Loading...' : 'Load'}
                  </button>
                  { (widget.data && (widget.data.fetchError || widget.data.fetchStatus === 'error')) && (
                    <div className="w-full text-left mt-1">
                      <div className="text-xs text-red-600">{String(widget.data.fetchError || 'Failed to fetch data')}</div>
                      <div className="mt-1 flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); fetchSupabaseData(); }} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">Retry</button>
                        <button onClick={(e) => { e.stopPropagation(); console.debug('[Supabase] debugDump requested'); window.dispatchEvent(new CustomEvent('debugDump')); }} className="px-2 py-1 text-xs bg-gray-200 rounded">Debug</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {hasData && (
              <button 
                className="w-full px-2 py-1.5 rounded text-white text-xs font-medium hover:bg-opacity-90 transition-colors" 
                style={{ backgroundColor: colors.main }}
                onClick={(e) => {
                  console.log('🔵 [SUPABASE] VIEW DATA BUTTON CLICKED!!! widget:', widget.id, 'rows:', widget.data?.tableData?.length);
                  e.stopPropagation();
                  e.preventDefault();
                  // Trigger data forwarding to connected downstream widgets
                  console.debug('[Supabase] View Data clicked, triggering data forward for', widget.id);
                  try {
                    window.dispatchEvent(new CustomEvent('triggerDataForward', { detail: { sourceWidgetId: widget.id } }));
                  } catch (err) {
                    console.warn('[Supabase] triggerDataForward failed', err);
                  }
                  // Note: Modal removed - connect Supabase to Data Table widget to view data
                  console.log('[Supabase] Data forwarding triggered. Connect to Data Table widget to view data.');
                }}
                onMouseDown={(e) => {
                  console.log('🔵 [SUPABASE] MOUSEDOWN on View Data button');
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                View Data
              </button>
            )}
            {/* show fetchError even when hasData=false above; if hasData true but fetchStatus error, still allow View Data */}
            {(!hasData && widget.data && widget.data.fetchError) && (
              <div className="text-xs text-red-600 mt-1">{String(widget.data.fetchError)}</div>
            )}
          </div>
        </OrangeStyleWidget>
      );
    }
    if (widget.type === 'mean-average') {
      const colors = getWidgetColors('mean-average');
      
      return (
        <OrangeStyleWidget
          icon={Calculator}
          label={getWidgetLabel('mean-average')}
          mainColor={colors.main}
          lightColor={colors.light}
          bgColor={colors.bg}
        >
          <div className="mt-2 flex flex-col items-center gap-2">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setShowMeanModal(true); 
              }} 
              className="px-3 py-1.5 text-xs font-medium rounded transition-colors"
              style={{
                backgroundColor: colors.main,
                color: 'white',
              }}
            >
              Configure
            </button>
          </div>
        </OrangeStyleWidget>
      );
    }
    if (widget.type === 'line-chart') {
      const colors = getWidgetColors('line-chart');
      
      return (
        <OrangeStyleWidget
          icon={LineChart}
          label="Line Chart"
          mainColor={colors.main}
          lightColor={colors.light}
          bgColor={colors.bg}
        >
          <div className="mt-2 flex flex-col items-center gap-2">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setShowLineChartModal(true); 
              }} 
              className="px-3 py-1.5 text-xs font-medium rounded transition-colors text-white"
              style={{ backgroundColor: colors.main }}
            >
              Open Chart
            </button>
          </div>
        </OrangeStyleWidget>
      );
    }
    if (widget.type === 'scatter-plot') {
      const colors = getWidgetColors('scatter-plot');
      
      return (
        <OrangeStyleWidget
          icon={Scatter3D}
          label="Scatter Plot"
          mainColor={colors.main}
          lightColor={colors.light}
          bgColor={colors.bg}
        >
          <div className="mt-2 flex flex-col items-center gap-2">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setShowScatterModal(true); 
              }} 
              className="px-3 py-1.5 text-xs font-medium rounded transition-colors text-white"
              style={{ backgroundColor: colors.main }}
            >
              Open Chart
            </button>
          </div>
        </OrangeStyleWidget>
      );
    }
    if (widget.type === 'box-plot') {
      const colors = getWidgetColors('box-plot');
      
      return (
        <OrangeStyleWidget
          icon={Box}
          label="Box Plot"
          mainColor={colors.main}
          lightColor={colors.light}
          bgColor={colors.bg}
        >
          <div className="mt-2 flex flex-col items-center gap-2">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setShowBoxPlotModal(true); 
              }} 
              className="px-3 py-1.5 text-xs font-medium rounded transition-colors text-white"
              style={{ backgroundColor: colors.main }}
            >
              Open Chart
            </button>
          </div>
        </OrangeStyleWidget>
      );
    }
    if (widget.type === 'bar-chart') {
      const colors = getWidgetColors('bar-chart');
      
      return (
        <OrangeStyleWidget
          icon={BarChart3}
          label="Bar Chart"
          mainColor={colors.main}
          lightColor={colors.light}
          bgColor={colors.bg}
        >
          <div className="mt-2 flex flex-col items-center gap-2">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setShowBarChartModal(true); 
              }} 
              className="px-3 py-1.5 text-xs font-medium rounded transition-colors text-white"
              style={{ backgroundColor: colors.main }}
            >
              Open Chart
            </button>
          </div>
        </OrangeStyleWidget>
      );
    }
    if (widget.type === 'kmeans-analysis') {
      const runKMeans = async () => {
        console.log('[KMeans] runKMeans start for widget', widget.id);
        const tableData: any[] = widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || [];
        if (!tableData || tableData.length === 0) {
          alert('⚠️ No data available for KMeans. Connect a data source first.');
          return;
        }
        const params = widget.data?.kmeansParams || { n_clusters: 3, max_iter: 300 };
        // Local fallback KMeans implementation (runs in browser) in case backend/service is unreachable.
        const computeLocalKMeans = (rows: any[], k: number, maxIter: number) => {
          // Extract numeric columns
          const sample = rows[0] || {};
          const keys = Object.keys(sample);
          const numericKeys = keys.filter((kname) => rows.some(r => !isNaN(Number(r[kname]))));
          // Prefer Raman/shift and intensity-like names
          const lower = numericKeys.map(k => k.toLowerCase());
          const pick = (cands: string[]) => {
            for (const c of cands) {
              const idx = lower.findIndex(l => l.includes(c));
              if (idx >= 0) return numericKeys[idx];
            }
            return numericKeys[0] || null;
          };
          const xKey = pick(['shift','wavenumber','raman','x']);
          const yKey = pick(['intensity','counts','value','y']);
          const featKeys = [xKey, yKey].filter(Boolean) as string[];
          // Build feature matrix
          const features: number[][] = rows.map(r => featKeys.map(k => { const v = Number(r[k]); return Number.isFinite(v) ? v : 0; }));
          if (features.length === 0) return { labels: [], centroids: [], projection_2d: [] };

          // initialize centroids as first k unique samples (or random)
          const centroids: number[][] = [];
          const used = new Set();
          for (let i = 0; i < features.length && centroids.length < k; i++) {
            const key = features[i].join(',');
            if (!used.has(key)) { centroids.push([...features[i]]); used.add(key); }
          }
          while (centroids.length < k) {
            const idx = Math.floor(Math.random() * features.length);
            centroids.push([...features[idx]]);
          }

          let labels = new Array(features.length).fill(0);
          for (let iter = 0; iter < maxIter; iter++) {
            let changed = false;
            // assign
            for (let i = 0; i < features.length; i++) {
              let best = 0;
              let bestDist = Infinity;
              for (let c = 0; c < centroids.length; c++) {
                const d = features[i].reduce((acc, val, idx) => acc + Math.pow(val - (centroids[c][idx] ?? 0), 2), 0);
                if (d < bestDist) { bestDist = d; best = c; }
              }
              if (labels[i] !== best) { labels[i] = best; changed = true; }
            }
            // recompute centroids
            const sums: number[][] = new Array(k).fill(0).map(() => new Array(features[0].length).fill(0));
            const counts = new Array(k).fill(0);
            for (let i = 0; i < features.length; i++) {
              const lab = labels[i];
              counts[lab]++;
              for (let j = 0; j < features[0].length; j++) sums[lab][j] += features[i][j];
            }
            for (let c = 0; c < k; c++) {
              if (counts[c] === 0) continue;
              for (let j = 0; j < sums[c].length; j++) centroids[c][j] = sums[c][j] / counts[c];
            }
            if (!changed) break;
          }
          return { labels, centroids, projection_2d: features };
        };

        // keep original rows available to both the primary branch and the fallback
        const original = tableData || [];
        try {
          // Prefer calling the Node backend proxy so client doesn't need to reach the Python service directly.
          // fetchToBackend will try http://127.0.0.1:5003 first, then fall back to relative path.
          const resp = await fetchToBackend('/api/analytics/kmeans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: tableData, n_clusters: params.n_clusters || 3, max_iter: params.max_iter || 300 })
          });

          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'KMeans service error' }));
            throw new Error(err.error || `KMeans failed (status ${resp.status})`);
          }

          var kres = await resp.json();
          // Prepare augmented table: original rows + cluster column
          const labels = Array.isArray(kres?.labels) ? kres.labels : [];
          let augmented: any[] = [];
          try {
            if (original.length === labels.length && original.length > 0) {
              if (typeof original[0] === 'object' && !Array.isArray(original[0])) {
                // Add capitalized 'Cluster' column to match expected output
                augmented = original.map((r: any, i: number) => ({ ...(r || {}), Cluster: labels[i] }));
              } else if (Array.isArray(original[0])) {
                // append label as last column
                augmented = original.map((r: any, i: number) => ([...(r || []), labels[i]]));
              } else {
                // fallback: wrap primitive values into an object
                augmented = original.map((v: any, i: number) => ({ value: v, Cluster: labels[i] }));
              }
            } else {
              // lengths don't match or no original rows: build minimal table from projection if possible
              const projection = kres?.projection_2d || [];
              augmented = projection.map((p: any, i: number) => ({ x: p[0], y: p[1], Cluster: labels[i] }));
            }
          } catch (e) {
            console.warn('[KMeans] failed to build augmented table:', e);
            augmented = [];
          }

          // store results on widget; save augmented table to both tableData and tableDataProcessed so DataTableModal shows it
          const newData = { ...widget.data, kmeansParams: params, kmeansResults: kres, tableData: augmented, tableDataProcessed: augmented };
          onUpdateWidget && onUpdateWidget({ data: newData });
          // also keep a local copy so the modal shows immediately even if parent update hasn't propagated
          setLocalAugmentedTable(augmented);
          // keep local kmeans results for inline chart rendering
          setLocalKmeansResults(kres);
          console.log('[KMeans] results saved to widget', kres);
          // Position inline panel directly below widget and show it
          try { positionInlineBelowWidget(); } catch (e) { /* ignore */ }
          if (!inlineSuppressOpen) {
            // show the compact 3-row results list after a run; individual items open their respective views
            setShowKmeansResultList(true);
            setShowInlineResults(false);
          }
          return true;
        } catch (err: any) {
          console.error('[KMeans] primary error', err);
          try { console.error(err && err.stack ? err.stack : null); } catch (e) { /* ignore */ }
          // Attempt local fallback computation
          try {
            console.warn('[KMeans] attempting local fallback');
            const local = computeLocalKMeans(tableData, params.n_clusters || 3, params.max_iter || 300);
            const localLabels = Array.isArray(local.labels) ? local.labels : [];
            const augmentedLocal = (original.length === localLabels.length && original.length > 0)
              ? original.map((r: any, i: number) => ({ ...(r || {}), Cluster: localLabels[i] }))
              : (local.projection_2d || []).map((p: any, i: number) => ({ x: p[0], y: p[1], Cluster: localLabels[i] }));
            const kresLocal = { labels: localLabels, centroids: local.centroids, projection_2d: local.projection_2d };
              const newDataLocal = { ...widget.data, kmeansParams: params, kmeansResults: kresLocal, tableData: augmentedLocal, tableDataProcessed: augmentedLocal };
              onUpdateWidget && onUpdateWidget({ data: newDataLocal });
              // local copy for immediate modal rendering
                setLocalAugmentedTable(augmentedLocal);
                // keep local kmeans results for inline chart rendering
                setLocalKmeansResults(kresLocal);
              try { positionInlineBelowWidget(); } catch (e) { /* ignore */ }
              if (!inlineSuppressOpen) {
                setShowKmeansResultList(true);
                setShowInlineResults(false);
              }
            console.log('[KMeans] local fallback results saved', kresLocal);
            return true;
          } catch (e2) {
            console.error('[KMeans] local fallback failed', e2);
            try { console.error(e2 && e2.stack ? e2.stack : null); } catch (ee) { /* ignore */ }
            alert('KMeans computation failed: ' + (err?.message || String(err)));
            return false;
          }
        }
      };

      const colors = getWidgetColors('kmeans-analysis');
      const hasResults = !!widget.data?.kmeansResults;

      // Inline panel: compact 3-row results list (Clustered Scatter, Data table, Centroids)
      const KMeansInlinePanel = () => {
        const results = widget.data?.kmeansResults || localKmeansResults;
        const handleViewGraph = (e: any) => {
          e.stopPropagation();
          try { setInlineSuppressOpen(false); } catch (err) {}
          try { positionInlineBelowWidget(); } catch (err) {}
          const results = widget.data?.kmeansResults || localKmeansResults;
          const projection = results?.projection_2d || [];
            if (projection && projection.length > 0) {
            setShowKmeansGraphModal(true);
          } else {
            // fallback: open data table modal so user sees some output
            if (widget.data?.tableDataProcessed) setLocalAugmentedTable(widget.data.tableDataProcessed);
            else if (widget.data?.tableData) setLocalAugmentedTable(widget.data.tableData);
            openTableModal();
          }
        };

        const handleViewData = (e: any) => {
          e.stopPropagation();
          // show full table modal using augmented table if available
          if (widget.data?.tableDataProcessed) setLocalAugmentedTable(widget.data.tableDataProcessed);
          else if (widget.data?.tableData) setLocalAugmentedTable(widget.data.tableData);
          openTableModal();
        };

        const handleViewCentroids = (e: any) => {
          e.stopPropagation();
          // transform centroids to a table-like array for viewing
          const centroids = results?.centroids || [];
          const centroidTable = centroids.map((c: any, i: number) => {
            const obj: any = { Cluster: i };
            (c || []).forEach((v: any, idx: number) => { obj[`dim${idx}`] = v; });
            return obj;
          });
          const tableToShow = (centroidTable && centroidTable.length > 0)
            ? centroidTable
            : [{ Cluster: 'N/A', note: 'No centroid data available' }];
          setLocalAugmentedTable(tableToShow);
          openTableModal();
        };

        // Create the panel node and portal it into document.body so it layers above canvas
        const panelNode = (
          <div className="kmeans-inline-panel" onClick={(e) => e.stopPropagation()} style={{ pointerEvents: 'auto' }}>
            <div className="bg-white shadow rounded p-2 text-xs w-64" style={{ position: 'fixed', left: inlinePos.left, top: inlinePos.top, zIndex: 30, pointerEvents: 'auto' }}>
              <div className="flex items-center justify-between p-1 border-b">
                <div className="font-semibold">Clustered Scatter Plot</div>
                <button type="button" onClick={(e) => { console.log('[KMeansInline] View Graph clicked'); handleViewGraph(e); }} className="text-blue-600 px-2">View</button>
              </div>
              <div className="flex items-center justify-between p-1 border-b">
                <div className="">Data Table</div>
                <button type="button" onClick={(e) => { console.log('[KMeansInline] View Data clicked'); handleViewData(e); }} className="text-blue-600 px-2">View</button>
              </div>
              <div className="flex items-center justify-between p-1">
                <div className="">Centroids</div>
                <button type="button" onClick={(e) => { console.log('[KMeansInline] View Centroids clicked'); handleViewCentroids(e); }} className="text-blue-600 px-2">View</button>
              </div>
            </div>
          </div>
        );
        try {
          return createPortal(panelNode, document.body as any);
        } catch (e) {
          return panelNode;
        }
      };

      const kmeansResultPanel = showKmeansResultList ? <KMeansInlinePanel /> : null;

      return (
        <>
            <div ref={rootRef} onClick={(e) => { const target = e.target as HTMLElement;
              // If we've just closed the inline panel or the inline panel is suppressed,
              // ignore root clicks to avoid immediately re-opening it.
              if (justClosedRef.current) { e.stopPropagation(); return; }
              if (inlineSuppressOpen) { e.stopPropagation(); return; }
              // ignore clicks originating from the inline results panel itself
              if (target.closest && target.closest('.kmeans-inline-panel')) { e.stopPropagation(); return; }
              if (!target.closest('button, input')) { e.stopPropagation(); const hasResultsLocal = !!(widget.data && widget.data.kmeansResults); // Open parameters; if results exist also show inline graph
              setShowParameters(true);
              if (hasResultsLocal) { try { setInlineSuppressOpen(false); } catch (err) {} try { positionInlineBelowWidget(); } catch (err) {} setShowInlineResults(true); }
            } }}>
            <OrangeStyleWidget
              icon={Scatter3D}
              label={getWidgetLabel('kmeans-analysis')}
              iconRef={iconRef}
              portElements={(
                <>
                  <div
                    role="button"
                    aria-label="Start connection from right port"
                    className="absolute rounded-full pointer-events-auto"
                    onPointerDown={(e) => {
                      try {
                        e.stopPropagation();
                        e.preventDefault();
                        const tgt = e.currentTarget as HTMLElement;
                        const r = tgt.getBoundingClientRect();
                        // Use the visual center of the clickable area so the connection
                        // originates from the blue dot (inner circle). This also helps
                        // when the hit area is larger than the visible dot.
                        const cx = Math.round(r.left + r.width / 2);
                        const cy = Math.round(r.top + r.height / 2);
                        onStartConnection && onStartConnection({ clientX: cx, clientY: cy, portCenter: true });
                      } catch (err) { /* swallow */ }
                    }}
                    style={{ width: 18, height: 18, right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 70 }}
                  >
                    {/* Inner visible dot: keep the visual size 8px but make the hit area bigger */}
                    <div className="absolute rounded-full bg-white border-2" style={{ width: 8, height: 8, right: 5, top: '50%', transform: 'translateY(-50%)', borderColor: colors.main, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                  </div>
                </>
              )}
              statusText={hasResults ? `${widget.data.kmeansResults?.labels?.length || 0} samples` : ''}
              statusColor={hasResults ? 'green' : 'gray'}
              mainColor={colors.main}
              lightColor={colors.light}
              bgColor={colors.bg}
            >
              <div className="mt-2 flex flex-col items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setShowParameters(true); const hasResultsLocal = !!(widget.data && widget.data.kmeansResults); if (hasResultsLocal) { try { setInlineSuppressOpen(false); } catch (err) {} try { positionInlineBelowWidget(); } catch (err) {} setShowInlineResults(true); } }} className="px-3 py-1.5 text-xs font-medium rounded transition-colors text-white" style={{ backgroundColor: colors.main }}>
                  Configure KMeans
                </button>
                {hasResults && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); try { setInlineSuppressOpen(false); } catch (err) {} try { positionInlineBelowWidget(); } catch (err) {} setShowInlineResults(true); }} className="px-3 py-1.5 text-xs font-medium rounded transition-colors" style={{ backgroundColor: colors.light, color: colors.main }}>
                      View Results
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); openTableModal(); }} className="px-3 py-1.5 text-xs font-medium rounded transition-colors" style={{ backgroundColor: colors.light, color: colors.main }}>
                      View Data
                    </button>
                  </>
                )}
                <button
                  onClick={async (e) => {
                    console.log('[KMeans UI] inline Run button clicked for widget', widget.id);
                    e.stopPropagation();
                    try { setKmeansRunning(true); await runKMeans(); }
                    catch (err) { console.error('[KMeans] run button error', err); alert('KMeans run failed: ' + (err?.message || String(err))); }
                    finally { setKmeansRunning(false); }
                  }}
                  disabled={kmeansRunning}
                  className={`px-3 py-1.5 text-xs font-medium rounded text-white ${kmeansRunning ? 'bg-gray-400' : ''}`}
                  style={{ backgroundColor: colors.main }}
                >
                  {kmeansRunning ? 'Running…' : 'Run KMeans'}
                </button>
              </div>
            </OrangeStyleWidget>
          </div>

          {/* KMeans parameters modal (reuse ParametersModal) */}
          <ParametersModal isOpen={showParameters} onClose={() => setShowParameters(false)} title="KMeans Parameters">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Number of Clusters</label>
                <input type="number" min={1} value={(widget.data?.kmeansParams?.n_clusters) || 3} onChange={(e) => {
                  const v = Math.max(1, Number(e.target.value) || 3);
                  onUpdateWidget && onUpdateWidget({ data: { ...widget.data, kmeansParams: { ...(widget.data?.kmeansParams || {}), n_clusters: v } } });
                }} className="w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Max Iterations</label>
                <input type="number" min={10} value={(widget.data?.kmeansParams?.max_iter) || 300} onChange={(e) => {
                  const v = Math.max(10, Number(e.target.value) || 300);
                  onUpdateWidget && onUpdateWidget({ data: { ...widget.data, kmeansParams: { ...(widget.data?.kmeansParams || {}), max_iter: v } } });
                }} className="w-full p-2 border rounded" />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={async (e) => {
                    console.log('[KMeans UI] modal Run button clicked for widget', widget.id);
                    e.preventDefault(); e.stopPropagation();
                    // Close the modal first so the inline results panel can render above other UI
                    try {
                      setShowParameters(false);
                    } catch (e) { /* ignore */ }
                    // small delay to allow modal portal to unmount and z-index stacking to settle
                    await new Promise((res) => setTimeout(res, 80));
                    let success = false;
                    try {
                      setKmeansRunning(true);
                      success = await runKMeans();
                    } catch (err) {
                      console.error('[KMeans] run button error', err);
                      alert('KMeans run failed: ' + (err?.message || String(err)));
                    } finally {
                      setKmeansRunning(false);
                    }
                    if (success) {
                      // clear suppression (user explicitly ran) then position and show compact results list
                      try { setInlineSuppressOpen(false); } catch (err) {}
                      try { positionInlineBelowWidget(); } catch (e) { /* ignore */ }
                      try { setShowKmeansResultList(true); setShowInlineResults(false); } catch (e) { /* ignore */ }
                    }
                  }}
                  disabled={kmeansRunning}
                  className={`px-3 py-1 rounded text-white ${kmeansRunning ? 'bg-gray-400' : 'bg-blue-600'}`}>
                  {kmeansRunning ? 'Running…' : 'Run'}
                </button>
                <button onClick={(e) => { console.log('[KMeans UI] modal Close clicked for widget', widget.id); e.preventDefault(); e.stopPropagation(); setShowParameters(false); }} className="px-3 py-1 bg-gray-200 rounded">Close</button>
              </div>
            </div>
          </ParametersModal>

          {/* Hierarchical parameters modal */}
          {widget.type === 'hierarchical-clustering' && (
            <ParametersModal isOpen={showParameters} onClose={() => setShowParameters(false)} title="Hierarchical Parameters">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Method</label>
                  <select value={widget.data?.hier_params?.method || widget.data?.hier_method || 'agglomerative'} onChange={(e) => {
                    const method = e.target.value;
                    onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), hier_params: { ...(widget.data?.hier_params || {}), method }, hier_method: method } });
                  }} className="w-full p-2 border rounded">
                    <option value="agglomerative">Agglomerative (bottom-up)</option>
                    <option value="divisive">Divisive (top-down)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Linkage</label>
                  <select value={widget.data?.hier_params?.linkage || widget.data?.hier_linkage || 'single'} onChange={(e) => {
                    const linkage = e.target.value;
                    onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), hier_params: { ...(widget.data?.hier_params || {}), linkage }, hier_linkage: linkage } });
                  }} className="w-full p-2 border rounded">
                    <option value="single">Single</option>
                    <option value="complete">Complete</option>
                    <option value="average">Average</option>
                    <option value="ward">Ward</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Number of clusters (k)</label>
                  <input type="number" min={1} value={(widget.data?.hier_k) || 3} onChange={(e) => {
                    const v = Math.max(1, Number(e.target.value) || 3);
                    onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), hier_k: v } });
                  }} className="w-full p-2 border rounded" />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={async (e) => {
                      e.preventDefault(); e.stopPropagation();
                      // close the modal then run clustering locally
                      try { setShowParameters(false); } catch (err) {}
                      await new Promise(res => setTimeout(res, 60));

                      // local agglomerative clustering (simple single-linkage fallback)
                      const rows: any[] = widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || [];
                      if (!rows || rows.length === 0) { alert('No data available for Hierarchical Clustering'); return; }
                      const k = widget.data?.hier_k || 3;

                      // Extract 2D features similarly to other widgets (prefer common names)
                      const sample = rows[0] || {};
                      const keys = Object.keys(sample);
                      const numericKeys = keys.filter((kn) => rows.some(r => !isNaN(Number(r[kn]))));
                      const lower = numericKeys.map(k => k.toLowerCase());
                      const pick = (cands: string[]) => { for (const c of cands) { const idx = lower.findIndex(l => l.includes(c)); if (idx >= 0) return numericKeys[idx]; } return numericKeys[0] || null; };
                      const xKey = pick(['shift','wavenumber','raman','x']);
                      const yKey = pick(['intensity','counts','value','y']);
                      const featKeys = [xKey, yKey].filter(Boolean) as string[];
                      const features = rows.map(r => featKeys.map(k2 => { const v = Number(r[k2]); return Number.isFinite(v) ? v : 0; }));

                      // very small linkage implementation (single-linkage)
                      const euclid = (a: number[], b: number[]) => { let s = 0; for (let i=0;i<a.length;i++) s += (a[i]-b[i])**2; return Math.sqrt(s); };
                      let clusters: number[][] = []; for (let i=0;i<features.length;i++) clusters.push([i]);
                      const linkage: Array<[number,number,number,number]> = [];
                      const clusterDist = (c1:number[], c2:number[]) => { let best = Infinity; for (const i of c1) for (const j of c2) { const d = euclid(features[i], features[j]); if (d < best) best = d; } return best; };
                      while (clusters.length > 1) {
                        let bestI=0,bestJ=1,bestD=Infinity;
                        for (let i=0;i<clusters.length;i++) for (let j=i+1;j<clusters.length;j++){ const d = clusterDist(clusters[i], clusters[j]); if (d < bestD){ bestD=d; bestI=i; bestJ=j; } }
                        linkage.push([bestI,bestJ,bestD, clusters[bestI].length+clusters[bestJ].length]);
                        const merged = clusters[bestI].concat(clusters[bestJ]);
                        if (bestJ > bestI) { clusters.splice(bestJ,1); clusters.splice(bestI,1); } else { clusters.splice(bestI,1); clusters.splice(bestJ,1); }
                        clusters.push(merged);
                      }

                      // cut linkage to k clusters (naive)
                      let cutClusters: number[][] = []; for (let i=0;i<features.length;i++) cutClusters.push([i]);
                      for (let m=0; m<linkage.length && cutClusters.length > k; m++) {
                        const [i,j] = linkage[m];
                        if (i<0||j<0||i>=cutClusters.length||j>=cutClusters.length) break;
                        const merged = cutClusters[i].concat(cutClusters[j]);
                        if (j>i) { cutClusters.splice(j,1); cutClusters.splice(i,1); } else { cutClusters.splice(i,1); cutClusters.splice(j,1); }
                        cutClusters.push(merged);
                      }
                      const labels = new Array(features.length).fill(0);
                      for (let ci=0; ci<cutClusters.length; ci++) for (const idx of cutClusters[ci]) labels[idx] = ci;

                      const result = { linkage, labels, featKeys, features };
                      onUpdateWidget && onUpdateWidget({ data: { ...(widget.data||{}), hierarchicalResults: result, hier_k: k } });
                      openTableModal();
                    }}
                    className="px-3 py-1 rounded text-white bg-blue-600"
                  >
                    Run
                  </button>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowParameters(false); }} className="px-3 py-1 bg-gray-200 rounded">Close</button>
                </div>
              </div>
            </ParametersModal>
          )}

          {/* Inline results panel (portal + fallback) */}
          {kmeansResultPanel}
              {/* no transient banner: we show inline graph only after Run */}
        </>
      );
    }
    if (widget.type === 'hierarchical-clustering') {
      return (
        <HierarchicalWidget widget={widget} onUpdateWidget={onUpdateWidget} onStartConnection={onStartConnection} iconRef={iconRef} />
      );
    }
    if (widget.type === 'noise-filter') {
      const runNoiseFilter = async () => {
        const tableData: Record<string, any>[] = widget.data?.tableData || widget.data?.parsedData || [];
        
        if (!tableData || tableData.length === 0) {
          alert('⚠️ No input data!\n\nPlease connect a data source first:\n• Supabase Source → Noise Filter\n• OR Baseline Correction → Noise Filter');
          return;
        }

        console.log('[noise] Processing', tableData.length, 'rows with method:', noiseMethod);

        let smoothed = tableData;
        const params = {
          window: noiseWindow,
          sigma: noiseSigma,
          order: noiseOrder
        };

        // Try backend API first
        try {
          const res = await fetchToBackend('/api/noise-filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tableData,
              method: noiseMethod,
              params: {
                window: noiseWindow,
                windowSize: noiseWindow,
                sigma: noiseSigma,
                order: noiseOrder
              }
            })
          });
          
          if (res.ok) {
            const json = await res.json();
            smoothed = json.data || tableData;
            console.log('[noise] Backend processed successfully');
          } else {
            console.warn('[noise] Backend failed, using client-side fallback');
            smoothed = clientSideNoiseFilter(tableData, params);
          }
        } catch (err) {
          console.warn('[noise] Backend unavailable, using client-side fallback:', err);
          smoothed = clientSideNoiseFilter(tableData, params);
        }

        // Write processed data back to widget via callback if available and save params
        if (onUpdateWidget) {
          onUpdateWidget({ 
            data: { 
              ...(widget.data || {}), 
              tableDataProcessed: smoothed, 
              noiseParams: params 
            } 
          });
        }

        // Keep a local preview copy
        const cols = Object.keys(smoothed[0] || {});
        const xCandidates = ['shift', 'x', 'wavenumber', 'raman', 'index', 'time', 'label', 'raman_shift', 'raman shift'];
        const yCandidates = ['intensity', 'int', 'y', 'signal', 'counts', 'intensity_counts', 'raman intensity', 'raman_intensity'];
        let xKey: string | null = null;
        let yKey: string | null = null;
        
        for (const c of cols) {
          const low = c.toLowerCase();
          if (!xKey && xCandidates.some(x => low.includes(x))) xKey = c;
          if (!yKey && yCandidates.some(y => low.includes(y))) yKey = c;
        }
        
        // Fallback: pick first numeric column for Y
        if (!yKey) {
          for (const c of cols) {
            if (!isNaN(Number(smoothed[0][c])) && c !== xKey) { yKey = c; break; }
          }
        }
        
        let preview = smoothed;
        if (xKey && yKey) {
          preview = smoothed.map((r) => ({ shift: r[xKey], intensity: Number(r[yKey]) }));
        }
        setModalPreviewData(preview);
        
        console.log('[noise] Processing complete!');
        console.log('[noise] Original data length:', tableData.length);
        console.log('[noise] Smoothed data length:', smoothed.length);
        console.log('[noise] Preview data length:', preview.length);
        console.log('[noise] ✅ Click "View Data" to see the result!');
      };

      // Client-side fallback (moving average only)
      const clientSideNoiseFilter = (tableData: Record<string, any>[], params: any) => {
        const w = Math.max(1, Math.floor(params.window) || 5);
        const radius = Math.floor(w / 2);
        const columns = Object.keys(tableData[0]);
        const numericCols = columns.filter((c) => tableData.some((r) => !isNaN(Number(r[c]))));

        return tableData.map((row, i) => {
          const newRow: Record<string, any> = { ...row };
          numericCols.forEach((col) => {
            const vals: number[] = [];
            for (let k = i - radius; k <= i + radius; k++) {
              if (k >= 0 && k < tableData.length) {
                const v = Number(tableData[k][col]);
                if (!isNaN(v)) vals.push(v);
              }
            }
            newRow[col] = vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4)) : row[col];
          });
          return newRow;
        });
      };

      const openNoisePreview = () => {
        const processed = modalPreviewData || widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || [];
        console.log('[noise] Opening preview, data length:', processed.length);
        console.log('[noise] Data sample:', processed[0]);
        
        if (!processed || processed.length === 0) {
          alert('⚠️ No data to display!\n\nPlease:\n1. Connect a data source (Supabase or Baseline Correction)\n2. Click "Apply" to process the data\n3. Then click "View Data"');
          return;
        }
        
        setModalPreviewData(processed);
        setShowLineChartModal(true);
      };

      const colors = getWidgetColors('noise-filter');
      const hasData = (modalPreviewData && modalPreviewData.length > 0) || widget.data?.tableDataProcessed;

      return (
        <>
          <OrangeStyleWidget
            icon={Filter}
            label="Noise Filter"
            statusText={hasData ? 'Processed' : ''}
            statusColor={hasData ? 'green' : 'gray'}
            mainColor={colors.main}
            lightColor={colors.light}
            bgColor={colors.bg}
          />

          {/* Parameters Modal */}
          <ParametersModal
            isOpen={showParameters}
            onClose={() => setShowParameters(false)}
            title="Noise Filter Parameters"
          >
            <div className="space-y-4">
              {/* Method Selector */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">Filter Method</label>
                <select 
                  value={noiseMethod} 
                  onChange={(e) => setNoiseMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="moving_average">Moving Average</option>
                  <option value="savitzky_golay">Savitzky-Golay</option>
                  <option value="median">Median Filter</option>
                  <option value="gaussian">Gaussian</option>
                </select>
              </div>

              {/* Window Size */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">Window Size</label>
                <input 
                  type="number" 
                  min={3} 
                  max={51}
                  step={2}
                  value={noiseWindow} 
                  onChange={(e) => setNoiseWindow(Number(e.target.value))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
                <p className="text-xs text-gray-500">Number of data points ({noiseWindow} points)</p>
              </div>

              {/* Conditional parameters based on method */}
              {noiseMethod === 'savitzky_golay' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Polynomial Order</label>
                  <input 
                    type="number" 
                    min={1} 
                    max={5}
                    value={noiseOrder} 
                    onChange={(e) => setNoiseOrder(Number(e.target.value))} 
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                  />
                  <p className="text-xs text-gray-500">Degree of polynomial (1-5)</p>
                </div>
              )}

              {noiseMethod === 'gaussian' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Sigma (Spread)</label>
                  <input 
                    type="number" 
                    min={0.1} 
                    max={5}
                    step={0.1}
                    value={noiseSigma} 
                    onChange={(e) => setNoiseSigma(Number(e.target.value))} 
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                  />
                  <p className="text-xs text-gray-500">Gaussian parameter (0.1-5.0)</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('[Noise] Compute clicked'); runNoiseFilter(); }} 
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 cursor-pointer"
                  title="Apply noise filtering to the data"
                  style={{ pointerEvents: 'auto' }}
                >
                  Compute
                </button>
                <button 
                  type="button" 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('[Noise] Apply & Close clicked'); runNoiseFilter(); setShowParameters(false); }} 
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 cursor-pointer"
                  title="Apply and close"
                  style={{ pointerEvents: 'auto' }}
                >
                  Apply & Close
                </button>
                <button 
                  type="button" 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('[Noise] Reset clicked'); setNoiseMethod('moving_average'); setNoiseWindow(5); setNoiseOrder(3); setNoiseSigma(1.0); }} 
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>
          </ParametersModal>
        </>
      );
    }
      if (widget.type === 'smoothing') {
        // Gaussian smoothing with configurable sigma
        const [sigma, setSigma] = useState<number>(1);

        const gaussianKernel = (sigmaVal: number) => {
    const radius = Math.max(1, Math.ceil(sigmaVal * 3));
          const kernel: number[] = [];
          const twoSigmaSq = 2 * sigmaVal * sigmaVal;
          let sum = 0;
          for (let i = -radius; i <= radius; i++) {
            const v = Math.exp(-(i * i) / twoSigmaSq);
            kernel.push(v);
            sum += v;
          }
          return kernel.map((k) => k / sum);
        };

        const runSmoothing = () => {
          const tableData: Record<string, any>[] = widget.data?.tableData || widget.data?.parsedData || [];
          if (!tableData || tableData.length === 0) {
            console.debug('[Baseline] no input tableData - nothing to process', tableData && tableData.length);
            return;
          }

          console.debug('[Baseline] runBaselineCorrection input rows=', tableData.length, 'sample=', tableData[0]);

          const columns = Object.keys(tableData[0]);
          const numericCols = columns.filter((c) => tableData.some((r) => !isNaN(Number(r[c]))));

          const kernel = gaussianKernel(Math.max(0.1, sigma));
          const radius = Math.floor(kernel.length / 2);

          const smoothed = tableData.map((row, i) => {
            const newRow: Record<string, any> = { ...row };
            numericCols.forEach((col) => {
              let acc = 0;
              for (let k = -radius; k <= radius; k++) {
                const idx = i + k;
                if (idx >= 0 && idx < tableData.length) {
                  const v = Number(tableData[idx][col]);
                  if (!isNaN(v)) acc += v * kernel[k + radius];
                }
              }
              newRow[col] = Number(acc.toFixed(4));
            });
            return newRow;
          });

          if (onUpdateWidget) {
            onUpdateWidget({ data: { ...(widget.data || {}), tableDataProcessed: smoothed } });
          }
        };

        const colors = getWidgetColors('smoothing');
        const hasData = widget.data?.tableDataProcessed;

        return (
          <>
            <OrangeStyleWidget
              icon={Filter}
              label="Smoothing"
              statusText={hasData ? 'Smoothed' : ''}
              statusColor={hasData ? 'green' : 'gray'}
              mainColor={colors.main}
              lightColor={colors.light}
              bgColor={colors.bg}
            />

            {/* Parameters Modal */}
            <ParametersModal
              isOpen={showParameters}
              onClose={() => setShowParameters(false)}
              title="Smoothing Parameters"
            >
              <div className="space-y-4">
                {/* Sigma Parameter */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Sigma (Smoothness)</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={sigma}
                    onChange={(e) => setSigma(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500">Higher = smoother</p>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[Smoothing] Compute clicked');
                      runSmoothing(); 
                    }} 
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 cursor-pointer"
                    style={{ pointerEvents: 'auto' }}
                  >
                    Compute
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[Smoothing] Apply & Close clicked');
                      runSmoothing(); 
                      setShowParameters(false); 
                    }} 
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 cursor-pointer"
                    style={{ pointerEvents: 'auto' }}
                  >
                    Apply & Close
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[Smoothing] Reset clicked');
                      setSigma(1.0);
                    }} 
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </ParametersModal>
          </>
        );
      }
      if (widget.type === 'baseline-correction') {
        const runBaselineCorrection = async () => {
          const tableData: Record<string, any>[] = widget.data?.tableData || widget.data?.parsedData || [];
          if (!tableData || tableData.length === 0) return;

          // use local editable params (UI writes to localBaselineParams)
          const params = localBaselineParams || (widget.data && widget.data.baselineParams) || { method: 'min_subtract' };
          console.log('[Baseline] ========== RUNNING BASELINE CORRECTION ==========');
          console.log('[Baseline] Input: running with params=', params, 'rows=', tableData.length);
          console.log('[Baseline] Input columns:', Object.keys(tableData[0] || {}));
          console.log('[Baseline] Input sample row (first 3):', tableData.slice(0, 3));
          console.log('[Baseline] Data source:', widget.data?.tableDataProcessed ? 'tableDataProcessed' : widget.data?.tableData ? 'tableData' : 'parsedData');

          // Try server-side baseline correction via backend proxy -> python service
          try {
            const res = await fetch('/api/baseline-correction', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tableData, params }),
            });
            if (!res.ok) {
              const txt = await res.text();
              throw new Error(txt || `status ${res.status}`);
            }
            const body = await res.json();
            console.debug('[Baseline] server response', body);
            const corrected = body?.tableData || [];
            // record that we used the server-side baseline (python) and which method
            onUpdateWidget?.({ data: { ...(widget.data || {}), tableDataProcessed: corrected, baselineUsed: 'python', baselineMethod: params?.method || 'min_subtract', baselineParams: params } });
            // build a graph-friendly preview: try to detect X/Y columns and map to {shift,intensity}
            const buildPreview = (rows: Record<string, any>[]) => {
              if (!rows || rows.length === 0) return rows;
              const cols = Object.keys(rows[0] || {});
              
              // Find X-axis column (Raman Shift prioritized)
              const xCandidates = ['raman shift', 'shift', 'x', 'wavenumber', 'raman_shift', 'shift x axis'];
              let xKey = null;
              for (const c of cols) {
                const lc = c.toLowerCase().replace(/[^a-z0-9]/g, ''); // remove spaces/special chars
                if (xCandidates.some(cand => lc.includes(cand.replace(/[^a-z0-9]/g, '')))) {
                  xKey = c;
                  console.log('[Baseline] buildPreview: X-axis selected:', c);
                  break;
                }
              }
              
              // Find Y-axis column (intensity prioritized)
              const yCandidates = ['raman intensity', 'intensity', 'int', 'y', 'signal', 'counts', 'intensity_y_axis'];
              let yKey = null;
              for (const c of cols) {
                const lc = c.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (yCandidates.some(cand => lc.includes(cand.replace(/[^a-z0-9]/g, '')))) {
                  yKey = c;
                  console.log('[Baseline] buildPreview: Y-axis selected:', c);
                  break;
                }
              }
              
              // Fallback: find first numeric column for Y
              if (!yKey) {
                for (const c of cols) {
                  if (!isNaN(Number(rows[0][c])) && c !== xKey) { 
                    yKey = c;
                    console.log('[Baseline] buildPreview: Y-axis fallback:', c);
                    break; 
                  }
                }
              }
              
              // Fallback: find first numeric column for X
              if (!xKey) {
                for (const c of cols) {
                  if (!isNaN(Number(rows[0][c]))) { 
                    xKey = c;
                    console.log('[Baseline] buildPreview: X-axis fallback (numeric):', c);
                    break; 
                  }
                }
              }
              
              console.log('[Baseline] buildPreview: Final selection - X:', xKey, 'Y:', yKey);
              
              if (xKey && yKey) {
                const preview = rows.map((r) => ({ shift: r[xKey], intensity: Number(r[yKey]) }));
                console.log('[Baseline] buildPreview: Sample output:', preview.slice(0, 2));
                return preview;
              }
              return rows;
            };
            const preview = buildPreview(corrected);
            setModalPreviewData(preview);
            console.debug('[Baseline] modalPreviewData set (server)', corrected && corrected.slice(0,3));
            setShowLineChartModal(true);
            return;
          } catch (err) {
            console.warn('Server baseline correction failed, falling back to client-side:', err);
          }

          // Fallback: simple client-side min-subtract but do NOT alter x-axis columns
          const columns = Object.keys(tableData[0]);
          const numericCols = columns.filter((c) => tableData.some((r) => !isNaN(Number(r[c]))));
          const xCandidates = ['x', 'shift', 'wavenumber', 'raman', 'index', 'time', 'label', 'raman_shift'];
          let yCols = numericCols.filter((c) => !xCandidates.some((x) => c.toLowerCase().includes(x)));
          if (yCols.length === 0) yCols = numericCols.slice();
          const minima: Record<string, number> = {};
          yCols.forEach((col) => {
            const vals = tableData.map((r) => Number(r[col])).filter((v) => !isNaN(v));
            minima[col] = vals.length ? Math.min(...vals) : 0;
          });
          const corrected = tableData.map((row) => {
            const newRow: Record<string, any> = { ...row };
            yCols.forEach((col) => {
              const v = Number(row[col]);
              newRow[col] = !isNaN(v) ? Number((v - minima[col]).toFixed(4)) : row[col];
            });
            return newRow;
          });
          console.debug('[Baseline] client-side fallback corrected sample=', corrected && corrected.slice(0,3));
          if (onUpdateWidget) onUpdateWidget({ data: { ...(widget.data || {}), tableDataProcessed: corrected, baselineUsed: 'js', baselineMethod: params?.method || 'min_subtract', baselineParams: params } });
          // build graph-friendly preview for modal
          const cols = Object.keys(corrected[0] || {});
          const xCandidatesPreview = ['shift', 'x', 'wavenumber', 'raman', 'index', 'time', 'label', 'raman_shift'];
          const yCandidatesPreview = ['intensity', 'int', 'y', 'signal', 'counts', 'intensity_counts'];
          let xKey = null;
          let yKey = null;
          for (const c of cols) {
            const lc = c.toLowerCase();
            if (!xKey && xCandidatesPreview.includes(lc)) xKey = c;
            if (!yKey && yCandidatesPreview.includes(lc)) yKey = c;
          }
          if (!yKey) {
            for (const c of cols) {
              if (!isNaN(Number(corrected[0][c])) && c !== xKey) { yKey = c; break; }
            }
          }
          if (!xKey) {
            for (const c of cols) {
              if (isNaN(Number(corrected[0][c]))) { xKey = c; break; }
            }
          }
          const preview = (xKey && yKey) ? corrected.map((r) => ({ shift: r[xKey], intensity: Number(r[yKey]) })) : corrected;
          setModalPreviewData(preview);
          console.debug('[Baseline] modalPreviewData set (js)', corrected && corrected.slice(0,3));
          setShowLineChartModal(true);
        };

        const colors = getWidgetColors('baseline-correction');
        const hasData = widget.data?.tableDataProcessed;

        return (
          <>
            <OrangeStyleWidget
              icon={Calculator}
              label="Baseline"
              statusText={hasData ? 'Corrected' : ''}
              statusColor={hasData ? 'green' : 'gray'}
              mainColor={colors.main}
              lightColor={colors.light}
              bgColor={colors.bg}
            />

            {/* Parameters Modal */}
            <ParametersModal
              isOpen={showParameters}
              onClose={() => setShowParameters(false)}
              title="Baseline Correction Parameters"
            >
              <div className="space-y-4">
                {/* Method Selector */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Correction Method</label>
                  <select 
                    value={localBaselineParams?.method || 'min_subtract'} 
                    onChange={(e) => setLocalBaselineParams({ ...(localBaselineParams || {}), method: e.target.value })} 
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="min_subtract">Min Subtract</option>
                    <option value="rolling_min">Rolling Min</option>
                    <option value="polynomial">Polynomial</option>
                  </select>
                </div>

                {/* Window Size (for rolling_min and polynomial) */}
                {(localBaselineParams?.method === 'rolling_min' || localBaselineParams?.method === 'polynomial') && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Window Size</label>
                    <input 
                      type="number" 
                      min={1} 
                      value={localBaselineParams?.window || 5} 
                      onChange={(e) => setLocalBaselineParams({ ...(localBaselineParams || {}), window: Number(e.target.value) })} 
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    />
                    <p className="text-xs text-gray-500">Number of points</p>
                  </div>
                )}

                {/* Polynomial Degree */}
                {localBaselineParams?.method === 'polynomial' && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Polynomial Degree</label>
                    <input 
                      type="number" 
                      min={0} 
                      value={localBaselineParams?.degree || 2} 
                      onChange={(e) => setLocalBaselineParams({ ...(localBaselineParams || {}), degree: Number(e.target.value) })} 
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    />
                    <p className="text-xs text-gray-500">Degree (0-5)</p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[Baseline] Compute button clicked');
                      runBaselineCorrection(); 
                    }} 
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 cursor-pointer"
                    style={{ pointerEvents: 'auto' }}
                  >
                    Compute
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[Baseline] Apply & Close clicked');
                      runBaselineCorrection(); 
                      setShowParameters(false); 
                    }} 
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 cursor-pointer"
                    style={{ pointerEvents: 'auto' }}
                  >
                    Apply & Close
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[Baseline] Reset clicked');
                      setLocalBaselineParams({ method: 'min_subtract' });
                    }} 
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 cursor-pointer"
                    style={{ pointerEvents: 'auto' }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </ParametersModal>
          </>
        );
      }

      // Temporarily keep the old rendering code for reference
      if (false && widget.type === 'baseline-correction-old') {
        return (
          <div className="flex flex-col items-center justify-center w-full h-full cursor-default px-2" onClick={(e) => e.stopPropagation()}>
            {/* Outer connection circle */}
            <div className="rounded-full p-1 flex items-center justify-center" style={{ border: '2px dashed rgba(0,0,0,0.06)', borderRadius: 999 }}>
              {/* Inner icon circle (clickable) */}
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); } }}
                className="rounded-full p-1 flex items-center justify-center focus:outline-none"
                style={{ borderRadius: 999 }}
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center icon-outer`} style={{ width: 64, height: 64 }}>
                  <Calculator className={`h-6 w-6 transition-transform duration-200 icon`} />
                </div>
              </div>
            </div>

            {/* render a tiny sparkline preview when processed data exists */}
            {(() => {
              const processed = widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || [];
              if (processed && processed.length > 0) {
                // find first numeric column
                const cols = Object.keys(processed[0] || {});
                let colName: string | null = null;
                for (const c of cols) {
                  const v = Number(processed[0][c]);
                  if (!isNaN(v)) { colName = c; break; }
                }
                if (colName) {
                  const vals = processed.map((r: any) => Number(r[colName])).filter((v: number) => !isNaN(v));
                  if (vals.length > 0) {
                    const w = 120;
                    const h = 36;
                    const min = Math.min(...vals);
                    const max = Math.max(...vals);
                    const range = max - min || 1;
                    const step = w / Math.max(1, vals.length - 1);
                    const points = vals.map((v: number, i: number) => `${i * step},${h - ((v - min) / range) * h}`);
                    const path = points.length ? `M${points.join(' L')}` : '';
                    return (
                      <div className="mt-2 flex items-center justify-center w-full">
                        <svg width={w} height={h} className="block">
                          <path d={path} fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    );
                  }
                }
              }
              return <div className="mt-2 text-[12px] font-medium text-center">Baseline Correction</div>;
            })()}
          </div>
        );
      }

      // Custom Code Widget
      if (widget.type === 'custom-code') {
        const defaultCode = `# Peak Detector - Finds peaks in Raman spectroscopy data
import numpy as np
from scipy.signal import find_peaks

if input_data and len(input_data) > 0:
    # Get column names from first row
    first_row = input_data[0]
    columns = list(first_row.keys())
    
    # Try to find the intensity/y-axis column
    intensity_col = None
    for col in columns:
        col_lower = col.lower()
        if any(keyword in col_lower for keyword in ['intensity', 'count', 'signal', 'value', 'y']):
            intensity_col = col
            break
    
    # If not found, use second column (assuming first is wavenumber/x)
    if not intensity_col and len(columns) > 1:
        intensity_col = columns[1]
    
    if intensity_col:
        # Extract intensity values
        intensities = np.array([float(row.get(intensity_col, 0)) for row in input_data])
        
        # Find peaks using scipy
        # prominence: minimum height difference from surrounding baseline
        # distance: minimum distance between peaks (in data points)
        peaks, properties = find_peaks(intensities, prominence=np.std(intensities) * 0.5, distance=5)
        
        # Create summary output
        output_data = [{
            'Result': 'Peak Detection Summary',
            'Total Peaks Found': len(peaks),
            'Data Points': len(intensities),
            'Intensity Column Used': intensity_col,
            'Max Intensity': float(np.max(intensities)),
            'Mean Intensity': float(np.mean(intensities))
        }]
        
        # Add details for each peak (first 20)
        for i, peak_idx in enumerate(peaks[:20]):
            peak_data = {
                'Peak Number': i + 1,
                'Position (index)': int(peak_idx),
                'Intensity': float(intensities[peak_idx]),
                'Prominence': float(properties['prominences'][i])
            }
            output_data.append(peak_data)
            
        if len(peaks) > 20:
            output_data.append({'Note': f'Showing first 20 of {len(peaks)} total peaks'})
    else:
        output_data = [{
            'Error': 'Could not identify intensity column',
            'Available Columns': ', '.join(columns),
            'Suggestion': 'Check your data structure or edit code to specify column name'
        }]
else:
    output_data = [{'status': 'No input data', 'message': 'Connect this widget to a data source'}]
`;
        
        const [customCode, setCustomCode] = useState<string>(widget.data?.customCode || defaultCode);
        const [widgetName, setWidgetName] = useState<string>(widget.data?.widgetName || '');
        const [widgetDescription, setWidgetDescription] = useState<string>(widget.data?.widgetDescription || '');
        const [isExecuting, setIsExecuting] = useState(false);
        const [executionOutput, setExecutionOutput] = useState<string>('');
        const [showCommunityModal, setShowCommunityModal] = useState(false);
        const [communityWidgets, setCommunityWidgets] = useState<any[]>([]);
        const [initialized, setInitialized] = useState(false);
        const [showCodeEditor, setShowCodeEditor] = useState(false);
        const [showTableModal, setShowTableModal] = useState(false);
        const [showOutputInWidget, setShowOutputInWidget] = useState(false);

        // Update state when widget data changes (for newly created widgets)
        useEffect(() => {
          // Only sync once when widget has data but state is not yet initialized
          if (!initialized && (widget.data?.widgetName || widget.data?.widgetDescription || widget.data?.customCode)) {
            if (widget.data?.widgetName) setWidgetName(widget.data.widgetName);
            if (widget.data?.widgetDescription) setWidgetDescription(widget.data.widgetDescription);
            if (widget.data?.customCode) setCustomCode(widget.data.customCode);
            setInitialized(true);
          }
        }, [widget.id, initialized]);

        // Auto-execute when this is a created widget (has widgetName) and receives new data
        useEffect(() => {
          const hasWidgetName = widget.data?.widgetName;
          const hasCustomCode = widget.data?.customCode;
          const hasInputData = widget.data?.tableData && widget.data.tableData.length > 0;
          
          console.log('Auto-execute check:', { hasWidgetName, hasCustomCode, hasInputData, isExecuting });
          
          // Only auto-execute if this is a created widget (not the editor) and has input data
          if (hasWidgetName && hasCustomCode && hasInputData && !isExecuting) {
            console.log('Auto-executing code for widget:', widget.data.widgetName);
            // Auto-execute the code
            handleExecuteCode();
          }
        }, [widget.data?.tableData, widget.id]);

        // Auto-show output when new processed data arrives
        useEffect(() => {
          if (widget.data?.tableDataProcessed && widget.data.tableDataProcessed.length > 0 && widget.data?.widgetName) {
            setShowOutputInWidget(true);
          }
        }, [widget.data?.tableDataProcessed?.length, widget.id]);

        const handleExecuteCode = async () => {
          setIsExecuting(true);
          setExecutionOutput('Executing...');
          
          try {
            const inputData = widget.data?.tableData || [];
            // Use code from widget.data if available (for created widgets), otherwise use state (for editor)
            const codeToExecute = widget.data?.customCode || customCode;
            
            const response = await fetchToBackend('/api/custom-code/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: codeToExecute,
                input_data: inputData
              })
            });

            // Better error handling for JSON parsing
            let result: any;
            const responseText = await response.text();
            console.log('Backend response status:', response.status);
            console.log('Backend response text:', responseText);
            
            if (!response.ok) {
              throw new Error(`Backend returned status ${response.status}: ${responseText || 'No response body'}`);
            }
            
            try {
              result = responseText ? JSON.parse(responseText) : {};
            } catch (parseError: any) {
              console.error('JSON parse error:', parseError);
              throw new Error(`Backend returned invalid JSON. Status: ${response.status}. Response: ${responseText.substring(0, 200)}`);
            }
            
            if (result.success) {
              // Don't show text output - focus on widget creation
              setExecutionOutput('');

              console.log('Execution result:', result);
              console.log('Output data:', result.output_data);

              const isEditor = !widget.data?.widgetName; // true when this instance is the editor (not a created widget)
              
              console.log('Widget creation check:', {
                isEditor,
                widgetName,
                hasOnAddWidget: !!onAddWidget,
                widgetDataName: widget.data?.widgetName
              });

              // Update current widget with output data only if this widget is already a created/processing widget
              if (!isEditor && onUpdateWidget && result.output_data) {
                console.log('Updating widget with output data, length:', result.output_data.length);
                onUpdateWidget({
                  data: {
                    ...(widget.data || {}),
                    tableDataProcessed: result.output_data,
                    customCode: codeToExecute, // Use the code that was executed
                    lastExecuted: new Date().toISOString()
                  }
                });
              }

              // CREATE A NEW WIDGET when Execute Code is clicked from the editor and a widget name is provided
              if (isEditor) {
                if (!widgetName || widgetName.trim() === '') {
                  // If we're in the editor and the user didn't provide a name, ask for it
                  setExecutionOutput('⚠️ Please enter a Widget Name to create a new widget on the canvas.');
                  console.log('❌ Widget name is required but not provided');
                  return;
                }

                if (!onAddWidget) {
                  console.error('❌ onAddWidget function is not available');
                  setExecutionOutput('❌ Error: Cannot create widget (onAddWidget not available)');
                  return;
                }

                console.log('✅ Creating new widget...');
                // Position new widget to the right of current widget
                const newPosition = {
                  x: widget.position.x + 350,
                  y: widget.position.y
                };

                // Prepare initial data for the new widget - include both input and output data
                const initialData = {
                  widgetName: widgetName.trim(),
                  widgetDescription: widgetDescription.trim(),
                  customCode: customCode,
                  tableData: inputData, // Include input data
                  tableDataProcessed: result.output_data, // Include output data
                  lastExecuted: new Date().toISOString()
                };

                console.log('Creating new widget with data:', initialData);
                console.log('Position:', newPosition);

                try {
                  // Create a new custom-code widget with the executed code (silent creation)
                  const newWidgetId = onAddWidget('custom-code', newPosition, initialData);
                  console.log('✅ New widget created with ID:', newWidgetId);

                  // Show success message
                  setExecutionOutput(`✅ Widget "${widgetName}" created successfully!\n\nLook to the right of this widget on the canvas.\nConnect it to data sources to see it in action.`);
                } catch (error: any) {
                  console.error('❌ Error creating widget:', error);
                  setExecutionOutput(`❌ Error creating widget: ${error.message}`);
                }
              }
            } else {
              setExecutionOutput(`❌ Error:\n\n${result.error}`);
              alert('Execution failed. Check the output below.');
            }
          } catch (error: any) {
            setExecutionOutput(`❌ Connection Error:\n\n${error.message}`);
            console.error('Failed to connect to backend service:', error);
          } finally {
            setIsExecuting(false);
          }
        };

        const handleSaveWidget = async () => {
          if (!widgetName || !customCode) {
            alert('Please provide a widget name and code before saving.');
            return;
          }

          try {
            const response = await fetchToBackend('/api/custom-code/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: widgetName,
                description: widgetDescription,
                python_code: customCode,
                author: 'user-' + Date.now(), // In real app, use actual user ID
                category: 'processing',
                tags: ['custom', 'user-created']
              })
            });

            const result = await response.json();
            
            if (result.success) {
              alert(`✅ Widget "${widgetName}" saved to community library!\n\nOther users can now use your widget.`);
            } else {
              alert(`Failed to save widget: ${result.error}`);
            }
          } catch (error: any) {
            alert(`Failed to save: ${error.message}`);
          }
        };

        const handleLoadCommunityWidget = async (widgetId: string) => {
          try {
            const response = await fetchToBackend(`/api/custom-code/${widgetId}`);
            const result = await response.json();
            
            if (result.success) {
              setCustomCode(result.widget.python_code);
              setWidgetName(result.widget.name);
              setWidgetDescription(result.widget.description);
              setShowCommunityModal(false);
              alert(`Loaded widget: ${result.widget.name}`);
            }
          } catch (error: any) {
            alert(`Failed to load widget: ${error.message}`);
          }
        };

        const handleBrowseCommunity = async () => {
          try {
            const response = await fetchToBackend('/api/custom-code/list?limit=50');
            const result = await response.json();
            
            if (result.success) {
              setCommunityWidgets(result.widgets);
              setShowCommunityModal(true);
            }
          } catch (error: any) {
            alert(`Failed to load community widgets: ${error.message}`);
          }
        };

        const colors = getWidgetColors('custom-code');
        const hasData = widget.data?.tableDataProcessed && widget.data.tableDataProcessed.length > 0;
        const hasCode = widget.data?.widgetName || customCode !== defaultCode;

        return (
          <>
            <OrangeStyleWidget
              icon={Code}
              label={widget.data?.widgetName || "Custom Code"}
              statusText={hasData ? 'Executed' : hasCode ? 'Configured' : ''}
              statusColor={hasData ? 'green' : hasCode ? 'blue' : 'gray'}
              mainColor={colors.main}
              lightColor={colors.light}
              bgColor={colors.bg}
            />

            {/* Parameters Modal - Code Editor */}
            <ParametersModal
              isOpen={showParameters}
              onClose={() => setShowParameters(false)}
              title="Custom Code Editor"
            >
              <div className="space-y-4">
                {/* Widget Name */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Widget Name</label>
                  <input
                    type="text"
                    placeholder="e.g., 'Peak Detector'"
                    value={widgetName}
                    onChange={(e) => setWidgetName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Widget Description */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Description</label>
                  <input
                    type="text"
                    placeholder="Describe what your widget does"
                    value={widgetDescription}
                    onChange={(e) => setWidgetDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Python Code */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Python Code</label>
                  <textarea
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                    placeholder="# Write your Python code here&#10;# Input: input_data&#10;# Output: output_data"
                    className="w-full h-48 px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
                    style={{ fontFamily: 'Consolas, Monaco, monospace' }}
                  />
                  <p className="text-xs text-gray-500">Use input_data (list of dicts) and return output_data</p>
                </div>

                {/* Execution Output */}
                {executionOutput && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Output</label>
                    <div className="p-3 bg-gray-50 border border-gray-300 rounded text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {executionOutput}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('[CustomCode] Execute clicked'); handleExecuteCode(); }} 
                    disabled={isExecuting || !customCode}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:bg-gray-400 cursor-pointer"
                  >
                    {isExecuting ? 'Running...' : 'Execute'}
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('[CustomCode] Save & Close clicked'); if (onUpdateWidget) { onUpdateWidget({ data: { ...(widget.data || {}), widgetName, widgetDescription, customCode } }); } setShowParameters(false); }} 
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 cursor-pointer"
                  >
                    Save & Close
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCustomCode(defaultCode); setWidgetName(''); setWidgetDescription(''); setExecutionOutput(''); }} 
                    className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </ParametersModal>

            {/* Advanced Code Editor Modal (kept for complex editing) */}
            {showCodeEditor && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowCodeEditor(false); }}>
                <div className="bg-white rounded-lg shadow-2xl w-[800px] h-[700px] flex flex-col" onClick={(e) => { e.stopPropagation(); }}>
                  {/* Modal Header */}
                  <div className="flex items-center justify-between p-4 border-b bg-purple-600 text-white flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <Code className="h-5 w-5" />
                      <span className="text-lg font-bold">Custom Code Editor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowCodeEditor(false); }}
                        className="px-4 py-1.5 text-sm font-semibold bg-white text-purple-600 rounded hover:bg-gray-100 transition-colors"
                      >
                        Close
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowCodeEditor(false); }}
                        className="w-8 h-8 flex items-center justify-center bg-white text-purple-600 rounded hover:bg-gray-100 transition-colors font-bold text-lg"
                        title="Close"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Modal Content */}
                  <div className="flex-1 p-6 overflow-y-auto">
                    <div className="space-y-4">
                      {/* Widget Metadata Section */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2 text-gray-700">Widget Name</label>
                          <input
                            type="text"
                            placeholder="e.g., 'Peak Detector'"
                            value={widgetName}
                            onChange={(e) => {
                              setWidgetName(e.target.value);
                            }}
                            className="w-full px-4 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-gray-700">Description</label>
                          <input
                            type="text"
                            placeholder="Describe what your widget does"
                            value={widgetDescription}
                            onChange={(e) => {
                              setWidgetDescription(e.target.value);
                            }}
                            className="w-full px-4 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>

                      {/* Code Editor Section */}
                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-700">Python Code</label>
                        <textarea
                          value={customCode}
                          onChange={(e) => {
                            setCustomCode(e.target.value);
                          }}
                          placeholder="# Write your Python code here&#10;# Input: input_data&#10;# Output: output_data"
                          className="w-full h-48 px-4 py-3 text-sm font-mono border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50"
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontFamily: 'Consolas, Monaco, monospace' }}
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-3 gap-3">
                        <button
                          onClick={handleExecuteCode}
                          disabled={isExecuting}
                          className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                        >
                          {isExecuting ? 'Executing...' : 'Execute Code'}
                        </button>
                        <button
                          onClick={handleSaveWidget}
                          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                        >
                          Save to Library
                        </button>
                        <button
                          onClick={handleBrowseCommunity}
                          className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded hover:bg-purple-700 transition-colors"
                        >
                          Browse Widgets
                        </button>
                      </div>

                      {/* Output Display */}
                      {executionOutput && (
                        <div>
                          <label className="block text-sm font-medium mb-2 text-gray-700">Output</label>
                          <div className="w-full p-4 text-sm font-mono bg-gray-100 border rounded max-h-32 overflow-auto">
                            <pre className="whitespace-pre-wrap">{executionOutput}</pre>
                          </div>
                        </div>
                      )}

                      {/* Bottom Close Button */}
                      <div className="pt-2 border-t">
                        <button
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowCodeEditor(false); }}
                          className="w-full px-6 py-3 text-sm font-semibold text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-colors cursor-pointer"
                        >
                          Close Editor
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Community Widgets Modal */}
            {showCommunityModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowCommunityModal(false); }}>
                <div className="bg-white rounded-lg p-4 max-w-2xl w-full max-h-96 overflow-auto" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-bold mb-3">Community Widgets</h3>
                  {communityWidgets.length === 0 ? (
                    <p className="text-sm text-gray-500">No community widgets found. Be the first to create one!</p>
                  ) : (
                    <div className="space-y-2">
                      {communityWidgets.map((w) => (
                        <div key={w.id} className="border rounded p-3 hover:bg-gray-50">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-semibold text-sm">{w.name}</h4>
                              <p className="text-xs text-gray-600">{w.description}</p>
                              <p className="text-xs text-gray-400 mt-1">
                                by {w.author} | Used {w.usage_count} times
                              </p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleLoadCommunityWidget(w.id); }}
                              className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                            >
                              Load
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowCommunityModal(false); }}
                    className="mt-4 w-full px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Data Table Modal for Viewing Output */}
              <DataTableModal
                key={`datatable-${widget.id}-${showTableModal ? 'open' : 'closed'}`}
                isOpen={showTableModal}
                data={localAugmentedTable || widget.data?.tableDataProcessed || widget.data?.tableData || []}
                onClose={() => { guardedCloseTableModal({ setJustClosed: true }); }}
              />
          </>
        );
      }

        if (widget.type === 'blank-remover') {
          const [threshold, setThreshold] = useState<number>(0.1);

          const runBlankRemover = () => {
            const tableData: Record<string, any>[] = widget.data?.tableData || widget.data?.parsedData || [];
            if (!tableData || tableData.length === 0) return;

            // Simple blank removal: filter rows where sum of numeric values < threshold
            const processed = tableData.filter((row) => {
              const values = Object.values(row).filter((v) => !isNaN(Number(v))).map(Number);
              const sum = values.reduce((a, b) => a + b, 0);
              return sum > threshold;
            });

            if (onUpdateWidget) {
              onUpdateWidget({ 
                data: { 
                  ...(widget.data || {}), 
                  tableDataProcessed: processed,
                  blankRemoverThreshold: threshold 
                } 
              });
            }
          };

          const colors = getWidgetColors('blank-remover');
          const hasData = widget.data?.tableDataProcessed;

          return (
            <>
              <OrangeStyleWidget
                icon={Filter}
                label="Blank Remover"
                statusText={hasData ? 'Filtered' : ''}
                statusColor={hasData ? 'green' : 'gray'}
                mainColor={colors.main}
                lightColor={colors.light}
                bgColor={colors.bg}
              />

              {/* Parameters Modal */}
              <ParametersModal
                isOpen={showParameters}
                onClose={() => setShowParameters(false)}
                title="Blank Remover Parameters"
              >
                <div className="space-y-4">
                  {/* Threshold parameter */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Threshold</label>
                    <input 
                      type="number" 
                      min={0} 
                      step={0.1}
                      value={threshold} 
                      onChange={(e) => setThreshold(Number(e.target.value))} 
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500">Minimum sum threshold to keep row</p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={(e) => { 
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[BlankRemover] Compute clicked');
                        runBlankRemover(); 
                      }} 
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
                    >
                      Compute
                    </button>
                      <button 
                        type="button" 
                        onClick={(e) => { 
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[BlankRemover] Apply & Close clicked');
                          runBlankRemover(); 
                          setShowParameters(false); 
                        }} 
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 cursor-pointer"
                        style={{ pointerEvents: 'auto' }}
                      >
                        Apply & Close
                      </button>
                      <button 
                        type="button" 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[BlankRemover] Reset clicked');
                          setThreshold(0.1);
                        }} 
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 cursor-pointer"
                      >
                        Reset
                      </button>
                  </div>
                </div>
              </ParametersModal>
            </>
          );
        }
    // Default: just show icon
    return (
      <div
        className="flex flex-col items-center justify-center w-full h-full"
        onClick={(e) => {
          // open selector on widget click (but prevent when clicking controls)
          const t = e.target as HTMLElement;
          if (t.closest('button, input, textarea, select')) return;
          e.stopPropagation();
          setShowSelector(true);
        }}
      >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex items-center justify-center">
            {!iconLoadFailed ? (
              <img
                src={customIconPath}
                alt={widget.type}
                className="orange-widget-icon"
                onError={() => setIconLoadFailed(true)}
              />
            ) : (
              <IconComponent className="orange-widget-icon" />
            )}
          </div>
      </div>
    );
  };

  return (
    <>
      <div
        // Attach only the dragPreview to the container so drag preview images work,
        // but the drag source itself is only the handle (ref={drag} on the handle button).
        ref={(node) => {
          try {
            if (node) {
              dragPreview(node);
            }
          } catch (err) {
            // swallow
          }
        }}
        className={`absolute transition-all duration-300 ${
          isDragging ? 'opacity-50 scale-95' : ''
  }`}
        style={{
          left: widget.position.x,
          top: widget.position.y,
          zIndex: showControls ? 50 : 20,
        }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
        onContextMenu={(e) => {
          // Open custom context menu on right-click for every widget
          e.preventDefault();
          e.stopPropagation();
          setShowControls(true);
          setShowContextMenu(true);
          setContextPos({ x: e.clientX, y: e.clientY });
        }}
      >
        <div
          className={`orange-widget ${isConnectingFrom ? 'connecting' : ''}`}
          data-category={getWidgetCategory(widget.type)}
          style={{ willChange: 'box-shadow, transform' }}
        >
          {/* Control buttons - only show on hover, positioned at top-left corner */}
          <div
            className={`absolute -top-2 -left-2 z-40 transition-all duration-200 ${
              showControls ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'
            }`}
          >
            {/* Settings button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (widget.type === 'file-upload') {
                  (fileInputRef.current as HTMLInputElement | null)?.click();
                  return;
                }
                onOpenConfig();
              }}
              title="Settings"
              className="orange-control-btn"
            >
              <Settings />
            </button>
          </div>

          {/* Drag handle - positioned at top-right corner */}
          <div
            className={`absolute -top-2 -right-2 z-40 transition-all duration-200 ${
              showControls ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'
            }`}
          >
            <button
              ref={drag}
              title="Drag"
              aria-label="Drag widget"
              className="orange-control-btn cursor-move"
            >
              <GripVertical />
            </button>
          </div>

          {/* Widget content centered - pointer-events-none to allow connection overlay to work */}
          <div className={`w-full h-full relative flex items-center justify-center ${['supabase','data-table','file-upload','kmeans-analysis'].includes(widget.type) ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            {renderWidgetContent()}
          </div>

          {/* file-upload uses the same top-row controls as other widgets; no duplicate bottom buttons */}
          {/* Outer ring overlay: single interaction area that starts connections by angle
              and a dashed semi-arc highlight that orients toward the pointer when highlighted */}
          {/* disable the connection overlay while any modal is open so modal buttons receive clicks */}
          <div className={`absolute inset-0 ${['supabase','data-table','file-upload','kmeans-analysis'].includes(widget.type) ? 'pointer-events-none' : (showParameters || showTableModal || showInlineResults) ? 'pointer-events-none' : 'pointer-events-auto'} flex items-center justify-center z-50`}>
            {/* Interaction area: matches blue icon circle size for connections on the blue circle */}
            <div
              className="absolute rounded-full"
              style={(() => {
                // If we have computed icon center (viewport coords), render overlay fixed over the icon
                if (iconCenter && ['supabase','data-table','file-upload'].includes(widget.type)) {
                    return {
                    position: 'fixed',
                    width: '70px',
                    height: '70px',
                    left: `${iconCenter.left}px`,
                    top: `${iconCenter.top}px`,
                    transform: 'translate(-50%,-50%)',
                    transformOrigin: 'center',
                    willChange: 'transform',
                    zIndex: 9000
                  } as React.CSSProperties;
                }
                return {
                  width: '70px',
                  height: '70px',
                  left: '50%',
                  top: ['supabase','data-table','file-upload'].includes(widget.type) ? '12px' : '50%',
                  transform: ['supabase','data-table','file-upload'].includes(widget.type) ? 'translate(-50%,0)' : 'translate(-50%,-50%)',
                  transformOrigin: 'center',
                  willChange: 'transform'
                } as React.CSSProperties;
              })()}
              onPointerDown={(e) => {
                // For input widgets the overlay is non-interactive (pointer-events-none on parent)
                // so this handler will only run for non-input widgets.
                try {
                  e.preventDefault();
                  e.stopPropagation();
                  onStartConnection && onStartConnection({ clientX: e.clientX, clientY: e.clientY });
                } catch (err) {
                  // swallow
                }
              }}
            >
              {/* Show connection dots only while connecting (source) or when highlighted as target */}
              {(isConnectingFrom || isHighlighted) && !['supabase','data-table','file-upload'].includes(widget.type) && (
                <>
                  {/* Position connection dots inside icon circle for input widgets (Supabase/Data table/File upload) */}
                  <div
                    className="absolute rounded-full bg-white border-2 pointer-events-none"
                    style={(() => {
                      if (['supabase','data-table','file-upload'].includes(widget.type)) {
                        return {
                          width: '8px',
                          height: '8px',
                          left: '14px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          borderColor: getWidgetColors(widget.type).main,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.25)'
                        } as React.CSSProperties;
                      }
                      return {
                        width: '8px',
                        height: '8px',
                        left: '5px',
                        top: '30%',
                        transform: 'translateY(-50%)',
                        borderColor: getWidgetColors(widget.type).main,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.25)'
                      } as React.CSSProperties;
                    })()}
                  />
                  <div
                    className="absolute rounded-full bg-white border-2 pointer-events-none"
                    style={(() => {
                      if (['supabase','data-table','file-upload'].includes(widget.type)) {
                        return {
                          width: '8px',
                          height: '8px',
                          right: '14px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          borderColor: getWidgetColors(widget.type).main,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.25)'
                        } as React.CSSProperties;
                      }
                      return {
                        width: '8px',
                        height: '8px',
                        right: '5px',
                        top: '30%',
                        transform: 'translateY(-50%)',
                        borderColor: getWidgetColors(widget.type).main,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.25)'
                      } as React.CSSProperties;
                    })()}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Widget Label: render only for non-supabase widgets (supabase renders its own label inside) */}
        {widget.type !== 'supabase' && (
          <div className={`orange-widget-label absolute top-full mt-1 left-1/2 transform -translate-x-1/2 ${showControls ? 'opacity-100' : 'opacity-80'}`}>
            {editingLabel !== null ? (
              <input
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (onUpdateWidget) onUpdateWidget({ label: editingLabel });
                    setEditingLabel(null);
                  } else if (e.key === 'Escape') {
                    setEditingLabel(null);
                  }
                }}
                className="px-2 py-1 rounded border text-xs"
                autoFocus
              />
            ) : (
              (widget.label && widget.label.length > 0)
                ? widget.label
                : getWidgetLabel(widget.type)
            )}
          </div>
        )}

        {/* Show upload status for file-upload widgets */}
        {showControls && showUploadStatus && (
          <div
            className={`absolute top-full left-1/2 transform -translate-x-1/2 px-3 py-1 rounded text-xs font-semibold whitespace-nowrap ${
              uploadStatus === 'uploading'
                ? 'bg-yellow-200 text-yellow-800'
                : uploadStatus === 'success'
                ? 'bg-green-200 text-green-800'
                : uploadStatus === 'error'
                ? 'bg-red-200 text-red-800'
                : 'bg-gray-200 text-gray-700'
            } shadow`}
          >
              {uploadStatus === 'uploading' && 'Uploading...'}
              {uploadStatus === 'success' && 'Upload Successful'}
              {uploadStatus === 'error' && 'Upload Failed'}
          </div>
        )}

        {/* Processing Indicator removed per user request */}

        {/* Data Table Modal */}
          {widget.type === 'data-table' && (
            <>
              {console.log('[CanvasWidget] Rendering DataTableModal for widget:', widget.id, 'isOpen:', showTableModal, 'dataLength:', (widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || []).length)}
              <DataTableModal
                key={`datatable-${widget.id}-${showTableModal ? 'open' : 'closed'}`}
                isOpen={showTableModal}
                data={widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || []}
                sourceWidgetId={widget.id}
                onClose={() => {
                  console.log('[CanvasWidget] DataTableModal close button clicked - forcing close (bypassing lock)');
                  // Bypass the lock for explicit close button clicks
                  setShowTableModal(false);
                  setLocalAugmentedTable(null);
                  justClosedRef.current = true;
                  setTimeout(() => { justClosedRef.current = false; }, 500);
                }}
              />
            </>
          )}

          {/* Render DataTableModal for any widget (non-data-table) when requested (e.g., KMeans results) */}
          {widget.type !== 'data-table' && showTableModal && (
            <DataTableModal
              key={`datatable-${widget.id}-${showTableModal ? 'open' : 'closed'}`}
              isOpen={showTableModal}
              data={localAugmentedTable || widget.data?.tableDataProcessed || widget.data?.tableData || []}
              sourceWidgetId={widget.id}
              onClose={() => { 
                console.log('[CanvasWidget] DataTableModal close button clicked (non-data-table) - forcing close');
                setShowTableModal(false);
                setLocalAugmentedTable(null);
                justClosedRef.current = true;
                setTimeout(() => { justClosedRef.current = false; }, 500);
              }}
            />
          )}

      {/* Widget Selector Modal */}
      <WidgetSelectorModal
        isOpen={showSelector}
        onClose={() => setShowSelector(false)}
        onSelect={(widgetTypeId) => {
          if (onUpdateWidget) onUpdateWidget({ type: widgetTypeId });
        }}
        registry={widgetRegistry}
        onCreateLinked={(widgetTypeId) => {
          if (onCreateLinkedNode) onCreateLinkedNode(widget.id, widgetTypeId);
        }}
      />
      </div>

      {/* Custom right-click context menu */}
      {showContextMenu && contextPos && (
        <div
          role="menu"
          aria-label="Widget context menu"
          onClick={(e) => {
            e.stopPropagation();
          }}
          style={{ position: 'fixed', left: contextPos.x, top: contextPos.y, zIndex: 60 }}
        >
          <div className="w-48 rounded bg-white shadow-lg dark:bg-gray-800 text-sm overflow-hidden">
            {[
              { key: 'open', label: 'Open', shortcut: 'Enter', action: () => {
                  // Special case: PCA with results - show inline results modal
                  if (widget.type === 'pca-analysis' && widget.data?.pcaResults) {
                    setShowInlineResults(true);
                  }
                  // KMeans: if results exist, open data table, otherwise open parameters
                  else if (widget.type === 'kmeans-analysis') {
                    if (widget.data?.kmeansResults) openTableModal();
                    else setShowParameters(true);
                  }
                  // For preprocessing widgets, show parameters
                  else if (['noise-filter', 'baseline-correction', 'smoothing', 'normalization', 'blank-remover', 'spectral-segmentation', 'future-extraction', 'custom-code', 'pca-analysis'].includes(widget.type)) {
                    setShowParameters(true);
                  }
                  else if (widget.type === 'hierarchical-clustering') {
                    // If this widget already has data or results, ask it to open its combined outputs.
                    // Otherwise open the Parameters pane so the user can connect/configure a data source.
                    const hasData = (
                      (widget.data?.tableData && widget.data.tableData.length > 0) ||
                      (widget.data?.tableDataProcessed && widget.data.tableDataProcessed.length > 0) ||
                      (widget.data?.parsedData && widget.data.parsedData.length > 0) ||
                      (widget.data?.hierarchicalResults)
                    );
                    if (hasData) {
                      try {
                        console.debug('[CanvasWidget] dispatching openHierarchicalOutput(all) for', widget.id);
                        window.dispatchEvent(new CustomEvent('openHierarchicalOutput', { detail: { widgetId: widget.id, view: 'all' } }));
                      } catch (err) {
                        console.debug('[CanvasWidget] openHierarchicalOutput dispatch failed', err);
                      }
                    } else {
                      // No data yet - open parameters so user can configure
                      try {
                        console.debug('[CanvasWidget] No data - dispatching openWidgetParameters for', widget.id);
                        window.dispatchEvent(new CustomEvent('openWidgetParameters', { detail: { widgetId: widget.id } }));
                      } catch (err) {
                        console.debug('[CanvasWidget] dispatch failed, falling back to local setShowParameters', err);
                      }
                      setShowParameters(true);
                    }
                  }
                  // Open the appropriate modal depending on widget type
                  else if (widget.type === 'data-table') {
                    const hasData = (
                      (widget.data?.tableData && widget.data.tableData.length > 0) ||
                      (widget.data?.tableDataProcessed && widget.data.tableDataProcessed.length > 0) ||
                      (widget.data?.parsedData && widget.data.parsedData.length > 0)
                    );
                    console.log('[CanvasWidget] Context menu Open clicked for data-table:', widget.id, 'hasData:', hasData);
                      console.log('[CanvasWidget] Data sources:', {
                        tableData: widget.data?.tableData?.length || 0,
                        tableDataProcessed: widget.data?.tableDataProcessed?.length || 0,
                        parsedData: widget.data?.parsedData?.length || 0
                      });
                      if (hasData) {
                        // Open the full Data Table modal and center it over the canvas viewport
                        // Use guarded opener to avoid immediate close/reopen races
                        console.log('[CanvasWidget] Opening data table modal for widget:', widget.id);
                        openTableModal();
                      } else {
                        // No data: do nothing (do not show an empty modal)
                        console.warn('[CanvasWidget] Open ignored: data-table has no data for widget:', widget.id);
                      }
                    } else if (widget.type === 'line-chart') {
                    setShowLineChartModal(true);
                  } else if (widget.type === 'scatter-plot') {
                    setShowScatterModal(true);
                  } else if (widget.type === 'box-plot') {
                    setShowBoxPlotModal(true);
                  } else if (widget.type === 'bar-chart') {
                    setShowBarChartModal(true);
                  } else if (widget.type === 'mean-average') {
                    setShowMeanModal(true);
                  } else {
                    onOpenConfig();
                  }
                } },
              { key: 'rename', label: 'Rename', shortcut: 'F2', action: () => setEditingLabel(widget.label || '') },
              { key: 'delete', label: 'Delete', shortcut: 'Del', action: () => onDelete() },
              { key: 'removeAll', label: 'Remove All', shortcut: 'Ctrl+X', action: () => { onRemoveConnections && onRemoveConnections(); } },
              { key: 'duplicate', label: 'Duplicate', shortcut: 'Ctrl+D', action: () => {/* placeholder */} },
              { key: 'copy', label: 'Copy', shortcut: 'Ctrl+C', action: () => {/* placeholder */} },
              { key: 'help', label: 'Help', shortcut: 'F1', action: () => {/* placeholder */} },
            ].map((item, idx) => (
              <button
                key={item.key}
                onClick={(e) => {
                  e.stopPropagation();
                  item.action();
                  setShowContextMenu(false);
                }}
                className={`w-full text-left px-3 py-2 flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 ${idx === 0 ? 'pt-3' : ''}`}
              >
                <span>{item.label}</span>
                <span className="text-xs text-gray-500">{item.shortcut}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mean/Average Modal */}
      {widget.type === 'mean-average' && (
        <MeanAverageModal
          isOpen={showMeanModal}
          onClose={() => setShowMeanModal(false)}
          columns={columns}
          data={data}
          mode={mode}
          setMode={setMode}
          selectedRows={selectedRows}
          setSelectedRows={setSelectedRows}
          selectedCols={selectedCols}
          setSelectedCols={setSelectedCols}
        />
      )}

      {/* Line Chart Modal (usable by line-chart and processing widgets like baseline) */}
      {showLineChartModal && (() => {
        const modalData: Record<string, any>[] = modalPreviewData || widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || [];
        const modalCols: string[] = modalData && modalData.length > 0 ? Object.keys(modalData[0]) : [];
        return (
          <LineChartModal
            isOpen={showLineChartModal}
            onClose={() => {
              setShowLineChartModal(false);
              setModalPreviewData(null);
            }}
            data={modalData}
            columns={modalCols}
          />
        );
      })()}

      {/* Scatter Plot Modal */}
      {widget.type === 'scatter-plot' && (
        <ScatterPlotModal
          isOpen={showScatterModal}
          onClose={() => setShowScatterModal(false)}
          data={widget.data?.tableData || []}
          columns={widget.data?.tableData && widget.data.tableData.length > 0 ? Object.keys(widget.data.tableData[0]) : []}
        />
      )}

      {/* Box Plot Modal */}
      {widget.type === 'box-plot' && (
        <BoxPlotModal
          isOpen={showBoxPlotModal}
          onClose={() => setShowBoxPlotModal(false)}
          data={widget.data?.tableData || []}
          columns={widget.data?.tableData && widget.data.tableData.length > 0 ? Object.keys(widget.data.tableData[0]) : []}
        />
      )}

      {/* Bar Chart Modal */}
      {widget.type === 'bar-chart' && (
        <BarChartModal
          isOpen={showBarChartModal}
          onClose={() => setShowBarChartModal(false)}
          data={widget.data?.tableData || []}
          columns={widget.data?.tableData && widget.data.tableData.length > 0 ? Object.keys(widget.data.tableData[0]) : []}
        />
      )}

      {/* KMeans Graph Modal (shows 2D projection with cluster coloring) */}
      {showKmeansGraphModal && (() => {
        const results = widget.data?.kmeansResults || localKmeansResults;
        const projection = results?.projection_2d || [];
        const labels = results?.labels || [];
        const clusters: Record<string, { x: number; y: number }[]> = {};
        for (let i = 0; i < projection.length; i++) {
          const p = projection[i] || [0, 0];
          const lbl = (labels && labels[i] !== undefined) ? String(labels[i]) : '0';
          clusters[lbl] = clusters[lbl] || [];
          clusters[lbl].push({ x: Number(p[0] || 0), y: Number(p[1] || 0) });
        }
        const clusterKeys = Object.keys(clusters);
        const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-lg shadow-lg p-4 min-w-[600px] max-w-[90vw]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">KMeans Clustered Scatter</h3>
                <button onClick={() => setShowKmeansGraphModal(false)} className="text-gray-600 px-2">Close</button>
              </div>
              {projection.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-600">No projection data available.</div>
              ) : (
                <div style={{ width: '100%', height: 420 }}>
                  <ResponsiveContainer>
                    <ScatterChart>
                      <CartesianGrid />
                      <XAxis type="number" dataKey="x" name="X" />
                      <YAxis type="number" dataKey="y" name="Y" />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      {clusterKeys.map((k, idx) => (
                        <Scatter key={k} name={`Cluster ${k}`} data={clusters[k]} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
};

export default CanvasWidget;