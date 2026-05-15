import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://127.0.0.1:5003';
  const pyApi = env.VITE_PY_API_URL || 'http://127.0.0.1:6004';

  return {
    plugins: [react()],
    server: {
      host: true, // Allow access from network
      port: 5177,
      strictPort: false,
      proxy: {
        // Use explicit IPv4 loopback address to avoid Windows localhost/IPv6 proxy edge-cases
        // Forward prediction calls to the Python service
        '/api/predict': {
          target: pyApi,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/api/, '')
        },
        // Default /api routes go to the Node backend (upload, supabase, etc.)
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/api/, '')
        }
      }
    }
  };
});
