import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://127.0.0.1:5003';

  return {
    plugins: [react()],
    server: {
      host: true, // Allow access from network
      port: 5173,
      strictPort: false,
      proxy: {
        // Use explicit IPv4 loopback address to avoid Windows localhost/IPv6 proxy edge-cases
        '/api': {
          // Use environment-configurable backend target so developers can override port
          target: apiUrl,
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});
