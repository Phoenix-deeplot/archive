/* Service worker: lets the library be opened again without a network. Registered only on a deployed (https) site, never by serve.py.
   - the page and its small files (vendor/, icons/): kept; the page itself and the library's manifest are fetched first and the kept copy is the fallback;
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
  if (path.startsWith('/api/') || path === '/sw.js' || path === '/sitemap.xml' || path === '/robots.txt' || path.startsWith('/feed')) return;
  if (path.startsWith('/vendor/') || path.startsWith('/icons/')) { event.respondWith(cacheFirst(event, SHELL)); return; }
  if (req.mode === 'navigate' || path === '/' || /(^|\/)(index\.html|manifest\.(json|js|webmanifest)|all\.html)$/.test(path)) { event.respondWith(networkFirst(event, SHELL)); return; }
  event.respondWith(networkFirst(event, DOCS));                                       // a document: fetched first, kept for next time
});
