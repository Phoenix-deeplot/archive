// e2e: the page of the picked books ("精选图书"): no filter bar of the directory (programs, domains, platforms), no "updated" line, no list of tags in the side; the card of a book says little
// (language, author, where it is read, chapters, where this reader is; no "站长推荐", "书籍", licence, tags); a row of genres, book lists (a line on why, the order of their maker), an author;
// closing the reader just closes it; the progress of the reader is on the card; a phone; English
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', SITE = 'http://127.0.0.1:8850', DIRF = P.DIST + '/dir/directory.json';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };

const CH = { s: '127.0.0.1:8850', p: 'Tale/', n: ['Chapter 1', 'Chapter 2', 'Chapter 3'] };
const book = (id, title, extra) => ({ id, title, summary: 'About ' + title + ': a short summary, long enough to be a summary of a book and not only a title.', url: SITE + '/a/' + id, image: '', date: '', type: 'book', lang: 'en', tags: ['小说', '在线书籍'], shelf: 'books', author: 'A. Writer', license: 'public-domain', ...extra });
const BOOKS = [
  book('tale0001', 'The Tale', { url: SITE + '/wiki/Tale', bid: 'tale', ch: CH }),
  book('short001', 'Short Story', { bid: 'short' }),
  book('lunyu001', '论语', { lang: 'zh', tags: ['哲学', '古典'], author: '孔子弟子', bid: 'lunyu' }),
  book('rust0001', 'Learn Rust', { tags: ['技术', '编程'], author: 'R. Dev', bid: 'rust' }),
  book('sci00001', 'Science Weekly', { tags: ['杂志', '科学'], author: 'Many', bid: 'sci' }),
  book('sunzi001', '孙子兵法', { lang: 'zh', tags: ['思想', '古典', '兵法'], author: '孙武', bid: 'sunzi' }),
];
const L = (id, zh, en, books) => ({ id, name: { zh, en }, blurb: { zh: zh + '：先读这些', en: en + ': read these first' }, books: books.map(b => (typeof b === 'string' ? { id: b } : b)) });
const LISTS = [
  L('start', '入门', 'Start', [{ id: 'short001', why: { zh: '最短的一本', en: 'The shortest' } }, { id: 'lunyu001', why: { zh: '对话体', en: 'Dialogues' } }, 'tale0001']),
  L('dev', '程序员', 'Developers', ['rust0001', 'sci00001']),
  L('old', '古典', 'Old books', ['lunyu001', 'sunzi001']),
  L('fic', '小说', 'Fiction', ['tale0001', 'short001']),
  L('more', '更多', 'More', ['sci00001', 'tale0001']),
];
const addBooks = () => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.shelves.push({ id: 'books', name: '精选图书', description: '人工挑选的、可以免费阅读的书和刊物', home: '', kind: 'books', lang: '', license: '', tags: [], n: BOOKS.length, updated: '2026-10-22', feed: '', status: 'ok', featured: true, rights: 'licensed' });
  d.items.push(...BOOKS); d.count = d.items.length; d.booklists = LISTS;
  fs.writeFileSync(DIRF, JSON.stringify(d));
};

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,render,itemById}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async (lang = 'zh') => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1')`);
    await c.goto(BASE, 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
  };
  const toPage = async () => { await J(`document.querySelector('#cats [data-dlanding="books"]').click()`); await sleep(900); };
  const card = title => `[...document.querySelectorAll('#grid .card')].find(c=>c.querySelector('.card-title a').textContent===${JSON.stringify(title)})`;
  const titles = () => J(`[...document.querySelectorAll('#grid .card .card-title a')].map(a=>a.textContent)`);
  const lists = () => J(`[...document.querySelectorAll('.bkp-list .bkp-name')].map(b=>b.textContent)`);
  const tabs = () => J(`[...document.querySelectorAll('#dirBar #dTabs [data-bgenre]')].map(b=>b.textContent+(b.getAttribute('aria-selected')==='true'?'*':'')).join('|')`);
  const head = () => J(`({title:document.querySelector('#viewTitle').textContent, sub:document.querySelector('#viewSub').textContent.trim()})`);

  addBooks();
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ what is gone
  await fresh();
  await J(`state.dPickT=new Set(['nothing-here']); state.dTabs='topic'; state.dTab=''; render()`);           // (a choice of the other pages must not reach this one)
  await toPage();
  const h0 = await head();
  ok('the page is "精选图书" and nothing under it (no explaining line, no line "updated ...")', h0.title === '精选图书' && h0.sub === '', h0);
  ok('there is no "已更新" line and no button for it, on this page and on the others', await J(`!document.querySelector('#updNote') && !document.querySelector('[data-dirrefresh]') && !/已更新/.test(document.querySelector('.view-head').textContent)`));
  ok('the row under the strip is the genres only: no 栏目 / 平台 switch, no dropdown of programs, and the row slides sideways (it does not wrap)', await J(`(()=>{ const t=document.querySelector('#dTabs'); return document.querySelector('#dirBar').offsetParent!==null && document.querySelector('#dTabsMode').offsetParent===null && !document.querySelector('#dPickBtn') && getComputedStyle(t).flexWrap==='nowrap' && getComputedStyle(t).overflowX==='auto'; })()`));
  ok('no list of tags in the side (the shelf list is still there)', await J(`getComputedStyle(document.querySelector('#tagbox')).display==='none' && !/标签/.test(document.querySelector('.side-scroll').innerText) && !!document.querySelector('#dir .shelf-row')`));
  ok('a choice of programs or domains made on the other pages does not hide the books here', (await titles()).length === 6, await titles());
  const tale = await J(`(()=>{ const c=${card('The Tale')}; return {badges:!!c.querySelector('.why, .ftype, .lic, .chips, .tag, .shelf-link, .mono-sm'), all:c.textContent.replace(/\\s+/g,' '), meta:c.querySelector('.xmeta').textContent, by:(c.querySelector('.bk-by')||{}).textContent, sum:!!c.querySelector('.sum'), go:(c.querySelector('.bk-go')||{}).textContent, heart:!!c.querySelector('.heart'), bm:!!c.querySelector('[data-d="save"]'), prog:!!c.querySelector('.bk-prog')}; })()`);
  ok('the card of a book: no "站长推荐", no "书籍", no licence, no tags, no shelf name, no mark of the shelf', !tale.badges && !/站长推荐|书籍|公有领域|精选图书|#/.test(tale.all), tale);
  ok('...it says the language, the chapters and where it is read; the author is under the title; the summary stays; like, bookmark and "试读" are there', /English/.test(tale.meta) && /3 章/.test(tale.meta) && tale.by === 'A. Writer' && tale.sum && tale.go === '试读' && tale.heart && tale.bm && !tale.prog, tale);
  const hs = await J(`(()=>{ const h=${card('The Tale')}.querySelector('.cstat.heart').getBoundingClientRect(), b=${card('The Tale')}.querySelector('[data-d="save"]').getBoundingClientRect(); return {w:Math.round(h.width), h:Math.round(h.height), bw:Math.round(b.width), bh:Math.round(b.height)}; })()`);
  ok('the heart is a finger-sized button, as big as the bookmark beside it (at least 36 px)', hs.w >= 36 && hs.h >= 36 && hs.h >= hs.bh - 2, hs);
  await c.shot(P.SHOTS + '/bookpage_home.png');

  // ------------------------------------------------ the book lists
  ok('the lists come first: four, in the order of their maker', (await lists()).join('|') === '入门|程序员|古典|小说', await lists());
  ok('...and a button for the rest', await J(`(()=>{ const b=document.querySelector('.bkp-lists .dt-more'); return !!b && /5/.test(b.textContent) && b.getAttribute('aria-expanded')==='false'; })()`));
  await J(`document.querySelector('.bkp-lists .dt-more').click()`); await sleep(400);
  ok('it opens all five', (await lists()).length === 5 && await J(`document.querySelector('.bkp-lists .dt-more').getAttribute('aria-expanded')`) === 'true', await lists());
  await J(`document.querySelector('.bkp-lists .dt-more').click()`); await sleep(300);
  ok('...and folds them again', (await lists()).length === 4);
  await J(`document.querySelector('.bkp-list').click()`); await sleep(700);
  const lh = await head();
  ok('a list: its name and its line are the heading, its books come in the order of the list, with the maker\'s line on each', lh.title === '入门' && lh.sub === '入门：先读这些' && (await titles()).join('|') === 'Short Story|论语|The Tale'
    && await J(`${card('Short Story')}.querySelector('.bk-why').textContent`) === '最短的一本' && await J(`!${card('The Tale')}.querySelector('.bk-why')`), [lh, await titles()]);
  ok('in a list: a way back, no lists, no genres', await J(`!!document.querySelector('.bkp-back') && !document.querySelector('.bkp-list') && !document.querySelector('#dTabs [data-bgenre]')`));
  ok('the numbers beside the sidebar\'s types do not change inside a list', await J(`(()=>{ const n=[...document.querySelectorAll('#cats .cat-btn')].find(b=>b.dataset.dtype==='all'); return !!n && +n.querySelector('.n').textContent>=6; })()`));
  await c.shot(P.SHOTS + '/bookpage_list.png');
  await J(`document.querySelector('.bkp-back').click()`); await sleep(500);
  ok('the way back leads to all the books', (await titles()).length === 6 && (await head()).title === '精选图书');

  // ------------------------------------------------ the genres
  ok('a row of genres, only those that have a book, "全部" first and chosen', (await tabs()) === '全部*|小说|哲学|技术|杂志', await tabs());
  await J(`document.querySelector('[data-bgenre="philosophy"]').click()`); await sleep(500);
  ok('a genre: its books only (a magazine about science is a magazine, a novel is a novel)', (await titles()).sort().join('|') === '孙子兵法|论语' && (await tabs()) === '全部|小说|哲学*|技术|杂志', [await titles(), await tabs()]);
  ok('...no lists while a genre is chosen', await J(`!document.querySelector('.bkp-list')`));
  await J(`document.querySelector('[data-bgenre="philosophy"]').click()`); await sleep(400);
  ok('the same genre again: back to all', (await titles()).length === 6 && (await lists()).length === 4);
  await J(`document.querySelector('[data-bgenre="novel"]').click()`); await sleep(400);
  ok('novels: The Tale and Short Story', (await titles()).sort().join('|') === 'Short Story|The Tale');

  // ------------------------------------------------ an author
  await J(`${card('The Tale')}.querySelector('.bk-by .au').click()`); await sleep(500);
  ok('the name of an author on a card shows his books (the genre is let go), with a chip to take it back', (await titles()).sort().join('|') === 'Short Story|The Tale' && await J(`document.querySelector('.bkp-au .chip').textContent.includes('A. Writer')`) && (await lists()).length === 0, await titles());
  await J(`document.querySelector('.bkp-au .chip').click()`); await sleep(500);
  ok('the chip takes the author back', (await titles()).length === 6 && await J(`!document.querySelector('.bkp-au')`));

  // ------------------------------------------------ the language of the page's top bar still counts
  await J(`document.querySelector('#langFilter [data-lf="zh"]').click()`); await sleep(500);
  ok('the language filter of the top bar still works on this page: only Chinese books, and no row of genres when there is only one', (await titles()).sort().join('|') === '孙子兵法|论语' && await J(`!document.querySelector('#dTabs [data-bgenre]')`), [await titles(), await J(`state.lf`)]);
  await J(`document.querySelector('#langFilter [data-lf="all"]').click()`); await sleep(400);

  // ------------------------------------------------ the progress of the reader
  await J(`state.progress['bk:tale0001']={i:1, pct:40, at:Date.now(), done:[0]}; LS.set('progress',state.progress); render()`); await sleep(500);
  const pr = await J(`(()=>{ const c=${card('The Tale')}; return {meta:c.querySelector('.xmeta').textContent, p:(c.querySelector('.bk-prog')||{style:{}}).style.getPropertyValue('--p'), go:c.querySelector('.bk-go').textContent}; })()`);
  ok('a book that the reader has begun: "读到 Chapter 2 · 47%", a thin line on the cover of the same length, "继续阅读"', /读到 Chapter 2 · 47%/.test(pr.meta) && pr.p === '47%' && pr.go === '继续阅读', pr);

  // ------------------------------------------------ leaving a book: no window
  await J(`${card('The Tale')}.querySelector('.bk-go').click()`); await sleep(3000);
  const inBook = await J(`({reader:!document.querySelector('#reader').hidden, title:document.querySelector('#readerTitle').textContent})`);
  await J(`document.querySelector('#readerBack').click()`); await sleep(800);
  const out = await J(`({reader:!document.querySelector('#reader').hidden, dlg:document.querySelector('#bookDlg').open, anyDlg:!!document.querySelector('dialog[open]'), title:document.querySelector('#viewTitle').textContent, cards:document.querySelectorAll('#grid .card').length})`);
  ok('leaving the book: it just closes, no window comes up, and the page of the books is there', inBook.reader && /The Tale/.test(inBook.title) && !out.reader && !out.dlg && !out.anyDlg && out.title === '精选图书' && out.cards === 6, [inBook, out]);
  await J(`${card('The Tale')}.querySelector('.bk-go').click()`); await sleep(2500);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(700);
  ok('Esc leaves it the same way', await J(`document.querySelector('#reader').hidden && !document.querySelector('dialog[open]')`));
  await J(`${card('The Tale')}.querySelector('.bk-go').click()`); await sleep(2500);
  await J(`window.dispatchEvent(new PopStateEvent('popstate',{state:{publicRoute:'books'}}))`); await sleep(700);          // (what the browser's back button gives the page when it leaves the reader: the state of the page below; a real back step may first take the chapter's own frame off the history)
  ok('the back button of the browser leaves it the same way: the reader closes and no window comes up', await J(`document.querySelector('#reader').hidden && !document.querySelector('dialog[open]')`));

  // ------------------------------------------------ the other pages: a picked book has no badge there either
  await J(`document.querySelector('#cats [data-dtype="all"]').click()`); await sleep(800);
  await J(`state.dShelf='books'; state.dLimit=200; render()`); await sleep(600);                      // (the books among everything: the shelf of the books chosen, as the other book tests do)
  const all = await J(`(()=>{ const c=[...document.querySelectorAll('#grid .card')].find(c=>c.querySelector('.card-title a')&&c.querySelector('.card-title a').textContent==='The Tale'); return c ? {badges:!!c.querySelector('.why, .ftype, .lic, .chips, .tag, .shelf-link, .mono-sm'), all:c.textContent.replace(/\\s+/g,' ')} : null; })()`);
  ok('in the list of everything a picked book has no "站长推荐", no "书籍", no licence either; the filter bar is there again', all && !all.badges && !/站长推荐|书籍|公有领域/.test(all.all) && await J(`document.querySelector('#dirBar').offsetParent!==null`), all);

  // ------------------------------------------------ a phone
  await c.mobile(390, 780, 3); await sleep(500);
  await fresh(); await toPage();
  const ph = await J(`(()=>{ const rs=[...document.querySelectorAll('.bkp-list')].map(b=>b.getBoundingClientRect()), tb=[...document.querySelectorAll('#dTabs [data-bgenre]')].map(b=>Math.round(b.getBoundingClientRect().height)); return {cols:new Set(rs.map(r=>Math.round(r.left))).size, right:Math.max(...rs.map(r=>r.right)), vw:innerWidth, tabH:Math.min(...tb), over:document.documentElement.scrollWidth>innerWidth, slide:getComputedStyle(document.querySelector('#dTabs')).overflowX, wrap:getComputedStyle(document.querySelector('#dTabs')).flexWrap, scroller:[...document.querySelectorAll('#dirReco *')].some(e=>{ const o=getComputedStyle(e).overflowX; return (o==='auto'||o==='scroll') && e.scrollWidth>e.clientWidth; })}; })()`);
  ok('on a phone: two lists side by side, nothing sideways on the page, the genres are finger-sized (40 px) in one row that slides', ph.cols === 2 && ph.right <= ph.vw && ph.tabH >= 40 && !ph.over && !ph.scroller && ph.slide === 'auto' && ph.wrap === 'nowrap', ph);
  const hp = await J(`(()=>{ const h=${card('The Tale')}.querySelector('.cstat.heart').getBoundingClientRect(); return {w:Math.round(h.width), h:Math.round(h.height)}; })()`);
  ok('on a phone the heart is at least 44 px', hp.w >= 44 && hp.h >= 44, hp);
  await c.shot(P.SHOTS + '/bookpage_phone.png');
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ English
  await fresh('en'); await toPage();
  const he = await head();
  ok('English: the heading (nothing under it), the lists, the genres', he.title === 'Book picks' && he.sub === '' && (await lists()).join('|') === 'Start|Developers|Old books|Fiction' && (await tabs()) === 'All*|Fiction|Philosophy|Tech|Magazines', [he, await lists(), await tabs()]);
  const te = await J(`(()=>{ const c=${card('The Tale')}; return {meta:c.querySelector('.xmeta').textContent, all:c.textContent, badges:!!c.querySelector('.why, .ftype, .lic, .chips, .tag, .shelf-link, .mono-sm')}; })()`);
  ok('English: the card says "English" and "3 chapters", and has no badge and no licence', /English/.test(te.meta) && /3 chapters/.test(te.meta) && !te.badges && !/Public domain|Editor/i.test(te.all), te);
  await J(`document.querySelector('.bkp-list').click()`); await sleep(500);
  ok('English: a list has its name, its line and the way back "‹ Book picks"', (await head()).title === 'Start' && /read these first/.test((await head()).sub) && /Book picks/.test(await J(`document.querySelector('.bkp-back').textContent`)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); process.exit(2); });
