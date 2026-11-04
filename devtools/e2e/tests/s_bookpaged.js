// e2e: reading a picked book (R2 + "simple reading"): the chapter is in pages, on a PC (a sheet in the middle of the screen, an arrow at each side, keys, the wheel) and on a phone (the page follows the finger,
// lets go and goes on or comes back, taps at the sides); nothing to set but the size of the letters (the bar at the foot); the top bar has only what a book needs, and an eye-care button that changes the colour;
// the place is a place in the text (the size of the letters changes, the reader stays where he is); a chapter with a table is scrolled; the chapters panel pinned at the left of a wide screen; an article has the same settings (the letters, the colour), is scrolled, and has no bookmark
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
const ZH = { ...TALE, id: 'tale0002', title: '中文的书', summary: '中文的书：同样的页面，按中文排版。', url: SITE + '/wiki/Tale2', lang: 'zh', bid: 'tale2', author: '某人' };
const addBooks = () => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.shelves.push({ id: 'books', name: '精选图书', description: '人工挑选的、可以免费阅读的书和刊物', home: '', kind: 'books', lang: '', license: '', tags: [], n: 2, updated: '2026-10-22', feed: '', status: 'ok', featured: true, rights: 'licensed' });
  d.items.push(TALE, ZH); d.count = d.items.length;
  fs.writeFileSync(DIRF, JSON.stringify(d));
};
const ARTICLE = '# A short history of tea\n\n' + Array.from({ length: 30 }, (_, i) => `Tea was first drunk in China, as a medicine, thousands of years ago, paragraph ${i}.`).join('\n\n');

