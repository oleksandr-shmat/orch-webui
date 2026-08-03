import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    // Non-default port — 3000/5173 are used by countless other local projects; this pair
    // (4317 server / 4318 web) is dedicated to orch-webui to avoid collisions.
    port: 4318,
    strictPort: true,
    proxy: {
      '/api': {
        // Must match apps/server's default PORT (see apps/server/src/server.ts). If you run the
        // server with a non-default PORT, set the same value here (vite.config.ts is not itself
        // affected by a PORT env var — its dev server port is fixed above).
        target: 'http://127.0.0.1:4317',
        changeOrigin: true
      }
    }
  }
});
