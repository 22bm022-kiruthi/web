import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allow access from network
    port: 5173,
    strictPort: false,
    proxy: {
      // Use explicit IPv4 loopback address to avoid Windows localhost/IPv6 proxy edge-cases
      '/api': {
        // point to backend default port (ensure this matches the running backend)
        target: 'http://127.0.0.1:5003',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
