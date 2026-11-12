// =====================================================================
// Service Worker اختصاصی سامانه برائت (گروه حقوقی برائت)
// قابلیت کارکرد کامل آفلاین + دریافت همیشگی نسخه جدید کدها هنگام آنلاین بودن
// =====================================================================

const CACHE_NAME = 'baraat-cache-v7';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './baraat_engine.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        ASSETS_TO_CACHE.map(asset =>
          cache.add(new Request(asset, { cache: 'reload' })).catch(err => {
            console.warn('Pre-cache notice for ' + asset + ':', err);
          })
        )
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') {
    return;
  }

  // Google fonts and CDN assets: Cache-First
  if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com') || url.origin.includes('jsdelivr.net')) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Only handle same-origin internal requests below
  if (url.origin !== self.location.origin) {
    return;
  }

  // HTML, JS, CSS, and Navigation: Network-First (never serve stale UI/logic when online)
  const isCodeOrDoc =
    req.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('/');

  if (isCodeOrDoc) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || caches.match('./index.html') || caches.match('./');
      })
    );
    return;
  }

  // Static images/icons/manifest: Stale-While-Revalidate
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cachedResponse => {
      const fetchPromise = fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, responseToCache));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
