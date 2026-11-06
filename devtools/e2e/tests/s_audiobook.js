// e2e: the audiobooks of the picked books page ("精选图书"): a tab "有声书" among the genres (only when the service has audiobooks), the books as cards (the hottest first, styles, the language button), a book with all its
// chapters the first chapter first, "from the start" / "carry on" (the chapter and the second where it was left), the chapters are the list of the bar and the next one comes by itself, what is kept on this device and cleared
// with the rest. (demo app :8820, fake services :8840 and :8843, with /__listen?v2=1; headless Edge)
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840', DIRF = P.DIST + '/dir/directory.json';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };

const book = (id, title) => ({ id, title, summary: 'About ' + title + ': a short summary, long enough to be a summary of a book and not only a title.', url: 'http://127.0.0.1:8850/a/' + id, image: '', date: '', type: 'book', lang: 'en', tags: ['小说', '在线书籍'], shelf: 'books', author: 'A. Writer', license: 'public-domain', bid: id });
const addBooks = () => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.shelves.push({ id: 'books', name: '精选图书', description: '人工挑选的、可以免费阅读的书和刊物', home: '', kind: 'books', lang: '', license: '', tags: [], n: 2, updated: '2026-10-22', feed: '', status: 'ok', featured: true, rights: 'licensed' });
  d.items.push(book('tale0001', 'The Tale'), { ...book('short001', 'Short Story'), tags: ['哲学', '古典'] }); d.count = d.items.length; d.booklists = [];
  fs.writeFileSync(DIRF, JSON.stringify(d));
};

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* the page is busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(100); } };
  const svc = q => fetch(SVC + '/__listen?mode=ok&' + q).then(r => r.json());
  const log2 = () => fetch(SVC + '/__listen_log2').then(r => r.json());
  const fresh = async (q = 'v2=1', lang = 'zh') => {
    await svc('reset=1&' + q);
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1')`);
    await c.goto(BASE, 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
    await J(`document.querySelector('#cats [data-dlanding="books"]').click()`); await sleep(1200);
  };
  const tabs = () => J(`[...document.querySelectorAll('#dirBar #dTabs [data-bgenre]')].map(b=>b.textContent+(b.getAttribute('aria-selected')==='true'?'*':'')).join('|')`);
  const audio = async () => { await waitFor(`!!document.querySelector('#dTabs [data-bgenre="audio"]')`, 6000); await J(`document.querySelector('#dTabs [data-bgenre="audio"]').click()`); await waitFor(`document.querySelector('#abRoot .ab-grid')`, 6000); await sleep(200); };
  const cards = () => J(`[...document.querySelectorAll('#abRoot .ab-card')].map(b=>b.querySelector('b').textContent)`);
  const open = async title => { await J(`[...document.querySelectorAll('#abRoot .ab-card')].find(b=>b.querySelector('b').textContent===${JSON.stringify(title)}).click()`); await waitFor(`document.querySelectorAll('#abRoot .ab-ch').length>0`, 6000); await sleep(150); };
  addBooks();
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ an older service has no audiobooks
  await fresh('v2=0');
  ok('a service that does not know audiobooks: the genres of the books and no tab "有声书"', !/有声书/.test(await tabs()), await tabs());

  // ------------------------------------------------ the tab and the books
  await fresh();
  await waitFor(`!!document.querySelector('#dTabs [data-bgenre="audio"]')`, 6000);
  const t0 = await tabs();
  ok('a service that has audiobooks: the tab "有声书" comes after the genres of the books', /^全部\*\|.*有声书$/.test(t0), t0);
  await audio();
  ok('the tab is chosen: the page is "有声书", the books of the directory are gone, a line says what is here', await J(`document.querySelector('#viewTitle').textContent`) === '有声书' && await J(`document.querySelectorAll('#grid .card').length`) === 0 && /公版和电台/.test(await J(`document.querySelector('#abRoot .ab-intro').textContent`)) && /有声书\*/.test(await tabs()), await tabs());
  ok('four books, the hottest first; the first three say “热门”', (await cards()).join('|') === '红楼梦|爱丽丝梦游仙境|福尔摩斯探案集：冒险史|聊斋志异' && await J(`document.querySelectorAll('#abRoot .ab-hot').length`) === 3, await cards());
  const styles = await J(`[...document.querySelectorAll('#abRoot .ab-styles .dr-chip')].map(b=>b.textContent+(b.getAttribute('aria-pressed')==='true'?'*':'')).join('|')`);
  ok('the styles of the service are a row of choices, “全部” chosen', styles === '全部*|经典名著|故事悬疑|童话寓言|国学经典', styles);
  ok('a book whose sound is abroad (LibriVox) carries a small “海外”, the Chinese ones do not', await J(`[...document.querySelectorAll('#abRoot .ab-card')].map(b=>!!b.querySelector('.ab-gl')).join()`) === 'false,true,true,false', await J(`[...document.querySelectorAll('#abRoot .ab-card')].map(b=>!!b.querySelector('.ab-gl')).join()`));
  await J(`document.querySelector('#abRoot [data-ab-style="story"]').click()`); await sleep(150);
  ok('a style keeps its books: 故事悬疑 has the detective stories and the strange tales', (await cards()).join('|') === '福尔摩斯探案集：冒险史|聊斋志异', await cards());
  await J(`document.querySelector('#abRoot [data-ab-style=""]').click()`); await sleep(100);
  await J(`document.querySelector('#lfBtn').click()`); await sleep(300);
  const lf1 = await cards();
  ok('the button of the language of the content works here too (中: the Chinese books)', await J(`state.lf`) === 'zh' && lf1.join('|') === '红楼梦|聊斋志异', [await J(`state.lf`), lf1]);
  await J(`document.querySelector('#lfBtn').click()`); await sleep(300);
  ok('(EN: the English ones)', (await cards()).join('|') === '爱丽丝梦游仙境|福尔摩斯探案集：冒险史', await cards());
  await J(`document.querySelector('#lfBtn').click()`); await sleep(300);

  // ------------------------------------------------ a book
  await open('红楼梦');
  const bk = await J(`({title:document.querySelector('#abRoot h3').textContent, by:document.querySelector('#abRoot .ab-by').textContent, meta:document.querySelector('#abRoot .ab-hero .ab-m').textContent, rt:document.querySelector('#abRoot .ab-rt').textContent, go:[...document.querySelectorAll('#abRoot .ab-acts button')].map(b=>b.textContent.trim()).join('|'), n:document.querySelectorAll('#abRoot .ab-ch').length, first:document.querySelector('#abRoot .ab-ch .ab-n').textContent, firstT:document.querySelector('#abRoot .ab-ch .ab-ct').textContent, last:[...document.querySelectorAll('#abRoot .ab-ch .ab-n')].pop().textContent})`);
  ok('a book: title, author · who reads, how many chapters and how long, where its text comes from; one button “从头听”; every chapter, the first one first', bk.title === '红楼梦' && bk.by === '曹雪芹 · 男中音朗读' && /^30 章 · /.test(bk.meta) && /公版/.test(bk.rt) && bk.go === '从头听' && bk.n === 30 && bk.first === '1' && /^第1回/.test(bk.firstT) && bk.last === '30', bk);
  ok('the chapters were asked for (one question)', (await log2()).filter(x => x === 'book:cn-hlm').length === 1, await log2());
  await J(`document.querySelector('#abRoot .ab-go').click()`);
  ok('“从头听” plays the first chapter; the 30 chapters are the list of the bar, in order; the bar is the bar of an episode (speed, back 15 / on 30), not of a song', await waitFor(`pl.q.length===30 && pl.q[pl.i]==='tmp:ls:ab:cn-hlm:1' && plAudio.currentTime>0.05`, 9000) && await J(`!document.body.classList.contains('pl-music')`) && await J(`pl.q[0]==='tmp:ls:ab:cn-hlm:1' && pl.q[29]==='tmp:ls:ab:cn-hlm:30'`), [await J(`pl.q.length`), await J(`pl.q[pl.i]`)]);
  ok('the chapter that plays is marked in the list, and the bar says the chapter and the book', await J(`document.querySelector('#abRoot .ab-ch[data-ab-ch="1"]').classList.contains('is-playing')`) && /第1回/.test(await J(`document.querySelector('#plTitle').textContent`)) && /红楼梦/.test(await J(`document.querySelector('#plSub').textContent`)));
  await J(`plAudio.currentTime=plAudio.duration-0.4`);
  ok('when a chapter ends the next one comes by itself (the second, not the last: the order of the book)', await waitFor(`pl.q[pl.i]==='tmp:ls:ab:cn-hlm:2' && plAudio.currentTime>0.05`, 9000), await J(`pl.q[pl.i]`));
  ok('the book remembers it: the chapter that was begun last is 2', await J(`LS.get('abLast',{})['cn-hlm'].n`) === 2);
  ok('the list shows chapter 1 as heard (✓), 2 as the one that plays', await waitFor(`document.querySelector('#abRoot .ab-ch[data-ab-ch="1"] .ab-d').textContent==='✓' && document.querySelector('#abRoot .ab-ch[data-ab-ch="2"]').classList.contains('is-cur')`, 4000));

  // ------------------------------------------------ carry on
  await J(`document.querySelector('#abRoot .ab-ch[data-ab-ch="2"] button').click()`);               // (a chapter of the list: from where it was left, the book goes on after it)
  await waitFor(`pl.q[pl.i]==='tmp:ls:ab:cn-hlm:2' && plAudio.currentTime>0.05`, 6000);
  await J(`plAudio.currentTime=7`); await sleep(300); await J(`plAudio.pause()`); await sleep(300);
  await J(`document.querySelector('#abRoot [data-ab-back]').click()`); await sleep(200);
  ok('the list of books says where each was left, and offers to carry on with the one heard last', /听到第 2 章/.test(await J(`document.querySelector('#abRoot .ab-card').textContent`)) && /接着听《红楼梦》第 2 章/.test(await J(`document.querySelector('#abRoot .ab-resume').textContent`)));
  await open('红楼梦');
  ok('in the book: the button says “接着听 · 第 2 章” (and the way back to the start), the chapter has a line of how far it was heard', /^接着听 · 第 2 章\|从头听$/.test(await J(`[...document.querySelectorAll('#abRoot .ab-acts button')].map(b=>b.textContent.trim()).join('|')`)) && await J(`!!document.querySelector('#abRoot .ab-ch[data-ab-ch="2"] .ab-pg')`));
  await J(`plAudio.pause(); document.querySelector('#abRoot [data-ab-go]').click()`);
  ok('“接着听” goes on where it was left: chapter 2, a few seconds before the second where it stopped', await waitFor(`pl.q[pl.i]==='tmp:ls:ab:cn-hlm:2' && plAudio.currentTime>=3.5 && plAudio.currentTime<8`, 8000), await J(`plAudio.currentTime`));
  await J(`plAudio.pause()`);
  await J(`document.querySelector('#abRoot [data-ab-back]').click()`); await sleep(150);
  await J(`document.querySelector('#abRoot [data-ab-resume]').click()`);
  ok('the button on the list of books does the same without opening the book', await waitFor(`pl.q[pl.i]==='tmp:ls:ab:cn-hlm:2' && plAudio.currentTime>0.05`, 8000));
  await J(`plAudio.pause()`);

  // ------------------------------------------------ a chapter that does not play is not skipped
  await J(`window.__zt.plStop()`);
  await J(`document.querySelector('#abRoot [data-ab-back]').click()`); await sleep(150);
  await open('聊斋志异');
  await J(`state.ab.books.get('cn-lz').chapters[1].audio='http://127.0.0.1:8843/missing-ch2.mp3'`);
  await J(`document.querySelector('#abRoot .ab-go').click()`);
  await waitFor(`pl.q[pl.i]==='tmp:ls:ab:cn-lz:1' && plAudio.currentTime>0.05`, 8000);
  await J(`plAudio.currentTime=plAudio.duration-0.4`);
  ok('chapter 2 does not play: the book does NOT go on to chapter 3 by itself (it is heard in order); the page says which chapter, with a button to try again', await waitFor(`pl.q[pl.i]==='tmp:ls:ab:cn-lz:2' && !pl.loaded && /这一章放不了/.test(document.querySelector('#toastMsg').textContent) && document.querySelector('#toastAct').textContent==='重试'`, 9000), [await J(`pl.q[pl.i]`), await J(`document.querySelector('#toastMsg').textContent`)]);
  await sleep(1500);
  ok('(and it stays there)', await J(`pl.q[pl.i]==='tmp:ls:ab:cn-lz:2' && !pl.loaded`));
  await J(`state.tmp.get('tmp:ls:ab:cn-lz:2').audio.url='http://127.0.0.1:8843/ep2.wav'; document.querySelector('#toastAct').click()`);
  ok('“重试” plays the chapter (here the address was mended)', await waitFor(`pl.q[pl.i]==='tmp:ls:ab:cn-lz:2' && plAudio.currentTime>0.05`, 8000));
  await J(`plAudio.pause()`); await J(`window.__zt.plStop()`);

  // ------------------------------------------------ what is kept, and cleared
  await J(`document.querySelector('#player [data-pl="menu"]').click()`); await sleep(400);
  await J(`document.querySelector('#plSetBtn').click()`); await sleep(250);
  await J(`document.querySelector('#plWipe').click()`); await sleep(300);
  ok('“清除这台设备上的听歌记录” clears where the books were left and how far the chapters were heard', await J(`Object.keys(LS.get('abLast',{})).length`) === 0 && await J(`Object.keys(LS.get('plProg',{})).filter(k=>k.startsWith('tmp:ls:ab:')).length`) === 0);
  await J(`document.querySelector('#plDlg').close()`);
  await J(`window.__zt.plStop()`);

  // ------------------------------------------------ the service gives trouble
  await fresh('v2=1&ab=down');
  await sleep(500);
  ok('the service has audiobooks listed but a book does not answer: no tab when the list does not answer; (list down: no tab)', !/有声书/.test(await tabs()), await tabs());
  await fresh('v2=1&ab=empty');
  await sleep(500);
  ok('a list with no book: no tab', !/有声书/.test(await tabs()), await tabs());
  await fresh('v2=1');
  await audio();
  await svc('v2=1&ab=down');
  await J(`state.ab.books.clear()`);
  await open2('聊斋志异');
  async function open2(title) { await J(`[...document.querySelectorAll('#abRoot .ab-card')].find(b=>b.querySelector('b').textContent===${JSON.stringify(title)}).click()`); await waitFor(`document.querySelector('#abRoot [data-ab-retry]')`, 6000); }
  ok('a book that cannot be read says so and has a retry button', /读不到/.test(await J(`document.querySelector('#abRoot').textContent`)) && await J(`!!document.querySelector('#abRoot [data-ab-retry]')`));
  await svc('v2=1&ab=ok');
  await J(`document.querySelector('#abRoot [data-ab-retry]').click()`);
  ok('the retry reads it', await waitFor(`document.querySelectorAll('#abRoot .ab-ch').length===8`, 6000));
  await svc('v2=1&ab=stale'); await J(`state.ab.books.clear(); document.querySelector('#abRoot [data-ab-back]').click()`); await sleep(100);
  await open('聊斋志异');
  ok('an older copy of a book is used when the service says so: a line says it', /读不到最新的/.test(await J(`document.querySelector('#abRoot').textContent`)));

  // ------------------------------------------------ English, a phone
  await fresh('v2=1', 'en');
  await audio();
  ok('English: the tab and the page are “Audiobooks”, the books have their English titles, the styles theirs', /Audiobooks/.test(await tabs()) && (await cards()).join('|') === 'Dream of the Red Chamber|Alice\'s Adventures in Wonderland|Adventures of Sherlock Holmes|Strange Tales from a Chinese Studio'
    && (await J(`[...document.querySelectorAll('#abRoot .ab-styles .dr-chip')].map(b=>b.textContent).join('|')`)) === 'All|Classics|Stories & mystery|Fairy tales & fables|Chinese classics', [await tabs(), await cards()]);
  await c.mobile(390, 844, 2);
  await sleep(500);
  await open(`Alice's Adventures in Wonderland`);
  ok('a phone: the book page does not scroll sideways, the chapters are rows of at least 44 px', await J(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`) && await J(`document.querySelector('#abRoot .ab-ch button').getBoundingClientRect().height>=44`), await J(`[document.documentElement.scrollWidth, document.documentElement.clientWidth]`));
  await c.desktop(1280, 900, 1);
  ok('no errors in the page', errs.length === 0, errs);
  await fetch(SVC + '/__listen?mode=ok&reset=1');
  console.log(`${pass} passed, ${fail} failed`);
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
