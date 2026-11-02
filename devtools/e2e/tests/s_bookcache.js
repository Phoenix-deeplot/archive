// e2e: the shared copy of the chapters of the picked books. A chapter is looked for in this browser, then on the server (/api/book: Redis, then the long-term layer), and only then on the original page;
// what is read is kept in this browser (and, for a book that may be kept, on the server). A book that may not be kept on a server is read through /api/feed and kept in this browser only. When the server
// is down or answers something odd the original page is read as before. The foot of a chapter says the licence.
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', SITE = 'http://127.0.0.1:8850', SVC = 'http://127.0.0.1:8840', DIRF = P.DIST + '/dir/directory.json';
let pass = 0, fail = 0, base = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };
const siteLog = async () => (await (await fetch(SITE + '/__log')).json()).slice(base);
const get = async p => (await fetch(SVC + p)).json();

const CH = { s: '127.0.0.1:8850', p: 'Tale/', n: ['Chapter 1', 'Chapter 2', 'Chapter 3'] };
const book = (id, title, bid, license, extra) => ({ id, title, summary: title + '：一本made-up的书。', url: SITE + '/wiki/Tale', image: '', date: '', type: 'book', lang: 'en', tags: ['小说', '在线书籍'], shelf: 'books', author: 'A. Writer', license, bid, ch: CH, ...extra });
const BOOKS = [book('tale0001', 'The Tale', 'tale', 'public-domain'), book('closed01', 'The Closed Book', 'closed', 'cc-by-nc')];
const addBooks = () => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.shelves.push({ id: 'books', name: '精选图书', description: '人工挑选的、可以免费阅读的书和刊物', home: '', kind: 'books', lang: '', license: '', tags: [], n: BOOKS.length, updated: '2026-10-22', feed: '', status: 'ok', featured: true, rights: 'licensed' });
  d.items.push(...BOOKS); d.count = d.items.length;
  fs.writeFileSync(DIRF, JSON.stringify(d));
};

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const asked = { book: [], feed: [] };
  c.on(m => { if (m.method === 'Network.requestWillBeSent') { const u = m.params.request.url; if (/\/api\/book\?/.test(u)) asked.book.push(u); if (/\/api\/feed$/.test(u)) asked.feed.push(u); } });
  const J = expr => c.js(`(()=>{ const {state,LS,render,itemById}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async (clear = true) => {
    await c.goto('about:blank', 200); if (clear) await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('zh')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1')`);
    await c.goto(BASE, 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
    await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await sleep(600);
  };
  const card = title => `[...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes(${JSON.stringify(title)}))`;
  const openChapter = async (title, i) => {                                                          // the book's window, then a chapter; -> what the reader shows once the text is there
    await J(`${card(title)}.querySelector('.card-title a').click()`); await sleep(500);
    await J(`document.querySelector('#bookDlg [data-bo-ch="${i}"]').click()`);
    for (let k = 0; k < 30; k++) { await sleep(400); const n = await J(`((document.querySelector('#frame').contentDocument||{body:{textContent:''}}).body.textContent||'').length`); if (n > 200) break; }
    return J(`(()=>{ const it=itemById(state.readingId)||{}; const t=(document.querySelector('#frame').contentDocument||{body:{textContent:''}}).body.textContent; return {tier:it.bkTier, text:t, title:document.querySelector('#readerTitle').textContent}; })()`);
  };
  const back = async () => { await J(`document.querySelector('#readerBack').click()`); await sleep(500); await J(`document.querySelector('#bookClose') && document.querySelector('#bookDlg').open && document.querySelector('#bookClose').click()`); await sleep(300); };

  await get('/__book_reset');
  addBooks(); base = (await (await fetch(SITE + '/__log')).json()).length;
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ the first reader: the original page is read, the copy is made
  await fresh();
  const a = await openChapter('The Tale', 0);
  let st = await get('/__book_state');
  ok('the first reader of a chapter makes the server read the original (once) and the page shows it', a.tier === 'source' && /first chapter, and the lamps/.test(a.text) && (await siteLog()).filter(l => l.path === '/wiki/Tale/Chapter_1').length === 1, [a.tier, await siteLog()]);
  ok('the copy is kept in the hot layer and, as the book is a kept one, in the long-term layer', st.hot.includes('bk:1:tale:0') && st.durable.includes('tale:0'), st);
  ok('the foot of the chapter says the licence, where it is from, where THIS reading came from (the original, just now), and the way to the original', /授权：公有领域 · 来源：127\.0\.0\.1 · 这一章来自：刚从原站读取/.test(a.text) && /阅读原文/.test(a.text), a.text.slice(-200));
  await c.shot(P.SHOTS + '/bookcache_foot.png');
  await back();

  // ------------------------------------------------ the same browser again: nothing is asked at all
  asked.book.length = 0; asked.feed.length = 0;
  await fresh(false);                                                                                 // (the page is loaded again; what this browser keeps stays)
  const b = await openChapter('The Tale', 0);
  ok('the same chapter again in this browser: from this browser (no request to /api/book, none to /api/feed, none to the site; the foot says so)', b.tier === 'local' && /这一章来自：这个浏览器里的副本/.test(b.text) && asked.book.length === 0 && asked.feed.length === 0 && (await siteLog()).filter(l => l.path === '/wiki/Tale/Chapter_1').length === 1, [b.tier, asked, await siteLog()]);
  await back();

  // ------------------------------------------------ another reader (a browser that has nothing): the server's copy, the original is not asked
  asked.book.length = 0; asked.feed.length = 0;
  await fresh(true);
  const d = await openChapter('The Tale', 0);
  ok('another reader gets the server\'s copy: one request to /api/book, none to /api/feed, and the original site is not asked again (the foot says so)', d.tier === 'hot' && /这一章来自：服务器上的副本/.test(d.text) && asked.book.length === 1 && asked.feed.length === 0 && (await siteLog()).filter(l => l.path === '/wiki/Tale/Chapter_1').length === 1 && /first chapter, and the lamps/.test(d.text), [d.tier, asked, await siteLog()]);
  await back();

  // ------------------------------------------------ Redis forgot it: the long-term layer answers
  await get('/__book_reset?hot=1');
  asked.book.length = 0;
  await fresh(true);
  const e = await openChapter('The Tale', 0);
  st = await get('/__book_state');
  ok('when the hot layer has forgotten the chapter the long-term layer answers (and the hot one has it again); the original is still not asked', e.tier === 'durable' && st.hot.includes('bk:1:tale:0') && (await siteLog()).filter(l => l.path === '/wiki/Tale/Chapter_1').length === 1, [e.tier, st]);
  await back();

  // ------------------------------------------------ a book that may not be kept on a server
  await get('/__book_reset');
  asked.book.length = 0; asked.feed.length = 0; base = (await (await fetch(SITE + '/__log')).json()).length;
  await fresh(true);
  const f = await openChapter('The Closed Book', 0);
  st = await get('/__book_state');
  ok('a book that may not be kept (licence CC BY-NC) is asked of /api/book once, answered "nocache", then read through /api/feed; nothing is kept on the server', f.tier === 'feed' && asked.book.length === 1 && asked.feed.length >= 1 && st.hot.length === 0 && st.durable.length === 0 && /first chapter, and the lamps/.test(f.text), [f.tier, asked, st]);
  await J(`document.querySelector('#readerNext').click()`); await sleep(2500);
  ok('the next chapter of that book does not ask /api/book again in this visit', asked.book.length === 1 && (await J(`itemById(state.readingId).bkTier`)) === 'feed', asked);
  await back();
  asked.book.length = 0; asked.feed.length = 0;
  await fresh(false);
  const g = await openChapter('The Closed Book', 0);
  ok('...but this browser keeps it for itself: opened again, it comes from this browser', g.tier === 'local' && asked.feed.length === 0, [g.tier, asked]);
  await back();

  // ------------------------------------------------ the server is down, or answers something odd: the original page, as before
  for (const mode of ['down', 'junk']) {
    await get('/__book_reset?mode=' + mode);
    asked.book.length = 0; asked.feed.length = 0;
    await fresh(true);
    const h = await openChapter('The Tale', 2);
    ok(`the server ${mode === 'down' ? 'is down (503)' : 'answers something that is not JSON'}: the chapter is read through /api/feed all the same`, h.tier === 'feed' && asked.book.length === 1 && /third chapter, and the bridge/.test(h.text), [h.tier, asked]);
    await back();
  }
  await get('/__book_reset');

  // ------------------------------------------------ a phone
  await c.mobile(390, 780, 3); await sleep(400);
  await fresh(true);
  const m = await openChapter('The Tale', 1);
  ok('on a phone too: the chapter comes (from the server\'s copy or the original) and the foot says the licence', /second chapter, and the travellers/.test(m.text) && /授权：公有领域/.test(m.text), [m.tier, m.text.slice(-120)]);
  await c.desktop(1280, 900, 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); process.exit(2); });
