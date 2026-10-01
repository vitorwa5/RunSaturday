import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3001';

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Park5K: Your Saturday 5K planner',
          short_name: 'Park5K',
          description: 'Your Saturday 5K planner. Independent app, not affiliated with parkrun.',
          theme_color: '#c2410c',
          background_color: '#f7f7f5',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Cache the app shell only. API data is not cached offline in Phase 1.
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
    server: {
      port: 5173,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    preview: {
      port: 4173,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
  };
});