(async () => {
  const c = await connect(9444);
  const settle = await require('../settle')(c);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = async expr => { try { return await c.js(`(()=>{ const {state,LS,idb,loadAll,render,openReader,itemById,TR}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`); } catch (e) { throw new Error(e.message + '  IN: ' + expr.slice(0, 160)); } };
  const waitFor = async (expr, ms = 12000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(150); } };
  const fdoc = expr => J(`(()=>{ const d=document.querySelector('#frame').contentDocument, w=document.querySelector('#frame').contentWindow; return ${expr}; })()`);
  const shown = sel => J(`(()=>{ const e=document.querySelector(${JSON.stringify(sel)}); return !!e && !e.hidden && getComputedStyle(e).display!=='none' && getComputedStyle(e).visibility!=='hidden'; })()`);
  const fresh = async (lang = 'zh') => {
    await get('/__trans?mode=ok&reset=1'); await get('/__book_reset');
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 0); await settle(1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.trOk','1')`);
    await c.goto(BASE, 0); await settle(2500);
    await J(`(async()=>{ await idb.put({id:'local:en',path:'',category:'notes',filename:'en.md',hash:'',title:'A short history of tea',summary:'s',keywords:[],lang:'en',minutes:1,pages:null,size:10,date:'2026-01-01',added:1,featured:false,hidden:false,cover:'',type:'md',data:${JSON.stringify(ARTICLE)}}); await loadAll(); render(); })()`);
    await J(`document.querySelector('[data-space="dir"]').click()`); await settle(1800);
    await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await settle(600);
  };
  const ready = () => waitFor(`(()=>{ const d=document.querySelector('#frame').contentDocument; return !!(d && d.body && d.querySelectorAll('.doc>p:not([class])').length>2); })()`);
  const openChapter = async (i, title = 'The Tale') => {
    await J(`document.querySelector('#bookDlg').open || [...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes(${JSON.stringify(title)})).querySelector('.card-title a').click()`); await settle(500);
    await J(`document.querySelector('#bookDlg [data-bo-ch="${i}"]').click()`); await ready(); await settle(900);
  };
  const shut = async () => { await J(`document.querySelector('#readerBack').click()`); await settle(500); await J(`document.querySelector('#bookDlg').open && document.querySelector('#bookClose').click()`); await sleep(300); };
  const key = async k => { const code = { ArrowRight: 39, ArrowLeft: 37, End: 35, Home: 36, Escape: 27 }[k]; await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }); await settle(500); };
  const pg = () => fdoc(`(()=>{ const r=d.documentElement; return {paged:r.classList.contains('paged'), info:document.querySelector('#rbInfo').textContent, left:Math.round(r.scrollLeft), top:Math.round(w.scrollY), W:w.innerWidth, title:document.querySelector('#readerTitle').textContent, pgd:document.querySelector('#reader').classList.contains('pgd')}; })()`);
  const nPages = async () => +(await pg()).info.split(' / ')[1];
  const paras = () => fdoc(`(()=>{ const out=[]; d.querySelectorAll('.doc>p:not([class])').forEach(p=>{ if([...p.getClientRects()].some(r=>r.right>5 && r.left<w.innerWidth-5 && r.top>=-1)){ const m=/(\\d+)$/.exec(p.textContent.trim()); if(m) out.push(+m[1]); } }); return out; })()`);   // (the numbers of the paragraphs that are on the page now)
  const click = sel => J(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const fsBig = async n => { for (let i = 0; i < n; i++) await click('#rbFsP'); await settle(900); };
  const fsSmall = async n => { for (let i = 0; i < n; i++) await click('#rbFsM'); await settle(900); };
  // a finger
  const tStart = (x, y = 350) => c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const tMove = (x, y = 352) => c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  const tEnd = () => c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const drag = async (xs, gap, rest = 700) => { await tStart(xs[0]); for (const x of xs.slice(1)) { await sleep(gap); await tMove(x); } await tEnd(); await sleep(rest); };
  const tap = async x => { await tStart(x, 380); await sleep(50); await tEnd(); await settle(700); };

  addBooks();
  await c.desktop(1000, 800, 1);

  // ------------------------------------------------ the top bar and the chapter on a PC
  await fresh();
  await openChapter(0);
  const bar = {};
  for (const [k, sel] of Object.entries({ back: '#readerBack', toc: '#readerToc', focus: '#readerFocus', eye: '#readerEye', set: '#readerSet', save: '#readerSave', mark: '#readerMark', star: '#readerStar', newtab: '#readerNew', mobnav: '#readerMobileNav' })) bar[k] = await shown(sel);
  ok('the top bar of a book: back, contents, focus reading and eye care; no Aa, no save, no bookmark, no star, no new tab', bar.back && bar.toc && bar.focus && bar.eye && !bar.set && !bar.save && !bar.mark && !bar.star && !bar.newtab && !bar.mobnav, bar);
  const p1 = await pg(), N = await nPages();
  ok('the chapter is in pages (nothing to switch on), the foot says "1 / N", nothing scrolls up and down', p1.paged && p1.pgd && /^1 \/ \d+$/.test(p1.info) && N >= 2 && p1.top === 0 && p1.left === 0, p1);
  const lay = await fdoc(`(()=>{ const r=d.documentElement, doc=d.querySelector('.doc').getBoundingClientRect(), cs=getComputedStyle(d.body); return {pm:parseFloat(r.style.getPropertyValue('--pm')), w:Math.round(doc.width), left:Math.round(doc.left), fs:cs.fontSize, lh:r.style.getPropertyValue('--lh'), wide:r.classList.contains('wide'), ind:r.style.getPropertyValue('--ind'), jus:r.style.getPropertyValue('--jus')}; })()`);
  ok('on a PC the page is a sheet in the middle: 34 em of English (19 px letters), 1.65 lines high, not justified', lay.wide && lay.fs === '19px' && lay.lh === '1.65' && Math.abs(lay.w - 34 * 19) < 6 && Math.abs(lay.left - (1000 - lay.w) / 2) < 3 && lay.jus === 'start', lay);
  ok('the foot has the size of the letters and where one is; the arrows of a PC are at the sides of the page', (await shown('#rBook')) && (await shown('#rbFsM')) && (await shown('#rbFsP')) && !(await shown('#rbPrev')) && (await shown('#rEdgeL')) && (await shown('#rEdgeR')), await J(`getComputedStyle(document.querySelector('#rEdgeR')).display`));
  await c.shot(P.SHOTS + '/bookpaged_pc.png');

  // ------------------------------------------------ the arrows, the keys, the wheel
  await click('#rEdgeR'); await settle(600);
  const p2 = await pg();
  ok('the arrow at the right turns the page: the document slid by the width of the screen, the foot says 2', p2.left === p2.W && p2.info === `2 / ${N}`, p2);
  await fdoc(`d.dispatchEvent(new MouseEvent('click',{clientX:Math.round(w.innerWidth*0.85),clientY:300,bubbles:true}))`); await settle(500);
  await fdoc(`d.dispatchEvent(new MouseEvent('click',{clientX:Math.round(w.innerWidth*0.1),clientY:300,bubbles:true}))`); await settle(500);
  ok('a click on the text does nothing on a PC (no turn by mistake, and one can select words)', (await pg()).info === `2 / ${N}`, await pg());
  await click('#rEdgeL'); await settle(600);
  ok('the arrow at the left turns it back', (await pg()).info === `1 / ${N}`);
  await key('ArrowRight'); await key('ArrowRight');
  ok('the right arrow key turns the page (twice: page 3)', (await pg()).info === `3 / ${N}`, await pg());
  const place = await J(`state.progress['bk:tale0001']`);
  ok('the place in the book is kept (the chapter and how far in the text)', place && place.i === 0 && place.pct > 100 / N * 0.5 && place.pct < 100 / N * 3.5, [place, N]);
  await key('Home');
  ok('Home goes to the first page', (await pg()).info === `1 / ${N}`);
  await fdoc(`d.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}))`); await settle(600);
  ok('the wheel turns the page', (await pg()).info === `2 / ${N}`);
  await settle(500);
  for (let i = 0; i < 6; i++) { await fdoc(`d.dispatchEvent(new WheelEvent('wheel',{deltaY:${60 - i * 8},bubbles:true,cancelable:true}))`); await sleep(50); }
  await settle(600);
  ok('a long push on a trackpad (a train of wheel events) is one turn, not many', (await pg()).info === `3 / ${N}`, await pg());
  await key('ArrowLeft'); await key('ArrowLeft'); await key('ArrowLeft');
  ok('the first page does not go back (it is the first chapter)', (await pg()).info === `1 / ${N}` && /Chapter 1/.test((await pg()).title));

  // ------------------------------------------------ the size of the letters (the bar at the foot): the reader stays where he is (chapter 2 is the long one)
  await click('#readerToc'); await settle(400);
  await J(`document.querySelectorAll('#rTocBody .toc-i.bk')[1].click()`); await ready(); await settle(1000);
  await key('ArrowRight'); await key('ArrowRight'); await key('ArrowRight');
  const before = await paras();
  await fsBig(3);
  const after = await pg(), N2 = await nPages();
  ok('A+ three times: the letters are 130 % (19 px × 1.3), there are more pages, and a message says so', (await fdoc(`getComputedStyle(d.body).fontSize`)) === '24.7px' && N2 > N, [N, N2]);
  const nowP = await paras();
  ok('...and the reader is where he was (the paragraph that began his page is on the page again, and it is not the first page)', before.length > 0 && nowP.includes(before[0]) && after.info.split(' / ')[0] !== '1', [before, nowP, after.info]);
  const keep = await J(`state.rs.fs`);
  await fsSmall(3);
  ok('A− brings the size back (and the size is kept for the next time)', (await J(`state.rs.fs`)) === 100 && keep === 130 && JSON.stringify(await J(`LS.get('reader',{}).fs`)) === '100');

  // ------------------------------------------------ a chapter opened again is at the page where the reader was (the place is read before the chapter is laid out)
  const at = (await pg()).info;
  await shut(); await openChapter(1);
  ok('a chapter opened again is at the page where the reader left it', at !== `1 / ${await nPages()}` && (await pg()).info === at, [at, await pg()]);

  // ------------------------------------------------ the end of a chapter, the beginning of the next
  await key('End');
  const last = await pg(), lastN = await nPages();
  ok('End goes to the last page', last.info === `${lastN} / ${lastN}`, last);
  ok('the end page has no big buttons any more: one turn more goes on (they are for a scroll)', await fdoc(`getComputedStyle(d.querySelector('.bk-end')).display==='none'`));
  await click('#rEdgeR'); await ready(); await settle(1000);
  const c2 = await pg();
  ok('one more turn at the end: the next chapter, at its first page', /Chapter 3/.test(c2.title) && /^1 \/ \d+$/.test(c2.info) && c2.paged, c2);
  await click('#rEdgeL'); await ready(); await settle(1000);
  const back1 = await pg();
  ok('a turn back from the first page: the last page of the chapter before (and the last page is as the others: the document is a whole number of pages along)', /Chapter 2/.test(back1.title) && back1.info.split(' / ')[0] === back1.info.split(' / ')[1] && back1.left === (back1.W * (back1.info.split(' / ')[1] - 1)), back1);

  // ------------------------------------------------ the colours of the eyes
  const th = [];
  for (let i = 0; i < 4; i++) { await click('#readerEye'); await settle(500); th.push([await J(`state.rs.th`), await fdoc(`d.documentElement.getAttribute('data-theme')||''`), await J(`document.querySelector('#readerEye').dataset.th`)]); }
  ok('the eye-care button changes the colour at each click: sepia, green, dark, and back to the colours of the system', JSON.stringify(th.map(x => x.slice(0, 2))) === JSON.stringify([['sepia', 'sepia'], ['green', 'green'], ['dark', 'dark'], ['follow', '']]) && th.every(x => x[0] === x[2]), th);
  await click('#readerEye'); await settle(600);
  const sepia = await fdoc(`({bg:getComputedStyle(d.documentElement).backgroundColor, paper:getComputedStyle(d.documentElement,'::before').backgroundColor})`);
  ok('in sepia the sheet is yellowish and the desk around it a little darker', sepia.paper === 'rgb(244, 236, 216)' && sepia.bg === 'rgb(231, 221, 196)', sepia);
  await c.shot(P.SHOTS + '/bookpaged_sepia.png');
  await click('#readerEye'); await click('#readerEye'); await click('#readerEye'); await settle(500);
  ok('(back to the colours of the system for the rest)', (await J(`state.rs.th`)) === 'follow');

  // ------------------------------------------------ a chapter with a table is scrolled
  await click('#readerToc'); await settle(400);
  ok('the contents of a book have its chapters, and no "bookmarks" page', (await shown('#rTocPanel .rtabs [data-tab="chs"]')) && !(await shown('#rTocPanel .rtabs [data-tab="marks"]')));
  await J(`document.querySelectorAll('#rTocBody .toc-i.bk')[3].click()`); await ready(); await settle(900);
  const tb = await pg();
  ok('a chapter with a table is scrolled (the columns do not hold it); the foot says how far, and there are no arrows', !tb.paged && !tb.pgd && /^\d+%$/.test(tb.info) && /Chapter 4/.test(tb.title) && !(await shown('#rEdgeR')) && (await shown('#rbFsP')), tb);
  await fsBig(1);
  ok('...and the size of the letters still works there', (await fdoc(`getComputedStyle(d.body).fontSize`)) === '20.9px');
  await fsSmall(1);

  // ------------------------------------------------ the pictures that come late
  await click('#readerToc'); await sleep(300);
  await J(`document.querySelector('#rTocPanel').hidden && document.querySelector('#readerToc').click()`); await sleep(300);
  await J(`document.querySelectorAll('#rTocBody .toc-i.bk')[1].click()`); await ready(); await settle(900);
  const nBefore = await nPages();
  await fdoc(`(()=>{ const p=d.querySelector('.doc>p:not([class])'); for(let i=0;i<3;i++){ const im=d.createElement('img'); im.style.display='block'; im.src='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="1400"><rect width="400" height="1400" fill="#cde"/></svg>'); p.after(im); } })()`); await settle(1200);
  const nAfter = await nPages();
  ok('pictures that come late are counted: more pages, still in pages', nAfter >= nBefore + 2 && (await pg()).paged, [nBefore, nAfter]);
  await shut();

  // ------------------------------------------------ a Chinese book is set the Chinese way
  await J(`document.querySelector('#bookDlg').open && document.querySelector('#bookClose').click()`); await sleep(300);
  await openChapter(0, '中文的书');
  const zh = await fdoc(`(()=>{ const r=d.documentElement, doc=d.querySelector('.doc').getBoundingClientRect(); return {lh:r.style.getPropertyValue('--lh'), ind:r.style.getPropertyValue('--ind'), jus:r.style.getPropertyValue('--jus'), w:Math.round(doc.width), p:getComputedStyle(d.querySelector('.doc>p:not([class])')).textIndent}; })()`);
  ok('a Chinese book: about 36 characters a line (36 em of 19 px), 1.8 lines high, the first line of a paragraph indented two characters, justified', zh.lh === '1.8' && zh.ind === '2em' && zh.jus === 'justify' && Math.abs(zh.w - 36 * 19) < 6 && zh.p === '38px', zh);
  await shut();

  // ------------------------------------------------ the chapters panel at the left of a wide screen
  await c.desktop(1280, 900, 1);
  await J(`location.reload()`); await settle(2500);
  await J(`document.querySelector('[data-space="dir"]').click()`); await settle(1800);
  await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await settle(600);
  await openChapter(0);
  const wide = await fdoc(`(()=>{ const doc=d.querySelector('.doc').getBoundingClientRect(); return {w:Math.round(doc.width), left:Math.round(doc.left), W:w.innerWidth}; })()`);
  ok('on a wider screen the sheet is the same width, in the middle (the sides are the desk)', Math.abs(wide.w - 34 * 19) < 6 && Math.abs(wide.left - (wide.W - wide.w) / 2) < 3, wide);
  await J(`document.querySelector('#readerToc').click()`); await settle(500);
  ok('on a wide screen the chapters panel has a button to pin it', await J(`!!document.querySelector('#rTocBody .rpin') && getComputedStyle(document.querySelector('#rTocBody .rpin')).display!=='none'`));
  await J(`document.querySelector('#rTocBody .rpin').click()`); await settle(900);
  const pin = await J(`(()=>{ const p=document.querySelector('#rTocPanel').getBoundingClientRect(), f=document.querySelector('#frame').getBoundingClientRect(); return {cls:document.querySelector('#reader').classList.contains('toc-pin'), pl:Math.round(p.left), pw:Math.round(p.width), fl:Math.round(f.left), fw:Math.round(f.width), vw:innerWidth, open:!document.querySelector('#rTocPanel').hidden}; })()`);
  ok('pinned: the panel is at the left (300 px), the page is beside it and not under it', pin.cls && pin.open && pin.pl === 0 && pin.pw === 300 && pin.fl === 300 && pin.fw === pin.vw - 300, pin);
  ok('the pages are set again for the narrower page, and the arrows stand beside the page, not under the panel', (await pg()).paged && (await pg()).W === pin.vw - 300 && (await J(`document.querySelector('#rEdgeL').getBoundingClientRect().left`)) >= 300, await pg());
  await c.shot(P.SHOTS + '/bookpaged_pinned.png');
  await J(`document.querySelectorAll('#rTocBody .toc-i.bk')[1].click()`); await ready(); await settle(900);
  ok('a chapter chosen in the pinned panel opens and the panel stays', /Chapter 2/.test((await pg()).title) && (await J(`!document.querySelector('#rTocPanel').hidden`)), await pg());
  await key('Escape');
  ok('Esc closes the reader even when the panel is pinned', await J(`document.querySelector('#reader').hidden`));
  await J(`LS.set('tocPin',0)`);
  await J(`document.querySelector('#bookDlg').open && document.querySelector('#bookClose').click()`); await sleep(300);

  // ------------------------------------------------ an article: the same (the size of the letters and the colour, nothing else), scrolled, no bookmark
  await J(`openReader('local:en')`); await waitFor(`!document.querySelector('#reader').hidden`); await settle(1500);
  const art = {};
  for (const [k, sel] of Object.entries({ save: '#readerSave', eye: '#readerEye', rbook: '#rBook', prevch: '#rbPrev', set: '#readerSet', mark: '#readerMark', star: '#readerStar', edit: '#readerEdit', newtab: '#readerNew' })) art[k] = await shown(sel);
  ok('an article: save, eye care and the bar of the letters (without the chapters of a book); no Aa, no bookmark, no star, no pen, no "new tab"', art.save && art.eye && art.rbook && !art.prevch && !art.set && !art.mark && !art.star && !art.edit && !art.newtab && !(await J(`!!document.querySelector('#rSetPanel')`)), art);
  const al = await fdoc(`(()=>{ const r=d.documentElement, doc=d.querySelector('.doc').getBoundingClientRect(), cs=getComputedStyle(d.body); return {paged:r.classList.contains('paged'), fs:cs.fontSize, lh:r.style.getPropertyValue('--lh'), w:Math.round(doc.width), ind:r.style.getPropertyValue('--ind'), jus:r.style.getPropertyValue('--jus')}; })()`);
  ok('an article is scrolled, not paged, with the best looks: 19 px letters, 1.65 lines high, 34 em wide, no indent, not justified', !al.paged && al.fs === '19px' && al.lh === '1.65' && Math.abs(al.w - 34 * 19) < 6 && al.ind === '' && al.jus === '', al);
  ok('the bar says how far one has read (a percent) in an article', /^\d+%$/.test(await J(`document.querySelector('#rbInfo').textContent`)));
  await click('#rbFsP'); await settle(500);
  ok('A+ in an article: 110 % (20.9 px)', (await fdoc(`getComputedStyle(d.body).fontSize`)) === '20.9px');
  await click('#rbFsM'); await sleep(300);
  await click('#readerToc'); await settle(400);
  ok('the contents of an article have no "bookmarks" page and no chapters page', !(await shown('#rTocPanel .rtabs [data-tab="marks"]')) && !(await shown('#rTocPanel .rtabs [data-tab="chs"]')));
  await click('#readerToc'); await sleep(300);
  await shut();

  // ------------------------------------------------ like / dislike of an article of the directory stay in the middle, the bar of the letters is at the left (they were one on the other)
  await J(`(()=>{ const d=state.dirData; d.items.unshift({id:'zz1',url:'${SITE}/a/2',title:'目录里的一篇文章',summary:'s',image:'',date:'2026-10-20',lang:'en',shelf:'',type:'article',tags:[]}); window.__zt.openDirReader('zz1'); })()`);
  await waitFor(`!document.querySelector('#reader').hidden && !document.querySelector('#rVote').hidden`, 15000); await settle(1500);
  const vb = await J(`(()=>{ const v=document.querySelector('#rVote').getBoundingClientRect(), b=document.querySelector('#rBook').getBoundingClientRect(), f=document.querySelector('#frame').getBoundingClientRect(); return {overlap:!(v.bottom<=b.top || v.top>=b.bottom || v.right<=b.left || v.left>=b.right), vMid:Math.round((v.left+v.right)/2), mid:Math.round((f.left+f.right)/2), bLeft:Math.round(b.left), bRight:Math.round(b.right), vLeft:Math.round(v.left), vis:getComputedStyle(document.querySelector('#rBook')).display!=='none'}; })()`);
  ok('like / dislike of an article of the directory are in the middle of the foot, the bar of the letters at the left of it: they do not cover each other', vb.vis && !vb.overlap && Math.abs(vb.vMid - vb.mid) <= 6 && vb.bLeft < 40 && vb.bRight < vb.vLeft, vb);
  await c.shot(P.SHOTS + '/bookpaged_vote.png');
  await shut();

  // ------------------------------------------------ translation in pages
  await c.desktop(1000, 800, 1);
  await J(`location.reload()`); await settle(2500);
  await J(`document.querySelector('[data-space="dir"]').click()`); await settle(1800);
  await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await settle(600);
  await openChapter(0);
  await J(`document.querySelector('#readerTrans').click()`); await settle(400);
  await J(`document.querySelector('#trMenu [data-tr="screen"]').click()`); await waitFor(`TR.mode==='both'`); await settle(1200);
  const tr = await fdoc(`({paged:d.documentElement.classList.contains('paged'), tr:d.querySelectorAll('.zt-tr').length})`);
  ok('translation in pages: the page stays in pages, the translation is under its paragraphs, the foot is kept up to date', tr.paged && tr.tr >= 3 && /^\d+ \/ \d+$/.test((await pg()).info), tr);
  await shut();

  // ------------------------------------------------ a phone: the page follows the finger
  await c.mobile(390, 780, 3); await settle(500);
  await fresh('zh');
  await J(`location.reload()`); await settle(2500);
  await J(`document.querySelector('[data-space="dir"]').click()`); await settle(1800);
  await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await settle(600);
  await openChapter(0);
  const ph = await pg(), PN = await nPages();
  ok('on a phone: one page as wide as the screen, 17 px letters, the foot with the chapters (before, next) and no arrows at the sides', ph.paged && ph.W === 390 && /^1 \/ \d+$/.test(ph.info) && (await fdoc(`getComputedStyle(d.body).fontSize`)) === '17px' && (await shown('#rbPrev')) && (await shown('#rbNext')) && !(await shown('#rEdgeR')) && !(await shown('#readerMobileNav')), ph);
  await c.shot(P.SHOTS + '/bookpaged_phone.png');
  await tStart(300); await sleep(30); await tMove(270); await sleep(30); await tMove(230); await sleep(30); await tMove(200);
  const mid = await fdoc(`Math.round(d.documentElement.scrollLeft)`);
  ok('the finger is on the page and drags it to the left by 100 px: the document is 100 px along (it follows the finger)', mid >= 85 && mid <= 115, mid);
  await tEnd(); await settle(700);
  ok('let go after a long pull (more than a sixth of the screen): the page goes on, to the whole page', (await pg()).left === 390 && (await pg()).info === `2 / ${PN}`, await pg());
  await drag([300, 285, 272, 270], 100);
  ok('a short, slow pull comes back: the page stays where it was', (await pg()).left === 390 && (await pg()).info === `2 / ${PN}`, await pg());
  await drag([300, 270, 250], 20);
  ok('a quick flick, even a short one, turns the page', (await pg()).left === 780 && (await pg()).info === `3 / ${PN}`, await pg());
  await drag([100, 160, 260], 40);
  ok('a pull to the right turns the page back', (await pg()).info === `2 / ${PN}`, await pg());
  await tap(350);
  ok('a tap at the right side turns the page (with the slide)', (await pg()).info === `3 / ${PN}`, await pg());
  await tap(40);
  ok('a tap at the left side turns it back', (await pg()).info === `2 / ${PN}`, await pg());
  await tap(195);
  ok('a tap in the middle puts the bars away (the foot too)', (await J(`document.body.classList.contains('reader-focus')`)) && !(await shown('#rBook')));
  await tap(195);
  ok('and brings them back', !(await J(`document.body.classList.contains('reader-focus')`)) && (await shown('#rBook')));
  await key('Home'); await sleep(300);
  await J(`document.querySelector('#rbFsP') && 0`);
  await tStart(100); await sleep(30); await tMove(150); await sleep(30); await tMove(200);
  const rub = await fdoc(`({left:Math.round(d.documentElement.scrollLeft), tr:d.querySelector('.doc').style.transform})`);
  ok('at the first page a pull to the right moves the text a little (held back), the page does not go', rub.left === 0 && /translateX\(\d/.test(rub.tr), rub);
  await tEnd(); await settle(600);
  ok('and it settles back', (await fdoc(`d.querySelector('.doc').style.transform`)) === '' && (await pg()).info === `1 / ${PN}`);
  await J(`document.querySelector('#rbFsP').click()`); await settle(900);
  ok('A+ on a phone: 17 px × 110 %', (await fdoc(`getComputedStyle(d.body).fontSize`)) === '18.7px');
  await J(`document.querySelector('#rbFsM').click()`); await settle(700);
  await key('End'); await settle(500);
  await drag([300, 250, 200], 30);
  await ready(); await settle(900);
  ok('a pull to the left on the last page goes on to the next chapter', /Chapter 2/.test((await pg()).title) && (await pg()).paged, await pg());
  await click('#rbPrev'); await ready(); await settle(900);
  ok('the button before in the foot goes to the chapter before (a phone has no arrows at the sides)', /Chapter 1/.test((await pg()).title), await pg());
  await shut();
  await J(`(()=>{ const d=state.dirData; if(!d.items.some(i=>i.id==='zz1')) d.items.unshift({id:'zz1',url:'${SITE}/a/2',title:'目录里的一篇文章',summary:'s',image:'',date:'2026-10-20',lang:'en',shelf:'',type:'article',tags:[]}); window.__zt.openDirReader('zz1'); })()`);
  await waitFor(`!document.querySelector('#reader').hidden && !document.querySelector('#rVote').hidden`, 15000); await settle(1500);
  const pv = await J(`(()=>{ const v=document.querySelector('#rVote').getBoundingClientRect(), b=document.querySelector('#rBook').getBoundingClientRect(), f=document.querySelector('#trFab').getBoundingClientRect(); return {bLeft:Math.round(b.left), bRight:Math.round(b.right), vLeft:Math.round(v.left), vRight:Math.round(v.right), vMid:Math.round((v.left+v.right)/2), fLeft:Math.round(f.left), bBottom:Math.round(b.bottom), miniTop:(()=>{ const m=document.querySelector('.pl-mini'); return m && getComputedStyle(m).display!=='none' ? Math.round(m.getBoundingClientRect().top) : null; })(), vw:innerWidth, fabShown:getComputedStyle(document.querySelector('#trFab')).display!=='none'}; })()`);
  ok('phone, an article of the directory: A− A+ at the left (above the small player when one is on), like / dislike in the middle, the round translate button at the right, none on another', pv.bRight <= pv.vLeft && Math.abs(pv.vMid - pv.vw / 2) <= 6 && (!pv.fabShown || pv.vRight <= pv.fLeft) && (pv.miniTop === null || pv.bBottom <= pv.miniTop + 1), pv);
  await c.shot(P.SHOTS + '/bookpaged_phone_vote.png');
  await shut();
  await c.desktop(1280, 900, 1);

  const mine = errs.filter(e => !/adsbygoogle|googlesyndication/.test(e));              // (the script of the adverts of the demo page is not ours)
  ok('no script errors in the whole run', mine.length === 0, mine);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
