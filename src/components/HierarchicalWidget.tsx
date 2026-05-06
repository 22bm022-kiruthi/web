import React, { useState, useMemo, useEffect, useRef } from 'react';
import DendrogramModalComponent from './DendrogramModalComponent';
import { createPortal } from 'react-dom';
import OrangeStyleWidget from './OrangeStyleWidget';
import ParametersModal from './ParametersModal';
import { getWidgetColors } from '../config/orangeColors';
import { Search } from 'lucide-react';
import DataTableModal from './DataTableModal';
import ScatterPlotModal from './ScatterPlotModal';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// --- Lightweight clustering helpers (k-means / bisecting) ---
const euclidean = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const da = a[i] || 0; const db = b[i] || 0; const d = da - db; s += d * d;
  }
  return Math.sqrt(s);
};

const kmeans = (points: number[][], k: number, maxIter = 100) => {
  const n = points.length;
  if (k <= 0) return new Array(n).fill(0);
  if (k === 1) return new Array(n).fill(0);
  // init centroids by sampling k distinct points
  const cents: number[][] = [];
  const used = new Set<number>();
  while (cents.length < Math.min(k, n)) {
    const idx = Math.floor(Math.random() * n);
    if (!used.has(idx)) { used.add(idx); cents.push(points[idx].slice()); }
  }
  const labels = new Array(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    // assign
    for (let i = 0; i < n; i++) {
      let best = 0; let bestd = Infinity;
      for (let j = 0; j < cents.length; j++) {
        const d = euclidean(points[i], cents[j]); if (d < bestd) { bestd = d; best = j; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    // recompute
    const sums = new Array(cents.length).fill(0).map(() => [] as number[]);
    const counts = new Array(cents.length).fill(0);
    for (let i = 0; i < n; i++) {
      const lab = labels[i]; counts[lab]++;
      for (let d = 0; d < points[i].length; d++) {
        sums[lab][d] = (sums[lab][d] || 0) + points[i][d];
      }
    }
    for (let j = 0; j < cents.length; j++) {
      if (counts[j] === 0) {
        // reinit to random point
        cents[j] = points[Math.floor(Math.random() * n)].slice();
      } else {
        for (let d = 0; d < (sums[j] || []).length; d++) cents[j][d] = sums[j][d] / counts[j];
      }
    }
    if (!changed) break;
  }
  return labels.map(l => Math.min(l, k-1));
};

const bisectingKMeans = (points: number[][], k: number) => {
  const n = points.length;
  if (n === 0) return [];
  if (k <= 1) return new Array(n).fill(0);
  // simple strategy: run standard k-means with k clusters (fast and deterministic enough here)
  try {
    return kmeans(points, k, 60);
  } catch (e) {
    // fallback: round-robin assignment
    const labels = new Array(n).fill(0);
    for (let i = 0; i < n; i++) labels[i] = i % k;
    return labels;
  }
};


// Helper to compute full linkage in a Web Worker (module-level so components can call it)
const computeFullLinkageInWorker = (features: number[][]) => {
  return new Promise<any>((resolve, reject) => {
    try {
      const worker = new Worker(new URL('../workers/linkageWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (ev) => {
        const data = ev.data || {};
        if (data.error) {
          worker.terminate();
          reject(new Error(data.error));
          return;
        }
        worker.terminate();
        resolve(data);
      };
      worker.onerror = (err) => { worker.terminate(); reject(err); };
      worker.postMessage({ features });
    } catch (err) {
      reject(err);
    }
  });
};

const HierarchicalWidget = (props: any) => {
  const { widget = { id: 'hierarchical-1', data: {}, type: 'hierarchical' }, onUpdateWidget = () => {}, iconRef = null, portElements = null } = props;
  const colors = getWidgetColors(widget.type || 'hierarchical');

  const [showCombined, setShowCombined] = useState(false);
  const [showDendrogram, setShowDendrogram] = useState(false);
  const [showScatter, setShowScatter] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showParameters, setShowParameters] = useState(false);
  const [showResultsInline, setShowResultsInline] = useState(false);
  const [showFullScatterInline, setShowFullScatterInline] = useState(false);
  const [scatterChartVisible, setScatterChartVisible] = useState(false);
  const [requestedUpstream, setRequestedUpstream] = useState(false);
  const [upstreamMessage, setUpstreamMessage] = useState<string | null>(null);
  const [method, setMethod] = useState<'agglomerative'|'divisive'>('agglomerative');
  const [hierK, setHierK] = useState<number>(2);
  const [linkageCriteria, setLinkageCriteria] = useState<string>('average');
  const [distanceMetric, setDistanceMetric] = useState<string>('euclidean');
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [previewReady, setPreviewReady] = useState<boolean>(false);
  const [runInProgress, setRunInProgress] = useState<boolean>(false);
  const [computingDendrogram, setComputingDendrogram] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);

  const pushLog = (msg: string) => {
    try { setLogMessages(s => [new Date().toLocaleTimeString() + ' ' + msg].concat(s).slice(0, 12)); } catch (e) { /* ignore */ }
    try { console.debug('[HierarchicalWidget]', msg); } catch (e) { /* ignore */ }
  };
  // Helper to persist hierarchical results with safe handling for large tables
  const persistResultsWithLabels = (result: any, labels: number[], extra: any = {}) => {
    try {
      const baseRows = (widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || []);
      const N = Array.isArray(baseRows) ? baseRows.length : 0;
      const payloadBase: any = { ...(widget.data || {}), hierarchicalResults: result, hier_k: hierK, hier_method: method, hier_linkage: linkageCriteria, ...extra };
      if (N > 800) {
        const preview = (baseRows || []).slice(0, 20).map((r:any, i:number) => ({ index: i, cluster: labels[i] }));
        persistSafely({ data: { ...payloadBase, tableData: preview } });
        pushLog('Persisted preview for large table (deferred full table)');
      } else {
        const labelled = (baseRows || []).map((r:any, i:number) => ({ index: i, cluster: labels[i], ...r }));
        persistSafely({ data: { ...payloadBase, tableData: labelled } });
        pushLog('Persisted full labelled table');
      }
    } catch (e) { pushLog('persistResultsWithLabels failed: ' + (e && e.message)); }
  };
  // Persist helper: dispatch lightweight event for parent to handle async; fall back to calling onUpdateWidget after a short delay
  const persistSafely = (payload: any) => {
    try {
      // If payload includes a large `tableData`, send a lightweight summary first
      const MAX_IMMEDIATE_ROWS = 300;
      const lightweight = { ...payload };
      let deferredFull = false;
      try {
        if (lightweight && lightweight.data && Array.isArray(lightweight.data.tableData) && lightweight.data.tableData.length > MAX_IMMEDIATE_ROWS) {
          const fullTable = lightweight.data.tableData as any[];
          lightweight.data = { ...(lightweight.data || {}) };
          // include only metadata and a small preview to avoid heavy synchronous updates
          lightweight.data.tableData = fullTable.slice(0, 20).map((r:any,i:number)=>({ index: r.index || i, cluster: r.cluster }));
          deferredFull = true;
        }
      } catch (e) { /* ignore */ }
      const ev = new CustomEvent('hier-persist', { detail: { widgetId: widget.id, payload: lightweight } });
      window.dispatchEvent(ev);
      pushLog('Persist dispatched (lightweight) via hier-persist event');
    } catch (err) {
      pushLog('Persist event dispatch failed: ' + (err && err.message));
    }
    // Fallback: call onUpdateWidget after a short delay to avoid blocking direct synchronous parent work
      try {
        // Fallback: call onUpdateWidget after a short delay with the lightweight payload to avoid blocking
        setTimeout(() => { try { onUpdateWidget && onUpdateWidget(lightweight); pushLog('Persist fallback executed (lightweight)'); } catch (e) { pushLog('Persist fallback failed'); } }, 300);
        // If we deferred the full table, send it after a longer idle period
        try {
          if (deferredFull) {
            setTimeout(() => {
              try {
                onUpdateWidget && onUpdateWidget(payload);
                pushLog('Persist full payload applied (deferred)');
              } catch (e) { pushLog('Persist full payload failed'); }
            }, 1200);
          }
        } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }
  };
  const [tempK, setTempK] = useState<number>(hierK);

  const pendingShowResults = useRef<any>({ current: false });
  const pendingApplyRef = useRef<any | null>(null);
  const prevPersistedRef = useRef<any | null>(null);
  const scatterModalRef = useRef<any>(null);
  const divisiveDendroRef = useRef<any>(null);
  const combinedPortalRef = useRef<HTMLDivElement | null>(null);
  const combinedCanvasRectRef = useRef<DOMRect | null>(null);
  const [combinedPos, setCombinedPos] = useState<{ x: number; y: number } | null>(null);

  // Create/remove portal container inside canvas when combined modal opens/closes
  useEffect(() => {
    if (!showCombined) {
      try {
        if (combinedPortalRef.current && combinedPortalRef.current.parentElement) {
          combinedPortalRef.current.parentElement.removeChild(combinedPortalRef.current);
        }
      } catch (e) { /* ignore */ }
      combinedPortalRef.current = null;
      combinedCanvasRectRef.current = null;
      setCombinedPos(null);
    }
  }, [showCombined]);

  // When the centered combined modal closes, persist any pending applied results
  useEffect(() => {
    if (showCombined) return;
        if (pendingApplyRef.current) {
      try {
        const toPersist = pendingApplyRef.current;
        // Use safe persisting helper to avoid blocking on large tables
        persistResultsWithLabels(toPersist, toPersist.labels);
        // clear any temporarily saved previous result since we've persisted the new one
        prevPersistedRef.current = null;
      } catch (e) { console.error('[HierarchicalWidget] Persisting applied results failed', e); }
      pendingApplyRef.current = null;
    }
  }, [showCombined]);
  
  // If the combined modal closed without a new applied preview, restore any previous persisted results
  useEffect(() => {
    if (showCombined) return;
    if (!pendingApplyRef.current && prevPersistedRef.current) {
      try {
        const prev = prevPersistedRef.current;
        // Use safe helper to avoid building full table synchronously
        persistResultsWithLabels(prev, (prev && prev.labels) || []);
      } catch (e) { /* ignore */ }
      prevPersistedRef.current = null;
    }
  }, [showCombined]);


  // Expose simple global helpers so DevTools or external scripts can close/open modals
  React.useEffect(() => {
    (window as any).__HIER = (window as any).__HIER || {};
    (window as any).__HIER.closeCombined = () => setShowCombined(false);
    (window as any).__HIER.openFullDendrogram = async () => {
      const features = lastResult?.features || [];
      if (features.length === 0) return;
      try {
        setLastResult((p:any) => ({ ...(p||{}), computingLinkage: true }));
        const res:any = await computeFullLinkageInWorker(features);
        setLastResult((p:any) => ({ ...(p||{}), linkage: res.linkage||[], order: res.order||[], heights: res.heights||[], computingLinkage: false }));
        setShowDendrogram(true);
      } catch (err) {
        console.error('[HierarchicalWidget] __HIER.openFullDendrogram failed', err);
        setLastResult((p:any) => ({ ...(p||{}), computingLinkage: false }));
      }
    };
    // expose quick parameter opener for debugging
    (window as any).__HIER.openParameters = () => { try { setShowParameters(true); console.log('[HierarchicalWidget] __HIER.openParameters called'); } catch (err) { console.log('openParameters failed', err); } };
    return () => { if ((window as any).__HIER) { delete (window as any).__HIER.closeCombined; delete (window as any).__HIER.openFullDendrogram; } };
  }, [lastResult]);

  React.useEffect(() => {
    console.log('[HierarchicalWidget] showParameters ->', showParameters, 'widget.id:', widget.id);
  }, [showParameters, widget.id]);

    // Listen for parent request to open this widget's local parameters modal
    useEffect(() => {
      const openLocalHandler = (ev: any) => {
        try {
          const id = ev?.detail?.widgetId;
          if (String(id) === String(widget.id)) {
            console.log('[HierarchicalWidget] received openWidgetLocalParameters for', widget.id);
            setShowParameters(true);
          }
        } catch (err) { console.log('[HierarchicalWidget] openLocalHandler error', err); }
      };
      window.addEventListener('openWidgetLocalParameters', openLocalHandler as EventListener);
      return () => window.removeEventListener('openWidgetLocalParameters', openLocalHandler as EventListener);
    }, [widget.id]);

  // Allow forcing the combined modal closed via a custom document event (useful for debugging)
  React.useEffect(() => {
    const handler = () => setShowCombined(false);
    document.addEventListener('close-hier-combined', handler as EventListener);
    return () => document.removeEventListener('close-hier-combined', handler as EventListener);
  }, []);
  // Listen for global requests to open this widget's outputs (sent from Canvas context menu)
  React.useEffect(() => {
    const handler = async (ev: any) => {
      try {
        console.log('[HierarchicalWidget] openHierarchicalOutput event received:', ev?.detail);
        const d = ev?.detail || {};
        if (!d || d.widgetId !== widget.id) {
          console.log('[HierarchicalWidget] Event ignored - wrong widget ID');
          return;
        }
        const view = d.view as 'dendrogram' | 'scatter' | 'table' | 'all' | undefined;
        console.log('[HierarchicalWidget] Opening view:', view, 'lastResult exists:', !!lastResult);
        
        // Check if we have data available
        const hasData = (
          (widget.data?.tableData && widget.data.tableData.length > 0) ||
          (widget.data?.tableDataProcessed && widget.data.tableDataProcessed.length > 0) ||
          (widget.data?.parsedData && widget.data.parsedData.length > 0)
        );
        
        console.log('[HierarchicalWidget] hasData:', hasData, 'lastResult:', !!lastResult);
        
        if (lastResult) {
          // If results already exist, show them inline on canvas
          console.log('[HierarchicalWidget] Showing existing results inline on canvas');
          setShowResultsInline(true);
        } else if (hasData) {
          // No results yet but we have data - run clustering and show inline after it completes
          console.log('[HierarchicalWidget] Has data but no results - running clustering');
          pendingShowResults.current = true;
          await run();
          // The useEffect watching lastResult will show results when ready
        } else {
          // No data - open parameters modal
          console.log('[HierarchicalWidget] No data - opening parameters');
          setShowParameters(true);
        }
      } catch (err) {
        console.error('[HierarchicalWidget] Error in openHierarchicalOutput handler:', err);
        pendingShowResults.current = false;
      }
    };
    window.addEventListener('openHierarchicalOutput', handler as EventListener);
    return () => window.removeEventListener('openHierarchicalOutput', handler as EventListener);
  }, [widget.id, lastResult, method, hierK, widget.data]);

  // Listen for explicit 'render anyway' events from dendrogram modal
  React.useEffect(() => {
    const handler = () => {
      try {
        // When user forces rendering anyway, open the dendrogram (parent controls rendering guard)
        setShowDendrogram(true);
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('renderFullDendrogramAnyway', handler as EventListener);
    return () => window.removeEventListener('renderFullDendrogramAnyway', handler as EventListener);
  }, []);

  // Listen for request from dendrogram modal to open scatter summary
  React.useEffect(() => {
    const handler = () => { try { setShowScatter(true); } catch (e) { /* ignore */ } };
    window.addEventListener('openHierScatter', handler as EventListener);
    return () => window.removeEventListener('openHierScatter', handler as EventListener);
  }, []);

  // Note: parameter modals are managed by the parent CanvasWidget to avoid
  // duplicate modals. Widgets should request the parent to open parameters
  // via the `openWidgetParameters` event; they should not render their own
  // ParametersModal to prevent double displays.

  // Memoize scatter data to prevent re-creating array on every render
  const scatterData = useMemo(() => {
    if (!lastResult || !lastResult.features) return [];
    const MAX_POINTS = 500;
    let data = lastResult.features.map((f: number[], i: number) => ({ 
      x: f[0], 
      y: f[1], 
      index: i, 
      cluster: lastResult.labels[i] 
    }));
    if (data.length > MAX_POINTS) {
      const step = Math.ceil(data.length / MAX_POINTS);
      data = data.filter((_: any, i: number) => i % step === 0);
    }
    console.log('[HierarchicalWidget] Memoized scatter data with', data.length, 'points');
    return data;
  }, [lastResult]);

  const run = async (autoOpen?: 'table' | 'dendrogram' | 'scatter') => {
    console.log('[HierarchicalWidget] RUN FUNCTION CALLED!', { widgetId: widget.id, method, k: hierK });
    const tableData: any[] = widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || [];
    console.log('[HierarchicalWidget] Table data check:', { 
      hasTableData: !!widget.data?.tableData, 
      hasTableDataProcessed: !!widget.data?.tableDataProcessed, 
      hasParsedData: !!widget.data?.parsedData,
      dataLength: tableData.length,
      firstRow: tableData[0] 
    });
    if (!tableData || tableData.length === 0) {
      console.log('[HierarchicalWidget] NO DATA - Early return!', { tableData, length: tableData?.length });
      // Ask app to forward upstream data if available
      try {
        console.debug('[HierarchicalWidget] requesting upstream data for', widget.id);
        window.dispatchEvent(new CustomEvent('requestUpstreamData', { detail: { widgetId: widget.id } }));
        setRequestedUpstream(true);
      } catch (err) {
        // ignore
      }
      // Don't automatically open parameters - wait for user to explicitly click "Open"
      // setShowParameters(true); // Removed - parameters only show when user clicks "Open"
      // User-friendly waiting message — widget will auto-run when upstream data arrives
      setUpstreamMessage('Requesting upstream data… waiting for source. Click "Open" to configure parameters.');
      // Clear the waiting message after a timeout to avoid permanently showing it if upstream never responds
      setTimeout(() => {
        console.debug('[HierarchicalWidget] upstream wait timed out for', widget.id);
        setRequestedUpstream(false);
        // Only clear the message if it hasn't already been cleared by a successful arrival
        setUpstreamMessage((cur) => (cur && cur.startsWith('Requesting upstream data') ? 'No upstream data available. Connect a data source and try again.' : cur));
      }, 8000);

      // Attempt a graceful fallback: if no upstream widget provided data, try fetching from the backend Supabase proxy
      // This helps when the user expects the widget to pull from the project's default table (e.g. `raman_data`).
      try {
        const fallbackTable = (widget.data && widget.data.supabaseTable) || 'data';
        console.debug('[HierarchicalWidget] attempting fallback fetch from Supabase for table', fallbackTable);
        setUpstreamMessage('Attempting to fetch data from Supabase...');
        const resp = await fetch(`/api/supabase/fetch?table=${encodeURIComponent(fallbackTable)}&limit=200`);
        if (resp.ok) {
          const json = await resp.json();
          const rows = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
          if (rows && rows.length > 0) {
            console.debug('[HierarchicalWidget] fallback fetch returned rows, updating widget data', rows.length);
            onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), parsedData: rows } });
            // clear the waiting message and run clustering now that we have data
            setUpstreamMessage(null);
            setRequestedUpstream(false);
            // small delay to allow state to update
            setTimeout(() => { try { run(); setShowResultsInline(true); } catch (e) { /* ignore */ } }, 60);
            return;
          } else {
            console.debug('[HierarchicalWidget] fallback fetch returned no rows');
            setUpstreamMessage('No rows returned from Supabase. Connect a data source or check table name.');
          }
        } else {
          console.debug('[HierarchicalWidget] fallback fetch failed HTTP', resp.status);
          setUpstreamMessage('Failed to fetch data from Supabase (backend error).');
        }
      } catch (err) {
        console.warn('[HierarchicalWidget] fallback Supabase fetch error', err);
        setUpstreamMessage('Supabase fetch failed. Check backend is running and proxy configuration.');
      }

      return;
    }
    
    console.log('[HierarchicalWidget] DATA FOUND! Processing', tableData.length, 'rows');
    const sample = tableData[0] || {};
    const keys = Object.keys(sample);
    const numericKeys = keys.filter(k => tableData.some(r => !isNaN(Number(r[k]))));
    const lower = numericKeys.map(k => k.toLowerCase());
    const pick = (cands: string[]) => { for (const c of cands) { const idx = lower.findIndex(l => l.includes(c)); if (idx >= 0) return numericKeys[idx]; } return numericKeys[0] || null; };
    const xKey = pick(['shift','wavenumber','raman','x']);
    const yKey = pick(['intensity','counts','value','y']);
    const featKeys = [xKey, yKey].filter(Boolean) as string[];
    // Raw extracted features (may be 0-,1- or 2+-dimensional)
    let features = tableData.map(r => featKeys.map(k => { const v = Number(r[k]); return Number.isFinite(v) ? v : 0; }));
    // Ensure features are at least 2D for scatter plotting. If only one numeric column is present,
    // use the row index as the second dimension so points are visible. If no numeric columns, use index and 0.
    if (features.length > 0) {
      features = features.map((fv, idx) => {
        if (fv.length >= 2) return [fv[0] || 0, fv[1] || 0];
        if (fv.length === 1) return [fv[0] || 0, idx];
        return [idx, 0];
      });
    }

      // If features are >2 dims, we will project to 2D for scatter visualization using a simple PCA
      const compute2DProjection = (matrix: number[][]) => {
        const m = matrix.length;
        if (m === 0) return [];
        const d = matrix[0].length;
        if (d <= 2) return matrix.map(r => [r[0] || 0, r[1] || 0]);
        // center data
        const mean = new Array(d).fill(0);
        for (let i = 0; i < m; i++) for (let j = 0; j < d; j++) mean[j] += matrix[i][j];
        for (let j = 0; j < d; j++) mean[j] /= m;
        const A = new Array(m).fill(0).map(() => new Array(d).fill(0));
        for (let i = 0; i < m; i++) for (let j = 0; j < d; j++) A[i][j] = matrix[i][j] - mean[j];
        // compute covariance matrix C = (A^T A) / (m-1)
        const C = new Array(d).fill(0).map(() => new Array(d).fill(0));
        for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) {
          let s = 0; for (let k = 0; k < m; k++) s += A[k][i] * A[k][j]; C[i][j] = s / Math.max(1, m - 1);
        }
        // power iteration to get top eigenvector
        const topEigen = (mat) => {
          const n = mat.length; let v = new Array(n).fill(0).map((_, i) => Math.random());
          for (let it = 0; it < 40; it++) {
            const nv = new Array(n).fill(0);
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) nv[i] += mat[i][j] * v[j];
            const norm = Math.sqrt(nv.reduce((s, x) => s + x * x, 0)) || 1;
            for (let i = 0; i < n; i++) v[i] = nv[i] / norm;
          }
          return v;
        };
        const v1 = topEigen(C);
        // deflate
        const lambda1 = v1.reduce((s, x, i) => s + x * (C[i].reduce((ss, cij, j) => ss + cij * v1[j], 0)), 0);
        const D = new Array(d).fill(0).map(() => new Array(d).fill(0));
        for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) D[i][j] = C[i][j] - lambda1 * v1[i] * v1[j];
        const v2 = topEigen(D);
        // project A onto v1 and v2
        const proj = A.map(row => [row.reduce((s, x, i) => s + x * v1[i], 0), row.reduce((s, x, i) => s + x * v2[i], 0)]);
        return proj;
      };

    if (method === 'agglomerative') {
      const LINKAGE_SAFE_LIMIT = 400; // avoid O(n^3) linkage for very large n
      if (features.length > LINKAGE_SAFE_LIMIT) {
        console.warn('[HierarchicalWidget] dataset too large for full agglomerative linkage, falling back to fast divisive approximation for labels only', { n: features.length, limit: LINKAGE_SAFE_LIMIT });
        // compute labels using faster divisive kmeans approximate method to avoid freezing
        const labels = bisectingKMeans(features, hierK);
        const result = { linkage: [], order: Array.from({ length: features.length }, (_, i) => i), heights: [], labels, featKeys, features, previewOnly: true } as any;
        setLastResult(result);
        const baseRows = (widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || []);
        persistResultsWithLabels(result, labels);
        if (autoOpen === 'table') setShowTable(true);
        if (autoOpen === 'scatter') setShowScatter(true);
        // Do not attempt to open or compute full dendrogram automatically for large datasets
        return;
      }
      let linkage: any[] = [];
      let order: number[] = Array.from({ length: features.length }, (_, i) => i);
      let heights: number[] = [];
      let labels: number[] = [];
      try {
        // compute full agglomerative linkage in a Web Worker to avoid blocking the main thread
        const res: any = await computeFullLinkageInWorker(features);
        linkage = res.linkage || [];
        order = res.order || order;
        heights = res.heights || [];
        try {
          labels = (labelsFromLinkage as any)(features.length, linkage, hierK);
        } catch (e) {
          console.warn('[HierarchicalWidget] labelsFromLinkage failed, falling back to bisectingKMeans', e);
          labels = bisectingKMeans(features, hierK);
        }
      } catch (err) {
        console.error('[HierarchicalWidget] computeFullLinkageInWorker failed, falling back to bisectingKMeans', err);
        pushLog('computeFullLinkageInWorker failed — using fast bisecting k-means fallback');
        labels = bisectingKMeans(features, hierK);
        const result = { linkage: [], order, heights: [], labels, featKeys, features, previewOnly: true } as any;
        setLastResult(result);
        const baseRows = (widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || []);
        persistResultsWithLabels(result, labels);
        if (autoOpen === 'table') setShowTable(true);
        if (autoOpen === 'scatter') setShowScatter(true);
        return;
      }
      const result = { linkage, order, heights, labels, featKeys, features };
      setLastResult(result);
      // If features are higher-dimensional, auto-open the scatter view so PCA projection is shown
      try {
        if (features && features[0] && features[0].length > 2) {
          setShowScatter(true);
        }
      } catch (e) { /* ignore */ }
      // build a labelled table to forward to downstream widgets
      const baseRows = (widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || []);
      persistResultsWithLabels(result, labels);
      if (autoOpen === 'table') setShowTable(true);
      if (autoOpen === 'dendrogram') setShowDendrogram(true);
      if (autoOpen === 'scatter') setShowScatter(true);
    } else {
      // divisive
      const labels = bisectingKMeans(features, hierK);
      const result = { linkage: [], order: Array.from({ length: features.length }, (_, i) => i), heights: [], labels, featKeys, features };
      setLastResult(result);
      // Auto-open scatter for high-dimensional features so PCA projection is visible
      try {
        if (features && features[0] && features[0].length > 2) {
          setShowScatter(true);
        }
      } catch (e) { /* ignore */ }
      persistResultsWithLabels(result, labels);
      if (autoOpen === 'table') setShowTable(true);
      if (autoOpen === 'scatter') setShowScatter(true);
      // If features are high-dimensional, auto-open scatter for PCA projection
      try { if (features && features[0] && features[0].length > 2) setShowScatter(true); } catch (e) { /* ignore */ }
    }
  };

  // Fast, non-blocking approximate run used for Apply & Close to avoid freezing UI on large datasets.
  const quickRun = async (showInline = false) => {
    try {
      setRunInProgress(true);
      console.debug('[HierarchicalWidget] quickRun START', { widgetId: widget.id, hierK, method, linkageCriteria, showInline });
      const tableData: any[] = widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || [];
      if (!tableData || tableData.length === 0) { setRunInProgress(false); return null; }
      // extract features same as run()
      const sample = tableData[0] || {};
      const keys = Object.keys(sample);
      const numericKeys = keys.filter(k => tableData.some(r => !isNaN(Number(r[k]))));
      const lower = numericKeys.map(k => k.toLowerCase());
      const pick = (cands: string[]) => { for (const c of cands) { const idx = lower.findIndex(l => l.includes(c)); if (idx >= 0) return numericKeys[idx]; } return numericKeys[0] || null; };
      const xKey = pick(['shift','wavenumber','raman','x']);
      const yKey = pick(['intensity','counts','value','y']);
      const featKeys = [xKey, yKey].filter(Boolean) as string[];
      let features = tableData.map(r => featKeys.map(k => { const v = Number(r[k]); return Number.isFinite(v) ? v : 0; }));
      if (features.length > 0) {
        features = features.map((fv, idx) => {
          if (fv.length >= 2) return [fv[0] || 0, fv[1] || 0];
          if (fv.length === 1) return [fv[0] || 0, idx];
          return [idx, 0];
        });
      }
      // compute fast labels using bisecting kmeans (cheap)
      const labels = bisectingKMeans(features, hierK);
      const result = { linkage: [], order: Array.from({ length: features.length }, (_, i) => i), heights: [], labels, featKeys, features };
      // Store preview only — do NOT mutate lastResult or widget data until user applies
      setPreviewResult(result);
      if (showInline) {
        try { setShowResultsInline(true); } catch (e) { /* ignore */ }
      } else {
        setPreviewReady(true);
      }
      console.debug('[HierarchicalWidget] quickRun FINISH setPreviewResult', { labels: result.labels?.length, features: result.features?.length, showInline });
      setRunInProgress(false);
      return result;
    } catch (err) {
        console.error('[HierarchicalWidget] quickRun failed', err);
        setRunInProgress(false);
        return null;
      }
  };

  // If we requested upstream data, and widget props later receive tableData, automatically run once
  useEffect(() => {
    const has = (widget.data?.tableDataProcessed && widget.data.tableDataProcessed.length > 0) || (widget.data?.tableData && widget.data.tableData.length > 0) || (widget.data?.parsedData && widget.data.parsedData.length > 0);
    
    if (has) {
      console.debug('[HierarchicalWidget] Data detected:', {
        tableData: widget.data?.tableData?.length || 0,
        tableDataProcessed: widget.data?.tableDataProcessed?.length || 0,
        parsedData: widget.data?.parsedData?.length || 0,
        hasResult: !!lastResult,
        requestedUpstream
      });
      
      // If we were waiting for upstream data, run automatically
      if (requestedUpstream) {
        console.debug('[HierarchicalWidget] upstream data arrived for', widget.id);
        // clear flag and run clustering automatically
        setRequestedUpstream(false);
        // clear informational message when upstream data arrived
        setUpstreamMessage(null);
        // Close the parameters modal and open combined results when upstream data arrives
        // so the user doesn't need to press Run again.
        setShowParameters(false);
        // small timeout to allow UI updates to settle, then run clustering and show results inline
        setTimeout(() => {
          try {
            pendingShowResults.current = true;
            run();
            // Results will show automatically when lastResult updates
          } catch (e) {
            console.error('[HierarchicalWidget] Auto-run failed:', e);
            pendingShowResults.current = false;
          }
        }, 60);
      }
    }
  }, [widget.data?.tableData, widget.data?.tableDataProcessed, widget.data?.parsedData, requestedUpstream, lastResult]);

  // Debug logs to help trace modal visibility in the browser console
  useEffect(() => {
    console.debug('[HierarchicalWidget] showCombined ->', showCombined, 'showDendrogram ->', showDendrogram, 'showScatter ->', showScatter, 'showTable ->', showTable, 'lastResult?', !!lastResult);
    if (showCombined) console.debug('[HierarchicalWidget] Combined modal open - lastResult present?', !!lastResult);
  }, [showCombined, showDendrogram, showScatter, showTable, widget.id]);

  // When parameters modal opens, ensure combined modal is hidden so parameters overlay is on top.
  useEffect(() => {
    if (showParameters) {
      try { setShowCombined(false); } catch (e) { /* ignore */ }
    }
  }, [showParameters]);

  // Reset scatter chart visibility when modal opens
  useEffect(() => {
    if (showFullScatterInline) {
      setScatterChartVisible(true);
    }
  }, [showFullScatterInline]);

  // Expose lastResult for debugging in DevTools
  useEffect(() => {
    try { (window as any).__HIER = (window as any).__HIER || {}; (window as any).__HIER.lastResult = lastResult; } catch (e) { /* ignore */ }
    return () => { try { if ((window as any).__HIER) delete (window as any).__HIER.lastResult; } catch (e) { /* ignore */ } };
  }, [lastResult]);

  // keep tempK in sync with hierK when parameters change
  useEffect(() => { setTempK(hierK); }, [hierK]);

  // When lastResult is set and a pendingShowResults flag is present (or combined modal is open),
  // show inline results and clear the pending flag. This implements the automatic display
  // behavior expected when the user clicks Apply & Close or requests outputs from the canvas.
  useEffect(() => {
    if (!lastResult) return;
    console.log('[HierarchicalWidget] lastResult updated, pendingShowResults:', pendingShowResults.current, 'showCombined:', showCombined);
    // Only auto-show inline results when explicitly requested (pendingShowResults).
    // Do NOT treat `showCombined` as a signal to show inline results — that would
    // close the centered combined modal unexpectedly.
    if (pendingShowResults.current) {
      try {
        setShowResultsInline(true);
        pendingShowResults.current = false;
        console.log('[HierarchicalWidget] Showing results inline after compute');
      } catch (e) { console.error('[HierarchicalWidget] Error showing results inline', e); }
    }
  }, [lastResult]);

  // Emergency UX fix: while any modal is open, disable pointer events on the main canvas
  // This prevents the canvas from intercepting clicks (which can make modal buttons unresponsive)
  const canvasPointerPrevRef = React.useRef<string | null>(null);
  useEffect(() => {
    const el = document.querySelector('.orange-canvas') as HTMLElement | null;
    if (!el) return;
    const anyModalOpen = !!(showCombined || showDendrogram || showScatter || showTable || showParameters);
    if (anyModalOpen) {
      canvasPointerPrevRef.current = el.style.pointerEvents || '';
      el.style.pointerEvents = 'none';
      el.setAttribute('data-hier-pointer-disabled', '1');
    } else {
      try {
        // always restore pointer events when no modal is open
        el.style.pointerEvents = canvasPointerPrevRef.current || '';
        if (el.getAttribute('data-hier-pointer-disabled')) el.removeAttribute('data-hier-pointer-disabled');
        canvasPointerPrevRef.current = null;
      } catch (err) { /* ignore */ }
    }
    return () => {
      try {
        if (el && el.getAttribute('data-hier-pointer-disabled')) {
          el.style.pointerEvents = canvasPointerPrevRef.current || '';
          el.removeAttribute('data-hier-pointer-disabled');
          canvasPointerPrevRef.current = null;
        }
      } catch (err) { /* ignore */ }
    };
  }, [showCombined, showDendrogram, showScatter, showTable, showParameters]);

  const exportCSV = () => {
    if (!lastResult) return; const labels = lastResult.labels || [];
    const rows = (widget.data?.tableDataProcessed || widget.data?.tableData || []).map((r: any, i: number) => ({ index: i, cluster: labels[i], ...r }));
    if (rows.length === 0) return;
    const csv = [Object.keys(rows[0] || {}).join(',')].concat(rows.map(r => Object.values(r).map(v => typeof v === 'string' && v.includes(',') ? `"${v.replace(/"/g,'""')}"` : String(v)).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'hierarchical_clusters.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <OrangeStyleWidget 
      icon={Search} 
      label="Hierarchical Clustering" 
      iconRef={iconRef} 
      portElements={portElements} 
      mainColor={colors.main} 
      lightColor={colors.light} 
      bgColor={colors.bg}
      alwaysShowControls={showResultsInline}
    >
      <div className="mt-2 flex flex-col items-center gap-2 w-full">
        {/* Request parent CanvasWidget to open parameters when user clicks */}
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            try { 
              console.log('[HierarchicalWidget] dispatching openWidgetParameters', { widgetId: widget.id, widgetIdType: typeof widget.id });
              window.dispatchEvent(new CustomEvent('openWidgetParameters', { detail: { widgetId: widget.id } })); 
            } catch (err) { console.debug('dispatch failed', err); }
            // Also open local parameters modal as a fallback so users see parameters immediately
            try { setShowParameters(true); } catch (err) { console.log('setShowParameters failed', err); }
          }} 
          className="px-3 py-1.5 text-xs font-medium rounded transition-colors"
          style={{
            backgroundColor: colors.light,
            color: colors.main,
          }}
        >
          Open Parameters
        </button>

        {/* Parameters handled by parent CanvasWidget; no local modal rendered here */}

        {/* Inline results display on canvas (hidden while combined modal is open) */}
        {showResultsInline && lastResult && !showCombined && (
          <>
            {console.log('[HierarchicalWidget] RENDERING INLINE RESULTS!', { labelsLength: lastResult.labels?.length, clustersCount: lastResult.labels ? Math.max(...lastResult.labels) + 1 : 0 })}
            <div className="mt-2 p-2 bg-white rounded border overflow-visible pointer-events-auto" style={{ minWidth: '280px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <div className="flex justify-between items-center mb-1">
                <div className="text-gray-700" style={{ fontSize: '10px', fontWeight: 500 }}>
                  Results ({lastResult.labels.length} samples, {Math.max(...lastResult.labels) + 1} clusters)
                </div>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setShowResultsInline(false); 
                  }} 
                  className="text-red-600 hover:text-red-800"
                  style={{ fontSize: '10px' }}
                >
                  Hide
                </button>
              </div>
              
              {/* Mini scatter plot */}
              <div className="mb-2">
                <div className="font-medium mb-1" style={{ fontSize: '10px' }}>Clustered Scatter Plot</div>
                <div style={{ width: '100%', minWidth: '450px', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: '450px', height: '250px' }}>
                    <ScatterChart width={450} height={250} margin={{ top: 25, right: 25, bottom: 40, left: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="x" 
                        type="number" 
                        tick={{ fontSize: 9 }}
                        domain={['auto', 'auto']}
                        allowDataOverflow={false}
                        label={{ value: "PC1", position: "insideBottom", offset: -8, fontSize: 10 }}
                      />
                      <YAxis 
                        dataKey="y" 
                        tick={{ fontSize: 9 }}
                        domain={['auto', 'auto']}
                        allowDataOverflow={false}
                        label={{ value: "PC2", angle: -90, position: "insideLeft", fontSize: 10 }}
                        width={50}
                      />
                      <Tooltip />
                      {(() => {
                          const labels = lastResult.labels || [];
                          // Downsample scatter points for large datasets to avoid UI freeze
                          const MAX_SCATTER_POINTS = 1500;
                          let pts = lastResult.features.map((f: number[], i: number) => ({ x: f[0], y: f[1], cluster: labels[i], index: i }));
                          if (pts.length > MAX_SCATTER_POINTS) {
                            const step = Math.ceil(pts.length / MAX_SCATTER_POINTS);
                            pts = pts.filter((_, i) => i % step === 0);
                          }
                          const groups = new Map();
                          pts.forEach(p => { const k = String(p.cluster); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
                        const COLORS = ['#8884d8','#82ca9d','#ffc658','#ff7300','#0088FE','#00C49F','#FFBB28','#FF8042'];
                        let colorIdx = 0;
                        return Array.from(groups.entries()).map(([k, arr]) => (
                          <Scatter key={k} name={`Cluster ${k}`} data={arr} fill={COLORS[(colorIdx++) % COLORS.length]} />
                        ));
                      })()}
                    </ScatterChart>
                  </div>
                </div>
              </div>

              {/* Cluster summary table */}
              <div className="mb-1">
                <div className="font-medium mb-1" style={{ fontSize: '10px' }}>Cluster Summary (first 10 samples)</div>
                <div className="overflow-x-auto" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  <table className="w-full border-collapse" style={{ fontSize: '9px' }}>
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-200 px-1 py-0.5 text-left">Index</th>
                        <th className="border border-gray-200 px-1 py-0.5 text-left">Cluster</th>
                        {lastResult.featKeys.map((key: string, idx: number) => (
                          <th key={idx} className="border border-gray-200 px-1 py-0.5 text-left">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lastResult.features.slice(0, 10).map((feature: number[], idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="border border-gray-200 px-1 py-0.5">{idx}</td>
                          <td className="border border-gray-200 px-1 py-0.5">{lastResult.labels[idx]}</td>
                          {feature.map((value: number, fIdx: number) => (
                            <td key={fIdx} className="border border-gray-200 px-1 py-0.5">{value.toFixed(2)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lastResult.features.length > 10 && (
                    <div className="text-gray-500 mt-1 text-center" style={{ fontSize: '9px' }}>
                      Showing first 10 of {lastResult.features.length} samples
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-2 flex-wrap">
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setTimeout(() => setShowDendrogram(true), 100);
                  }} 
                  className="px-3 py-1.5 text-xs font-medium rounded transition-colors hover:opacity-80 cursor-pointer" 
                  style={{ backgroundColor: colors.light, color: colors.main }}
                >
                  Full Dendrogram
                </button>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setTimeout(() => setShowScatter(true), 50);
                  }} 
                  className="px-3 py-1.5 text-xs font-medium rounded transition-colors hover:opacity-80 cursor-pointer" 
                  style={{ backgroundColor: colors.light, color: colors.main }}
                >
                  Full Scatter
                </button>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setTimeout(() => setShowTable(true), 50);
                  }} 
                  className="px-3 py-1.5 text-xs font-medium rounded bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  Full Table
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); exportCSV(); }} 
                  className="px-3 py-1.5 text-xs font-medium rounded bg-green-100 hover:bg-green-200 transition-colors cursor-pointer text-green-700 font-semibold"
                  title="Download clustered data as CSV"
                >
                  ✓ Export CSV
                </button>
              </div>
            </div>
          </>
        )}
        {/* Parameters modal (widget-local) - opens when user clicks Open */}
        {showParameters && createPortal(
          <ParametersModal isOpen={showParameters} onClose={() => setShowParameters(false)} title="Hierarchical Parameters">
            <div className="space-y-4">
              {actionMessage && (
                <div className="p-2 bg-blue-50 border-l-4 border-blue-400 text-blue-800 text-sm rounded">
                  {actionMessage}
                </div>
              )}
              {upstreamMessage && (
                <div className="p-2 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 text-sm rounded flex items-center gap-2">
                  <svg className={`${requestedUpstream ? 'animate-spin' : ''}`} width="16" height="16" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="25" cy="25" r="20" stroke="#f59e0b" strokeWidth="6" strokeOpacity="0.25" />
                    {requestedUpstream && <path d="M45 25c0-11.046-8.954-20-20-20" stroke="#d97706" strokeWidth="6" strokeLinecap="round" />}
                  </svg>
                  <div>{upstreamMessage}</div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Method</label>
                <select value={method} onChange={(e) => { const v = e.target.value as any; setMethod(v); }} className="w-full p-2 border rounded">
                  <option value="agglomerative">Agglomerative (bottom-up)</option>
                  <option value="divisive">Divisive (top-down)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Linkage</label>
                <select value={linkageCriteria} onChange={(e) => { const link = e.target.value as any; setLinkageCriteria(link); }} className="w-full p-2 border rounded">
                  <option value="single">Single</option>
                  <option value="complete">Complete</option>
                  <option value="average">Average</option>
                  <option value="ward">Ward</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Number of clusters (k)</label>
                <input type="number" min={1} value={hierK} onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); setHierK(v); }} className="w-full p-2 border rounded" />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  disabled={requestedUpstream || !previewReady}
                  onClick={async (e) => {
                    e.preventDefault(); e.stopPropagation();
                    try {
                      // Close parameters modal first so its overlay unmounts and z-index is cleared
                      try { setShowParameters(false); } catch (err) {}
                      // small delay to allow portal/unmount to settle and z-index to update
                      await new Promise(res => setTimeout(res, 80));
                      // If a preview exists, promote it to the official lastResult and show combined modal
                      if (previewResult && previewReady) {
                        try {
                          setLastResult(previewResult);
                        } catch (e) {}
                        setPreviewResult(null);
                        setPreviewReady(false);
                        // ensure inline canvas results are hidden when showing the centered combined modal
                        try { setShowResultsInline(false); setShowFullScatterInline(false); setShowScatter(false); setShowTable(false); } catch (e) {}
                        setShowCombined(true);
                        return;
                      }
                      // Otherwise compute preview then promote and show combined
                      const res = await quickRun(false);
                      const toApply = res || previewResult;
                      if (toApply) {
                        try { setLastResult(toApply); } catch (e) {}
                        // Defer persisting applied results until the combined modal is closed
                        try { pendingApplyRef.current = toApply; } catch (e) { pendingApplyRef.current = toApply; }
                        // Temporarily clear any previously persisted results so the background widget
                        // does not display old results while the centered modal is open.
                        try {
                          prevPersistedRef.current = widget.data?.hierarchicalResults || null;
                          persistSafely({ data: { ...(widget.data || {}), hierarchicalResults: null, tableData: [] } });
                        } catch (e) { /* ignore */ }
                        setPreviewResult(null);
                      }
                      setPreviewReady(false);
                      // hide inline results on canvas before showing centered combined modal
                      try { setShowResultsInline(false); setShowFullScatterInline(false); setShowScatter(false); setShowTable(false); } catch (e) {}
                      setShowCombined(true);
                    } catch (err) { console.error('Apply & Close failed', err); }
                  }}
                  className={`px-3 py-1 rounded text-white ${requestedUpstream || !previewReady ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600'}`}>
                  Apply & Close
                </button>

                <button
                  disabled={requestedUpstream || runInProgress}
                  onClick={async (e) => {
                    e.preventDefault(); e.stopPropagation();
                    try {
                      console.debug('[HierarchicalWidget] Run button clicked; requestedUpstream=', requestedUpstream, 'runInProgress=', runInProgress);
                      setRunInProgress(true);
                      setActionMessage('Running preview...');
                      pushLog('Run clicked - starting quickRun');
                      const res = await quickRun(false);
                      pushLog('quickRun returned: ' + (res ? 'ok' : 'null'));
                      if (res) {
                        setActionMessage('Preview ready — click Apply & Close to persist');
                        // ensure previewReady is true
                        setPreviewReady(true);
                      } else {
                        setActionMessage('No data found to run preview. Check data source.');
                      }
                    } catch (err) { console.error('[HierarchicalWidget] Run failed:', err); }
                    finally { setRunInProgress(false); }
                  }}
                  className={`px-3 py-1 rounded text-white ${requestedUpstream || runInProgress ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600'}`}>
                  Run
                </button>

                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowParameters(false); }} className="px-3 py-1 bg-gray-200 rounded">Close</button>
              </div>
            </div>
          </ParametersModal>, document.body)
        }

        {/* Full Scatter Plot in Canvas */}
        {showFullScatterInline && lastResult && !showCombined && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40"
              onMouseDown={(e) => { 
                e.stopPropagation();
                setShowFullScatterInline(false);
              }}
            />
            
            {/* Popup */}
            <div 
              ref={scatterModalRef}
              className="fixed p-6 bg-white rounded-lg border-2 shadow-2xl pointer-events-auto overflow-hidden"
              style={{ 
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '1200px',
                height: '800px',
                zIndex: 9999
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <div className="text-lg font-semibold text-gray-800">
                  Clustered Scatter Plot ({lastResult.labels.length} samples, {Math.max(...lastResult.labels) + 1} clusters)
                </div>
                <button 
                  onMouseDown={(e) => { 
                    e.stopPropagation(); 
                    e.preventDefault();
                    setShowFullScatterInline(false);
                  }}
                  type="button"
                  className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded font-medium cursor-pointer"
                  style={{ pointerEvents: 'auto', zIndex: 10000, position: 'relative' }}
                >
                  ✕ Close
                </button>
              </div>
              
              <div 
                style={{ 
                  width: '100%',
                  height: 'calc(100% - 60px)',
                  overflow: 'auto'
                }}
              >
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2">Index</th>
                      <th className="border p-2">Cluster</th>
                      <th className="border p-2">PC1 (x)</th>
                      <th className="border p-2">PC2 (y)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastResult.features.map((f: number[], i: number) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="border p-2 text-center">{i}</td>
                        <td className="border p-2 text-center">{lastResult.labels[i]}</td>
                        <td className="border p-2 text-right">{f[0]?.toFixed(3)}</td>
                        <td className="border p-2 text-right">{f[1]?.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {showTable && lastResult && (() => {
        const tableData = (widget.data?.tableData || []).map((r: any, i: number) => ({ index: i, cluster: lastResult.labels[i], ...r }));
        // Limit to 500 rows for performance
        const limitedData = tableData.length > 500 ? tableData.slice(0, 500) : tableData;
        return (
          <DataTableModal 
            isOpen={showTable} 
            data={limitedData} 
            onClose={() => setShowTable(false)} 
          />
        );
      })()}

      {showScatter && lastResult && createPortal(
        <ScatterPlotModal 
          isOpen={showScatter} 
          onClose={() => setShowScatter(false)} 
          data={scatterData} 
          columns={['y']} 
        />,
        document.body
      )}

      {showDendrogram && lastResult && method === 'agglomerative' && createPortal(
            <DendrogramModalComponent
              isOpen={showDendrogram}
              onClose={() => setShowDendrogram(false)}
              linkage={lastResult.linkage}
              n={lastResult.features.length}
              heights={lastResult.heights}
              onOpenScatter={() => setShowScatter(true)}
              onCut={(k) => {
                console.log('[HierarchicalWidget] Apply clicked with k=', k);
                const labels = labelsFromLinkage(lastResult.features.length, lastResult.linkage, k);
                console.log('[HierarchicalWidget] Generated labels:', labels.slice(0, 10));
                const result = { ...lastResult, labels };
                setLastResult(result);
                persistResultsWithLabels(result, labels, { hier_k: k });
                console.log('[HierarchicalWidget] Updated labelled data preview (persist dispatched)');
                console.log('[HierarchicalWidget] Widget data updated');
                // Ensure results are visible
                setShowResultsInline(true);
              }}
              initialK={hierK}
              allowRenderFull={lastResult.features.length <= 50}
            />,
            document.body
      )}

      {/* Combined results modal: dendrogram preview + scatter + table */}
      {/* Combined modal portalled to document.body and centered like ParametersModal */}
      {showCombined && createPortal(
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', zIndex: 140050 }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }} onClick={(e) => { if (e.target === e.currentTarget) setShowCombined(false); }}>
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
              {lastResult ? (
                <div className="mt-2 p-2 bg-white rounded border pointer-events-auto" style={{ minWidth: '420px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-gray-700" style={{ fontSize: '13px', fontWeight: 600 }}>Results ({lastResult.labels.length} samples, {Math.max(...lastResult.labels) + 1} clusters)</div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">k:</label>
                      <input type="number" min={1} value={tempK} onChange={(e) => setTempK(Math.max(1, parseInt(e.target.value || '1', 10)))} className="w-16 p-1 border rounded" />
                      <button type="button" disabled={runInProgress} onClick={(e) => { e.stopPropagation(); try { pushLog('Recompute clicked, k=' + tempK); setRunInProgress(true); setTimeout(() => {
                              try {
                                const feats = (lastResult && lastResult.features) || [];
                                if (!feats || feats.length === 0) { pushLog('Recompute aborted: no features available'); setRunInProgress(false); return; }
                                pushLog('Recompute running on ' + feats.length + ' features');
                                const newLabels = bisectingKMeans(feats, tempK);
                                setLastResult({ ...(lastResult||{}), labels: newLabels });
                                pushLog('Recompute finished, labels[0..6]=' + newLabels.slice(0,7).join(','));
                              } catch (err) { pushLog('Recompute failed: ' + (err && err.message)); }
                              setRunInProgress(false);
                            }, 20);
                          } catch (err) { pushLog('Recompute handler error: ' + (err && err.message)); setRunInProgress(false); } }} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">Recompute</button>
                      <button type="button" disabled={runInProgress || computingDendrogram} onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          if (!lastResult || !lastResult.features || lastResult.features.length === 0) { pushLog('Compute Dendrogram aborted: no features'); return; }
                          pushLog('Compute Dendrogram started');
                          setComputingDendrogram(true);
                          try {
                            const res: any = await computeFullLinkageInWorker(lastResult.features);
                            setLastResult((p:any) => ({ ...(p||{}), linkage: res.linkage||[], order: res.order||[], heights: res.heights||[] }));
                            pushLog('Compute Dendrogram finished');
                            setShowDendrogram(true);
                          } catch (err) {
                            pushLog('Compute Dendrogram failed: ' + (err && err.message));
                          }
                        } catch (err) { pushLog('Compute Dendrogram handler error: ' + (err && err.message)); }
                        setComputingDendrogram(false);
                      }} className="px-3 py-1 text-sm bg-indigo-600 text-white rounded">{computingDendrogram ? 'Computing…' : 'Compute Dendrogram'}</button>
                      <button type="button" disabled={runInProgress} onClick={(e) => { e.stopPropagation(); try { pushLog('Discard clicked'); setRunInProgress(true); setTimeout(() => {
                                try {
                                  pendingApplyRef.current = null;
                                  if (prevPersistedRef.current) {
                                    const prev = prevPersistedRef.current;
                                    setTimeout(() => { try { persistResultsWithLabels(prev, prev.labels); pushLog('Discard restored previous persisted results (dispatched)'); } catch (e) { pushLog('Discard restore failed'); } }, 10);
                                    prevPersistedRef.current = null;
                                  } else {
                                    setTimeout(() => { try { persistSafely({ data: { ...(widget.data || {}), hierarchicalResults: null, tableData: [] } }); pushLog('Discard cleared persisted results (dispatched)'); } catch (e) { pushLog('Discard clear failed'); } }, 10);
                                  }
                                } catch (err) { pushLog('Discard failed: ' + (err && err.message)); }
                                setRunInProgress(false);
                                setShowCombined(false);
                              }, 20);
                          } catch (err) { pushLog('Discard handler error: ' + (err && err.message)); setRunInProgress(false); setShowCombined(false); } }} className="px-3 py-1 text-sm bg-gray-200 rounded">Discard</button>
                      <button type="button" disabled={runInProgress} onClick={(e) => { e.stopPropagation(); try { pushLog('Close clicked - closing results without apply'); setRunInProgress(true); setTimeout(() => {
                                try {
                                  // Close without applying: clear any pending apply and restore previous persisted results
                                  pendingApplyRef.current = null;
                                  // hide any inline views
                                  try { setShowResultsInline(false); setShowFullScatterInline(false); setShowScatter(false); setShowTable(false); } catch (e) {}
                                  // if we have a previously persisted result, restore it now
                                  if (prevPersistedRef.current) {
                                    const prev = prevPersistedRef.current;
                                    try { persistResultsWithLabels(prev, prev.labels); pushLog('Close restored previous persisted results (dispatched)'); } catch (e) { pushLog('Close restore failed'); }
                                    prevPersistedRef.current = null;
                                  }
                                } catch (err) { pushLog('Close handler error: ' + (err && err.message)); }
                                setRunInProgress(false);
                                setShowCombined(false);
                              }, 20);
                          } catch (err) { pushLog('Close handler error: ' + (err && err.message)); setRunInProgress(false); setShowCombined(false); } }} className="px-3 py-1 text-sm bg-gray-300 rounded">Close</button>
                      <button type="button" disabled={runInProgress} onClick={(e) => { e.stopPropagation(); try { pushLog('Apply clicked - persisting now'); setRunInProgress(true); setTimeout(() => {
                                try {
                                  const toPersist = lastResult;
                                  if (toPersist) {
                                    const baseRows = (widget.data?.tableDataProcessed || widget.data?.tableData || widget.data?.parsedData || []);
                                    const N = Array.isArray(baseRows) ? baseRows.length : 0;
                                    if (N > 800) {
                                      // For very large tables, persist only the hierarchical results and a small preview to avoid blocking
                                      const preview = (baseRows || []).slice(0, 20).map((r:any, i:number) => ({ index: i, cluster: toPersist.labels[i] }));
                                      setTimeout(() => { try { persistSafely({ data: { ...(widget.data || {}), hierarchicalResults: toPersist, hier_k: tempK, hier_method: method, hier_linkage: linkageCriteria, tableData: preview } }); pushLog('Apply persisted (deferred preview for large table)'); } catch (e) { pushLog('Apply persist failed'); } }, 10);
                                    } else {
                                      const labelled = baseRows.map((r:any,i:number)=>({ index:i, cluster: toPersist.labels[i], ...r }));
                                      setTimeout(() => { try { persistSafely({ data: { ...(widget.data || {}), hierarchicalResults: toPersist, hier_k: tempK, hier_method: method, hier_linkage: linkageCriteria, tableData: labelled } }); pushLog('Apply persisted (dispatched)'); } catch (e) { pushLog('Apply persist failed'); } }, 10);
                                    }
                                    prevPersistedRef.current = null;
                                  }
                                } catch (err) { pushLog('Apply persist failed: ' + (err && err.message)); }
                                setRunInProgress(false);
                                setShowCombined(false);
                              }, 20);
                          } catch (err) { pushLog('Apply handler error: ' + (err && err.message)); setRunInProgress(false); setShowCombined(false); } }} className="px-3 py-1 text-sm bg-green-600 text-white rounded">Apply</button>
                    </div>
                  </div>
                  {lastResult && (
                    <div className="mb-2 p-2 bg-gray-50 rounded text-sm text-gray-700" style={{ fontSize: '12px' }}>
                      <div><strong>Diagnostics:</strong> samples: {lastResult.features ? lastResult.features.length : 0}, features/sample: {(lastResult.features && lastResult.features[0] && lastResult.features[0].length) || 0}, previewOnly: {String(!!lastResult.previewOnly)}</div>
                      <div className="text-xs text-gray-600">Tip: clustering expects rows = samples. Your uploaded CSV may be a single spectrum (one sample with many features).</div>
                    </div>
                  )}
                  <div className="mb-2">
                    <div className="font-medium mb-1">Clustered Scatter Plot</div>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                      <div style={{ width: '520px', height: '280px' }}>
                        <ScatterChart width={520} height={280} margin={{ top: 25, right: 25, bottom: 40, left: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="x" type="number" tick={{ fontSize: 11 }} domain={["auto","auto"]} label={{ value: 'PC1', position: 'insideBottom', offset: -8 }} />
                          <YAxis dataKey="y" tick={{ fontSize: 11 }} domain={["auto","auto"]} label={{ value: 'PC2', angle: -90, position: 'insideLeft' }} width={50} />
                          <Tooltip />
                          {(() => {
                            const labels = lastResult.labels || [];
                            const MAX_SCATTER_POINTS = 1500;
                            let pts = lastResult.features.map((f: number[], i: number) => ({ x: f[0], y: f[1], cluster: labels[i], index: i }));
                            if (pts.length > MAX_SCATTER_POINTS) {
                              const step = Math.ceil(pts.length / MAX_SCATTER_POINTS);
                              pts = pts.filter((_, i) => i % step === 0);
                            }
                            const groups = new Map();
                            pts.forEach(p => { const k = String(p.cluster); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
                            const COLORS = ['#8884d8','#82ca9d','#ffc658','#ff7300','#0088FE','#00C49F','#FFBB28','#FF8042'];
                            let colorIdx = 0;
                            return Array.from(groups.entries()).map(([k, arr]) => (
                              <Scatter key={k} name={`Cluster ${k}`} data={arr} fill={COLORS[(colorIdx++) % COLORS.length]} />
                            ));
                          })()}
                        </ScatterChart>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium mb-1">Cluster Summary (first 10 samples)</div>
                    <div className="overflow-x-auto" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                      <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-200 px-2 py-1 text-left">Index</th>
                            <th className="border border-gray-200 px-2 py-1 text-left">Cluster</th>
                            {lastResult.featKeys.map((key: string, idx: number) => (
                              <th key={idx} className="border border-gray-200 px-2 py-1 text-left">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lastResult.features.slice(0, 10).map((feature: number[], idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="border border-gray-200 px-2 py-1">{idx}</td>
                              <td className="border border-gray-200 px-2 py-1">{lastResult.labels[idx]}</td>
                              {feature.map((value: number, fIdx: number) => (
                                <td key={fIdx} className="border border-gray-200 px-2 py-1">{value.toFixed(2)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 p-2 bg-gray-50 rounded" style={{ maxHeight: '120px', overflow: 'auto', fontSize: '11px' }}>
                      <div className="font-medium mb-1">Recent logs</div>
                      <ul className="list-disc pl-4">
                        {logMessages.length === 0 && <li className="text-gray-500">No logs yet</li>}
                        {logMessages.map((m, i) => (
                          <li key={i} className="text-gray-700">{m}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-lg p-6 min-w-[420px] max-w-[560px] max-h-[80vh] overflow-auto relative">
                  <div className="text-lg font-semibold mb-2">Computing hierarchical clustering…</div>
                  <div className="text-sm text-gray-600 mb-4">This may take a few moments for large datasets. The preview will appear when ready.</div>
                  <div className="mb-4"><svg className="animate-spin mx-auto" width="36" height="36" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" stroke="#3b82f6" strokeWidth="4" strokeOpacity="0.2" fill="none"/><path d="M45 25a20 20 0 0 0-6-14" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" fill="none"/></svg></div>
                </div>
              )}
            </div>
          </div>
        </div>, document.body
      )}

      {showDendrogram && lastResult && method === 'divisive' && (
        <div ref={divisiveDendroRef} className="fixed inset-0 z-50 flex items-center justify-center" />
      )}

      
    </OrangeStyleWidget>
  );
};

// Dendrogram modal component moved to separate file: DendrogramModalComponent.tsx

export default HierarchicalWidget;
