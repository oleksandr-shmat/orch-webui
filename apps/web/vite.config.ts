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
        // Follows apps/server's PORT env var (default 4317, see apps/server/src/server.ts), so
        // `PORT=5000 npm run dev` points both processes at the same port.
        target: `http://127.0.0.1:${process.env.PORT ?? 4317}`,
        changeOrigin: true
      }
    }
  }
});
