import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker(fetch) {
  const listeners = new Map(), stored = new Map(), deleted = [];
  let claimed = false, skipped = false;
  const cache = { put: async (key, value) => stored.set(key, value), match: async key => stored.get(key) };
  vm.runInNewContext(source, { URL, Response, fetch, caches: { open: async () => cache, keys: async () => ['other-app-cache', 'agentic-inbox-pwa-v0', 'agentic-inbox-pwa-v1'], delete: async key => deleted.push(key) }, self: { location: { origin: 'https://inbox.example.com' }, addEventListener: (name, callback) => listeners.set(name, callback), clients: { claim: async () => { claimed = true; } }, skipWaiting: () => { skipped = true; } } });
  return { listeners, stored, deleted, claimed: () => claimed, skipped: () => skipped };
}
function request(path, options = {}) { return { url: `https://inbox.example.com${path}`, method: 'GET', mode: 'navigate', ...options }; }
async function lifecycle(w, name) { let promise; w.listeners.get(name)({ waitUntil: value => { promise = value; } }); await promise; }
test('install caches only the verified public offline page', async () => {
  const w = worker(async () => new Response('<html data-page="agentic-inbox-offline">offline</html>', { headers: { 'Content-Type': 'text/html' } }));
  await lifecycle(w, 'install'); assert.deepEqual([...w.stored.keys()], ['/offline.html']);
});
test('install rejects a login page instead of caching it', async () => {
  const w = worker(async () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(lifecycle(w, 'install')); assert.equal(w.stored.size, 0);
});
test('API, agent, auth, non-GET, asset and external requests are never intercepted', () => {
  const w = worker(() => { throw new Error('should not fetch'); });
  for (const req of [request('/api/v1/mailboxes'), request('/agents/email-agent'), request('/cdn-cgi/access/login'), request('/mailbox', { method: 'POST' }), request('/assets/app.js', { mode: 'cors' }), request('/', { url: 'https://other.example.com/' })]) {
    w.listeners.get('fetch')({ request: req, respondWith: () => assert.fail('unexpected interception') });
  }
});
test('online authenticated navigation is fetched and never cached', async () => {
  const w = worker(async () => new Response('private mailbox'));
  let response; w.listeners.get('fetch')({ request: request('/mailbox/test@example.com/inbox'), respondWith: value => { response = value; } });
  assert.equal(await (await response).text(), 'private mailbox'); assert.equal(w.stored.size, 0);
});
test('offline navigation returns the public fallback without caching request data', async () => {
  const w = worker(async () => { throw new TypeError('offline'); });
  w.stored.set('/offline.html', new Response('offline fallback'));
  let response; w.listeners.get('fetch')({ request: request('/mailbox/private@example.com/inbox'), respondWith: value => { response = value; } });
  assert.equal(await (await response).text(), 'offline fallback'); assert.deepEqual([...w.stored.keys()], ['/offline.html']);
});
test('activation removes only old app caches and does not force an update', async () => {
  const w = worker(async () => new Response(''));
  await lifecycle(w, 'activate'); assert.deepEqual(w.deleted, ['agentic-inbox-pwa-v0']); assert.equal(w.claimed(), true); assert.equal(w.skipped(), false);
  w.listeners.get('message')({ data: { type: 'OTHER' } }); assert.equal(w.skipped(), false);
  w.listeners.get('message')({ data: { type: 'SKIP_WAITING' } }); assert.equal(w.skipped(), true);
});
test('manifest includes install identity, scoped launch and existing icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/site.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.id, '/'); assert.equal(manifest.scope, '/'); assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) assert.ok((await readFile(new URL(`../public${icon.src}`, import.meta.url))).length > 0);
});
