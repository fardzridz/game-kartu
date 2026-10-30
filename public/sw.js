/* eslint-env serviceworker */
/**
 * Service Worker ringan Remi Tongkrongan.
 *
 * - Navigasi: network-first + fallback shell yang sudah dicache.
 * - Aset statis (.js/.css/.svg/.png/.woff2 dll): stale-while-revalidate,
 *   tampil instan dari cache lalu diperbarui diam-diam di latar.
 * - Firebase (firebaseio.com / firebasedatabase.app / googleapis.com) tidak
 *   pernah disentuh: request realtime harus langsung ke jaringan, bukan cache.
 */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `remi-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `remi-static-${CACHE_VERSION}`;
const MAX_STATIC_ENTRIES = 220;

const BYPASS_HOSTS = ['firebaseio.com', 'firebasedatabase.app', 'googleapis.com'];
const PRECACHE_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons.svg'];
const STATIC_FILE_RE = /\.(?:js|mjs|css|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf)$/i;

function isBypassed(url) {
  return BYPASS_HOSTS.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

function isStaticAsset(request) {
  if (request.method !== 'GET' || request.headers.has('range')) return false;
  const url = new URL(request.url);
  if (isBypassed(url)) return false;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  return STATIC_FILE_RE.test(url.pathname);
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_STATIC_ENTRIES) return;
  await Promise.all(
    keys.slice(0, keys.length - MAX_STATIC_ENTRIES).map(key => cache.delete(key)),
  );
}

async function fetchAndCache(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
      await trimCache(cache);
    }
    return response;
  } catch {
    return null;
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cached = (await cache.match('/index.html')) || (await cache.match('/'));
    if (cached) return cached;
    return new Response(
      '<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Remi Tongkrongan</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#fff;font:600 16px system-ui"><p>Kamu sedang offline. Buka aplikasi sekali lagi setelah sinyal kembali.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

function staleWhileRevalidate(event) {
  const request = event.request;
  const update = fetchAndCache(request);
  // Tetap hidupkan update cache walau respons cache langsung dikembalikan.
  event.waitUntil(update.catch(() => {}));

  return (async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const fresh = await update;
    return fresh || Response.error();
  })();
}

async function cacheUrls(urls) {
  const cache = await caches.open(STATIC_CACHE);
  const unique = [...new Set(urls)];
  await Promise.allSettled(
    unique.map(async raw => {
      let url;
      try {
        url = new URL(raw, self.location.origin);
      } catch {
        return;
      }
      if (url.origin !== self.location.origin || isBypassed(url)) return;
      const hit = await cache.match(url.href);
      if (hit) return;
      try {
        const response = await fetch(new Request(url.href, { credentials: 'same-origin' }));
        if (response.ok) await cache.put(url.href, response);
      } catch {
        // Satu aset gagal tidak boleh membatalkan seluruh pemanasan cache.
      }
    }),
  );
  await trimCache(cache);
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        PRECACHE_URLS.map(async url => {
          try {
            const response = await fetch(new Request(url, { cache: 'reload' }));
            if (response.ok) await cache.put(url, response);
          } catch {
            // Shell parsial tetap lebih baik daripada instalasi gagal total.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key.startsWith('remi-') && key !== SHELL_CACHE && key !== STATIC_CACHE)
          .map(key => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', event => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
    event.waitUntil(cacheUrls(data.urls.filter(url => typeof url === 'string')));
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isBypassed(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (isStaticAsset(request)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
