// e2e: reading a picked book (R1, the reading mode): the name and title of a chapter, the chapters panel (the whole book, the place, what is read), the way on at the end of a chapter (and the labels of
// previous / next that are about chapters), the next chapter fetched in advance (once), the place that is remembered (the chapter and how far into it: it comes back after a reload, with "continue" in the
// window of the book), the options of reading (font, spacing, indent, justify: nothing changes while they are at their defaults), on a phone a tap in the middle and no swipe between chapters
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', SITE = 'http://127.0.0.1:8850', SVC = 'http://127.0.0.1:8840', DIRF = P.DIST + '/dir/directory.json';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };
const get = async p => (await fetch(SVC + p)).json();

const CH = { s: '127.0.0.1:8850', p: 'Tale/', n: ['Chapter 1', 'Chapter 2', 'Chapter 3'], t: ['The lamps', 'The river', 'The bridge'] };
const TALE = { id: 'tale0001', title: 'The Tale', summary: 'The Tale：一本made-up的书。', url: SITE + '/wiki/Tale', image: '', date: '', type: 'book', lang: 'en', tags: ['小说', '在线书籍'], shelf: 'books', author: 'A. Writer', license: 'public-domain', bid: 'tale', ch: CH };
const addBooks = () => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.shelves.push({ id: 'books', name: '精选图书', description: '人工挑选的、可以免费阅读的书和刊物', home: '', kind: 'books', lang: '', license: '', tags: [], n: 1, updated: '2026-10-22', feed: '', status: 'ok', featured: true, rights: 'licensed' });
  d.items.push(TALE); d.count = d.items.length;
  fs.writeFileSync(DIRF, JSON.stringify(d));
};

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const asked = [];
  c.on(m => { if (m.method === 'Network.requestWillBeSent' && /\/api\/book\?/.test(m.params.request.url)) asked.push(m.params.request.url.replace(/^.*\?/, '')); });
  const J = async expr => { try { return await c.js(`(()=>{ const {state,LS,render,itemById}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`); } catch (e) { throw new Error(e.message + '  IN: ' + expr.slice(0, 160)); } };
  const fresh = async (clear = true, lang = 'zh') => {
    await c.goto('about:blank', 200); if (clear) await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1')`);
    await c.goto(BASE, 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
    await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await sleep(600);
  };
  const frameText = () => J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return d && d.body ? (d.body.textContent||'') : ''; })()`);
  const waitText = async (re, ms = 14000) => { const t0 = Date.now(); for (;;) { const t = await frameText(); if (re.test(t) || Date.now() - t0 > ms) return t; await sleep(300); } };
  const openBookWindow = async () => { await J(`[...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes('The Tale')).querySelector('.card-title a').click()`); await sleep(500); };
  const openChapter = async (i, re) => { await openBookWindow(); await J(`document.querySelector('#bookDlg [data-bo-ch="${i}"]').click()`); return waitText(re || /bright|chapter, and/); };
  const dlg = () => J(`(()=>{ const d=document.querySelector('#bookDlg'); return {open:d.open, sub:document.querySelector('#bookSub').textContent, start:document.querySelector('#bookStart').textContent, hasT:d.querySelector('#bookChs').classList.contains('has-t'), labels:[...d.querySelectorAll('.bo-ch')].map(b=>b.textContent), done:[...d.querySelectorAll('.bo-ch.done')].map(b=>b.dataset.boCh), cur:[...d.querySelectorAll('.bo-ch')].findIndex(b=>b.getAttribute('aria-current')==='true')}; })()`);
  const rd = () => J(`({open:!document.querySelector('#reader').hidden, title:document.querySelector('#readerTitle').textContent, pos:document.querySelector('#readerPos').textContent, h1:(()=>{ const d=document.querySelector('#frame').contentDocument, h=d&&d.body?d.querySelector('h1'):null; return h?h.textContent:''; })(), prev:document.querySelector('#readerPrev .lbl').textContent, next:document.querySelector('#readerNext .lbl').textContent})`);
  const scrollTo = async pct => { await J(`window.__zt.goPct(${pct})`); await sleep(500); };                // (a book is in pages: to the page that has that place of the text)
  const where = () => J(`document.querySelector('#rbInfo').textContent`);
  const back = async () => { await J(`document.querySelector('#readerBack').click()`); await sleep(500); await J(`document.querySelector('#bookDlg').open && document.querySelector('#bookClose').click()`); await sleep(300); };
  const place = () => J(`state.progress['bk:tale0001']`);

  await get('/__book_reset');
  addBooks();
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ the window of a book, the name of a chapter
  await fresh();
  await openBookWindow();
  const d0 = await dlg();
  ok('the window of a book with titles: each chapter is a name and a title, and a reader who has not begun is told to start', d0.open && d0.hasT && d0.labels.join('|') === 'Chapter 1The lamps|Chapter 2The river|Chapter 3The bridge' && d0.start === '从头开始读' && d0.cur === -1, d0);
  await J(`document.querySelector('#bookDlg [data-bo-ch="0"]').click()`);
  await waitText(/first chapter, and the lamps/);
  const r1 = await rd();
  ok('chapter 1: the bar says book and chapter, the page its title and the name of the chapter, "1 / 3", and previous / next are about chapters', r1.title === 'The Tale · Chapter 1' && r1.h1 === 'Chapter 1　The lamps' && r1.pos === '1 / 3' && r1.prev === '上一章' && r1.next === '下一章', r1);

  // ------------------------------------------------ the chapters panel
  await J(`document.querySelector('#readerToc').click()`); await sleep(400);
  const pn = await J(`({tab:document.querySelector('#rTocPanel .rtabs [aria-selected="true"]').textContent, tabShown:!document.querySelector('#rTocPanel .rtabs [data-tab="chs"]').hidden, head:(document.querySelector('#rTocBody .bk-head')||{}).textContent, items:[...document.querySelectorAll('#rTocBody .toc-i.bk')].map(b=>b.textContent), on:[...document.querySelectorAll('#rTocBody .toc-i.bk')].findIndex(b=>b.classList.contains('on')), foot:document.querySelector('#rtNext').textContent})`);
  ok('the contents panel opens on the chapters of the book: the whole list with titles, this one marked, where in the book, and its buttons say chapter', pn.tabShown && pn.tab === '章节' && /第 1 \/ 3 章 · 全书约 0%/.test(pn.head) && pn.items.join('|') === 'Chapter 1The lamps|Chapter 2The river|Chapter 3The bridge' && pn.on === 0 && pn.foot === '下一章', pn);
  await c.shot(P.SHOTS + '/bookreader_panel.png');
  await J(`document.querySelectorAll('#rTocBody .toc-i.bk')[2].click()`);
  await waitText(/third chapter, and the bridge/);
  const r3 = await rd();
  ok('a click on a chapter in the panel goes there (the panel is put away)', r3.title === 'The Tale · Chapter 3' && r3.h1 === 'Chapter 3　The bridge' && r3.pos === '3 / 3' && (await J(`document.querySelector('#rTocPanel').hidden`)), r3);

  // ------------------------------------------------ the way on at the end of a chapter
  const last = await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return {prev:(d.querySelector('a[data-bk="prev"] b')||{}).textContent, next:!!d.querySelector('a[data-bk="next"]'), last:(d.querySelector('.bk-last')||{}).textContent}; })()`);
  ok('the last chapter ends with the way back and a word that it is the last (no way on)', last.prev === 'Chapter 2　The river' && !last.next && last.last === '已经是最后一章', last);
  await J(`document.querySelector('#frame').contentDocument.querySelector('a[data-bk="prev"]').click()`);
  await waitText(/second chapter, and the travellers/);
  const r2 = await rd();
  ok('the button at the end of a chapter goes to the chapter before', r2.title === 'The Tale · Chapter 2' && r2.pos === '2 / 3', r2);
  const mid = await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return {prev:(d.querySelector('a[data-bk="prev"] b')||{}).textContent, next:(d.querySelector('a[data-bk="next"] b')||{}).textContent}; })()`);
  ok('a chapter in the middle ends with both ways, each with the name and title of the chapter', mid.prev === 'Chapter 1　The lamps' && mid.next === 'Chapter 3　The bridge', mid);
  await c.shot(P.SHOTS + '/bookreader_end.png');
  await J(`document.querySelector('#frame').contentDocument.querySelector('a[data-bk="next"]').click()`);
  await waitText(/third chapter, and the bridge/);
  ok('and the button on the right goes on', (await rd()).title === 'The Tale · Chapter 3');
  await back();

  // ------------------------------------------------ where the reader is: remembered, and back after a reload
  await get('/__book_reset'); asked.length = 0;
  await fresh();
  await openChapter(1, /second chapter, and the travellers/);
  await scrollTo(50);
  const pl = await place(), at50 = await where();
  ok('how far the reader got is kept as the place in the book (chapter and percent: the top of the page), in the progress that the sync carries', pl && pl.i === 1 && pl.pct > 15 && pl.pct < 60 && typeof pl.at === 'number' && !/^1 \//.test(at50), [pl, at50]);
  await back();
  const d1 = await dlg();
  await J(`document.querySelector('#bookDlg').open || [...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes('The Tale')).querySelector('.card-title a').click()`); await sleep(400);
  const d2 = await dlg();
  ok('the window says where the reader is: "continue", the chapter and how far, and the share of the whole book', /继续读：Chapter 2 · [1-9]\d?%/.test(d2.start) && /已读约 [1-9]\d%/.test(d2.sub) && d2.cur === 1, d2);
  await J(`document.querySelector('#bookClose').click()`); await sleep(300);
  const meta = await J(`[...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes('The Tale')).querySelector('.xmeta').textContent`);
  ok('the card of the book says where the reader is', /读到 Chapter 2/.test(meta), meta);
  await fresh(false);                                                                                      // (the page again: what the browser keeps stays)
  await J(`[...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes('The Tale')).querySelector('.card-title a').click()`); await sleep(500);
  await J(`document.querySelector('#bookStart').click()`);
  await waitText(/second chapter, and the travellers/);
  await sleep(900);
  const back50 = await where();
  ok('after a reload "continue" opens the same chapter at the same page', back50 === at50, [at50, back50]);
  await back();

  // ------------------------------------------------ the next chapter is fetched in advance (once), and read marks
  await get('/__book_reset'); asked.length = 0;
  await fresh();
  await openChapter(0, /first chapter, and the lamps/);
  await sleep(500);
  ok('nothing of the next chapter is asked for before the reader is well into this one', !asked.some(q => /c=1/.test(q)), asked);
  await scrollTo(85);
  await sleep(2500);
  const pre = await J(`(itemById('tmp:tale0001~1')||{}).content ? (itemById('tmp:tale0001~1').content.length) : 0`);
  ok('past 60% the next chapter is fetched, once, and is already there', pre > 300 && asked.filter(q => /c=1/.test(q)).length === 1, [pre, asked]);
  await scrollTo(95);
  await J(`document.querySelector('#readerNext').click()`);
  await waitText(/second chapter, and the travellers/);
  ok('opening it asks for nothing more', asked.filter(q => /c=1/.test(q)).length === 1, asked);
  await back();
  const d3 = await dlg();
  await openBookWindow();
  const d4 = await dlg();
  ok('a chapter read to the end is marked read in the window of the book and in the chapters panel', d4.done.includes('0'), d4);
  await J(`document.querySelector('#bookClose').click()`); await sleep(300);

  // ------------------------------------------------ the looks of a book are fixed: what older versions kept as options does not count
  await J(`LS.set('reader',{fs:100,th:'follow',ff:'serif',pg:'l',ind:'off',jus:'on',lh:'l',w:'w',mode:'scroll',dbl:'off'}); Object.assign(state.rs,{ff:'serif',pg:'l',ind:'off',jus:'on',lh:'l',w:'w'})`);
  await openChapter(0, /first chapter, and the lamps/);
  const css = () => J(`(()=>{ const d=document.querySelector('#frame').contentDocument, p=d.querySelectorAll('.doc>p:not([class])')[2], cs=d.defaultView.getComputedStyle(p), bs=d.defaultView.getComputedStyle(d.body); return {indent:cs.textIndent, align:cs.textAlign, mb:cs.marginBottom, ff:bs.fontFamily, lh:bs.lineHeight, style:d.documentElement.getAttribute('style')}; })()`);
  const base = await css();
  ok('whatever the old options said, the looks of a book are the best known: first line indented 1.5 em, left (English), .45 em below a paragraph, 1.65 lines high, the usual font', base.indent === '28.5px' && /^(start|left)$/.test(base.align) && Math.abs(parseFloat(base.mb) - 8.55) < 0.5 && Math.abs(parseFloat(base.lh) - 19 * 1.65) < 0.6 && !/--ff/.test(base.style) && /Segoe|PingFang|Sans|sans|Microsoft YaHei/i.test(base.ff), base);
  await back();

  // ------------------------------------------------ the old list of places (only the chapter) is still read
  await fresh();
  await J(`localStorage.setItem('archive.bookPos', '{\"tale0001\":2}')`);
  await fresh(false);
  await openBookWindow();
  const old = await dlg();
  ok('a reader who has only the old record (the chapter) is told to continue at that chapter', /继续读：Chapter 3/.test(old.start) && old.cur === 2, old);
  await J(`document.querySelector('#bookClose').click()`); await sleep(300);

  // ------------------------------------------------ English
  await fresh(true, 'en');
  await openChapter(0, /first chapter, and the lamps/);
  await J(`document.querySelector('#readerToc').click()`); await sleep(400);
  const en = await J(`({tab:document.querySelector('#rTocPanel .rtabs [data-tab="chs"]').textContent, head:document.querySelector('#rTocBody .bk-head').textContent, prev:document.querySelector('#readerPrev .lbl').textContent, next:document.querySelector('#readerNext .lbl').textContent, end:(document.querySelector('#frame').contentDocument.querySelector('a[data-bk="next"] small')||{}).textContent})`);
  ok('English: "Chapters", "Chapter 1 of 3", "Next chapter" everywhere', en.tab === 'Chapters' && /Chapter 1 of 3 · about 0% of the book/.test(en.head) && en.next === 'Next chapter' && en.end === 'Next chapter', en);
  await back();

  // ------------------------------------------------ a phone: a tap in the middle, and no swipe between chapters
  await c.mobile(390, 780, 3); await sleep(500);
  await fresh(true);
  await openChapter(1, /second chapter, and the travellers/);
  const touch = async (x0, y0, x1, y1) => { await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] }); await sleep(60); await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }] }); await sleep(60); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(500); };
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 350 }] }); await sleep(60);
  await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 160, y: 356 }] }); await sleep(60);
  await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60, y: 360 }] }); await sleep(60);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(900);
  ok('on a phone a swipe sideways does not change the chapter in a book (it is easy to do by mistake)', (await rd()).title === 'The Tale · Chapter 2', await rd());
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 380 }] }); await sleep(50);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(700);
  const focus1 = await J(`document.body.classList.contains('reader-focus')`);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 380 }] }); await sleep(50);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(700);
  const focus2 = await J(`document.body.classList.contains('reader-focus')`);
  ok('a tap in the middle of the text puts the bars away, and another brings them back', focus1 === true && focus2 === false, [focus1, focus2]);
  await c.desktop(1280, 900, 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); process.exit(2); });
