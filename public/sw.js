/* Only public offline assets are cached. Mail, API responses and authenticated HTML stay network-only. */
const CACHE_NAME = 'agentic-inbox-pwa-v1';
const OFFLINE_URL = '/offline.html';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(OFFLINE_URL, { cache: 'reload' });
    if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('text/html') || !(await response.clone().text()).includes('agentic-inbox-offline')) {
      throw new Error('Offline page unavailable');
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.put(OFFLINE_URL, response);
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('agentic-inbox-pwa-') && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || event.request.mode !== 'navigate' || /^\/(api|agents|cdn-cgi)(\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const fallback = await (await caches.open(CACHE_NAME)).match(OFFLINE_URL);
    return fallback || new Response('Offline. Please reconnect and retry.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
