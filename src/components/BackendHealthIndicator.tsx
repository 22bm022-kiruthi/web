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
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
          setStatus({
            isHealthy: true,
            lastCheck: new Date(),
            error: null
          });
        } else {
          setStatus({
            isHealthy: false,
            lastCheck: new Date(),
            error: `Health check failed with status: ${response.status}`
          });
        }
      } catch (error) {
        setStatus({
          isHealthy: false,
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };

    // Check immediately on mount
    checkHealth();

    // Then check periodically
    const interval = setInterval(checkHealth, checkInterval);

    return () => clearInterval(interval);
  }, [checkInterval]);

  return status;
}

export function BackendHealthIndicator() {
  const health = useBackendHealth();
  const [dismissed, setDismissed] = useState(false);

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
          onClick={() => setDismissed(true)}
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
