// e2e: the translation of a picked book (R4): nothing is translated by itself (not the cards, not the window of a book); the button of a chapter opens a small menu (this screen / this chapter / the contents);
// the screen is only what is on it and a little more, the chapter is the rest (what is translated is not asked for again), the contents (the titles of the chapters) come with the chapter or alone and are
// shown under the titles; the translation of every paragraph is kept for itself (the chapter again: nothing is asked); what is left of the day is told; the name and the summary of a book on request;
// on a phone a round button at the corner of the page (not in a focus, not on an article); English.
// The directory's /api/translate is the real translateapi.py behind the fake services (sync_dev.py, :8840): its providers are fake ("译:" before a text for Chinese, "EN:" for English).
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', SITE = 'http://127.0.0.1:8850', SVC = 'http://127.0.0.1:8840', DIRF = P.DIST + '/dir/directory.json';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };
const get = p => fetch(SVC + p).then(r => r.json());

const CH = { s: '127.0.0.1:8850', p: 'Tale/', n: ['Chapter 1', 'Chapter 2', 'Chapter 3'], t: ['The lamps', 'The river', 'The bridge'] };
const TALE = { id: 'tale0001', title: 'The Tale', summary: 'The Tale：这是一本用来试翻译的书，写的是一个关于灯和河的故事。', url: SITE + '/wiki/Tale', image: '', date: '', type: 'book', lang: 'en', tags: ['小说', '在线书籍'], shelf: 'books', author: 'A. Writer', license: 'public-domain', bid: 'tale', ch: CH };
const ZHBOOK = { id: 'zhbook001', title: '一本中文书', summary: '这是一本中文书的简介。', url: 'https://example.org/zh', image: '', date: '', type: 'book', lang: 'zh', tags: ['小说'], shelf: 'books', author: '某人', license: 'public-domain', ch: { s: '127.0.0.1:8850', p: 'Zh/', n: ['第1回'] } };
const addBooks = () => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.shelves.push({ id: 'books', name: '精选图书', description: '人工挑选的、可以免费阅读的书和刊物', home: '', kind: 'books', lang: '', license: '', tags: [], n: 2, updated: '2026-10-22', feed: '', status: 'ok', featured: true, rights: 'licensed' });
  d.items.push(TALE, ZHBOOK); d.count = d.items.length;
  fs.writeFileSync(DIRF, JSON.stringify(d));
};
const ARTICLE = '# A short history of tea\n\n' + ['Tea was first drunk in China, as a medicine, thousands of years ago.', 'It reached Europe by ship in the seventeenth century and soon became a habit.'].join('\n\n');

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = async expr => { try { return await c.js(`(()=>{ const {state,LS,idb,loadAll,render,openReader,itemById,TR,transApi}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`); } catch (e) { throw new Error(e.message + '  IN: ' + expr.slice(0, 160)); } };
  const waitFor = async (expr, ms = 12000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(150); } };
  const fresh = async (lang = 'zh') => {
    await get('/__trans?mode=ok&reset=1'); await get('/__book_reset');
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.trOk','1')`);
    await c.goto(BASE, 2500);
    await J(`(async()=>{ await idb.put({id:'local:en',path:'',category:'notes',filename:'en.md',hash:'',title:'A short history of tea',summary:'s',keywords:[],lang:'en',minutes:1,pages:null,size:10,date:'2026-01-01',added:1,featured:false,hidden:false,cover:'',type:'md',data:${JSON.stringify(ARTICLE)}}); await loadAll(); render(); })()`);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
    await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await sleep(600);
    await waitFor(`!!transApi()`);
  };
  const log = () => get('/__trans_log');
  const fdoc = expr => J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return ${expr}; })()`);
  const openBookWindow = async () => { await J(`[...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes('The Tale')).querySelector('.card-title a').click()`); await sleep(500); };
  const openChapter = async i => {
    await openBookWindow(); await J(`document.querySelector('#bookDlg [data-bo-ch="${i}"]').click()`);
    await waitFor(`(()=>{ const d=document.querySelector('#frame').contentDocument; return !!(d && d.body && d.querySelectorAll('.doc>p:not([class])').length>2); })()`);
    await sleep(900);
  };
  const shut = async () => { await J(`document.querySelector('#readerBack').click()`); await sleep(500); await J(`document.querySelector('#bookDlg').open && document.querySelector('#bookClose').click()`); await sleep(300); };
  const menu = () => J(`(()=>{ const m=document.querySelector('#trMenu'); return {open:!m.hidden, items:[...m.querySelectorAll('[data-tr]')].filter(b=>!b.hidden).map(b=>b.dataset.tr), cycle:document.querySelector('#trMenuCycle').textContent, left:document.querySelector('#trLeft').hidden?'':document.querySelector('#trLeft').textContent}; })()`);
  const pick = async k => { await J(`document.querySelector('#readerTrans').click()`); await sleep(300); await J(`document.querySelector('#trMenu [data-tr="${k}"]').click()`); };
  const idle = async () => { await sleep(300); await waitFor(`!TR.busy`); await sleep(400); };

  addBooks();
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ nothing by itself
  await fresh();
  ok('the cards of the books are never translated by themselves', (await log()).length === 0);
  await openBookWindow();
  await waitFor(`!document.querySelector('#bookTrBtn').hidden`);
  ok('the window of a book: nothing is translated by itself, and there is a button for its name and summary', (await log()).length === 0 && !(await J(`document.querySelector('#bookTrBtn').hidden`)) && (await J(`document.querySelector('#bookTr').hidden`)));
  await J(`document.querySelector('#bookTrBtn').click()`); await waitFor(`!document.querySelector('#bookTr').hidden`);
  let lg = await log();
  ok('"翻译简介": only what is not in the language already is sent (the English name, not the Chinese summary), and the translation is shown in the window', lg.length === 1 && lg[0].n === 1 && /译:The Tale/.test(await J(`document.querySelector('#bookTr').textContent`)), [lg, await J(`document.querySelector('#bookTr').textContent`)]);
  await J(`document.querySelector('#bookClose').click()`); await sleep(300);
  await J(`[...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes('一本中文书')).querySelector('.card-title a').click()`); await sleep(500);
  await sleep(1200);
  ok('a Chinese book for a Chinese interface: no button (nothing to translate)', await J(`document.querySelector('#bookTrBtn').hidden`));
  await J(`document.querySelector('#bookClose').click()`); await sleep(300);

  // ------------------------------------------------ the menu of a chapter
  await openChapter(0);
  ok('a chapter is open and nothing more was sent', (await log()).length === 1);
  await J(`document.querySelector('#readerTrans').click()`); await sleep(400);
  const m0 = await menu();
  ok('the button of a chapter opens a menu: this screen, this chapter, the contents (nothing is translated yet, so no "switch")', m0.open && m0.items.join() === 'screen,all,toc' && (await log()).length === 1 && (await fdoc(`d.querySelectorAll('.zt-tr').length`)) === 0, m0);
  await c.shot(P.SHOTS + '/booktrans_menu.png');
  await J(`document.querySelector('#trMenu [data-tr="screen"]').click()`); await idle();
  lg = await log();
  const total = await fdoc(`[...d.querySelectorAll('p,li,h1,h2,h3')].filter(e=>!e.closest('.zt-tr,nav,.doc-meta,.doc-src,.doc-lic')).length`), n1 = await fdoc(`d.querySelectorAll('.zt-tr').length`);
  ok('"翻译本屏": only the paragraphs on the screen and a little more are sent (not the whole chapter), each one has its translation under it', lg.length === 2 && lg[1].n === n1 && n1 >= 4 && n1 < total - 8, { lg, n1, total });
  ok('the end of the chapter is not translated yet; the author and source lines never are', (await fdoc(`(()=>{ const ps=[...d.querySelectorAll('.doc>p:not([class])')]; return !ps[ps.length-1].querySelector('.zt-tr') && !d.querySelector('.doc-meta .zt-tr') && !d.querySelector('.doc-src .zt-tr'); })()`)));
  const m1 = await (async () => { await J(`document.querySelector('#readerTrans').click()`); await sleep(300); return menu(); })();
  ok('the menu now offers to switch (双语), and tells what is left of today\'s allowance', m1.items.includes('cycle') && /双语/.test(m1.cycle) && /今天还可以翻译约 \d+ 字/.test(m1.left), m1);
  await J(`document.querySelector('#trMenu [data-tr="all"]').click()`); await idle();
  lg = await log();
  const n2 = await fdoc(`d.querySelectorAll('.zt-tr').length`);
  ok('"翻译本章": the rest of the chapter (what has its translation is not sent again); then the titles of the contents, in a call of their own', lg.length === 4 && lg[2].n === total - n1 && lg[3].n === 3 && n2 === total, { lg, n2, total, n1 });
  await J(`document.querySelector('#readerToc').click()`); await sleep(400);
  const toc = await J(`[...document.querySelectorAll('#rTocBody .toc-i.bk')].map(b=>(b.querySelector('.trl')||{}).textContent||'')`);
  ok('the contents show the translation of each title under it', toc.join('|') === '译:The lamps|译:The river|译:The bridge', toc);
  await c.shot(P.SHOTS + '/booktrans_toc.png');
  await J(`document.querySelector('#readerToc').click()`); await sleep(300);

  // ------------------------------------------------ switching, and the chapter again
  await J(`document.querySelector('#readerTrans').click()`); await sleep(300);
  await J(`document.querySelector('#trMenuCycle').click()`); await sleep(400);
  ok('the menu switches: 译文 (the translation alone)', (await J(`document.querySelector('#readerTransLbl').textContent`)) === '译文' && (await fdoc(`d.documentElement.classList.contains('zt-only')`)));
  await shut();
  const before = (await log()).length;
  await openChapter(0);
  await pick('all'); await idle();
  ok('the chapter again: every paragraph is translated from this browser\'s cache, nothing is asked of the service', (await log()).length === before && (await fdoc(`d.querySelectorAll('.zt-tr').length`)) === total, { before, now: (await log()).length });
  await shut();

  // ------------------------------------------------ the contents alone
  await openChapter(2);
  await pick('toc'); await sleep(900);
  ok('"翻译目录" on its own: the titles are not asked again (kept), the contents open and say so', (await log()).length === before && (await J(`!document.querySelector('#rTocPanel').hidden`)) && /目录翻译好了/.test(await J(`document.querySelector('#toastMsg').textContent`)), await log());
  await shut();

  // ------------------------------------------------ English: the summary of a Chinese-written book goes into English
  await fresh('en');
  await openBookWindow(); await waitFor(`!document.querySelector('#bookTrBtn').hidden`);
  await J(`document.querySelector('#bookTrBtn').click()`); await waitFor(`!document.querySelector('#bookTr').hidden`);
  lg = await log();
  ok('an English interface: the Chinese summary is translated (the English name is not)', lg.length === 1 && lg[0].to === 'en' && lg[0].n === 1 && /^EN:/.test(await J(`document.querySelector('#bookTr').textContent`)), [lg, await J(`document.querySelector('#bookTr').textContent`)]);
  await J(`document.querySelector('#bookClose').click()`); await sleep(300);

  // ------------------------------------------------ a phone
  await c.mobile(390, 780, 3); await sleep(500);
  await fresh('zh');
  await openChapter(0);
  const fab = await J(`(()=>{ const f=document.querySelector('#trFab'), r=f.getBoundingClientRect(), nav=document.querySelector('#readerMobileNav').getBoundingClientRect(); return {shown:getComputedStyle(f).display!=='none', right:Math.round(r.right), bottom:Math.round(r.bottom), navTop:Math.round(nav.top), w:Math.round(r.width), vw:innerWidth}; })()`);
  ok('on a phone a round button is at the corner of the page: finger-sized, inside the screen, above the bar of chapters', fab.shown && fab.w >= 44 && fab.right <= fab.vw && fab.bottom <= fab.navTop, fab);
  await J(`document.querySelector('#trFab').click()`); await sleep(400);
  const pm = await J(`(()=>{ const m=document.querySelector('#trMenu'), r=m.getBoundingClientRect(); return {open:!m.hidden, top:Math.round(r.top), bottom:Math.round(r.bottom), left:Math.round(r.left), right:Math.round(r.right), vh:innerHeight, vw:innerWidth}; })()`);
  ok('it opens the same menu at the foot of the screen', pm.open && pm.top > pm.vh * 0.4 && pm.bottom <= pm.vh && pm.left >= 0 && pm.right <= pm.vw, pm);
  await c.shot(P.SHOTS + '/booktrans_phone.png');
  await J(`document.querySelector('#trMenu [data-tr="screen"]').click()`); await idle();
  ok('"翻译本屏" on a phone translates the screen', (await fdoc(`d.querySelectorAll('.zt-tr').length`)) >= 3);
  await J(`document.body.classList.add('reader-focus')`); await sleep(300);
  ok('in the focus (no bars) the round button goes away', (await J(`getComputedStyle(document.querySelector('#trFab')).display`)) === 'none');
  await J(`document.body.classList.remove('reader-focus')`);
  await shut();
  await J(`openReader('local:en')`); await waitFor(`!document.querySelector('#reader').hidden`); await sleep(1500);
  ok('an article that is not a book has no round button (and the button of its bar is as it was)', await J(`document.querySelector('#trFab').hidden`));
  await c.desktop(1280, 900, 1);

  ok('no script errors in the whole run', errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
