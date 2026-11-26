// Service Worker سامانه گروه حقوقی برائت
const CACHE_NAME = 'baraat-cache-v34';

function scopeUrl(rel) {
  return new URL(rel, self.registration.scope).href;
}

const CORE_REL_ASSETS = [
  './',
  './supabase.min.js',
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

// Fast Network with 850ms Cache Fallback: instant open on slow mobile/offline, fresh on fast networks
function networkWithFastCacheFallback(req, cacheKey, timeoutMs) {
  return caches.match(cacheKey).then(cached => {
    const netPromise = fetch(new Request(req, { cache: 'no-store' })).then(res => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(cacheKey, clone));
      }
      return res;
    });

    if (!cached) {
      return netPromise;
    }

    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(cached);
        }
      }, timeoutMs);

      netPromise.then(res => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve(res);
        }
      }).catch(() => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve(cached);
        }
      });
    });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Fonts & CDN SDK fallbacks: Cache-First so PWA never blocks on external CDNs
  if (
    url.origin.includes('fonts.googleapis.com') ||
    url.origin.includes('fonts.gstatic.com') ||
    url.origin.includes('cdn.jsdelivr.net') ||
    url.origin.includes('unpkg.com')
  ) {
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

  // Self-hosted Supabase SDK & versioned baraat_engine.js?v=...: Cache-First for <5ms startup
  if (
    url.pathname.endsWith('/supabase.min.js') ||
    (url.pathname.endsWith('/baraat_engine.js') && url.searchParams.has('v'))
  ) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Navigation & unhashed entry files: Network with 850ms cache fallback + background refresh
  if (
    req.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/manifest.json') ||
    url.pathname.endsWith('/baraat_engine.js')
  ) {
    const cacheKey = req.mode === 'navigate' ? scopeUrl('./') : req;
    event.respondWith(networkWithFastCacheFallback(req, cacheKey, 850));
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
