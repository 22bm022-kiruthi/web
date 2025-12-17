import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import OrangeStyleWidget from './OrangeStyleWidget';
import ParametersModal from './ParametersModal';
import { Search } from 'lucide-react';
import DataTableModal from './DataTableModal';
import ScatterPlotModal from './ScatterPlotModal';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Helper to compute full linkage in a Web Worker (module-level so components can call it)
const computeFullLinkageInWorker = (features: number[][]) => {
  return new Promise((resolve, reject) => {
    try {
      const worker = new Worker(new URL('../workers/linkageWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (ev) => {
        const data = ev.data || {};
        worker.terminate();
        if (data.error) return reject(new Error(data.error));
        resolve(data);
      };
      worker.onerror = (err) => { worker.terminate(); reject(err); };
      worker.postMessage({ features });
    } catch (err) {
      reject(err);
    }
  });
};

interface HierarchicalWidgetProps {
  widget: any;
  onUpdateWidget?: (updates: any) => void;
  // allow parent Canvas to provide a connection starter (used to begin a canvas connection)
  onStartConnection?: (portOrPoint?: 'top' | 'left' | 'right' | 'bottom' | { clientX: number; clientY: number; portCenter?: boolean }) => void;
  iconRef?: any;
}

// Simple agglomerative clustering (single-linkage) for small datasets
// Produce linkage in standard format: [idx1, idx2, dist, size]
function computeLinkage(features: number[][], linkageMethod: 'single' | 'complete' | 'average' | 'ward' = 'single', distanceMetric: 'euclidean' | 'manhattan' | 'cosine' = 'euclidean') {
  const n = features.length;
  if (n === 0) return { linkage: [], order: [], heights: [] };
  const distFunc = (a: number[], b: number[]) => {
    if (distanceMetric === 'manhattan') {
      let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s;
    }
    if (distanceMetric === 'cosine') {
      let dot = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } if (na === 0 || nb === 0) return 1; return 1 - (dot / (Math.sqrt(na) * Math.sqrt(nb)));
    }
    // default euclidean
    let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s);
  };

  

  // clusters: array of { id, members }
  let clusters: Array<{ id: number; members: number[] }> = [];
  for (let i = 0; i < n; i++) clusters.push({ id: i, members: [i] });

  const linkage: Array<[number, number, number, number]> = [];
  let nextId = n;

  const distCache = new Map<string, number>();
  const clusterDist = (c1: number[], c2: number[]) => {
    // compute pairwise distances according to linkageMethod
    if (linkageMethod === 'ward') {
      // approximate Ward by using average linkage on squared euclidean distances
      let sum = 0; let cnt = 0;
      for (const i of c1) for (const j of c2) { const key = `${i}_${j}`; let d = distCache.get(key); if (d === undefined) { d = distFunc(features[i], features[j]); distCache.set(key, d); } sum += d * d; cnt++; }
      return Math.sqrt(sum / Math.max(1, cnt));
    }
    let best = linkageMethod === 'complete' ? -Infinity : Infinity;
    let sum = 0; let cnt = 0;
    for (const i of c1) for (const j of c2) {
      const key = `${i}_${j}`;
      let d = distCache.get(key);
      if (d === undefined) { d = distFunc(features[i], features[j]); distCache.set(key, d); }
      if (linkageMethod === 'single') best = Math.min(best, d);
      else if (linkageMethod === 'complete') best = Math.max(best, d);
      else { sum += d; cnt++; }
    }
    if (linkageMethod === 'average') return sum / Math.max(1, cnt);
  };

  while (clusters.length > 1) {
    let bestI = 0, bestJ = 1; let bestD = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = clusterDist(clusters[i].members, clusters[j].members);
        if (d < bestD) { bestD = d; bestI = i; bestJ = j; }
      }
    }
    const a = clusters[bestI];
    const b = clusters[bestJ];
    const mergedMembers = a.members.concat(b.members);
    linkage.push([a.id, b.id, bestD, mergedMembers.length]);
    if (bestJ > bestI) { clusters.splice(bestJ, 1); clusters.splice(bestI, 1); }
    else { clusters.splice(bestI, 1); clusters.splice(bestJ, 1); }
    clusters.push({ id: nextId++, members: mergedMembers });
  }

  const order = Array.from({ length: n }, (_, i) => i);
  const heights = linkage.map(l => l[2]);
  return { linkage, order, heights };
}
// Bisecting k-means (simple) for divisive clustering
// Bisecting k-means (simple) for divisive clustering
function bisectingKMeans(features: number[][], k: number, maxIter = 30) {
  const n = features.length;
  if (n === 0) return new Array(n).fill(0);
  // start with single cluster of all indices
  let clusters: number[][] = [Array.from({ length: n }, (_, i) => i)];
  const dist = (a: number[], b: number[]) => {
    let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s);
  };

  const kmeans2 = (indices: number[]) => {
    if (indices.length <= 1) return indices.map(() => 0);
    // initialize centroids: pick two random distinct points
    let a = indices[0], b = indices.length > 1 ? indices[1] : indices[0];
    let centA = features[a].slice(); let centB = features[b].slice();
    for (let it = 0; it < maxIter; it++) {
      const gA: number[] = [], gB: number[] = [];
      const cA: number[] = new Array(centA.length).fill(0);
      const cB: number[] = new Array(centB.length).fill(0);
      let cntA = 0, cntB = 0;
      for (const idx of indices) {
        const dA = dist(features[idx], centA);
        const dB = dist(features[idx], centB);
        if (dA <= dB) { gA.push(idx); cntA++; for (let j = 0; j < centA.length; j++) cA[j] += features[idx][j]; }
        else { gB.push(idx); cntB++; for (let j = 0; j < centB.length; j++) cB[j] += features[idx][j]; }
      }
      if (cntA > 0) for (let j = 0; j < centA.length; j++) centA[j] = cA[j] / cntA;
      if (cntB > 0) for (let j = 0; j < centB.length; j++) centB[j] = cB[j] / cntB;
    }
    // final assignment
    const labels = new Array(indices.length).fill(0);
    for (let t = 0; t < indices.length; t++) {
      const idx = indices[t];
      labels[t] = dist(features[idx], centA) <= dist(features[idx], centB) ? 0 : 1;
    }
    return { groups: [indices.filter((_,i) => labels[i] === 0), indices.filter((_,i) => labels[i] === 1)] };
  };

  while (clusters.length < k) {
    // pick largest cluster to split
    let bestIdx = 0, bestSize = clusters[0].length;
    for (let i = 1; i < clusters.length; i++) if (clusters[i].length > bestSize) { bestSize = clusters[i].length; bestIdx = i; }
    const toSplit = clusters[bestIdx];
    if (toSplit.length <= 1) break;
    const split = kmeans2(toSplit as number[]);
    if (!split || !split.groups || split.groups.length < 2) break;
    // replace cluster with two groups
    clusters.splice(bestIdx, 1, split.groups[0], split.groups[1]);
    // safety
    if (clusters.length > n) break;
  }
  // produce labels
  const labels = new Array(n).fill(0);
  for (let ci = 0; ci < clusters.length; ci++) for (const idx of clusters[ci]) labels[idx] = ci;
  return labels;
}

