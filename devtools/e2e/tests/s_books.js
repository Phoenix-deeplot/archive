// e2e: the picked books of the directory ("精选图书"): the card says the chapters and the licence, a book with chapters opens in a window with its chapters, a chapter is read in the page,
// previous / next walk the chapters, closing the reader just closes it (the window does not come back), the chapter you got to is remembered; a book that is one page is read at once, any other opens on its own site;
// English; a phone
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', SITE = 'http://127.0.0.1:8850', DIRF = P.DIST + '/dir/directory.json';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };
let base = 0;
const log = async () => (await (await fetch(SITE + '/__log')).json()).slice(base);

const book = (id, title, extra) => ({ id, title, summary: title + '：一本made-up的书，用来试页面。', url: SITE + '/wiki/' + id, image: '', date: '', type: 'book', lang: 'en', tags: ['小说', '在线书籍'], shelf: 'books', author: 'A. Writer', license: 'public-domain', ...extra });
const BOOKS = [
  book('tale0001', 'The Tale', { url: SITE + '/wiki/Tale', ch: { s: '127.0.0.1:8850', p: 'Tale/', n: ['Chapter 1', 'Chapter 2', 'Chapter 3'] } }),
  book('onepage01', 'One Page Book', { url: SITE + '/a/2', tags: ['随笔', '在线书籍'] }),                                   // (no chapters, but its page can be read)
  book('journal01', 'An Open Journal', { url: 'https://example.org/journal', tags: ['期刊', '科学'], license: 'cc-by', author: '' }),         // (only on its own site)
];
const addBooks = () => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.shelves.push({ id: 'books', name: '精选图书', description: '人工挑选的、可以免费阅读的书和刊物', home: '', kind: 'books', lang: '', license: '', tags: [], n: BOOKS.length, updated: '2026-10-22', feed: '', status: 'ok', featured: true, blurb: '人工挑选的、可以免费阅读的书和刊物', rights: 'licensed' });
  d.items.push(...BOOKS); d.count = d.items.length;
  fs.writeFileSync(DIRF, JSON.stringify(d));
};

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,render,openReader,itemById}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async lang => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500); await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1')`); await c.goto(BASE, 2500); };
  const toBooks = async () => { await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800); await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await sleep(600); };
  const card = title => `[...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes(${JSON.stringify(title)}))`;
  const meta = title => J(`${card(title)}.querySelector('.xmeta').textContent`);
  const dlg = () => J(`(()=>{ const d=document.querySelector('#bookDlg'); return {open:d.open, title:document.querySelector('#bookTitle').textContent, sub:document.querySelector('#bookSub').textContent, chs:[...d.querySelectorAll('.bo-ch')].map(b=>b.textContent), cur:[...d.querySelectorAll('.bo-ch')].findIndex(b=>b.getAttribute('aria-current')==='true'), start:document.querySelector('#bookStart').textContent, facts:document.querySelector('#bookFacts').textContent, orig:document.querySelector('#bookOrig').href}; })()`);
  const rd = () => J(`({open:!document.querySelector('#reader').hidden, title:document.querySelector('#readerTitle').textContent, pos:document.querySelector('#readerPos').textContent, text:(document.querySelector('#frame').contentDocument||{body:{textContent:''}}).body.textContent, prev:document.querySelector('#readerPrev').disabled, next:document.querySelector('#readerNext').disabled, hash:location.hash})`);

  addBooks(); base = (await (await fetch(SITE + '/__log')).json()).length;                      // (the log of the site may hold earlier runs)
  await c.desktop(1280, 900, 1);
  await fresh('zh'); await toBooks();

  // ------------------------------------------------ the cards
  ok('the shelf of the picked books shows its three books', (await J(`[...document.querySelectorAll('#grid .card .card-title a')].map(a=>a.textContent)`)).sort().join('|') === 'An Open Journal|One Page Book|The Tale');
  const m1 = await meta('The Tale'), m2 = await meta('One Page Book'), m3 = await meta('An Open Journal');
  ok('a book with chapters says how many; no card says its licence, its type or its shelf (the licence is in the window and under the chapter)', /3 章/.test(m1) && !/章/.test(m2) && ![m1, m2, m3].some(m => /公有领域|CC BY|书籍|精选图书/.test(m)), [m1, m2, m3]);
  await c.shot(P.SHOTS + '/books_cards.png');

  // ------------------------------------------------ a book with chapters: its window
  await J(`window.__opened=[]; window.open=function(u){ window.__opened.push(u); return null; }; 0`);
  await J(`${card('The Tale')}.querySelector('.card-title a').click()`); await sleep(500);
  const d1 = await dlg();
  ok('a click opens the window of the book, not the reader and not a new tab', d1.open && !(await rd()).open && (await J('window.__opened.length')) === 0, d1);
  ok('the window has the title, author, chapter count, the licence, three chapters, the start button and the original', d1.title === 'The Tale' && /A\. Writer/.test(d1.sub) && /3 章/.test(d1.sub) && /公有领域/.test(d1.facts) && d1.chs.join('|') === 'Chapter 1|Chapter 2|Chapter 3' && d1.start === '从头开始读' && d1.orig === SITE + '/wiki/Tale', d1);
  await c.shot(P.SHOTS + '/books_dialog.png');

  // ------------------------------------------------ read a chapter, then walk
  await J(`document.querySelector('#bookDlg [data-bo-ch="1"]').click()`); await sleep(3500);
  const r2 = await rd();
  ok('chapter 2 is read in the page (the window is gone, the title says book and chapter, the text is there, "2 / 3")', r2.open && !(await dlg()).open && r2.title === 'The Tale · Chapter 2' && /second chapter, and the travellers/.test(r2.text) && r2.pos === '2 / 3' && /^#read\//.test(r2.hash), r2);
  ok('the page asked the site for that chapter only', (await log()).some(l => l.path === '/wiki/Tale/Chapter_2') && !(await log()).some(l => l.path === '/wiki/Tale/Chapter_1'));
  await c.shot(P.SHOTS + '/books_reader.png');
  await J(`document.querySelector('#readerNext').click()`); await sleep(3500);
  const r3 = await rd();
  ok('next is chapter 3, and there is no next after the last', r3.title === 'The Tale · Chapter 3' && /third chapter, and the bridge/.test(r3.text) && r3.pos === '3 / 3' && r3.next && !r3.prev, r3);
  await J(`document.querySelector('#readerBack').click()`); await sleep(700);
  const d2a = await dlg();
  ok('closing the reader just closes it: no window of the chapters comes back', !(await rd()).open && !d2a.open, d2a);
  await J(`${card('The Tale')}.querySelector('.card-title a').click()`); await sleep(500);
  const d2 = await dlg();
  ok('the window of the book (from its card) has the place marked and "continue" on the button', d2.open && d2.cur === 2 && d2.start === '继续读：Chapter 3', d2);
  ok('this browser remembers the chapter (in the progress, as the place in the book: the sync carries it)', (await J(`state.progress['bk:tale0001'].i`)) === 2);
  await J(`document.querySelector('#bookStart').click()`); await sleep(3000);
  await J(`document.querySelector('#readerPrev').click()`); await sleep(3000);
  const r4 = await rd();
  ok('"continue" opens chapter 3 and previous goes back to chapter 2 (the pages are kept: nothing is fetched twice)', r4.title === 'The Tale · Chapter 2' && r4.pos === '2 / 3' && (await log()).filter(l => l.path === '/wiki/Tale/Chapter_2').length === 1, r4);
  await J(`document.querySelector('#readerBack').click()`); await sleep(700);
  await J(`document.querySelector('#bookClose').click()`); await sleep(300);
  ok('the window closes with its button', !(await dlg()).open && !(await rd()).open);

  // ------------------------------------------------ a book that is one page; a book that is only on its own site
  await J(`${card('One Page Book')}.querySelector('.card-title a').click()`); await sleep(3500);
  const r5 = await rd();
  ok('a book that is one page is read at once, in the reader', r5.open && !(await dlg()).open && /Lead time is the gap/.test(r5.text), r5);
  ok('its previous / next do not lead into a book with chapters', !(await J(`state.visible.some(id=>/~\\d+$/.test(id))`)));
  await J(`document.querySelector('#readerBack').click()`); await sleep(700);
  await J(`window.__opened=[]; ${card('An Open Journal')}.querySelector('.card-title a').click()`); await sleep(500);
  ok('a book that has only its own site opens there, in a new tab', !(await rd()).open && !(await dlg()).open && (await J('window.__opened')).join() === 'https://example.org/journal', await J('window.__opened'));

  // ------------------------------------------------ the keyboard and a click outside
  await J(`${card('The Tale')}.querySelector('.card-title a').click()`); await sleep(500);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300);
  ok('Esc closes the window', !(await dlg()).open);
  await J(`${card('The Tale')}.querySelector('.card-title a').click()`); await sleep(400);
  await J(`document.querySelector('#bookDlg').dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await sleep(300);
  ok('a click outside the window closes it', !(await dlg()).open);

  // ------------------------------------------------ English
  await fresh('en'); await toBooks();
  const en = await meta('The Tale');
  await J(`${card('The Tale')}.querySelector('.card-title a').click()`); await sleep(500);
  const de = await dlg();
  ok('English: "3 chapters" on the card (no licence there), "Public domain" in the window, "Start reading", the note under the chapters', /3 chapters/.test(en) && !/Public domain/.test(en) && /3 chapters/.test(de.sub) && /Public domain/.test(de.facts) && de.start === 'Start reading' && /Previous \/ Next/.test(await J(`document.querySelector('.bo-note').textContent`)) && !/Closing the reader/.test(await J(`document.querySelector('.bo-note').textContent`)), [en, de]);

  // ------------------------------------------------ a phone
  await c.mobile(390, 780, 3); await sleep(500);
  const ph = await J(`(()=>{ const d=document.querySelector('#bookDlg'), r=d.getBoundingClientRect(), b=d.querySelector('.bo-ch').getBoundingClientRect(); return {open:d.open, w:Math.round(r.width), left:Math.round(r.left), right:Math.round(r.right), vw:innerWidth, bh:Math.round(b.height), overflow:document.documentElement.scrollWidth>innerWidth}; })()`);
  ok('on a phone the window fits the screen and a chapter is a finger-sized button', ph.open && ph.left >= 0 && ph.right <= ph.vw && ph.bh >= 36 && !ph.overflow, ph);
  await c.shot(P.SHOTS + '/books_phone.png');
  await J(`document.querySelector('#bookDlg [data-bo-ch="0"]').click()`); await sleep(3500);
  const pr = await rd();
  ok('on a phone a chapter opens in the reader, with the bar of previous / next', pr.open && /Chapter 1/.test(pr.title) && (await J(`!document.querySelector('#readerMobileNav').hidden`)), pr);
  await c.desktop(1280, 900, 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); process.exit(2); });
