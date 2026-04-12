import React, { useCallback, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import FilesModal from './components/FilesModal';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import ConfigModal from './components/ConfigModal';
import TopMenuBar from './components/TopMenuBar';
import { BackendHealthIndicator } from './components/BackendHealthIndicator';
import { Widget, Connection, Theme } from './types';
import LoginPage from './LoginPage';

const App: React.FC = () => {
  const [loggedIn, setLoggedIn] = useState<boolean>(() => {
    try {
      // Dev override: append ?showLogin=1 to force showing the login page regardless of localStorage
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      if (params && params.get('showLogin') === '1') return false;
      // support direct link to /login
      if (pathname === '/login' || pathname.endsWith('/login')) return false;
      return localStorage.getItem('loggedIn') === 'true';
    } catch (err) {
      return false;
    }
  });
  
  const handleLogin = () => {
    setLoggedIn(true);
    try {
      localStorage.setItem('loggedIn', 'true');
    } catch (err) {
      // ignore
    }
  };

  // If login was triggered via a dedicated /login path, remove it after successful login
  React.useEffect(() => {
    if (loggedIn) {
      try {
        if (typeof window !== 'undefined' && (window.location.pathname === '/login' || window.location.pathname.endsWith('/login'))) {
          window.history.replaceState({}, '', '/');
        }
      } catch (err) {
        // ignore
      }
    }
  }, [loggedIn]);

  // app state: theme, widgets, connections, selection
  const [theme, setTheme] = useState<Theme>('light' as Theme);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? ('light' as Theme) : ('dark' as Theme)));

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedWidget, setSelectedWidget] = useState<Widget | null>(null);
  // allow other components to open the Files modal for a specific widget by dispatching
  // window.dispatchEvent(new CustomEvent('openFilesModal', { detail: { widgetId } }))
  React.useEffect(() => {
    const handler = (ev: any) => {
      const id = ev?.detail?.widgetId;
      if (id) {
        const w = widgets.find((x) => x.id === id) || null;
        setSelectedWidget(w);
      }
      setFilesModalOpen(true);
    };
    window.addEventListener('openFilesModal', handler as EventListener);
    return () => window.removeEventListener('openFilesModal', handler as EventListener);
  }, [widgets]);

  // Listen for widgets requesting upstream data (e.g. Hierarchical widget can ask for source data)
  React.useEffect(() => {
    const reqHandler = (ev: any) => {
      try {
        const targetId = ev?.detail?.widgetId;
        if (!targetId) return;
        // find connections that feed into the target widget
        const fromIds = connections.filter((c) => c.toId === targetId).map((c) => c.fromId);
        if (!fromIds || fromIds.length === 0) return;
        // pick the first upstream widget that has table data
        setWidgets((prevWidgets: Widget[]) => {
          const fromWidget = prevWidgets.find((w) => fromIds.includes(w.id));
          if (!fromWidget) return prevWidgets;
          const forwardTable = fromWidget.data?.tableData || fromWidget.data?.parsedData || fromWidget.data?.tableDataProcessed || [];
          if (!forwardTable || forwardTable.length === 0) return prevWidgets;
          return prevWidgets.map((w) => (w.id === targetId ? { ...w, data: { ...(w.data || {}), tableData: forwardTable } } : w));
        });
        // If nothing was forwarded (no data on connected upstream), try a graceful fallback:
        // 1) find any widget in the app that already has tableData
        // 2) if none exists, attempt to fetch from backend /api/supabase/fetch?table=raman_data
        setTimeout(async () => {
          try {
            // Read the latest widgets state via a functional update to avoid stale closures
            let forwarded = false;
            setWidgets((prevWidgets) => {
              const anyWithData = prevWidgets.find((w) => (w.data?.tableData && w.data.tableData.length > 0) || (w.data?.parsedData && w.data.parsedData.length > 0));
              if (anyWithData) {
                // forward that table to targetId
                onUpdateWidget(targetId, { data: { ...(anyWithData.data || {}), tableData: anyWithData.data.tableData || anyWithData.data.parsedData } });
                console.debug('[App] fallback forwarded data from widget', anyWithData.id, 'to', targetId);
                forwarded = true;
              }
              return prevWidgets;
            });
            if (forwarded) return;

            // final fallback: call backend proxy to fetch raman_data (if available)
            console.debug('[App] no upstream widget had data; attempting backend fetch fallback');
            const resp = await fetch(`/api/supabase/fetch?table=raman_data&limit=200`);
            if (!resp.ok) { console.warn('[App] backend fetch fallback failed', resp.status); return; }
            const body = await resp.json().catch(() => null);
            const rows = body?.data || body || [];
            if (rows && rows.length > 0) {
              // Forward fetched rows to the target widget (replace/attach tableData)
              onUpdateWidget(targetId, { data: { tableData: rows } });
              console.debug('[App] backend fetch fallback forwarded', rows.length, 'rows to', targetId);
            }
          } catch (err) {
            console.warn('[App] upstream fallback failed', err);
          }
        }, 60);
      } catch (err) {
        // swallow
      }
    };
    window.addEventListener('requestUpstreamData', reqHandler as EventListener);
    return () => window.removeEventListener('requestUpstreamData', reqHandler as EventListener);
  }, [connections]);

  // Debug helper: allow dumping app state to console via window.dispatchEvent(new CustomEvent('debugDump'))
  React.useEffect(() => {
    const handler = (ev: any) => {
      try {
        console.group('[App Debug Dump]');
        console.debug('widgets:', widgets);
        console.debug('connections:', connections);
        console.groupEnd();
      } catch (e) {
        console.warn('[App] debugDump failed', e);
      }
    };
    window.addEventListener('debugDump', handler as EventListener);
    return () => window.removeEventListener('debugDump', handler as EventListener);
  }, [widgets, connections]);

  // Expose simple helper actions for debugging and quick demo setup
  React.useEffect(() => {
    try {
      (window as any).__APP_ACTIONS = (window as any).__APP_ACTIONS || {};
      (window as any).__APP_ACTIONS.createSupabaseToTable = (opts?: { supPos?: { x: number; y: number }; tablePos?: { x: number; y: number } }) => {
        try {
          const supPos = opts?.supPos || { x: 120, y: 160 };
          const tablePos = opts?.tablePos || { x: supPos.x + 220, y: supPos.y };
          const idBase = Date.now();
          const supId = `widget-${idBase}`;
          const tableId = `widget-${idBase + 1}`;
          // Add both widgets in a single state update to avoid intermediate inconsistent renders
          setWidgets((prev) => [...prev, { id: supId, type: 'supabase', position: supPos, data: {} }, { id: tableId, type: 'data-table', position: tablePos, data: {} }]);
          const conn = { id: `conn-${Date.now()}`, fromId: supId, toId: tableId, createdAt: Date.now() };
          setConnections((prev) => [...prev, conn]);
          // Trigger fetch for the new supabase widget
          try { window.dispatchEvent(new CustomEvent('fetchSupabase', { detail: { widgetId: supId } })); } catch (e) { /* ignore */ }
          console.info('[App Action] created supabase -> data-table', supId, '->', tableId);
          return { supId, tableId };
        } catch (e) {
          console.warn('createSupabaseToTable failed', e);
          return null;
        }
      };
      // Debug helper: set tableData for an existing widget id (use in console)
      (window as any).__APP_ACTIONS.setWidgetData = (widgetId: string, data: any[]) => {
        try {
          if (!widgetId) return null;
          // Use the app's onUpdateWidget to set the widget data so downstream forwarding runs
          try { onUpdateWidget(widgetId, { data: { ...(widgets.find((w:any) => w.id === widgetId)?.data || {}), tableData: data } }); } catch (e) { console.warn('[App Action] setWidgetData failed', e); }
          console.info('[App Action] setWidgetData called for', widgetId, Array.isArray(data) ? data.length : 'non-array');
          return true;
        } catch (e) { console.warn('[App Action] setWidgetData top-level failed', e); return false; }
      };
    } catch (e) {
      // ignore
    }
  }, [setConnections, setWidgets]);

  // Expose app state for easier debugging in the browser: `window.__APP_STATE`
  React.useEffect(() => {
    try {
      (window as any).__APP_STATE = { widgets, connections };
    } catch (e) {
      // ignore
    }
  }, [widgets, connections]);

  // Auto-forward any widget.tableData to downstream connected widgets (useful for Supabase -> Data Table)
  // This is defensive: it only forwards when the source has non-empty tableData and the target
  // either has no tableData or a different length, avoiding infinite loops.
  React.useEffect(() => {
    try {
      // Build map of connections from source -> [targets]
      const connsByFrom: Record<string, string[]> = {};
      connections.forEach((c) => {
        connsByFrom[c.fromId] = connsByFrom[c.fromId] || [];
        connsByFrom[c.fromId].push(c.toId);
      });

      // Work on a snapshot of widgets and compute a new array when forwarding is needed
      const prevWidgets = widgets;
      let changed = false;
      const next = prevWidgets.map((w) => ({ ...w, data: w.data ? { ...w.data } : {} }));

      for (const src of prevWidgets) {
        // consider processed and parsed data as valid table sources too
        const srcTable = src.data?.tableData || src.data?.tableDataProcessed || src.data?.parsedData;
        if (!Array.isArray(srcTable) || srcTable.length === 0) continue;
        const targets = connsByFrom[src.id] || [];
        for (const tid of targets) {
          const ti = next.findIndex((n) => n.id === tid);
          if (ti === -1) continue;
          const target = next[ti];
          const tgtTable = target.data?.tableData;
          const sameLength = Array.isArray(tgtTable) && tgtTable.length === srcTable.length;
          if (!sameLength) {
            next[ti] = { ...target, data: { ...(target.data || {}), tableData: srcTable } };
            changed = true;
            console.info('[App] auto-forwarded', srcTable.length, 'rows from', src.id, 'to', tid);
          }
        }
      }

      if (changed) {
        console.log('[App] Auto-forward effect calling setWidgets with', next.length, 'widgets');
        setWidgets(next);
        // Data forwarded - Data Tables will only open when user explicitly clicks "Open table" button
      } else {
        console.log('[App] Auto-forward effect: no changes needed');
      }
    } catch (e) {
      console.warn('[App] auto-forward effect failed', e);
    }
    // Depend on widgets and connections so this runs when either changes
  }, [widgets, connections]);

  // Auto-fetch Supabase for existing connections: when a Supabase widget has outgoing connections
  // but no tableData yet, trigger its fetch once. Use a ref to avoid repeated requests across renders.
  const autoFetchedRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    try {
      connections.forEach((c) => {
        const from = widgets.find((w) => w.id === c.fromId);
        if (!from) return;
        if (from.type === 'supabase') {
          const hasData = (from.data?.tableData && from.data.tableData.length > 0) || (from.data?.parsedData && from.data.parsedData.length > 0);
          if (!hasData && !autoFetchedRef.current.has(from.id)) {
            try {
              window.dispatchEvent(new CustomEvent('fetchSupabase', { detail: { widgetId: from.id } }));
              console.debug('[App] auto-dispatched fetchSupabase for existing connection', from.id);
              autoFetchedRef.current.add(from.id);
            } catch (e) { /* ignore */ }
          }
        }
      });
    } catch (e) { /* ignore */ }
    // No cleanup needed; this is a lightweight sweep triggered on widgets/connections change
  }, [widgets.length, connections.length]);

  // Listen for createDataTable events (dispatched by widgets like Hierarchical after Run)
  React.useEffect(() => {
    const handler = (ev: any) => {
      try {
        const src = ev?.detail?.sourceWidgetId;
        const data = ev?.detail?.data || null;
        console.debug('[App] createDataTable event received', { src, dataLength: Array.isArray(data) ? data.length : 'no-data' });
        if (!src) return;
        // If there's already a downstream data-table connected from this source, don't create another
        const existing = connections.find((c) => c.fromId === src && (widgets.find(w => w.id === c.toId)?.type === 'data-table'));
        if (existing) {
          console.debug('[App] createDataTable: downstream data-table already exists for', src);
          // If a downstream data-table already exists, populate it with the provided data
          try {
            const targetId = existing.toId;
            if (data && targetId) {
              // Update the target data-table widget with the new rows
              onUpdateWidget(targetId, { data: { ...(widgets.find(w => w.id === targetId)?.data || {}), tableData: data } });
              // Data updated - table will only open when user clicks "Open table" button
            }
          } catch (err) {
            console.warn('[App] failed to update existing data-table for createDataTable', err);
          }
          return;
        }
        // find source widget to position the new table near it
        const srcWidget = widgets.find((w) => w.id === src);
        const pos = srcWidget?.position ? { x: (srcWidget.position.x || 200) + 180, y: (srcWidget.position.y || 200) } : { x: 280, y: 200 };
        // Create a new data-table widget with initial tableData if provided
        const newId = onAddWidget('data-table', pos, data ? { tableData: data } : {});
        if (newId) {
          // add connection from source -> new table
          const conn = { id: `conn-${Date.now()}`, fromId: src, toId: newId, createdAt: Date.now() };
          setConnections((prev) => [...prev, conn]);
          console.debug('[App] createDataTable created and connected', newId, 'from', src);
          // Data Table created - do NOT auto-open; user must click "Open" to view
        }
      } catch (err) {
        console.warn('[App] createDataTable handler failed', err);
      }
    };
    window.addEventListener('createDataTable', handler as EventListener);
    return () => window.removeEventListener('createDataTable', handler as EventListener);
  }, [widgets, connections]);

  // Listen for forceCreateDataTable: always create a new data-table for the given source (used as a reliable fallback)
  React.useEffect(() => {
    const forceHandler = (ev: any) => {
      try {
        const src = ev?.detail?.sourceWidgetId;
        const data = ev?.detail?.data || null;
        if (!src) return;
        console.debug('[App] forceCreateDataTable event received', { src, dataLength: Array.isArray(data) ? data.length : 'no-data' });
        const srcWidget = widgets.find((w) => w.id === src);
        const pos = srcWidget?.position ? { x: (srcWidget.position.x || 200) + 180, y: (srcWidget.position.y || 200) } : { x: 280, y: 200 };
        const newId = onAddWidget('data-table', pos, data ? { tableData: data } : {});
        if (newId) {
          const conn = { id: `conn-${Date.now()}`, fromId: src, toId: newId, createdAt: Date.now() };
          setConnections((prev) => [...prev, conn]);
          console.debug('[App] forceCreateDataTable created and connected', newId, 'from', src);
          // Data Table created - do NOT auto-open; user must click "Open" to view
        }
      } catch (err) {
        console.warn('[App] forceCreateDataTable handler failed', err);
      }
    };
    window.addEventListener('forceCreateDataTable', forceHandler as EventListener);
    return () => window.removeEventListener('forceCreateDataTable', forceHandler as EventListener);
  }, [widgets, connections]);

  // Listen for triggerDataForward events to manually run the auto-forward logic
  React.useEffect(() => {
    const triggerHandler = (ev: any) => {
      try {
        const sourceId = ev?.detail?.sourceWidgetId;
        if (!sourceId) return;
        console.debug('[App] triggerDataForward event received for', sourceId);
        
        // Force a re-run of the auto-forward logic for this specific source
        const sourceWidget = widgets.find(w => w.id === sourceId);
        if (!sourceWidget) return;
        
        const srcTable = sourceWidget.data?.tableData || sourceWidget.data?.tableDataProcessed || sourceWidget.data?.parsedData;
        if (!Array.isArray(srcTable) || srcTable.length === 0) return;
        
        // Find connected targets
        const targets = connections.filter(c => c.fromId === sourceId).map(c => c.toId);
        if (targets.length === 0) return;
        
        // Update target widgets with the source data
        setWidgets(prev => prev.map(w => {
          if (targets.includes(w.id)) {
            console.debug('[App] triggerDataForward updating', w.id, 'with', srcTable.length, 'rows from', sourceId);
            return { ...w, data: { ...(w.data || {}), tableData: srcTable } };
          }
          return w;
        }));
        
        // Data forwarded - Data Table will only open when user clicks "Open table" button
        
      } catch (err) {
        console.warn('[App] triggerDataForward handler failed', err);
      }
    };
    window.addEventListener('triggerDataForward', triggerHandler as EventListener);
    return () => window.removeEventListener('triggerDataForward', triggerHandler as EventListener);
  }, [widgets, connections]);

  const updateWidget = (id: string, changes: Partial<Widget>) => {
    const dataProp = (changes as any).data;
    const providedTableData = dataProp && Object.prototype.hasOwnProperty.call(dataProp, 'tableData');
    const tableDataLength = dataProp?.tableData?.length;
    console.log('[App] updateWidget called for', id, 'providedTableData:', !!providedTableData, 'tableData length:', tableDataLength);
    // Only warn if caller explicitly provided a tableData property that is undefined
    if (providedTableData && tableDataLength === undefined) {
      console.warn('[App] updateWidget: caller provided tableData but it is undefined — possible accidental clear. Stack:', new Error().stack);
    }
    setWidgets((prev: Widget[]) => prev.map((w: Widget) => {
      if (w.id !== id) return w;
      // Preserve existing type unless caller explicitly changed it
      const safeType = (changes as any).type || w.type;
      // Deep merge the 'data' property to avoid overwriting existing fields like tableData
      const merged = { ...w, ...changes, type: safeType } as Widget;
      if (changes.data) {
        merged.data = { ...(w.data || {}), ...changes.data };
      }
      // Clamp/validate position if provided to avoid NaN or off-canvas moves
      if ((merged as any).position) {
        const pos = (merged as any).position as any;
        const x = Number(pos.x);
        const y = Number(pos.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          // fallback to previous position
          merged.position = { ...(w.position || {}) };
        } else {
          merged.position = { x: Math.max(0, x), y: Math.max(0, y) };
        }
      }
      return merged;
    }));
  };

  // Enhanced removal debug: log when widgets are removed so we can trace unexpected disappearance
  const prevWidgetsRef = React.useRef<Widget[] | null>(null);
  React.useEffect(() => {
    const prev = prevWidgetsRef.current;
    if (prev) {
      const prevIds = new Set(prev.map(w => w.id));
      const curIds = new Set(widgets.map(w => w.id));
      const removed = prev.filter(w => !curIds.has(w.id));
      if (removed.length > 0) {
        console.warn('[App] Widgets removed:', removed.map(r => ({ id: r.id, type: r.type })), 'Current widgets:', widgets.map(w => ({ id: w.id, type: w.type })) );
      }
    }
    prevWidgetsRef.current = widgets.slice();
  }, [widgets]);

  const onAddWidget = (type: string, position: { x: number; y: number }, initialData?: any) => {
    const id = `widget-${Date.now()}`;
    console.debug('[App] onAddWidget called:', { id, type, position });
    setWidgets((prev: Widget[]) => {
      const next = [...prev, { id, type, position, data: initialData || {}, label: initialData?.widgetName || '' }];
      console.debug('[App] widgets after add (count):', next.length);
      try { (window as any).__APP_STATE = { widgets: next, connections }; } catch (e) { /* ignore */ }
      return next;
    });
    return id;
  };

  // One-time developer convenience: if the URL has ?loadSample=1, fetch the
  // bundled `sample_full_spectrum.csv`, parse it, and create a File Upload widget
  // pre-populated with parsed rows so the app works offline/demo without Supabase.
  React.useEffect(() => {
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      if (!params || params.get('loadSample') !== '1') return;
      (async () => {
        try {
          const resp = await fetch('/sample_full_spectrum.csv');
          if (!resp.ok) return console.warn('[App] sample loader: failed to fetch sample file', resp.status);
          const txt = await resp.text();
          // Very small CSV parser: first line headers, then rows split on commas.
          const lines = txt.split(/\r?\n/).filter(l => l.trim().length > 0);
          if (lines.length < 2) return console.warn('[App] sample loader: sample file has no rows');
          const headers = lines[0].split(',').map(h => h.trim());
          const rows = lines.slice(1).map(line => {
            const parts = line.split(',');
            const obj: Record<string, any> = {};
            headers.forEach((h, i) => { obj[h] = parts[i] !== undefined ? parts[i].trim() : ''; });
            return obj;
          });
          const pos = { x: 120, y: 160 };
          const id = onAddWidget('file-upload', pos, { filename: 'sample_full_spectrum.csv', parsedData: rows });
          console.info('[App] sample loader: created file-upload widget', id, 'with', rows.length, 'rows');
        } catch (e) { console.warn('[App] sample loader failed', e); }
      })();
    } catch (err) { /* ignore */ }
  }, []);

  // Auto-attach: fetch server-side active upload and assign to first file-upload widget
  const autoAttachRef = React.useRef(false);
  React.useEffect(() => {
    if (autoAttachRef.current) return;
    // run once after initial widgets state is available
    autoAttachRef.current = true;
    (async () => {
      try {
        const resp = await fetch('/api/upload');
        if (!resp.ok) return;
        const list = await resp.json();
        const active = Array.isArray(list) ? (list.find((u: any) => u.active) || list[0]) : list;
        if (!active) return;
        let parsedRows = active.parsedData || active.data?.parsedData;
        if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
          const id = active._id || active.id || active.fileId || active.file;
          if (id) {
            const r = await fetch('/api/upload/' + encodeURIComponent(id));
            if (r.ok) {
              const body = await r.json();
              parsedRows = body.parsedData || body.data?.parsedData || body.parsed || [];
            }
          }
        }
        if (!Array.isArray(parsedRows) || parsedRows.length === 0) return;
        // find a file-upload widget that doesn't already have parsedData
        const fileWidget = widgets.find((w) => w.type === 'file-upload' && (!w.data || !Array.isArray(w.data.parsedData) || w.data.parsedData.length === 0));
        if (!fileWidget) return;
        onUpdateWidget(fileWidget.id, {
          data: {
            filename: active.filename || active.name || active.file || active.fileId || 'server-upload',
            fileId: active._id || active.id || active.fileId || active.file,
            parsedData: parsedRows,
          },
        });
        console.info('[App] auto-attached server upload to', fileWidget.id);
      } catch (e) {
        console.warn('[App] auto-attach active upload failed', e);
      }
    })();
  }, [widgets]);

  // Debug: log widgets when they change to help trace missing drops
  React.useEffect(() => {
    try {
      console.debug('[App] widgets changed (count):', widgets.length, 'widgets:', widgets.map(w => ({ id: w.id, type: w.type, pos: w.position }))); 
    } catch (e) { /* ignore */ }
  }, [widgets.length]);

  const onOpenConfig = (widget: Widget) => setSelectedWidget(widget);
  const [filesModalOpen, setFilesModalOpen] = useState(false);
  const onDeleteWidget = (id: string) => {
    setWidgets((prev: Widget[]) => prev.filter((w: Widget) => w.id !== id));
    setConnections((prev: Connection[]) => prev.filter((c: Connection) => c.fromId !== id && c.toId !== id));
  };
  const onUpdateWidget = (id: string, changes: Partial<Widget>) => {
    updateWidget(id, changes);

    // If the widget's data contains tableData, propagate it to downstream widgets
    // support both tableData (explicit) and parsedData (from uploads) so downstream widgets get updated
    const newTable = (changes as any).data?.tableData || (changes as any).data?.parsedData;
    if (newTable && Array.isArray(newTable) && newTable.length > 0) {
      // find connections from this widget
      const targets = connections.filter((c) => c.fromId === id).map((c) => c.toId);
      // Only call setWidgets if there are actually targets to update
      if (targets.length > 0) {
        setWidgets((prevWidgets: Widget[]) => {
          return prevWidgets.map((w) =>
            targets.includes(w.id)
              ? { ...w, data: { ...(w.data || {}), tableData: newTable } }
              : w
          );
        });
      }
    }
  };

  const onRemoveConnections = (widgetId: string) => {
    setConnections((prev) => prev.filter((c) => c.fromId !== widgetId && c.toId !== widgetId));
  };

  const handleUseFile = (file: any) => {
    // assign file to selected widget if it is a file-upload
    if (!selectedWidget) {
      alert('No widget selected to receive the file. Please select a File Upload widget.');
      return;
    }
    if (selectedWidget.type !== 'file-upload') {
      alert('Selected widget is not a File Upload widget. Please select a File Upload widget to use this file.');
      return;
    }
    // update the selected widget with the file data
    onUpdateWidget(selectedWidget.id, { data: { filename: file.filename, fileId: file._id, parsedData: file.parsedData } });
    setFilesModalOpen(false);
  };

  const addConnection = useCallback(
    (fromId: string, toId: string) => {
      const newConnection: Connection = { id: `conn-${Date.now()}`, fromId, toId, createdAt: Date.now() };
  setConnections((prev: Connection[]) => [...prev, newConnection]);

  // If the connection originates from a Supabase source, ask that widget to fetch data
  try {
    const fromWidget = widgets.find((w: Widget) => w.id === fromId);
    if (fromWidget && fromWidget.type === 'supabase') {
      // dispatch an event the Supabase widget listens for to start a fetch
      window.dispatchEvent(new CustomEvent('fetchSupabase', { detail: { widgetId: fromId } }));
      console.debug('[App] dispatched fetchSupabase event for', fromId);
    }
  } catch (e) {
    console.debug('[App] failed to dispatch fetchSupabase event', e);
  }

  const fromWidget = widgets.find((w: Widget) => w.id === fromId);
  const toWidget = widgets.find((w: Widget) => w.id === toId);

      if (!fromWidget || !toWidget) return;

      // File Upload/Blank Remover -> Mean Average
      if (
        (fromWidget.type === 'file-upload' || fromWidget.type === 'supabase' || fromWidget.type === 'blank-remover') &&
        toWidget.type === 'mean-average'
      ) {
        const tableData = fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
        setWidgets((prev: Widget[]) =>
          prev.map((widget: Widget) =>
            widget.id === toId
              ? {
                  ...widget,
                  data: {
                    ...widget.data,
                    tableData,
                    meanType: 'row', // default selection
                    meanResult: [],  // will be calculated in the widget
                  },
                }
              : widget
          )
        );
      }

      // Mean Average -> Data Table
      if (fromWidget.type === 'mean-average' && toWidget.type === 'data-table') {
        setWidgets((prev: Widget[]) =>
          prev.map((widget: Widget) =>
            widget.id === toId
              ? {
                  ...widget,
                  data: {
                    ...widget.data,
                    tableData: fromWidget.data?.meanResult || [],
                  },
                }
              : widget
          )
        );
      }

      // File Upload/Supabase -> Blank Remover: fill blanks with "NIL"
      if ((fromWidget.type === 'file-upload' || fromWidget.type === 'supabase') && toWidget.type === 'blank-remover') {
        const tableData = fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
        // Replace all blank/empty/null/undefined cells with "NIL"
        const processed = tableData.map((row: Record<string, any>) => {
          const newRow: Record<string, any> = {};
          Object.entries(row).forEach(([key, val]) => {
            newRow[key] =
              val === null ||
              val === undefined ||
              (typeof val === 'string' && val.trim() === '')
                ? 'NIL'
                : val;
          });
          return newRow;
        });
        setWidgets((prev: Widget[]) =>
          prev.map((widget: Widget) =>
            widget.id === toId
              ? {
                  ...widget,
                  data: { ...widget.data, tableData: processed },
                }
              : widget
          )
        );
      }

      // Blank Remover -> Data Table
      if (fromWidget.type === 'blank-remover' && toWidget.type === 'data-table') {
        setWidgets((prev: Widget[]) =>
          prev.map((widget: Widget) =>
            widget.id === toId
              ? {
                  ...widget,
                  data: {
                    ...widget.data,
                    tableData: fromWidget.data?.tableData || [],
                  },
                }
              : widget
          )
        );
      }

          // File Upload/Supabase -> Data Table (use tableData from source if present)
          if ((fromWidget.type === 'file-upload' || fromWidget.type === 'supabase') && toWidget.type === 'data-table') {
            const tableData = fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
            setWidgets((prev: Widget[]) =>
              prev.map((widget: Widget) =>
                widget.id === toId
                  ? {
                      ...widget,
                      data: {
                        ...widget.data,
                        tableData,
                      },
                    }
                  : widget
              )
            );
          }

          // File Upload/Supabase -> Line Chart
          if ((fromWidget.type === 'file-upload' || fromWidget.type === 'supabase') && toWidget.type === 'line-chart') {
            const tableData = fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
            setWidgets((prev: Widget[]) =>
              prev.map((widget: Widget) =>
                widget.id === toId
                  ? {
                      ...widget,
                      data: {
                        ...widget.data,
                        tableData,
                      },
                    }
                  : widget
              )
            );
          }

          // File Upload/Supabase -> Baseline Correction
          if ((fromWidget.type === 'file-upload' || fromWidget.type === 'supabase') && toWidget.type === 'baseline-correction') {
            const tableData = fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
            setWidgets((prev: Widget[]) =>
              prev.map((widget: Widget) =>
                widget.id === toId
                  ? {
                      ...widget,
                      data: {
                        ...(widget.data || {}),
                        tableData,
                      },
                    }
                  : widget
              )
            );
          }

      // File Upload / Supabase -> Noise Filter
      if ((fromWidget.type === 'file-upload' || fromWidget.type === 'supabase') && toWidget.type === 'noise-filter') {
        const tableData = fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
        setWidgets((prev: Widget[]) =>
          prev.map((widget: Widget) =>
            widget.id === toId
              ? {
                  ...widget,
                  data: { ...(widget.data || {}), tableData },
                }
              : widget
          )
        );
      }

      // Baseline Correction -> Noise Filter (NEW: allows preprocessing chain)
      if (fromWidget.type === 'baseline-correction' && toWidget.type === 'noise-filter') {
        const tableData = fromWidget.data?.tableDataProcessed || fromWidget.data?.tableData || [];
        setWidgets((prev: Widget[]) =>
          prev.map((widget: Widget) =>
            widget.id === toId
              ? {
                  ...widget,
                  data: { ...(widget.data || {}), tableData },
                }
              : widget
          )
        );
      }

      // Noise Filter -> Data Table / Visualizations: prefer processed tableDataProcessed
      if (fromWidget.type === 'noise-filter' && (toWidget.type === 'data-table' || toWidget.type === 'line-chart' || toWidget.type === 'scatter-plot' || toWidget.type === 'box-plot' || toWidget.type === 'bar-chart')) {
        const processed = fromWidget.data?.tableDataProcessed || fromWidget.data?.tableData || [];
        setWidgets((prev: Widget[]) =>
          prev.map((widget: Widget) =>
            widget.id === toId
              ? {
                  ...widget,
                  data: { ...(widget.data || {}), tableData: processed },
                }
              : widget
          )
        );
      }

      // Baseline Correction -> Data Table / Visualizations: prefer processed tableDataProcessed
      if (fromWidget.type === 'baseline-correction' && (toWidget.type === 'data-table' || toWidget.type === 'line-chart' || toWidget.type === 'scatter-plot' || toWidget.type === 'box-plot' || toWidget.type === 'bar-chart')) {
        const processed = fromWidget.data?.tableDataProcessed || fromWidget.data?.tableData || [];
        setWidgets((prev: Widget[]) =>
          prev.map((widget: Widget) =>
            widget.id === toId
              ? {
                  ...widget,
                  data: { ...(widget.data || {}), tableData: processed },
                }
              : widget
          )
        );
      }

          // File Upload/Supabase -> Scatter Plot
          if ((fromWidget.type === 'file-upload' || fromWidget.type === 'supabase') && toWidget.type === 'scatter-plot') {
            const tableData = fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
            setWidgets((prev: Widget[]) =>
              prev.map((widget: Widget) =>
                widget.id === toId
                  ? {
                      ...widget,
                      data: {
                        ...widget.data,
                        tableData,
                      },
                    }
                  : widget
              )
            );
          }

          // File Upload/Supabase -> Box Plot
          if ((fromWidget.type === 'file-upload' || fromWidget.type === 'supabase') && toWidget.type === 'box-plot') {
            const tableData = fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
            setWidgets((prev: Widget[]) =>
              prev.map((widget: Widget) =>
                widget.id === toId
                  ? {
                      ...widget,
                      data: {
                        ...widget.data,
                        tableData,
                      },
                    }
                  : widget
              )
            );
          }

          // File Upload/Supabase -> Bar Chart
          if ((fromWidget.type === 'file-upload' || fromWidget.type === 'supabase') && toWidget.type === 'bar-chart') {
            const tableData = fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
            setWidgets((prev: Widget[]) =>
              prev.map((widget: Widget) =>
                widget.id === toId
                  ? {
                      ...widget,
                      data: {
                        ...widget.data,
                        tableData,
                      },
                    }
                  : widget
              )
            );
          }

          // Forward preprocessing output to PCA Analysis
          if (
            (fromWidget.type === 'file-upload' ||
             fromWidget.type === 'supabase' ||
             fromWidget.type === 'noise-filter' ||
             fromWidget.type === 'baseline-correction' ||
             fromWidget.type === 'normalization' ||
             fromWidget.type === 'smoothing' ||
             fromWidget.type === 'blank-remover') &&
            toWidget.type === 'pca-analysis'
          ) {
            const tableData = fromWidget.data?.tableDataProcessed || fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
            setWidgets((prev: Widget[]) =>
              prev.map((widget: Widget) =>
                widget.id === toId
                  ? { ...widget, data: { ...(widget.data || {}), tableData } }
                  : widget
              )
            );
          }

          // Forward preprocessing output to KMeans Analysis (prefer processed data when available)
          if (
            (fromWidget.type === 'file-upload' ||
             fromWidget.type === 'supabase' ||
             fromWidget.type === 'noise-filter' ||
             fromWidget.type === 'baseline-correction' ||
             fromWidget.type === 'normalization' ||
             fromWidget.type === 'smoothing' ||
             fromWidget.type === 'blank-remover') &&
            toWidget.type === 'kmeans-analysis'
          ) {
            const tableData = fromWidget.data?.tableDataProcessed || fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
            setWidgets((prev: Widget[]) =>
              prev.map((widget: Widget) =>
                widget.id === toId
                  ? { ...widget, data: { ...(widget.data || {}), tableData } }
                  : widget
              )
            );
          }

          // Generic fallback: if the source widget has tableData (e.g., Supabase fetch)
          // forward it to the target if the target doesn't already have tableData.
          try {
            const forwardTable = fromWidget.data?.tableData || fromWidget.data?.parsedData || [];
            if (forwardTable && forwardTable.length > 0) {
              setWidgets((prev: Widget[]) =>
                prev.map((widget: Widget) =>
                  widget.id === toId
                    ? {
                        ...widget,
                        data: { ...(widget.data || {}), tableData: forwardTable },
                      }
                    : widget
                )
              );
            }
          } catch (err) {
            console.error('Error forwarding tableData on connection:', err);
          }
    },
    [widgets]
  );

  if (!loggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }
  return (
    <ThemeProvider theme={theme} toggleTheme={toggleTheme}>
      <DndProvider backend={HTML5Backend}>
        <ErrorBoundary>
          <BackendHealthIndicator />
          <div className="flex flex-col h-screen">
            <Header onToggleTheme={toggleTheme} theme={theme} onOpenFiles={() => setFilesModalOpen(true)} />
            <TopMenuBar />
            <div className="flex flex-1">
              <Sidebar onAddWidget={onAddWidget} />
              <Canvas
                widgets={widgets}
                connections={connections}
                onUpdateWidget={onUpdateWidget}
                onDeleteWidget={onDeleteWidget}
                onAddConnection={addConnection}
                onOpenConfig={onOpenConfig}
                onAddWidget={onAddWidget}
              />
            </div>
            {selectedWidget && (
              <ConfigModal
                isOpen={!!selectedWidget}
                widget={selectedWidget}
                onClose={() => setSelectedWidget(null)}
                onUpdate={onUpdateWidget}
                theme={theme}
              />
            )}
            <FilesModal isOpen={filesModalOpen} onClose={() => setFilesModalOpen(false)} onUseFile={(f) => handleUseFile(f)} />
          </div>
        </ErrorBoundary>
      </DndProvider>
    </ThemeProvider>
  );
};

export default App;