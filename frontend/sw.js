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

// Cache basic assets for offline stability (Optional but good for PWA)
const CACHE_NAME = 'mtalk-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
