/* Mouth-Talk Service Worker */
self.addEventListener('push', function(event) {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: data.icon || 'https://t3.ftcdn.net/jpg/06/76/63/78/360_F_676637882_ywOxjtsIXUK79F6lKVtXAwYiI9zZ2h3H.jpg',
            badge: 'https://t3.ftcdn.net/jpg/06/76/63/78/360_F_676637882_ywOxjtsIXUK79F6lKVtXAwYiI9zZ2h3H.jpg',
            vibrate: [100, 50, 100],
            data: {
                url: data.data.url
            }
        };
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});

// Cache basic assets for offline stability and instant second load
const CACHE_NAME = 'mtalk-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/performance.css',
  '/assets/css/interactive-heading.css',
  '/assets/css/premium-buttons.css',
  '/assets/css/responsive.css',
  '/assets/css/nav-search.css',
  '/assets/css/notifications.css',
  '/assets/css/beast-mode.css',
  '/assets/js/interactive-heading.js',
  '/assets/js/premium-buttons.js',
  '/assets/js/notifications.js',
  '/assets/js/nav-search.js',
  '/assets/js/responsive.js',
  '/assets/images/land.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Do not cache API requests or non-GET requests
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Cache-first for Fonts and Images
  if (
    url.host.includes('fonts.gstatic.com') ||
    url.host.includes('fonts.googleapis.com') ||
    event.request.destination === 'font' ||
    event.request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Stale-While-Revalidate for CSS, JS, and HTML
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
        }
        return networkResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
