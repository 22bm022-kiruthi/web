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
    const failureThreshold = 3;
    let consecutiveFailures = 0;

    const tryFetch = async (url: string) => {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), perCandidateTimeout);

      try {
        const resp = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });

        clearTimeout(to);

        if (resp.ok) return { ok: true };

        let txt = '';
        try { txt = await resp.text(); } catch {}

        return { ok: false, status: resp.status, msg: txt || `status-${resp.status}` };

      } catch (err: any) {
        clearTimeout(to);

        if (err?.name === 'AbortError') {
          return { ok: false, status: 0, msg: 'timeout' };
        }

        return { ok: false, status: 0, msg: err?.message || 'error' };
      }
    };

    const checkHealth = async () => {
      try {
        const suppress = (import.meta.env.VITE_SUPPRESS_BACKEND_ALERT || '').toString().trim();
        if (suppress === '1' || suppress === 'true') {
          setStatus({ isHealthy: true, lastCheck: new Date(), error: null });
          return;
        }
      } catch {}

      const envApi = (import.meta.env.VITE_API_URL || '').toString().trim();
      const candidates: string[] = [];
      if (envApi) {
        const base = envApi.replace(/\/$/, '');
        candidates.push(`${base}/api/health`);
      }
      // Relative first (lets dev proxy handle it), then production backend
      candidates.push('/api/health', 'https://spectral-api-jji3.onrender.com/api/health');

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
          if (r.msg === 'connection-refused' || r.msg === 'mixed-content' || r.msg === 'timeout' || (r.status && r.status >= 500)) {
            continue;
          }
          setStatus({ isHealthy: false, lastCheck: new Date(), error: `Health check failed with status: ${r.status || 'unknown'}` });
          return;
        } catch (e) {
          lastMsg = e instanceof Error ? e.message : String(e);
        }
      }

      consecutiveFailures += 1;

      if (consecutiveFailures >= failureThreshold) {
        setStatus({
          isHealthy: false,
          lastCheck: new Date(),
          error: lastMsg || 'Backend unreachable'
        });
      } else {
        setStatus({
          isHealthy: true,
          lastCheck: new Date(),
          error: null
        });
      }
    };

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
      return localStorage.getItem('ds:backend-health-dismissed') === '1';
    } catch {
      return false;
    }
  });

  if (health.isHealthy || dismissed) return null;

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
        zIndex: 10000,
        maxWidth: '400px'
      }}
    >
      <strong>⚠️ Backend Not Connected</strong>

      {health.error && (
        <p style={{ fontSize: '12px' }}>
          {health.error}
        </p>
      )}

      <button onClick={() => {
        setDismissed(true);
        localStorage.setItem('ds:backend-health-dismissed', '1');
      }}>
        Dismiss
      </button>
    </div>
  );
}