// Derive flat cluster labels from a linkage matrix for a desired k clusters.
function labelsFromLinkage(nLeaves: number, linkage: Array<[number, number, number, number]>, k: number) {
  // If no linkage (e.g., divisive) or k <= 1 or k >= nLeaves, return trivial labels
  if (!Array.isArray(linkage) || linkage.length === 0) {
    return new Array(nLeaves).fill(0);
  }
  if (k <= 1) return new Array(nLeaves).fill(0);
  if (k >= nLeaves) return Array.from({ length: nLeaves }, (_, i) => i);

  // We'll perform the first (nLeaves - k) merges to reduce to k clusters.
  const mergesToDo = Math.max(0, Math.min(linkage.length, nLeaves - k));

  // Map of nodeId -> members (leaf indices)
  const nodeMembers = new Map<number, number[]>();
  for (let i = 0; i < nLeaves; i++) nodeMembers.set(i, [i]);

  // Process merges sequentially and create new cluster ids starting at nLeaves
  for (let i = 0; i < mergesToDo; i++) {
    const [a, b] = linkage[i];
    const membersA = nodeMembers.get(a) || [];
    const membersB = nodeMembers.get(b) || [];
    const newId = nLeaves + i;
    nodeMembers.set(newId, membersA.concat(membersB));
    // remove old entries to keep map smaller (optional)
    nodeMembers.delete(a);
    nodeMembers.delete(b);
  }

  // Remaining entries in nodeMembers correspond to the k clusters
  const clusters = Array.from(nodeMembers.values());
  // Build labels array
  const labels = new Array(nLeaves).fill(0);
  clusters.forEach((members, ci) => {
    for (const idx of members) labels[idx] = ci;
  });
  return labels;
}

