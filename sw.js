/* Service worker: lets the library be opened again without a network. Registered only on a deployed (https) site, never by serve.py (a test browser on localhost asks for it with localStorage 'zt.sw' = '1').
   - the page and its small files (vendor/, icons/): kept; the page itself (/ and /index.html, whatever follows the address) and manifest.js are answered AT ONCE from the kept copy and asked again from the network
     behind it: a changed one is kept and the open pages are told ('zt-shell-updated': they offer a refresh); nothing kept yet (the first visit) = the network; the other pages of the site are fetched first and the kept copy is the fallback;
   - documents that were opened (HTML, Markdown / TXT pages, small PDFs): kept as they are read, the newest 120;
   - never kept: anything with a Range request (the browser's PDF viewer), /api/, other sites, big files.
   Change VERSION when this file changes in a way that old kept copies must go. */
const VERSION = 'v3';
const SHELL = 'shell-' + VERSION, DOCS = 'docs-' + VERSION;
const INBOX = 'inbox';                                  // what other apps shared to this one, until the page has taken it: not tied to a version, so an update never loses it
const MAX_DOCS = 120, MAX_BYTES = 15 * 1024 * 1024, WAIT = 4000;
const PRECACHE = ['./', 'index.html', 'manifest.webmanifest', 'vendor/marked.min.js', 'vendor/purify.min.js', 'icons/favicon.svg', 'icons/favicon-32.png', 'icons/favicon-48.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n !== SHELL && n !== DOCS && n !== INBOX).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DOCS))) await cache.delete(k);      // the oldest go first
}

function keep(cacheName, request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const size = Number(response.headers.get('content-length') || 0);
  if (size > MAX_BYTES) return;
  const copy = response.clone();
  caches.open(cacheName).then(c => c.put(request, copy).then(() => cacheName === DOCS && trim(c))).catch(() => {});
}

function networkFirst(event, cacheName) {
  const req = event.request;
  return new Promise(resolve => {
    let settled = false;
    const fallback = () => caches.match(req, { ignoreSearch: false }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
    const timer = setTimeout(() => fallback().then(hit => { if (hit && !settled) { settled = true; resolve(hit); } }), WAIT);     // a slow network: show what was kept
    fetch(req).then(res => {
      keep(cacheName, req, res);
      if (!settled) { settled = true; clearTimeout(timer); resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      if (!settled) fallback().then(hit => { settled = true; resolve(hit || Response.error()); });
    });
  });
}

/* The shell = the page and the manifest.js it loads first. Kept under one key each (the address without what follows it), so /?share=1 and / are the same page. */
const SHELL_PATHS = ['/index.html', '/manifest.js'];
const shellKey = url => {
  const p = url.pathname === '/' ? '/index.html' : url.pathname;
  return SHELL_PATHS.includes(p) ? new Request(url.origin + p) : null;
};

async function digest(res) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', await res.clone().arrayBuffer()));
  return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
}
async function sameShell(a, b) {
  const ea = a.headers.get('etag'), eb = b.headers.get('etag');
  if (ea && eb && ea === eb) return true;                  // (a different etag is not believed alone: the bytes decide, so a re-deploy of the same file does not offer a refresh)
  return (await digest(a)) === (await digest(b));
}
async function tellPages(msg) {
  for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage(msg);
}
const plain = res => res.redirected ? res.clone().blob().then(b => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers })) : res;         // (a page answered with a redirected response is refused by the browser)

/* ask the network again; a changed shell file is kept and the open pages are told. Any failure = nothing happens (the kept copy goes on being used). */
async function shellRevalidate(cache, key, old) {
  try {
    const res = await fetch(key.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.status !== 200) return;
    if (old && await sameShell(old, res.clone())) return;
    await cache.put(key, await plain(res.clone()));
    if (old) await tellPages({ type: 'zt-shell-updated', file: key.url });
  } catch (e) { /* offline: the kept copy stays */ }
}

async function shellFirst(event, key) {
  try {
    const cache = await caches.open(SHELL), hit = await cache.match(key, { ignoreVary: true });
    if (hit) { event.waitUntil(shellRevalidate(cache, key, hit.clone())); return hit; }
    const res = await fetch(event.request);                               // the first visit: nothing kept yet, the network as it was
    if (res.status === 200 && !res.redirected) cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    return (event.request.mode === 'navigate' && await caches.match('index.html')) || Response.error();
  }
}

async function checkShell() {
  const cache = await caches.open(SHELL);
  for (const p of SHELL_PATHS) { const key = new Request(self.location.origin + p), old = await cache.match(key, { ignoreVary: true }); if (old) await shellRevalidate(cache, key, old); }
}
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'zt-check-shell') event.waitUntil(checkShell());          // the page came back after a while: look now, not at the next visit
});

function cacheFirst(event, cacheName) {
  return caches.match(event.request).then(hit => hit || fetch(event.request).then(res => { keep(cacheName, event.request, res); return res; }));
}

/* "Share to this app" (Android, once the site is installed; see share_target in manifest.webmanifest): the shared files and the shared address are put in the inbox cache and the
   browser is sent to the page, which asks where to put them. Nothing is sent anywhere. */
async function handleShare(req) {
  try {
    const form = await req.formData(), cache = await caches.open(INBOX), stamp = Date.now();
    let n = 0;
    for (const f of form.getAll('files')) {
      if (typeof f === 'string' || !f.size) continue;
      await cache.put('/__inbox/' + stamp + '-' + (n++), new Response(f, { headers: { 'x-name': encodeURIComponent(f.name || 'file'), 'content-type': f.type || 'application/octet-stream' } }));
    }
    const text = [form.get('url'), form.get('text')].map(v => String(v || '')).join(' ');
    const link = (text.match(/https?:\/\/[^\s<>"']+/) || [])[0];
    if (link) await cache.put('/__inbox/' + stamp + '-link', new Response(JSON.stringify({ url: link, title: String(form.get('title') || '') }), { headers: { 'x-kind': 'link', 'content-type': 'application/json' } }));
  } catch (e) { /* nothing usable was shared: the page opens anyway */ }
  return Response.redirect(self.location.origin + '/?share=1', 303);
}

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share-target') { event.respondWith(handleShare(req)); return; }
  if (req.method !== 'GET' || url.origin !== self.location.origin || req.headers.has('range')) return;
  const path = url.pathname;
  if (path.startsWith('/api/') || path === '/sw.js' || path === '/sitemap.xml' || path === '/robots.txt' || path.startsWith('/feed') || path.startsWith('/converted/')) return;     // (the texts of a search must not push the books out of the offline copies)
  if (path.startsWith('/vendor/') || path.startsWith('/icons/')) { event.respondWith(cacheFirst(event, SHELL)); return; }
  const key = shellKey(url);
  if (key && (req.mode === 'navigate' || path === '/manifest.js')) { event.respondWith(shellFirst(event, key)); return; }
  if (req.mode === 'navigate' || path === '/' || /(^|\/)(index\.html|manifest\.(json|js|webmanifest)|all\.html)$/.test(path)) { event.respondWith(networkFirst(event, SHELL)); return; }
  event.respondWith(networkFirst(event, DOCS));                                       // a document: fetched first, kept for next time
});
