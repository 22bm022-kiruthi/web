import { useEffect, useState } from 'react';

interface BackendHealthStatus {
  isHealthy: boolean;
  lastCheck: Date | null;
  error: string | null;
}

export function useBackendHealth(checkInterval: number = 30000) {
  const [status, setStatus] = useState<BackendHealthStatus>({
    isHealthy: false,
    lastCheck: null,
    error: null
  });

  useEffect(() => {
    const perCandidateTimeout = 4000;
    const failureThreshold = 3; // require this many consecutive failures before reporting unhealthy
    let consecutiveFailures = 0;

    const tryFetch = async (url: string) => {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), perCandidateTimeout);
      try {
        // Mixed-content will be blocked by the browser if page is https and url is http
        if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:' && url.startsWith('http:')) {
          clearTimeout(to);
          return { ok: false, status: 0, msg: 'mixed-content' };
        }
        const resp = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' }, signal: controller.signal });
        clearTimeout(to);
        if (resp.ok) return { ok: true };
        // Read body to detect proxy/connection-refused messages
        let txt = '';
        try { txt = await resp.text(); } catch (e) { /* ignore */ }
        const lower = (txt || '').toLowerCase();
        if (lower.includes('econnrefused') || lower.includes('connection refused') || lower.includes('cannot connect') || lower.includes('connect econnrefused')) {
          return { ok: false, status: resp.status, msg: 'connection-refused' };
        }
        return { ok: false, status: resp.status, msg: `status-${resp.status}` };
      } catch (err: any) {
        clearTimeout(to);
        if (err && err.name === 'AbortError') return { ok: false, status: 0, msg: 'timeout' };
        return { ok: false, status: 0, msg: err && err.message ? err.message : String(err) };
      }
    };

    const checkHealth = async () => {
      // Allow callers to disable the proactive health alert in development via env
      try {
        const suppress = (import.meta.env.VITE_SUPPRESS_BACKEND_ALERT || '').toString().trim();
        if (suppress === '1' || suppress === 'true') {
          // keep status healthy so UI won't show alerts
          setStatus({ isHealthy: true, lastCheck: new Date(), error: null });
          return;
        }
      } catch (e) { /* ignore */ }
      const envApi = (import.meta.env.VITE_API_URL || '').toString().trim();
      const candidates: string[] = [];
      if (envApi) {
        const base = envApi.replace(/\/$/, '');
        candidates.push(`${base}/api/health`);
      }
      // Relative first (lets dev proxy handle it), then direct IPv4/localhost
      candidates.push('/api/health', 'http://127.0.0.1:5003/api/health', 'http://localhost:5003/api/health');

      let lastMsg: string | null = null;
      for (const url of candidates) {
        try {
          const r = await tryFetch(url);
          if (r.ok) {
            consecutiveFailures = 0;
            setStatus({ isHealthy: true, lastCheck: new Date(), error: null });
            return;
          }
          lastMsg = r.msg || `status:${r.status}`;
          // If proxy returned connection-refused/mixed-content/timeout OR any 5xx
          // assume the proxy couldn't reach the real backend and try the next candidate.
          if (r.msg === 'connection-refused' || r.msg === 'mixed-content' || r.msg === 'timeout' || (r.status && r.status >= 500)) {
            continue;
          }
          // For other non-OK statuses (4xx, etc), surface the status immediately
          setStatus({ isHealthy: false, lastCheck: new Date(), error: `Health check failed with status: ${r.status || 'unknown'}` });
          return;
        } catch (e) {
          lastMsg = e instanceof Error ? e.message : String(e);
        }
      }
      consecutiveFailures += 1;
      const errMsg = lastMsg || 'Failed to reach backend';
      if (consecutiveFailures >= failureThreshold) {
        setStatus({ isHealthy: false, lastCheck: new Date(), error: errMsg });
      } else {
        // don't mark unhealthy yet; report as still healthy until threshold exceeded
        setStatus({ isHealthy: true, lastCheck: new Date(), error: null });
      }
    };

    // initial check and interval
    checkHealth();
    const interval = setInterval(checkHealth, checkInterval);
    return () => clearInterval(interval);
  }, [checkInterval]);

  return status;
}

export function BackendHealthIndicator() {
  const health = useBackendHealth();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('ds:backend-health-dismissed');
      return v === '1' || v === 'true';
    } catch (e) { return false; }
  });

  if (health.isHealthy || dismissed) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        backgroundColor: '#ff4444',
        color: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        zIndex: 10000,
        maxWidth: '400px',
        fontSize: '14px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <strong>⚠️ Backend Server Not Connected</strong>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
            The backend server on port 5003 is not responding. 
            Please run <code style={{ 
              backgroundColor: 'rgba(255,255,255,0.2)', 
              padding: '2px 6px', 
              borderRadius: '4px',
              fontFamily: 'monospace'
            }}>START_BACKEND_AUTO.bat</code>
          </p>
          {health.error && (
            <p style={{ 
              margin: '4px 0 0 0', 
              fontSize: '11px', 
              opacity: 0.7,
              fontFamily: 'monospace'
            }}>
              Error: {health.error}
            </p>
          )}
        </div>
        <button
          onClick={() => { setDismissed(true); try { localStorage.setItem('ds:backend-health-dismissed', '1'); } catch (e) { /* ignore */ } }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0',
            lineHeight: '1'
          }}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
