const CACHE_NAME = 'card-clash-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/logo.svg',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  // Network first for API/PeerJS, Cache first for assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});