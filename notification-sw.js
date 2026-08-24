self.GEN_SHELL_CACHE = 'gen2-shell-v2';
self.GEN_CONTENT_CACHE = 'gen2-content-v2';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(self.GEN_SHELL_CACHE);
    await cache.addAll([
      './index.html',
      './manifest.webmanifest',
      './aaglobal/style.css',
      './aaglobal/sidebar.css',
      './aaglobal/site-polish.css',
      './aaglobal/sidebar.js',
      './aaglobal/offline-manager.js',
      './perfil/sin-conexion.html',
      './perfil/sin-conexion.css',
      './perfil/sin-conexion.js',
      './perfil/sin-conexion-no-disponible.html',
      './aadocumentos/imagenes/icono-gen-192.png',
      './aadocumentos/imagenes/icono-gen-512.png'
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('gen2-') && ![self.GEN_SHELL_CACHE, self.GEN_CONTENT_CACHE].includes(name))
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

function isCacheableRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return url.hostname === 'www.gstatic.com' || url.hostname === 'cdnjs.cloudflare.com';
  }
  if (url.pathname.includes('/admin/') || url.pathname.includes('/functions/')) return false;
  if (/\.(apk|mp3|pdf|docx?|xlsx?|pptx?|zip)$/i.test(url.pathname)) return false;
  return true;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (!isCacheableRequest(request)) return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(self.GEN_CONTENT_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(request))
          || (await caches.match('./perfil/sin-conexion-no-disponible.html'))
          || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    if (/\.(?:js|css)$/i.test(url.pathname)) {
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) {
          const cache = await caches.open(self.GEN_CONTENT_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match(request)) || Response.error();
      }
    }
    if (/\.json$/i.test(url.pathname)) {
      const cache = await caches.open(self.GEN_CONTENT_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(request)) || Response.error();
      }
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(self.GEN_CONTENT_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type === 'GEN_CLEAR_OFFLINE') {
    event.waitUntil((async () => {
      await caches.delete(self.GEN_CONTENT_CACHE);
      event.ports?.[0]?.postMessage({ cleared: true });
    })());
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }
  const title = payload.title || 'Página Gen 2';
  const options = {
    body: payload.body || 'Tenés una novedad en Gen 2.',
    icon: new URL('aadocumentos/imagenes/icono-gen-192.png', self.registration.scope).href,
    badge: new URL('aadocumentos/imagenes/icono-gen-192.png', self.registration.scope).href,
    image: payload.image ? new URL(payload.image, self.registration.scope).href : undefined,
    tag: payload.tag || 'gen2-notification',
    renotify: Boolean(payload.renotify),
    data: { url: payload.url || 'index.html' }
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    if (self.navigator?.setAppBadge) await self.navigator.setAppBadge(Number(payload.badge || 1));
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || './index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const openClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = openClients.find(client => client.url === destination);
    if (existing) {
      await existing.focus();
      if (self.navigator?.clearAppBadge) await self.navigator.clearAppBadge();
      return;
    }
    await clients.openWindow(destination);
    if (self.navigator?.clearAppBadge) await self.navigator.clearAppBadge();
  })());
});
