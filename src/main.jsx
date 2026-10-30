import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './lobby.css';
import App from './App.jsx';
import { STATIC_ASSET_PATHS } from './utils/preloadAssets.js';

const STATIC_FILE_RE = /\.(?:js|mjs|css|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf)$/i;

// Kumpulkan app shell + aset yang benar-benar dipakai build ini, supaya Service
// Worker bisa menyimpannya sekali dan halaman tetap utuh saat sinyal hilang.
function collectCacheUrls() {
  const urls = new Set(['/', '/index.html', '/manifest.webmanifest', ...STATIC_ASSET_PATHS]);

  try {
    for (const entry of performance.getEntriesByType('resource')) {
      const url = new URL(entry.name);
      if (url.origin === location.origin && STATIC_FILE_RE.test(url.pathname)) urls.add(url.pathname);
    }
  } catch {
    // Performance API bisa dibatasi; daftar aset statis di atas tetap cukup.
  }

  document.querySelectorAll('script[src], link[href]').forEach(node => {
    const value = node.getAttribute('src') || node.getAttribute('href');
    if (!value) return;
    try {
      const url = new URL(value, location.href);
      if (url.origin === location.origin && STATIC_FILE_RE.test(url.pathname)) urls.add(url.pathname);
    } catch {
      // abaikan URL non-http (data:, dsb.)
    }
  });

  return [...urls];
}

function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(registration => {
        registration.update?.().catch(() => {});
        return navigator.serviceWorker.ready.then(ready => {
          ready.active?.postMessage({ type: 'CACHE_URLS', urls: collectCacheUrls() });
        });
      })
      .catch(error => {
        // PWA adalah lapisan kenyamanan: game harus tetap jalan tanpa SW.
        console.warn('[PWA] Service worker gagal didaftarkan:', error?.message || error);
      });
  }, { once: true });
}

registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
