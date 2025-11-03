const CACHE_NAME = 'bentopdf-cache-v1';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/about.html',
  '/contact.html',
  '/faq.html',
  '/privacy.html',
  '/terms.html',
  '/qpdf.wasm',
  '/images/favicon.png',
  '/images/favicon.svg',
  '/manifest.json',
  '/favicon.ico',
  // Add more assets if needed
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Runtime cache all /assets/* and /images/* files
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/images/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(response => {
          if (response) return response;
          return fetch(event.request)
            .then(networkResponse => {
              // Only cache successful, non-opaque responses
              if (networkResponse && networkResponse.ok && networkResponse.type !== 'opaque') {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => {
              // Fetch failed (offline or network error)
              // Optionally, return a fallback response here
              return new Response('Network error', { status: 408, statusText: 'Network error' });
            });
        })
      )
    );
    return;
  }

  // Default: cache-first for OFFLINE_URLS, network fallback
  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request).catch(() => new Response('Network error', { status: 408, statusText: 'Network error' }))
    )
  );
});
