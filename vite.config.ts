import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ??
  process.env.VITE_API_URL ??
  'http://api:8000';

export default defineConfig({
  plugins: [tailwindcss(), solid()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
