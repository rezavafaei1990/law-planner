// Service Worker سامانه گروه حقوقی برائت
const CACHE_NAME = 'baraat-cache-v21';

const CORE_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        CORE_ASSETS.map(url =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      )
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Fonts: Cache-First
  if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Only handle same-origin internal requests; bypass API and APK binaries
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.endsWith('.apk')) {
    return;
  }

  // Navigation & unhashed engine script requests: Network-First so updates appear immediately
  if (req.mode === 'navigate' || url.pathname.endsWith('/baraat_engine.js') || url.pathname.endsWith('/manifest.json')) {
    event.respondWith(
      fetch(new Request(req, { cache: 'no-store' })).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          const cacheKey = req.mode === 'navigate' ? '/' : req;
          caches.open(CACHE_NAME).then(c => c.put(cacheKey, clone));
        }
        return res;
      }).catch(() => caches.match(req).then(m => m || (req.mode === 'navigate' ? caches.match('/') : undefined)))
    );
    return;
  }

  // Static bundled assets (/assets/*, /icons/*): Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
