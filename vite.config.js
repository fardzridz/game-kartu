import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { relayPlugin } from './server/relay.mjs';

export default defineConfig({
  // relayPlugin memasang /relay/* di dev server & preview: sinkronisasi meja
  // lintas perangkat tanpa Firebase (lihat server/relay.mjs).
  plugins: [react(), tailwindcss(), relayPlugin()],
  // Dev server dibuka lewat host 0.0.0.0 (HP di jaringan yang sama) DAN lewat
  // tunnel (trycloudflare / localtunnel) supaya peserta bisa mencoba dari luar.
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.trycloudflare.com', '.loca.lt', '.ngrok-free.app', '.ngrok.io', 'localhost'],
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['.trycloudflare.com', '.loca.lt', '.ngrok-free.app', '.ngrok.io', 'localhost'],
  },
  build: {
    // Hashed build output lives in /assets, tempat header immutable di
    // vercel.json dan stale-while-revalidate Service Worker bekerja.
    assetsDir: 'assets',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/__tests__/**/*.test.js'],
  },
});
