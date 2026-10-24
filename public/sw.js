// App shell only: news generations and all user settings remain outside this cache.
const SHELL_VERSION = '__SIVREE_SHELL_VERSION__';
const SHELL_FILES = []; // Filled by build-static.mjs with exact versioned URLs.
const CACHE_NAME = `sivree-shell-${SHELL_VERSION}`;
const root = new URL('./', self.registration.scope);
const shellUrls = SHELL_FILES.map(path => new URL(path, root).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(shellUrls);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Retain the previous shell for tabs still using its versioned assets.
    const old = (await caches.keys()).filter(name => name.startsWith('sivree-shell-') && name !== CACHE_NAME);
    await Promise.all(old.slice(0, -1).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== root.origin) return;
  const navigation = event.request.mode === 'navigate' && [root.pathname, `${root.pathname}index.html`].includes(url.pathname);
  const key = navigation ? new URL(`index.html?v=${SHELL_VERSION}`, root).href : url.href;
  if (!navigation && !shellUrls.some(href => new URL(href).pathname === url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(key);
    return cached || await caches.match(key) || fetch(event.request);
  })());
});