const HierarchicalWidget: React.FC<HierarchicalWidgetProps> = ({ widget, onUpdateWidget, onStartConnection, iconRef }) => {
  console.log('[HierarchicalWidget] Widget data received:', { 
    widgetId: widget.id, 
    hasTableData: !!widget.data?.tableData,
    hasTableDataProcessed: !!widget.data?.tableDataProcessed, 
    hasParsedData: !!widget.data?.parsedData,
    tableDataLength: widget.data?.tableData?.length || 0,
    tableDataProcessedLength: widget.data?.tableDataProcessed?.length || 0,
    parsedDataLength: widget.data?.parsedData?.length || 0,
    allData: widget.data
  });
  const colors = { main: '#1d4ed8', light: '#bfdbfe', bg: '#eff6ff' };
  // ports for creating connections from this widget
  const portElements = (
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
  const [showDendrogram, setShowDendrogram] = useState(false);
  const [showScatter, setShowScatter] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showCombined, setShowCombined] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [requestedUpstream, setRequestedUpstream] = useState<boolean>(false);
  const [upstreamMessage, setUpstreamMessage] = useState<string | null>(null);
  const [method, setMethod] = useState<'agglomerative' | 'divisive'>(widget.data?.hier_method || 'agglomerative');
  const [distanceMetric, setDistanceMetric] = useState<'euclidean' | 'manhattan' | 'cosine'>(widget.data?.distanceMetric || 'euclidean');
  const [linkageCriteria, setLinkageCriteria] = useState<'single' | 'complete' | 'average' | 'ward'>(widget.data?.linkageCriteria || 'single');
  const [hierK, setHierK] = useState<number>(widget.data?.hier_k || 3);
  const [showParameters, setShowParameters] = useState<boolean>(false);
  const [showResultsInline, setShowResultsInline] = useState<boolean>(false);
  const pendingShowResults = React.useRef<boolean>(false);

  // When lastResult is updated and we're waiting to show results, display them
  React.useEffect(() => {
    if (lastResult && pendingShowResults.current) {
      console.log('[HierarchicalWidget] lastResult updated, showing inline results');
      pendingShowResults.current = false;
      setShowResultsInline(true);
    }
  }, [lastResult]);

  // When combined modal is open, attach a capturing click logger and Escape key handler
  React.useEffect(() => {
    if (!showCombined) return;
    const onCaptureClick = (e: Event) => {
      try {
        // log the clicked element and the composed path for shadow/overlay cases
        console.debug('[HierarchicalWidget] capture-click target:', (e.target as any), 'path:', (e as any).composedPath ? (e as any).composedPath() : undefined);
      } catch (err) { /* ignore */ }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        console.debug('[HierarchicalWidget] Escape pressed - closing combined modal');
        setShowCombined(false);
      }
    };
    document.addEventListener('click', onCaptureClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onCaptureClick, true);
      document.removeEventListener('keydown', onKey);
    };
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
    return () => { if ((window as any).__HIER) { delete (window as any).__HIER.closeCombined; delete (window as any).__HIER.openFullDendrogram; } };
  }, [lastResult]);

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

  // Listen for global requests to open this widget's parameters modal
  useEffect(() => {
    const paramsHandler = (ev: any) => {
      try {
        const d = ev?.detail || {};
        if (!d || d.widgetId !== widget.id) return;
        setShowParameters(true);
      } catch (err) {
        // ignore
      }
    };
    window.addEventListener('openWidgetParameters', paramsHandler as EventListener);
    return () => window.removeEventListener('openWidgetParameters', paramsHandler as EventListener);
  }, [widget.id]);

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
        const fallbackTable = (widget.data && widget.data.supabaseTable) || 'raman_data';
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
        const baseRows = (widget.data?.tableData || widget.data?.tableDataProcessed || widget.data?.parsedData || []);
        const labelled = baseRows.map((r: any, i: number) => ({ index: i, cluster: labels[i], ...r }));
        onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), hierarchicalResults: result, hier_k: hierK, hier_method: method, tableData: labelled } });
        if (autoOpen === 'table') setShowTable(true);
        if (autoOpen === 'scatter') setShowScatter(true);
        // Do not attempt to open or compute full dendrogram automatically for large datasets
        return;
      }
      const { linkage, order, heights } = computeLinkage(features, linkageCriteria, distanceMetric);
      const labels = labelsFromLinkage(features.length, linkage, hierK);
      const result = { linkage, order, heights, labels, featKeys, features };
      setLastResult(result);
      // If features are higher-dimensional, auto-open the scatter view so PCA projection is shown
      try {
        if (features && features[0] && features[0].length > 2) {
          setShowScatter(true);
        }
      } catch (e) { /* ignore */ }
      // build a labelled table to forward to downstream widgets
      const baseRows = (widget.data?.tableData || widget.data?.tableDataProcessed || widget.data?.parsedData || []);
      const labelled = baseRows.map((r: any, i: number) => ({ index: i, cluster: labels[i], ...r }));
      onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), hierarchicalResults: result, hier_k: hierK, hier_method: method, tableData: labelled } });
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
      const baseRows = (widget.data?.tableData || widget.data?.tableDataProcessed || widget.data?.parsedData || []);
      const labelled = baseRows.map((r: any, i: number) => ({ index: i, cluster: labels[i], ...r }));
      onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), hierarchicalResults: result, hier_k: hierK, hier_method: method, tableData: labelled } });
      if (autoOpen === 'table') setShowTable(true);
      if (autoOpen === 'scatter') setShowScatter(true);
      // If features are high-dimensional, auto-open scatter for PCA projection
      try { if (features && features[0] && features[0].length > 2) setShowScatter(true); } catch (e) { /* ignore */ }
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
    console.debug('[HierarchicalWidget] showCombined ->', showCombined, 'showDendrogram ->', showDendrogram, 'showScatter ->', showScatter, 'showTable ->', showTable);
  }, [showCombined, showDendrogram, showScatter, showTable, widget.id]);

  // Expose lastResult for debugging in DevTools
  useEffect(() => {
    try { (window as any).__HIER = (window as any).__HIER || {}; (window as any).__HIER.lastResult = lastResult; } catch (e) { /* ignore */ }
    return () => { try { if ((window as any).__HIER) delete (window as any).__HIER.lastResult; } catch (e) { /* ignore */ } };
  }, [lastResult]);

  // Emergency UX fix: while any modal is open, disable pointer events on the main canvas
  // This prevents the canvas from intercepting clicks (which can make modal buttons unresponsive)
  const canvasPointerPrevRef = React.useRef<string | null>(null);
  useEffect(() => {
    const el = document.querySelector('.orange-canvas') as HTMLElement | null;
    if (!el) return;
    const anyModalOpen = !!(showCombined || showDendrogram || showScatter || showTable || showParameters);
    if (anyModalOpen) {
      // store previous inline pointer-events so we can restore it
      canvasPointerPrevRef.current = el.style.pointerEvents || '';
      el.style.pointerEvents = 'none';
      el.setAttribute('data-hier-pointer-disabled', '1');
    } else {
      if (el.getAttribute('data-hier-pointer-disabled')) {
        el.style.pointerEvents = canvasPointerPrevRef.current || '';
        el.removeAttribute('data-hier-pointer-disabled');
        canvasPointerPrevRef.current = null;
      }
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
    const rows = (widget.data?.tableData || widget.data?.tableDataProcessed || []).map((r: any, i: number) => ({ index: i, cluster: labels[i], ...r }));
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
      alwaysShowControls={showParameters || showResultsInline}
    >
      <div className="mt-2 flex flex-col items-center gap-2 w-full">
        {/* Show "Open" button when parameters are hidden */}
        {!showParameters && (
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              setShowParameters(true); 
            }} 
            className="px-3 py-1.5 text-xs font-medium rounded transition-colors"
            style={{
              backgroundColor: colors.light,
              color: colors.main,
            }}
          >
            Open Parameters
          </button>
        )}

        {/* Show controls when parameters are open */}
        {showParameters && (
          <>
            <div className="flex items-center gap-3">
              <label className="text-xs">Method:</label>
              <select className="text-sm p-1 rounded" value={method} onChange={(e) => setMethod(e.target.value as any)}>
                <option value="agglomerative">Agglomerative</option>
                <option value="divisive">Divisive (bisecting k-means)</option>
              </select>
              <label className="text-xs ml-3">Distance:</label>
              <select className="text-sm p-1 rounded" value={distanceMetric} onChange={(e) => setDistanceMetric(e.target.value as any)}>
                <option value="euclidean">Euclidean</option>
                <option value="manhattan">Manhattan</option>
                <option value="cosine">Cosine</option>
              </select>
              <label className="text-xs ml-3">Linkage:</label>
              <select className="text-sm p-1 rounded" value={linkageCriteria} onChange={(e) => setLinkageCriteria(e.target.value as any)}>
                <option value="single">Single</option>
                <option value="complete">Complete</option>
                <option value="average">Average</option>
                <option value="ward">Ward (approx)</option>
              </select>
              <label className="text-xs ml-3">Clusters (k):</label>
              <input type="number" min={1} max={20} value={hierK} onChange={(e) => setHierK(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="w-16 text-sm p-1 rounded" />
              <button onClick={(e) => { e.stopPropagation(); pendingShowResults.current = true; run(); }} className="px-3 py-1.5 text-xs font-medium rounded text-white" style={{ backgroundColor: colors.main }}>Run</button>
            </div>
            <div className="flex gap-2 mt-2">
              <button 
                onClick={async (e) => { 
                  e.stopPropagation(); 
                  if (!lastResult) { 
                    run('dendrogram'); 
                  } else {
                    if (lastResult.features.length > 400) {
                      alert(`⚠️ Dataset too large (${lastResult.features.length} samples)\n\nFull dendrogram rendering is disabled for datasets larger than 400 samples to prevent browser freezing.\n\nYou can view the Clustered Scatter plot or Data Table instead.`);
                      return;
                    }
                    setShowDendrogram(true);
                  }
                }} 
                className="px-3 py-1 text-xs rounded" 
                style={{ backgroundColor: colors.light, color: colors.main }}
              >
                Dendrogram
              </button>
              <button onClick={async (e) => { e.stopPropagation(); if (!lastResult) { run('scatter'); } else setShowScatter(true); }} className="px-3 py-1 text-xs rounded" style={{ backgroundColor: colors.light, color: colors.main }}>Clustered Scatter</button>
              <button onClick={async (e) => { e.stopPropagation(); if (!lastResult) { run('table'); } else setShowTable(true); }} className="px-3 py-1 text-xs rounded" style={{ backgroundColor: '#f3f4f6' }}>Labels Table</button>
              <button onClick={async (e) => { e.stopPropagation(); if (!lastResult) { run(); } setShowCombined(true); }} className="px-3 py-1 text-xs rounded" style={{ backgroundColor: '#e0f2fe' }}>Show All Outputs</button>
              <button onClick={(e) => { e.stopPropagation(); exportCSV(); }} className="px-3 py-1 text-xs rounded" style={{ backgroundColor: '#f3f4f6' }}>Export CSV</button>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setShowParameters(false); 
                }} 
                className="px-3 py-1 text-xs rounded text-red-600 hover:bg-red-50"
              >
                Hide
              </button>
            </div>
          </>
        )}

        {/* Inline results display on canvas */}
        {showResultsInline && lastResult ? (
          <div>
            {console.log('[HierarchicalWidget] RENDERING INLINE RESULTS!', { labelsLength: lastResult.labels?.length, clustersCount: lastResult.labels ? Math.max(...lastResult.labels) + 1 : 0 })}
          </div>
        ) : console.log('[HierarchicalWidget] NOT RENDERING:', { showResultsInline, hasLastResult: !!lastResult })}
        {showResultsInline && lastResult && (
          <div className="mt-3 p-3 bg-white rounded border max-h-96 overflow-auto pointer-events-auto" style={{ minWidth: '280px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs font-medium text-gray-700">
                Clustering Results ({lastResult.labels.length} samples, {Math.max(...lastResult.labels) + 1} clusters)
              </div>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setShowResultsInline(false); 
                }} 
                className="text-xs text-red-600 hover:text-red-800"
              >
                Hide
              </button>
            </div>
            
            {/* Mini scatter plot */}
            <div className="mb-3">
              <div className="text-xs font-medium mb-1">Clustered Scatter Plot</div>
              <div style={{ width: '100%', height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="x" 
                      type="number" 
                      fontSize={10}
                      domain={['auto', 'auto']}
                      allowDataOverflow={false}
                    />
                    <YAxis 
                      dataKey="y" 
                      fontSize={10}
                      domain={['auto', 'auto']}
                      allowDataOverflow={false}
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
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cluster summary table */}
            <div className="mb-2">
              <div className="text-xs font-medium mb-1">Cluster Summary (first 10 samples)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
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
                {lastResult.features.length > 10 && (
                  <div className="text-xs text-gray-500 mt-1 text-center">
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

      {showScatter && lastResult && (() => {
        // Downsample scatter data for large datasets to prevent freezing
        const MAX_POINTS = 500; // Reduced from 2000 to prevent freezing
        let scatterData = lastResult.features.map((f: number[], i: number) => ({ x: f[0], y: f[1], index: i, cluster: lastResult.labels[i] }));
        if (scatterData.length > MAX_POINTS) {
          const step = Math.ceil(scatterData.length / MAX_POINTS);
          scatterData = scatterData.filter((_, i: number) => i % step === 0);
        }
        console.log('[HierarchicalWidget] Rendering scatter with', scatterData.length, 'points');
        return (
          <ScatterPlotModal 
            isOpen={showScatter} 
            onClose={() => setShowScatter(false)} 
            data={scatterData} 
            columns={['y']} 
          />
        );
      })()}

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
                const baseRows = (widget.data?.tableData || widget.data?.tableDataProcessed || widget.data?.parsedData || []);
                const labelled = baseRows.map((r: any, i: number) => ({ index: i, cluster: labels[i], ...r }));
                console.log('[HierarchicalWidget] Updated labelled data, first 3 rows:', labelled.slice(0, 3));
                onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), hierarchicalResults: result, hier_k: k, tableData: labelled } });
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
      {showCombined && lastResult && (
        <div 
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40" 
          style={{ zIndex: 999999, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 } as React.CSSProperties} 
          onMouseDown={(e) => { 
            if (e.target === e.currentTarget) {
              console.log('[HierarchicalWidget] Backdrop clicked - closing modal');
              setShowCombined(false); 
            } 
          }}
        >
          <div 
            className="bg-white rounded-lg shadow-lg p-4 w-[90vw] max-h-[90vh] overflow-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">Hierarchical Clustering — All Outputs</h3>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 cursor-pointer" 
                  style={{ pointerEvents: 'all', zIndex: 10000 } as React.CSSProperties}
                  ref={(el) => {
                    if (el) {
                      console.log('[HierarchicalWidget] Close button ref called, dataset:', el.dataset.listenerAdded);
                      if (!el.dataset.listenerAdded) {
                        el.dataset.listenerAdded = 'true';
                        console.log('[HierarchicalWidget] Adding click listener to Close button');
                        el.addEventListener('click', (e) => {
                          console.log('[HierarchicalWidget] Close button CLICK EVENT FIRED!');
                          e.stopPropagation();
                          e.preventDefault();
                          alert('Close button clicked!');
                          setShowCombined(false);
                        }, true);
                      }
                    }
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer"
                  style={{ pointerEvents: 'all', zIndex: 10000 } as React.CSSProperties}
                  ref={(el) => {
                    if (el && !el.dataset.listenerAdded) {
                      el.dataset.listenerAdded = 'true';
                      el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        alert('Open Full Dendrogram clicked!');
                        console.log('[HierarchicalWidget] Open Full Dendrogram clicked via native listener');
                        setShowCombined(false);
                        setShowDendrogram(true);
                      }, true);
                    }
                  }}
                >
                  Open Full Dendrogram
                </button>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-7">
                <div className="mb-2 font-medium">Dendrogram (preview)</div>
                <div style={{ width: '100%', height: 420, overflow: 'auto' }}>
                  {
                    (() => {
                      const linkage = lastResult.linkage || [];
                      const n = lastResult.features ? lastResult.features.length : 0;
                      const PREVIEW_MAX_LEAVES = 100; // Reduced to prevent page freezing
                      const previewLeaves = Math.min(n || 0, PREVIEW_MAX_LEAVES);
                      const previewWidth = Math.max(600, previewLeaves * 12);
                      if (n > PREVIEW_MAX_LEAVES) {
                        return (
                          <div style={{ width: '100%', height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
                            <div style={{ textAlign: 'center', padding: 12 }}>
                              <div style={{ fontWeight: 600, marginBottom: 8 }}>Dendrogram preview disabled</div>
                              <div style={{ maxWidth: 520 }}>The dataset has {n} items — to avoid freezing the page the preview is disabled for large datasets. Click "Open Full Dendrogram" to view the full tree.</div>
                            </div>
                          </div>
                        );
                      }
                      // For any dataset, show simplified preview
                      const sample = Math.min(n, 50); // Even more reduced
                      const w = Math.max(600, sample * 12);
                      const tickXs = Array.from({ length: sample }, (_, i) => Math.round((i * (w - 40)) / Math.max(1, sample - 1)) + 20);
                      return (
                        <svg width={'100%'} height={420} viewBox={`0 0 ${w} 420`} preserveAspectRatio="xMidYMid meet">
                          <rect x={0} y={0} width={w} height={420} fill="#fafafa" />
                          {tickXs.map((x, i) => (
                            <line key={i} x1={x} y1={60} x2={x} y2={360} stroke="#999" strokeWidth={1.5} />
                          ))}
                          <text x={w/2} y={30} fontSize={14} textAnchor="middle" fill="#333" fontWeight="500">
                            Dendrogram preview (sampled {sample} of {n} leaves)
                          </text>
                        </svg>
                      );
                    })()
                  }
                </div>
              </div>
              <div className="col-span-5">
                <div className="mb-2 font-medium">Clustered Scatter</div>
                <div style={{ width: '100%', height: 320 }} className="mb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 80, bottom: 20, left: 20 }}>
                      <CartesianGrid />
                      <XAxis dataKey="x" name="X" type="number" />
                      <YAxis dataKey="y" name="Y" />
                      <Tooltip />
                      {(() => {
                        const labels = lastResult.labels || [];
                        const features = lastResult.features || [];
                        console.log('[HierarchicalWidget] Scatter - START - labels:', labels.length, 'features:', features.length);
                        
                        if (features.length === 0) {
                          console.error('[HierarchicalWidget] Scatter - NO FEATURES!');
                          return <text x="50%" y="50%" textAnchor="middle">No data available</text>;
                        }

                        // Use first 2 features directly without complex projections
                        const points = features.map((f: number[], i: number) => ({
                          x: f[0] ?? 0,
                          y: f[1] ?? 0,
                          cluster: labels[i] ?? 0,
                          index: i
                        }));
                        
                        console.log('[HierarchicalWidget] Scatter - raw points:', points.length, 'sample:', points.slice(0, 5));

                        // Group by cluster
                        const groups = new Map<number, any[]>();
                        points.forEach(p => {
                          const k = p.cluster;
                          if (!groups.has(k)) groups.set(k, []);
                          groups.get(k)!.push(p);
                        });
                        
                        console.log('[HierarchicalWidget] Scatter - clusters found:', Array.from(groups.keys()));
                        
                        const COLORS = ['#E11D48','#2563EB','#16A34A','#F59E0B','#7C3AED','#06B6D4','#FB7185','#F97316'];
                        const items: any[] = [];
                        
                        Array.from(groups.entries()).forEach(([clusterId, clusterPoints], idx) => {
                          console.log(`[HierarchicalWidget] Scatter - Cluster ${clusterId}: ${clusterPoints.length} points, first 3:`, clusterPoints.slice(0, 3));
                          items.push(
                            <Scatter
                              key={`cluster-${clusterId}`}
                              name={`Cluster ${clusterId}`}
                              data={clusterPoints}
                              fill={COLORS[idx % COLORS.length]}
                            />
                          );
                        });
                        
                        console.log('[HierarchicalWidget] Scatter - RENDERING', items.length, 'scatter components');
                        
                        return [
                          ...items,
                          <Legend key="legend" verticalAlign="top" align="right" />
                        ];
                      })()}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                <div className="mb-2 font-medium">Cluster Labels (first 200 rows)</div>
                <div className="overflow-auto max-h-[40vh]">
                  {
                    (() => {
                      // Build labelled rows from lastResult (preferred) falling back to widget data
                      const baseRows = (widget.data?.tableData || widget.data?.tableDataProcessed || widget.data?.parsedData || []);
                      const labelsArr = lastResult?.labels || [];
                      // If baseRows is empty but lastResult.features exist, create placeholder rows
                      const labelled = (baseRows.length > 0)
                        ? baseRows.map((r:any,i:number) => ({ index: i, cluster: labelsArr[i], ...r }))
                        : (lastResult?.features || []).map((f:any,i:number) => ({ index: i, cluster: labelsArr[i], x: f[0], y: f[1] }));

                      const toShow = labelled.slice(0, 200);
                      const extraCols = toShow[0] ? Object.keys(toShow[0]).filter(k => k !== 'index' && k !== 'cluster').slice(0,3) : [];

                      return (
                        <table className="min-w-full border border-gray-300 text-sm">
                          <thead>
                            <tr>
                              <th className="border px-2 py-1 bg-gray-100">Index</th>
                              <th className="border px-2 py-1 bg-gray-100">Cluster</th>
                              {extraCols.map((c:string) => (
                                <th key={c} className="border px-2 py-1 bg-gray-100">{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {toShow.map((row:any, i:number) => (
                              <tr key={i}>
                                <td className="border px-2 py-1">{row.index}</td>
                                <td className="border px-2 py-1">{row.cluster}</td>
                                {extraCols.map((k, idx) => (
                                  <td key={idx} className="border px-2 py-1">{row[k]}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDendrogram && lastResult && method === 'divisive' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-4 min-w-[400px] max-w-[90vw] max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Dendrogram (not available for divisive)</h3>
              <div>
                <button className="mr-2 px-2 py-1 text-sm" onClick={() => setShowDendrogram(false)}>Close</button>
              </div>
            </div>
            <div className="text-sm text-gray-600">Divisive clustering (bisecting k-means) does not produce a classic linkage dendrogram in this lightweight implementation. Use the Clustered Scatter and Labels Table to inspect results.</div>
          </div>
        </div>, document.body as any)
      }

      {/* Parameters modal for Hierarchical widget (open via context menu) */}
      <ParametersModal isOpen={showParameters} onClose={() => setShowParameters(false)} title="Hierarchical Parameters">
        <div className="space-y-4">
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
            <select value={method} onChange={(e) => { const v = e.target.value as any; setMethod(v); onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), hier_method: v } }); }} className="w-full p-2 border rounded">
              <option value="agglomerative">Agglomerative (bottom-up)</option>
              <option value="divisive">Divisive (top-down)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Linkage</label>
            <select value={widget.data?.hier_linkage || 'single'} onChange={(e) => { const link = e.target.value; onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), hier_linkage: link } }); }} className="w-full p-2 border rounded">
              <option value="single">Single</option>
              <option value="complete">Complete</option>
              <option value="average">Average</option>
              <option value="ward">Ward</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Number of clusters (k)</label>
            <input type="number" min={1} value={hierK} onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); setHierK(v); onUpdateWidget && onUpdateWidget({ data: { ...(widget.data || {}), hier_k: v } }); }} className="w-full p-2 border rounded" />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              disabled={requestedUpstream}
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                setShowParameters(false);
                // run and show outputs inline on canvas (not in modal)
                  setTimeout(() => { 
                    try { 
                      run(); 
                      setShowResultsInline(true); // Show results on canvas
                      // Do NOT open modal: setShowCombined(true);
                    } catch (err) { 
                      console.error('Run failed:', err); 
                    } 
                  }, 60);
              }}
              className={`px-3 py-1 rounded text-white ${requestedUpstream ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600'}`}>
              Run
            </button>

            <button
              disabled={requestedUpstream}
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                  try { 
                    run(); 
                    setShowResultsInline(true); // Show results on canvas
                    // Do NOT open modal: setShowCombined(true);
                  } catch (err) { 
                    console.error('Apply & Close run failed:', err); 
                  }
                setShowParameters(false);
              }}
              className={`px-3 py-1 rounded text-white ${requestedUpstream ? 'bg-green-300 cursor-not-allowed' : 'bg-green-600'}`}>
              Apply & Close
            </button>

            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowParameters(false); }} className="px-3 py-1 bg-gray-200 rounded">Close</button>
          </div>
        </div>
      </ParametersModal>

    </OrangeStyleWidget>
  );
};

