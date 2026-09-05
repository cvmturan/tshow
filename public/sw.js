'use strict';

const SHELL_CACHE = 'tshow-shell-v9';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/legal.html',
  '/css/main.css?v=20260906-1',
  '/js/app.js?v=20260906-1',
  '/manifest.webmanifest',
  '/assets/tshow-logo.png',
  '/assets/tshow-icon-192.png',
  '/assets/tshow-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    const isAppRoute = url.pathname === '/' || url.pathname === '/index.html';
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isAppRoute && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => isAppRoute ? caches.match('/index.html') : Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && ['style', 'script', 'image'].includes(request.destination)) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
