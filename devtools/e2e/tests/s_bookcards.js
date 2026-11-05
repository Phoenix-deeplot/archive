// e2e: the cards and rows of the picked books (R3): a book that has no picture is drawn as a book (its own colour, the title big, the author), the author under the title, three lines of the summary,
// "试读" / "继续阅读" straight into the book; a small book and one line in the list; a book that cannot be read in the page has no button; other cards stay as they are; a phone; English
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', SITE = 'http://127.0.0.1:8850', DIRF = P.DIST + '/dir/directory.json';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };

const CH = { s: '127.0.0.1:8850', p: 'Tale/', n: ['Chapter 1', 'Chapter 2', 'Chapter 3'] };
const book = (id, title, extra) => ({ id, title, summary: '这是《' + title + '》的简介：一本用来试卡片的书，它的介绍要写得长一点，才看得出三行摘要在哪里被截断，所以这里多写几句话，再多写几句，直到足够长为止。', url: SITE + '/wiki/' + id, image: '', date: '', type: 'book', lang: 'en', tags: ['小说', '在线书籍'], shelf: 'books', author: 'A. Writer', license: 'public-domain', ...extra });
const BOOKS = [
  book('tale0001', 'The Tale', { url: SITE + '/wiki/Tale', bid: 'tale', ch: CH }),
  book('onepage01', 'One Page Book', { url: SITE + '/a/2', tags: ['随笔', '在线书籍'], bid: 'page' }),
  book('pictured1', 'A Book With A Picture', { url: SITE + '/a/3', image: 'https://img.invalid/p.png', bid: 'pic' }),
  book('journal01', '一本很长很长的开放期刊的名字（用来看书名多长时封面怎么办）', { url: 'https://example.org/journal', tags: ['期刊', '科学'], license: 'cc-by', author: '', lang: 'zh' }),
];
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
  const J = expr => c.js(`(()=>{ const {state,LS,render,itemById}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async (lang = 'zh', clear = true) => {
    await c.goto('about:blank', 200); if (clear) await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1')`);
    await c.goto(BASE, 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
    await J(`state.dShelf='books'; state.dView='all'; state.dTab=''; render()`); await sleep(600);
  };
  const card = title => `[...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes(${JSON.stringify(title)}))`;
  const info = title => J(`(()=>{ const c=${card(title)}; if(!c) return null; const q=s=>c.querySelector(s), bk=q('.bk-book'), cv=q('.xcover, .row-thumb'), sum=q('.sum'), go=q('.bk-go'), r=x=>x?x.getBoundingClientRect():null; return {
      hasBook:!!bk, t:bk?(q('.bk-t')||{}).textContent:'', a:bk?(q('.bk-a')||{}).textContent:'', by:(q('.bk-by')||{}).textContent||'', img:!!q('.xcover img'), sumText:sum?sum.textContent.length:0, clamp:sum?getComputedStyle(sum).webkitLineClamp:'',
      go:go?go.textContent:'', bg:bk?getComputedStyle(bk).backgroundColor:'', ratio:bk?Math.round(r(bk).width/r(bk).height*100)/100:0, coverH:cv?Math.round(r(cv).height):0, bookH:bk?Math.round(r(bk).height):0,
      meta:(q('.xmeta')||{}).textContent||'', all:c.textContent.replace(/\s+/g,' '), badges:!!q('.why, .ftype, .lic, .chips, .tag, .shelf-link, .mono-sm'), prog:!!q('.bk-prog'), thumbW:q('.row-thumb')?Math.round(r(q('.row-thumb')).width):0, thumbH:q('.row-thumb')?Math.round(r(q('.row-thumb')).height):0, row:c.classList.contains('drow'), cardRight:Math.round(r(c).right) }; })()`);

  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  await c.send('Fetch.enable', { patterns: [{ urlPattern: 'https://img.invalid/*' }] });                         // (the picture of a book: answered here, so that it really loads)
  c.on(m => { if (m.method === 'Fetch.requestPaused') c.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: PNG }).catch(() => {}); });
  addBooks();
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ the card of a book that has no picture
  await fresh();
  const tale = await info('The Tale'), one = await info('One Page Book'), pic = await info('A Book With A Picture'), jr = await info('开放期刊');
  ok('a book with no picture is drawn as a book: the title big, the author at the foot, in the shape of a book', tale.hasBook && tale.t === 'The Tale' && tale.a === 'A. Writer' && Math.abs(tale.ratio - 0.75) < 0.03 && tale.bookH > tale.coverH * 0.8, tale);
  ok('each book has a colour of its own', tale.bg !== one.bg || tale.bg !== jr.bg, [tale.bg, one.bg, jr.bg]);
  ok('the author is under the title too, and the summary has three lines', tale.by === 'A. Writer' && tale.clamp === '3' && tale.sumText > 40, tale);
  ok('a book that has a picture keeps its picture (no drawn cover)', pic.img && !pic.hasBook, pic);
  ok('a long title is cut and the cover still holds (a Chinese journal)', jr.hasBook && jr.t.startsWith('一本很长') && jr.bookH > jr.coverH * 0.8 && !jr.a, jr);
  ok('the card says the chapters in its line of facts, with the author and the language of the book', /3 章/.test(tale.meta) && /中文|English/.test(tale.meta) && /A\. Writer/.test(tale.all), [tale.meta, tale.all]);
  ok('the card of a book has no "站长推荐", no "书籍", no licence, no tags, no shelf name, no mark of the shelf', !tale.badges && !/站长推荐|书籍|公有领域|CC BY|#/.test(tale.all) && !one.badges && !jr.badges && !tale.prog, [tale.badges, tale.all]);
  ok('"试读" on a book that can be read in the page, none on a book that cannot (a journal on its own site)', tale.go === '试读' && one.go === '试读' && jr.go === '', [tale.go, one.go, jr.go]);
  await c.shot(P.SHOTS + '/bookcards_grid.png');

  // ------------------------------------------------ the button: straight into the book, then "continue"
  await J(`${card('One Page Book')}.querySelector('.bk-go').click()`); await sleep(3500);
  const pg = await J(`({reader:!document.querySelector('#reader').hidden, dlg:document.querySelector('#bookDlg').open, text:((document.querySelector('#frame').contentDocument||{body:{textContent:''}}).body||{textContent:''}).textContent})`);
  ok('a book of one page: the button opens it in the reader at once', pg.reader && !pg.dlg && /Lead time is the gap/.test(pg.text), pg);
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);
  await J(`${card('The Tale')}.querySelector('.bk-go').click()`); await sleep(500);
  for (let k = 0; k < 20; k++) { const n = await J(`((document.querySelector('#frame').contentDocument||{body:{textContent:''}}).body||{textContent:''}).textContent.length`); if (n > 400) break; await sleep(400); }
  const t1 = await J(`({reader:!document.querySelector('#reader').hidden, dlg:document.querySelector('#bookDlg').open, title:document.querySelector('#readerTitle').textContent})`);
  ok('a book with chapters: the button opens the first chapter at once (no window in between)', t1.reader && !t1.dlg && t1.title === 'The Tale · Chapter 1', t1);
  await J(`window.__zt.goPct(50)`); await sleep(600);                                                     // (a book is in pages: to the page that has the middle of the text)
  const page50 = await J(`document.querySelector('#rbInfo').textContent`);
  await J(`document.querySelector('#readerBack').click()`); await sleep(600);
  const dlgAfter = await J(`({dlg:document.querySelector('#bookDlg').open, reader:!document.querySelector('#reader').hidden})`);
  await J(`document.querySelector('#bookDlg').open && document.querySelector('#bookClose').click()`); await sleep(400);
  const again = await info('The Tale');
  ok('after reading a little the card says "继续阅读" and where the reader is (the chapter, how much of the whole book), and a thin line on the cover', again.go === '继续阅读' && /读到 Chapter 1 · \d+%/.test(again.meta) && again.prog, [again.go, again.meta, again.prog]);
  ok('closing the reader just closes it: the window of the chapters does not come back', !dlgAfter.dlg && !dlgAfter.reader, dlgAfter);
  await J(`${card('The Tale')}.querySelector('.bk-go').click()`); await sleep(2500);
  const t2 = await J(`({reader:!document.querySelector('#reader').hidden, title:document.querySelector('#readerTitle').textContent, at:document.querySelector('#rbInfo').textContent})`);
  ok('"继续阅读" goes back to the chapter and the page where the reader was', t2.reader && t2.title === 'The Tale · Chapter 1' && t2.at === page50 && !/^1 \//.test(t2.at), [t2, page50]);
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);
  await J(`document.querySelector('#bookDlg').open && document.querySelector('#bookClose').click()`); await sleep(300);

  // ------------------------------------------------ the list
  await J(`state.view='list'; render()`); await sleep(700);
  const row = await info('The Tale'), rowj = await info('开放期刊');
  ok('in the list a book is a small book, its title and author, one line of its summary and its chapters, with no button', row.row && row.hasBook && row.thumbW === 62 && row.thumbH === 84 && row.clamp === '1' && /3 章/.test(row.meta) && /A\. Writer/.test(row.meta) && row.go === '', row);
  ok('the small book is a book (its title is on it)', row.t === 'The Tale' && rowj.hasBook, [row.t, rowj.t]);
  await c.shot(P.SHOTS + '/bookcards_list.png');
  await J(`state.view='cards'; render()`); await sleep(500);

  // ------------------------------------------------ the other cards are as they were
  await J(`state.dShelf='blogA'; render()`); await sleep(600);
  const other = await J(`({book:document.querySelectorAll('#grid .bk-book').length, go:document.querySelectorAll('#grid .bk-go').length, cards:document.querySelectorAll('#grid .card').length})`);
  ok('the cards of other programs have no drawn book and no button', other.cards > 0 && other.book === 0 && other.go === 0, other);

  // ------------------------------------------------ a phone, English
  await c.mobile(390, 780, 3); await sleep(500);
  await fresh('zh', true);
  const ph = await info('The Tale');
  const over = await J(`document.documentElement.scrollWidth>innerWidth`);
  ok('on a phone the drawn book fits its card and nothing overflows sideways', ph.hasBook && ph.bookH > 0 && ph.cardRight <= 390 && !over, [ph, over]);
  await c.shot(P.SHOTS + '/bookcards_phone.png');
  await c.desktop(1280, 900, 1);
  await fresh('en', true);
  const en = await info('The Tale');
  ok('English: "Read a sample"', en.go === 'Read a sample', en);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); process.exit(2); });
