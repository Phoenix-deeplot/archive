// e2e: paged reading of a chapter of a book (R2): an option of "Aa" (scroll is the default and nothing changes for those who do not choose it); the chapter in columns as wide as the screen; taps at the sides,
// keys and the wheel turn the page; the page counter; the end of a chapter goes on to the next one and the beginning back to the end of the one before; the place is a place in the text (the size of the letters
// changes, the reader stays where he is); a chapter with a table is scrolled; two pages on a wide screen; the chapters panel pinned at the left of a wide screen; a phone (swipe, taps); translation in pages
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', SITE = 'http://127.0.0.1:8850', SVC = 'http://127.0.0.1:8840', DIRF = P.DIST + '/dir/directory.json';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };
const get = p => fetch(SVC + p).then(r => r.json());

const CH = { s: '127.0.0.1:8850', p: 'Tale/', n: ['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4'], t: ['The lamps', 'The river', 'The bridge', 'The table'] };
const TALE = { id: 'tale0001', title: 'The Tale', summary: 'The Tale：这是一本用来试翻页的书。', url: SITE + '/wiki/Tale', image: '', date: '', type: 'book', lang: 'en', tags: ['小说', '在线书籍'], shelf: 'books', author: 'A. Writer', license: 'public-domain', bid: 'tale', ch: CH };
const addBooks = () => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.shelves.push({ id: 'books', name: '精选图书', description: '人工挑选的、可以免费阅读的书和刊物', home: '', kind: 'books', lang: '', license: '', tags: [], n: 1, updated: '2026-10-22', feed: '', status: 'ok', featured: true, rights: 'licensed' });
  d.items.push(TALE); d.count = d.items.length;
  fs.writeFileSync(DIRF, JSON.stringify(d));
};
const ARTICLE = '# A short history of tea\n\n' + Array.from({ length: 30 }, (_, i) => `Tea was first drunk in China, as a medicine, thousands of years ago, paragraph ${i}.`).join('\n\n');

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = async expr => { try { return await c.js(`(()=>{ const {state,LS,idb,loadAll,render,openReader,itemById,TR}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`); } catch (e) { throw new Error(e.message + '  IN: ' + expr.slice(0, 160)); } };
  const waitFor = async (expr, ms = 12000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(150); } };
  const fdoc = expr => J(`(()=>{ const d=document.querySelector('#frame').contentDocument, w=document.querySelector('#frame').contentWindow; return ${expr}; })()`);
  const fresh = async (lang = 'zh') => {
    await get('/__trans?mode=ok&reset=1'); await get('/__book_reset');
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.trOk','1')`);
    await c.goto(BASE, 2500);
    await J(`(async()=>{ await idb.put({id:'local:en',path:'',category:'notes',filename:'en.md',hash:'',title:'A short history of tea',summary:'s',keywords:[],lang:'en',minutes:1,pages:null,size:10,date:'2026-01-01',added:1,featured:false,hidden:false,cover:'',type:'md',data:${JSON.stringify(ARTICLE)}}); await loadAll(); render(); })()`);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
    await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await sleep(600);
  };
  const ready = () => waitFor(`(()=>{ const d=document.querySelector('#frame').contentDocument; return !!(d && d.body && d.querySelectorAll('.doc>p:not([class])').length>2); })()`);
  const openChapter = async i => {
    await J(`document.querySelector('#bookDlg').open || [...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes('The Tale')).querySelector('.card-title a').click()`); await sleep(500);
    await J(`document.querySelector('#bookDlg [data-bo-ch="${i}"]').click()`); await ready(); await sleep(900);
  };
  const shut = async () => { await J(`document.querySelector('#readerBack').click()`); await sleep(500); await J(`document.querySelector('#bookDlg').open && document.querySelector('#bookClose').click()`); await sleep(300); };
  const key = async k => { const code = { ArrowRight: 39, ArrowLeft: 37, End: 35, Home: 36, Escape: 27 }[k]; await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }); await sleep(450); };
  const tapAt = async frac => { await fdoc(`d.dispatchEvent(new MouseEvent('click',{clientX:Math.round(w.innerWidth*${frac}),clientY:300,bubbles:true}))`); await sleep(450); };
  const pg = () => fdoc(`(()=>{ const r=d.documentElement, n=d.querySelector('.pgnum'); return {paged:r.classList.contains('paged'), num:n?n.textContent:'', left:Math.round(r.scrollLeft), top:Math.round(w.scrollY), W:w.innerWidth, title:document.querySelector('#readerTitle').textContent}; })()`);
  const modeBtn = v => J(`document.querySelector('#rSetPanel [data-key="mode"] [data-v="${v}"]').click()`);
  const setPanel = async () => { await J(`document.querySelector('#rSetPanel').hidden && document.querySelector('#readerSet').click()`); await sleep(300); };
  const topPara = () => fdoc(`(()=>{ const out=[]; d.querySelectorAll('.doc>p:not([class])').forEach(p=>{ if([...p.getClientRects()].some(r=>r.right>5 && r.left<w.innerWidth-5 && r.top>=-1)){ const m=/(\\d+)$/.exec(p.textContent.trim()); if(m) out.push(+m[1]); } }); return out; })()`);   // (the numbers of the paragraphs that are on the page now)

  addBooks();
  await c.desktop(1000, 800, 1);

  // ------------------------------------------------ the default is to scroll
  await fresh();
  await openChapter(0);
  ok('by default a chapter is scrolled (the option is "滚动")', (await J(`state.rs.mode`)) === 'scroll' && !(await pg()).paged);
  await setPanel();
  const row0 = await J(`({mode:!document.querySelector('#rowMode').hidden, dbl:!document.querySelector('#rowDbl').hidden, note:!document.querySelector('#rModeNote').hidden, pressed:document.querySelector('#rSetPanel [data-key="mode"] [data-v="scroll"]').getAttribute('aria-pressed')})`);
  ok('"Aa" has the row of the way of reading for a chapter of a book (and not the one for two pages: the screen is not wide)', row0.mode && !row0.dbl && !row0.note && row0.pressed === 'true', row0);

  // ------------------------------------------------ pages
  await modeBtn('paged'); await sleep(900);
  const p1 = await pg();
  const N = +p1.num.split(' / ')[1];
  ok('"翻页": the chapter is in pages, the counter says "1 / N" (N more than one), nothing scrolls up and down', p1.paged && /^1 \/ \d+$/.test(p1.num) && N >= 2 && p1.top === 0 && p1.left === 0, p1);
  await c.shot(P.SHOTS + '/bookpaged_page.png');
  await J(`document.querySelector('#readerSet').click()`); await sleep(300);
  await key('ArrowRight');
  const p2 = await pg();
  ok('the right arrow turns the page: the document moved by the width of the screen, the counter says 2', p2.left === p2.W && p2.num === `2 / ${N}`, p2);
  await tapAt(0.85);
  const p3 = await pg();
  ok('a tap at the right side turns the page', p3.num === `3 / ${N}` && p3.left === 2 * p3.W, p3);
  await tapAt(0.12);
  ok('a tap at the left side turns it back', (await pg()).num === `2 / ${N}`);
  const place = await J(`state.progress['bk:tale0001']`);
  ok('the place in the book is kept (the chapter and how far in the text), as when it is scrolled', place && place.i === 0 && place.pct > 100 / N * 0.5 && place.pct < 100 / N * 2.5, [place, N]);
  await key('ArrowLeft'); await key('ArrowLeft');
  ok('the first page does not go back (it is the first chapter)', (await pg()).num === `1 / ${N}` && /Chapter 1/.test((await pg()).title));

  // ------------------------------------------------ the size of the letters changes: the reader stays where he is
  await key('ArrowRight'); await key('ArrowRight'); await key('ArrowRight');
  const before = await topPara();
  await setPanel();
  await J(`document.querySelector('#rSetPanel [data-fs="10"]').click(); document.querySelector('#rSetPanel [data-fs="10"]').click(); document.querySelector('#rSetPanel [data-fs="10"]').click()`); await sleep(900);
  await J(`document.querySelector('#readerSet').click()`); await sleep(300);
  const after = await pg(), N2 = +after.num.split(' / ')[1];
  const nowTop = await topPara();
  ok('a bigger letter makes more pages', N2 > N, [N, N2]);
  ok('...and the reader is where he was (the paragraph that began his page is on the page again, and the page is not the first one)', before.length > 0 && nowTop.includes(before[0]) && after.num.split(' / ')[0] !== '1', [before, nowTop, after.num]);
  await setPanel();
  await J(`for (let i=0;i<3;i++) document.querySelector('#rSetPanel [data-fs="-10"]').click()`); await sleep(700);
  await J(`document.querySelector('#readerSet').click()`); await sleep(300);

  // ------------------------------------------------ the end of a chapter, the beginning of the next
  await key('End');
  const last = await pg(), lastN = +last.num.split(' / ')[1];
  ok('the end key goes to the last page, where the way on to the next chapter is', last.num === `${lastN} / ${lastN}` && (await fdoc(`!!d.querySelector('a[data-bk="next"]') && d.querySelector('a[data-bk="next"]').getBoundingClientRect().left < w.innerWidth`)), last);
  await key('ArrowRight'); await ready(); await sleep(900);
  const c2 = await pg();
  ok('one more turn: the next chapter, at its first page', /Chapter 2/.test(c2.title) && /^1 \/ \d+$/.test(c2.num) && c2.paged, c2);
  await key('ArrowLeft'); await ready(); await sleep(900);
  const back1 = await pg();
  ok('a turn back from the first page: the last page of the chapter before', /Chapter 1/.test(back1.title) && back1.num.split(' / ')[0] === back1.num.split(' / ')[1], back1);

  // ------------------------------------------------ the wheel
  await key('Home');
  await fdoc(`d.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}))`); await sleep(500);
  ok('the wheel turns the page', (await pg()).num.startsWith('2 /'));
  await sleep(500);
  for (let i = 0; i < 6; i++) { await fdoc(`d.dispatchEvent(new WheelEvent('wheel',{deltaY:${60 - i * 8},bubbles:true,cancelable:true}))`); await sleep(50); }
  await sleep(500);
  ok('a long push on a trackpad (a train of wheel events) is one turn, not many', (await pg()).num.startsWith('3 /'), await pg());
  const nBefore = +(await pg()).num.split(' / ')[1];
  await fdoc(`(()=>{ const p=d.querySelector('.doc>p:not([class])'); for(let i=0;i<3;i++){ const im=d.createElement('img'); im.style.display='block'; im.src='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="1400"><rect width="400" height="1400" fill="#cde"/></svg>'); p.after(im); } })()`); await sleep(1200);
  const nAfter = +(await pg()).num.split(' / ')[1];
  ok('pictures that come late are counted: more pages, still in pages', nAfter >= nBefore + 2 && (await pg()).paged, [nBefore, nAfter]);

  // ------------------------------------------------ a chapter with a table is scrolled
  await J(`document.querySelector('#readerToc').click()`); await sleep(400);
  await J(`document.querySelectorAll('#rTocBody .toc-i.bk')[3].click()`); await ready(); await sleep(900);
  const tb = await pg();
  await setPanel();
  ok('a chapter with a table is scrolled even when pages are chosen, and "Aa" says so', !tb.paged && /Chapter 4/.test(tb.title) && (await J(`!document.querySelector('#rModeNote').hidden`)), tb);
  await J(`document.querySelector('#readerSet').click()`); await sleep(300);

  // ------------------------------------------------ back to scrolling: the place is kept
  await J(`document.querySelectorAll('#rTocBody .toc-i.bk')[0] ? 0 : 0`);
  await J(`document.querySelector('#readerToc').click()`); await sleep(300);
  await J(`document.querySelector('#rTocPanel').hidden && document.querySelector('#readerToc').click()`); await sleep(300);
  await J(`document.querySelectorAll('#rTocBody .toc-i.bk')[1].click()`); await ready(); await sleep(900);
  await key('ArrowRight'); await key('ArrowRight'); await key('ArrowRight');
  const mid = await pg(), midN = +mid.num.split(' / ')[1];
  await setPanel(); await modeBtn('scroll'); await sleep(900);
  await J(`document.querySelector('#readerSet').click()`); await sleep(300);
  const sc = await fdoc(`(()=>{ const max=d.documentElement.scrollHeight-w.innerHeight; return {paged:d.documentElement.classList.contains('paged'), pct:Math.round(w.scrollY/max*100), left:d.documentElement.scrollLeft}; })()`);
  ok('back to scrolling: the document is a scroll again, about where the reader was (page 4 of ' + midN + ')', !sc.paged && sc.left === 0 && Math.abs(sc.pct - 3 / midN * 100) < 14, [sc, mid]);
  await setPanel(); await modeBtn('paged'); await sleep(900);
  await J(`document.querySelector('#readerSet').click()`); await sleep(300);
  ok('and to pages again: on the page of that place', (await pg()).paged && Math.abs(+(await pg()).num.split(' / ')[0] - 4) <= 1, await pg());
  await shut();

  // ------------------------------------------------ two pages on a wide screen
  await c.desktop(1280, 900, 1);
  await J(`location.reload()`); await sleep(2500);
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
  await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await sleep(600);
  await openChapter(0);
  await sleep(500);
  const two = await fdoc(`(()=>{ const ps=[...d.querySelectorAll('.doc>p:not([class])')].filter(p=>{ const b=p.getBoundingClientRect(); return b.left>=0 && b.left<w.innerWidth && b.top>=0 && b.top<w.innerHeight; }); const lefts=[...new Set(ps.map(p=>Math.round(p.getBoundingClientRect().left)))]; return {cols:lefts.length, num:d.querySelector('.pgnum').textContent, W:w.innerWidth}; })()`);
  ok('a wide screen shows two pages side by side (two columns of text are on the screen), and a turn goes by the whole screen', two.cols === 2, two);
  await setPanel();
  ok('"Aa" has the row of two pages now', await J(`!document.querySelector('#rowDbl').hidden`));
  await J(`document.querySelector('#rSetPanel [data-key="dbl"] [data-v="off"]').click()`); await sleep(900);
  const one = await fdoc(`(()=>{ const ps=[...d.querySelectorAll('.doc>p:not([class])')].filter(p=>{ const b=p.getBoundingClientRect(); return b.left>=0 && b.left<w.innerWidth && b.top>=0 && b.top<w.innerHeight; }); return new Set(ps.map(p=>Math.round(p.getBoundingClientRect().left))).size; })()`);
  ok('"双页 关": one page again', one === 1, one);
  await J(`document.querySelector('#rSetPanel [data-key="dbl"] [data-v="on"]').click()`); await sleep(700);
  await J(`document.querySelector('#readerSet').click()`); await sleep(300);
  await c.shot(P.SHOTS + '/bookpaged_two.png');

  // ------------------------------------------------ the chapters panel at the left of a wide screen
  await J(`document.querySelector('#readerToc').click()`); await sleep(500);
  const pinBtn = await J(`!!document.querySelector('#rTocBody .rpin') && getComputedStyle(document.querySelector('#rTocBody .rpin')).display!=='none'`);
  ok('on a wide screen the chapters panel has a button to pin it', pinBtn);
  const numBefore = (await pg()).num;
  await J(`document.querySelector('#rTocBody .rpin').click()`); await sleep(900);
  const pin = await J(`(()=>{ const p=document.querySelector('#rTocPanel').getBoundingClientRect(), f=document.querySelector('#frame').getBoundingClientRect(); return {cls:document.querySelector('#reader').classList.contains('toc-pin'), pl:Math.round(p.left), pw:Math.round(p.width), fl:Math.round(f.left), fw:Math.round(f.width), vw:innerWidth, open:!document.querySelector('#rTocPanel').hidden}; })()`);
  ok('pinned: the panel is at the left (300 px), the page is beside it and not under it', pin.cls && pin.open && pin.pl === 0 && pin.pw === 300 && pin.fl === 300 && pin.fw === pin.vw - 300, pin);
  await c.shot(P.SHOTS + '/bookpaged_pinned.png');
  ok('the pages are set again for the narrower page', (await pg()).paged && (await pg()).W === pin.vw - 300, await pg());
  await J(`document.querySelectorAll('#rTocBody .toc-i.bk')[1].click()`); await ready(); await sleep(900);
  ok('a chapter chosen in the pinned panel opens and the panel stays', /Chapter 2/.test((await pg()).title) && (await J(`!document.querySelector('#rTocPanel').hidden`)), await pg());
  await key('Escape');
  ok('Esc closes the reader even when the panel is pinned (the panel does not count as something open)', await J(`document.querySelector('#reader').hidden`));
  await J(`document.querySelector('#bookDlg').open && document.querySelector('#bookClose').click()`); await sleep(300);
  await openChapter(0);
  await J(`document.querySelector('#rTocPanel').hidden && document.querySelector('#readerToc').click()`); await sleep(400);
  await J(`document.querySelector('#rTocBody .rpin').click()`); await sleep(700);
  ok('the pin is taken away: the panel is a drawer on the page again', !(await J(`document.querySelector('#reader').classList.contains('toc-pin')`)));
  await J(`LS.set('tocPin',0)`);
  await shut();

  // ------------------------------------------------ an article that is not a book is not paged
  await J(`openReader('local:en')`); await waitFor(`!document.querySelector('#reader').hidden`); await sleep(1500);
  await J(`document.querySelector('#readerSet').click()`); await sleep(300);
  ok('an article that is not a book: no way-of-reading row, and the page is a scroll', (await J(`document.querySelector('#rowMode').hidden`)) && !(await pg()).paged);
  await shut();

  // ------------------------------------------------ translation in pages
  await c.desktop(1000, 800, 1);
  await J(`state.rs.mode='paged'; LS.set('reader',state.rs)`);
  await J(`location.reload()`); await sleep(2500);
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
  await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await sleep(600);
  await openChapter(0);
  await J(`document.querySelector('#readerTrans').click()`); await sleep(400);
  await J(`document.querySelector('#trMenu [data-tr="screen"]').click()`); await waitFor(`TR.mode==='both'`); await sleep(1200);
  const tr = await fdoc(`({paged:d.documentElement.classList.contains('paged'), tr:d.querySelectorAll('.zt-tr').length, num:d.querySelector('.pgnum').textContent})`);
  ok('translation in pages: the page stays in pages, the translation is under its paragraphs, the counter is kept up to date', tr.paged && tr.tr >= 3 && /^\d+ \/ \d+$/.test(tr.num), tr);
  await shut();

  // ------------------------------------------------ a phone
  await c.mobile(390, 780, 3); await sleep(500);
  await fresh('zh');
  await J(`state.rs.mode='paged'; LS.set('reader',state.rs)`);
  await J(`location.reload()`); await sleep(2500);
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
  await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await sleep(600);
  await openChapter(0);
  const ph = await pg();
  ok('on a phone: one page, as wide as the screen, with its counter', ph.paged && ph.W === 390 && /^1 \/ \d+$/.test(ph.num), ph);
  const swipe = async (x0, x1) => { await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: 350 }] }); await sleep(60); await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (x0 + x1) / 2, y: 356 }] }); await sleep(60); await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1, y: 360 }] }); await sleep(60); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(800); };
  await swipe(300, 60);
  ok('a swipe to the left turns the page', (await pg()).num.startsWith('2 /'), await pg());
  await swipe(60, 300);
  ok('a swipe to the right turns it back', (await pg()).num.startsWith('1 /'), await pg());
  const tap = async x => { await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 380 }] }); await sleep(50); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(700); };
  await tap(350);
  ok('a tap at the right side turns the page', (await pg()).num.startsWith('2 /'), await pg());
  await tap(195);
  ok('a tap in the middle puts the bars away (the page is set again for the higher screen)', await J(`document.body.classList.contains('reader-focus')`));
  await tap(195);
  ok('and brings them back', !(await J(`document.body.classList.contains('reader-focus')`)));
  await c.desktop(1280, 900, 1);

  const mine = errs.filter(e => !/adsbygoogle|googlesyndication/.test(e));              // (the script of the adverts of the demo page is not ours)
  ok('no script errors in the whole run', mine.length === 0, mine);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
