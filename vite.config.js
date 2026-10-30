import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
