// === SnapPDF Service Worker ===
// Strategy: Cache-first for static assets, Network-first for pages

const CACHE_NAME = 'snapdf-v2';
const STATIC_CACHE = 'snapdf-static-v2';
const DYNAMIC_CACHE = 'snapdf-dynamic-v2';

// Shell resources to precache
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  '/images/logo.png',
];

// Cache durations
const STATIC_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const DYNAMIC_MAX_AGE = 24 * 60 * 60; // 1 day

// Install: precache essential shell resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Pre-caching shell resources');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      // Skip waiting so the new SW activates immediately
      return self.skipWaiting();
    })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map((name) => {
            console.log('[SW] Removing old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Claim all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch: route requests to appropriate caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Skip API requests and Next.js data requests — always go network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/data/')) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Next.js static chunks (_next/static/) — cache first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, STATIC_MAX_AGE));
    return;
  }

  // Static assets (images, fonts, icons)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, STATIC_MAX_AGE));
    return;
  }

  // HTML pages — network first with offline fallback
  event.respondWith(networkFirst(request, DYNAMIC_CACHE, DYNAMIC_MAX_AGE));
});

// === Caching Strategies ===

async function cacheFirst(request, cacheName, maxAge) {
  const cached = await caches.match(request);
  if (cached) {
    // Check age
    const dateHeader = cached.headers.get('sw-cache-date');
    if (dateHeader) {
      const age = (Date.now() - parseInt(dateHeader)) / 1000;
      if (age < maxAge) {
        return cached;
      }
    }
    // Stale but valid — return it and update in background
    updateCache(request, cacheName);
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cloned = response.clone();
      cloned.headers.set('sw-cache-date', Date.now().toString());
      const cache = await caches.open(cacheName);
      await cache.put(request, cloned);
    }
    return response;
  } catch (error) {
    // Network failed, try cache anyway (even if expired)
    const stale = await caches.match(request);
    if (stale) return stale;

    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request, cacheName, maxAge) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cloned = response.clone();
      cloned.headers.set('sw-cache-date', Date.now().toString());
      const cache = await caches.open(cacheName);
      await cache.put(request, cloned);
    }
    return response;
  } catch (error) {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // For navigation requests, serve offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/');
      if (offlinePage) return offlinePage;
    }

    return new Response('Offline — Please check your internet connection.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function updateCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cloned = response.clone();
      cloned.headers.set('sw-cache-date', Date.now().toString());
      const cache = await caches.open(cacheName);
      await cache.put(request, cloned);
    }
  } catch {
    // Background update failed — no action needed
  }
}

function isStaticAsset(pathname) {
  const staticExtensions = [
    '.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg',
    '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.json',
  ];
  return staticExtensions.some((ext) => pathname.endsWith(ext));
}

// === Message Handler ===
// Handle messages from the app (e.g., skip waiting, update)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});