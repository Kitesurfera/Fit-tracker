// Service worker de AM Coaching: guarda la app en el dispositivo para que abra rápido y sin conexión,
// y muestra las notificaciones (al final del archivo).
// - Páginas: primero internet (siempre la última versión); sin conexión, la copia guardada.
// - Código, imágenes y fuentes (/_expo, /assets, /icons): la copia guardada; sus nombres cambian en cada versión.
// - Las peticiones a otros dominios (servidor de datos en Render, Cloudinary) no se tocan.

const VERSION = 'v1';
const PAGES_CACHE = `pages-${VERSION}`;
const STATIC_CACHE = `static-${VERSION}`;
const MAX_STATIC_ENTRIES = 150;

const PAGES = [
  '/', '/home', '/calendar', '/tests', '/analytics', '/settings',
  '/training-mode', '/test-mode', '/athlete-detail', '/add-workout', '/edit-workout',
  '/add-test', '/periodization', '/progress',
];

const isStatic = (url) =>
  url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/') ||
  url.pathname.startsWith('/icons/') || url.pathname === '/favicon.ico' || url.pathname === '/manifest.json';

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i]);
}

async function cacheStatic(urls) {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(urls.map(async (u) => {
    if (await cache.match(u)) return;
    try {
      const res = await fetch(u);
      if (res.ok) await cache.put(u, res);
    } catch (e) {}
  }));
  await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const pages = await caches.open(PAGES_CACHE);
    await Promise.all(PAGES.map((p) => pages.add(new Request(p, { cache: 'reload' })).catch(() => {})));
    // El código que carga la página principal también se guarda desde el primer momento
    try {
      const html = await (await pages.match('/')).text();
      const assets = [...html.matchAll(/(?:src|href)="(\/_expo\/[^"]+)"/g)].map((m) => m[1]);
      await cacheStatic(assets);
    } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [PAGES_CACHE, STATIC_CACHE];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

// La página avisa de lo que ya ha descargado (fuentes, imágenes) para guardarlo también
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    const urls = event.data.urls.filter((u) => isStatic(new URL(u, self.location.origin)));
    event.waitUntil(cacheStatic(urls));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(PAGES_CACHE).then((c) => c.put(url.pathname, copy));
        }
        return res;
      } catch (e) {
        return (await caches.match(url.pathname, { ignoreSearch: true })) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (isStatic(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).then(() => trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES));
      }
      return res;
    })());
  }
});

// --- NOTIFICACIONES ---
// El servidor manda {title, body, url, tag}. Se muestran aunque la app esté cerrada.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'AM Coaching';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,          // si sustituye a otra del mismo tipo, vuelve a sonar
    lang: 'es',
    data: { url: data.url || '/' },
  }));
});

// Al tocar la notificación: abre la app en la pantalla del aviso (si ya estaba abierta, la trae delante)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  const path = url.pathname + url.search;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find((c) => new URL(c.url).origin === self.location.origin);
    if (app) {
      await app.focus().catch(() => {});
      app.postMessage({ type: 'OPEN_URL', url: path });
      return;
    }
    await self.clients.openWindow(path);
  })());
});
