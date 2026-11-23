// Service Worker سامانه گروه حقوقی برائت
const CACHE_NAME = 'baraat-cache-v28';

function scopeUrl(rel) {
  return new URL(rel, self.registration.scope).href;
}

const CORE_REL_ASSETS = [
  './',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        CORE_REL_ASSETS.map(rel =>
          cache.add(new Request(scopeUrl(rel), { cache: 'reload' })).catch(() => {})
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

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Fonts: Cache-First (immutable font files)
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

  // Only handle same-origin static requests; never intercept Supabase, /api/, or .apk binaries
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.endsWith('.apk')) {
    return;
  }

  // Navigation & unhashed entry files: Network-First (no-store) so updates appear immediately in PWA & Web
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/manifest.json') || url.pathname.endsWith('/baraat_engine.js')) {
    const rootKey = scopeUrl('./');
    event.respondWith(
      fetch(new Request(req, { cache: 'no-store' })).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          const cacheKey = req.mode === 'navigate' ? rootKey : req;
          caches.open(CACHE_NAME).then(c => c.put(cacheKey, clone));
        }
        return res;
      }).catch(() => caches.match(req).then(m => m || (req.mode === 'navigate' ? caches.match(rootKey) : undefined)))
    );
    return;
  }

  // Vite content-hashed chunks (/assets/*): Cache-First for instant load
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Other static files (/icons/*): Stale-While-Revalidate
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