// Dendrogram modal component (inline for simplicity)
function DendrogramModalComponent({
  isOpen,
  onClose,
  linkage,
  n,
  heights,
  onCut,
  initialK,
  allowRenderFull,
  onOpenScatter,
}: {
  isOpen: boolean;
  onClose: () => void;
  linkage: Array<[number, number, number, number]>;
  n: number;
  heights: number[];
  onCut: (k: number) => void;
  initialK?: number;
  allowRenderFull?: boolean;
  onOpenScatter?: () => void;
}) {
  const [k, setK] = useState<number>(initialK || Math.max(2, Math.min(n, 3)));
  const maxH = heights && heights.length ? Math.max(...heights) : 1;
  const width = Math.min(1200, Math.max(600, n * 12));
  const height = Math.max(240, (heights?.length || 0) * 12 + 120);

  // Build tree map: id -> { children?, members?, dist }
  const tree = useMemo(() => {
    const nodes = new Map<number, any>();
    for (let i = 0; i < n; i++) nodes.set(i, { id: i, children: [], members: [i], dist: 0 });
    for (let m = 0; m < (linkage || []).length; m++) {
      const [a, b, d] = linkage[m];
      const newId = n + m;
      const left = nodes.get(a) || { id: a, children: [], members: [a], dist: 0 };
      const right = nodes.get(b) || { id: b, children: [], members: [b], dist: 0 };
      const merged = { id: newId, children: [left, right], members: (left.members || []).concat(right.members || []), dist: d };
      nodes.set(newId, merged);
    }
    return nodes;
  }, [linkage, n]);

  // compute leaf x positions
  const leafIds = Array.from({ length: n }, (_, i) => i);
  const leafX = new Map<number, number>();
  const margin = 40;
  leafIds.forEach((id, idx) => {
    const x = margin + (idx * (width - margin * 2)) / Math.max(1, n - 1);
    leafX.set(id, x);
  });

  // compute positions for nodes
  const positions = new Map<number, { x: number; y: number }>();
  // recursive compute
  const computePos = (node: any) => {
    if (!node) return { x: 0, y: height - 40 };
    if (!node.children || node.children.length === 0) {
      const x = leafX.get(node.id) || 0;
      const y = height - 40;
      positions.set(node.id, { x, y });
      return { x, y };
    }
    const left = computePos(node.children[0]);
    const right = computePos(node.children[1]);
    const x = (left.x + right.x) / 2;
    const y = height - 40 - ((node.dist || 0) / Math.max(maxH, 1)) * (height - 120);
    positions.set(node.id, { x, y });
    // draw vertical connection from child y to parent y will be handled in rendering
    return { x, y };
  };
  const rootId = n + Math.max(0, (linkage || []).length - 1);
  const root = tree.get(rootId);
  if (isOpen && root) computePos(root);

  if (!isOpen) return null;
  const MAX_RENDER_LEAVES = 800; // safety guard for full SVG rendering
  const canRenderFull = typeof allowRenderFull === 'boolean' ? allowRenderFull : (n <= MAX_RENDER_LEAVES);

  if (!canRenderFull) {
    return (
      <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black bg-opacity-40">
      <div 
        className="bg-white rounded-lg shadow-lg p-4 min-w-[480px] max-w-[95vw] max-h-[90vh] overflow-auto z-[10051]"
        style={{ pointerEvents: 'auto' }}
      >
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">Dendrogram</h3>
            <div>
              <button 
                type="button"
                className="px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 cursor-pointer" 
                style={{ pointerEvents: 'auto' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
              >
                Close
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-700 mb-3">The dataset contains {n} leaves which is too large to render as a full SVG in the browser without freezing the page.</div>
          <div className="flex gap-2">
            <button 
              type="button"
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer" 
              style={{ pointerEvents: 'auto' }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
                alert('✓ Clustering Complete!\n\n' +
                      'Your data has been clustered into ' + (initialK || 3) + ' groups.\n\n' +
                      'To view the results:\n' +
                      '1. Check the "Cluster" column in the data table below\n' +
                      '2. Click "Export CSV" to download all clustered data\n' +
                      '3. Use "Full Scatter" or "Full Table" buttons for other views\n\n' +
                      'Note: Full dendrogram visualization is disabled for large datasets (>50 samples) to prevent browser freezing.');
              }}
            >
              View Results Guide
            </button>
            <button 
              type="button"
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer" 
              style={{ pointerEvents: 'auto' }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTimeout(() => {
                  try {
                    const payload = { linkage: linkage || [], n, heights: heights || [] };
                    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); 
                    a.href = url; 
                    a.download = `dendrogram-linkage-n${n}.json`; 
                    a.click(); 
                    URL.revokeObjectURL(url);
                  } catch (err) { 
                    console.error('[Warning Modal] Download linkage failed', err); 
                    alert('Failed to download linkage'); 
                  }
                }, 50);
                onClose();
              }}
            >
              Download JSON
            </button>
            <button 
              type="button"
              className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 cursor-pointer" 
              style={{ pointerEvents: 'auto' }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div 
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40"
      style={{ zIndex: 999999 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-lg p-4 min-w-[600px] max-w-[95vw] max-h-[90vh] flex flex-col"
        style={{ zIndex: 1000000 }}
      >
        {/* Fixed header with controls */}
        <div className="flex justify-between items-center mb-3 pb-3 border-b-2 border-gray-300">
          <h3 className="font-semibold text-lg">Dendrogram</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Clusters (k):</label>
            <input 
              type="number" 
              value={k} 
              min={1} 
              max={Math.max(1, n)} 
              onChange={(e) => {
                const newK = Math.max(1, Math.min(n, Number(e.target.value) || 1));
                setK(newK);
              }}
              className="w-16 text-sm p-1 border rounded"
            />
            <button 
              className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded hover:bg-blue-700" 
              onClick={(e) => {
                e.stopPropagation();
                const selectedK = k;
                onClose();
                setTimeout(() => {
                  try {
                    onCut(selectedK);
                  } catch (err) {
                    console.error('Apply error:', err);
                  }
                }, 100);
              }}
            >
              Apply
            </button>
            <button 
              className="px-4 py-2 text-sm font-semibold bg-gray-500 text-white rounded hover:bg-gray-600" 
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              Close
            </button>
          </div>
        </div>
        
        {/* Scrollable SVG area */}
        <div className="overflow-auto flex-1">
          <svg width={width} height={height}>
            {/* lines for each merge */}
            {linkage && linkage.map((ln, idx) => {
              const a = ln[0], b = ln[1];
              const parentId = n + idx;
              const p = positions.get(parentId);
              const pa = positions.get(a);
              const pb = positions.get(b);
              if (!p || !pa || !pb) return null;
              // vertical lines from children to parent's y, and horizontal connector
              return (
                <g key={idx}>
                  <line x1={pa.x} y1={pa.y} x2={pa.x} y2={p.y} stroke="#333" />
                  <line x1={pb.x} y1={pb.y} x2={pb.x} y2={p.y} stroke="#333" />
                  <line x1={pa.x} y1={p.y} x2={pb.x} y2={p.y} stroke="#333" />
                </g>
              );
            })}
            {/* labels for leaves */}
            {leafIds.map((id) => {
              const pos = positions.get(id);
              if (!pos) return null;
              return (
                <g key={`leaf-${id}`}>
                  <circle cx={pos.x} cy={pos.y} r={3} fill="#1f2937" />
                  <text x={pos.x} y={pos.y + 14} fontSize={10} textAnchor="middle" fill="#111">{id}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

export default HierarchicalWidget;
