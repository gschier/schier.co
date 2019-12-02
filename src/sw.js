const cacheName = 'schier.co';
const filesToCache = [
  '/static/build/index.css',
  '/static/build/index.js',
  '/static/build/images/me.jpg',
  '/static/build/images/greg.png',
  '/static/build/images/greg-large.png',
  '/static/build/images/icons/insomnia.png',
  '/static/build/images/icons/toread.png',
  '/static/build/images/icons/forkjoy.png',
  '/static/build/images/icons/platformpixels.png',
  '/static/build/images/icons/hemlock.png',
  '/static/build/images/icons/plans4ramps.png',
  '/static/build/favicon/favicon.ico',
  '/static/build/favicon/site.webmanifest',
  '/static/build/favicon/android-chrome-192x192.png',
];

self.addEventListener('install', function (e) {
  console.log('[ServiceWorker] Install');

  e.waitUntil(
    caches.open(cacheName).then(function (cache) {
      console.log('[ServiceWorker] Caching app shell', { filesToCache });
      return cache.addAll(filesToCache);
    })
  );
});

self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(response => {
      console.log('[ServiceWorker] Served', event.request.url);
      return response || fetch(event.request);
    })
  );
});
