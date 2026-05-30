/**
 * Service Worker — estrategias de caché DESACTIVADAS en desarrollo.
 * Para reactivar: descomentar el bloque inferior y volver a registrar en manifest.js
 */

/*
const CACHE_NAME = 'onneb-pos-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/theme.css',
  '/css/app.css',
  '/css/sidebar.css',
  '/css/pace.css',
  '/js/pace-init.js',
  '/js/F.js',
  '/js/db.js',
  '/js/manifest.js',
  '/js/app.js',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
*/

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', () => {});
