// e2e: the sections of the public directory are pages with addresses: /discover/ /hot/ /listen/ /picks/books/ /picks/articles/ /watch/. Opened by address they show the section and the side list
// says where you are; opened from the side list they change the address without loading the page again; back and forward follow; the articles and the videos open with the recommended ones
// and then all of them (nothing twice); a search or a filter leaves out the recommendations. (demo :8820; headless Edge)
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(120); } };
  const open = async (p, lang = 'zh') => {                                                            // a fresh browser opens the address (the way a search engine's visitor does)
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang, 1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.space','"dir"')`);
    await c.goto(BASE + p, 2800); await waitFor(`state.dirData`, 6000); await sleep(400);
  };
  const view = () => J(`({path:location.pathname, title:document.title, h1:document.querySelector('#viewTitle').textContent, landing:state.dLanding, space:state.space, cur:[...document.querySelectorAll('#cats [aria-current="true"]')].map(b=>b.textContent.trim().replace(/\\d+$/,'')).join('|'),
    curLanding:(document.querySelector('#cats [aria-current="true"]')||{dataset:{}}).dataset.dlanding||'', picks:document.querySelectorAll('#dirReco .dr-picks .card').length, picksTitle:(document.querySelector('#dirReco .dr-picks h2')||{}).textContent||'', more:(document.querySelector('#dirReco h2.dr-all')||{}).textContent||'',
    cards:document.querySelectorAll('#grid .card').length, listen:document.body.classList.contains('dir-listen'), hot:document.body.classList.contains('dir-hot'), empty:document.querySelector('#empty').hidden?'':document.querySelector('#empty').textContent.trim()})`);
  writeDir();
  await c.desktop(1280, 900, 1);

  // ---- opened by address
  await open('picks/articles/');
  let v = await view();
  ok('/picks/articles/ opens the public space on the articles section (title, heading, the row of the side list that is on)', v.space === 'dir' && v.landing === 'articles' && v.path === '/picks/articles/' && v.title === '精选文章｜知树阅读' && v.h1 === '精选文章' && v.curLanding === 'articles' && /^精选文章/.test(v.cur), v);
  ok('it opens with the recommended articles (at most six), then "更多文章" and the rest', v.picks >= 1 && v.picks <= 6 && v.picksTitle === '精选文章' && v.more === '更多文章' && v.cards > 0, v);
  ok('nothing is shown twice (the recommended ones are not in the list below)', await J(`(()=>{ const a=[...document.querySelectorAll('#dirReco .dr-picks .card')].map(c=>c.dataset.did), b=[...document.querySelectorAll('#grid .card[data-did]')].map(c=>c.dataset.did); return a.length>0 && !a.some(x=>b.includes(x)) && new Set(a.concat(b)).size===a.length+b.length; })()`));
  await open('watch/');
  v = await view();
  ok('/watch/: "看什么", the recommended videos first (at most three; the fixture has two), the row that is on', v.landing === 'watch' && v.title === '看什么｜知树阅读' && v.h1 === '看什么' && v.picksTitle === '推荐视频' && v.picks >= 1 && v.picks <= 3 && v.curLanding === 'watch', v);
  ok('"更多视频" is over the list only when the list has something in it (one recommended video per program: the rest follow)', v.picks + v.cards >= 1 && ((v.cards > 0) === (v.more === '更多视频')), v);
  await open('picks/books/');
  v = await view();
  ok('/picks/books/: "精选图书", its row is on; books are listed or, when there are none, the page says so', v.landing === 'books' && v.title === '精选图书｜知树阅读' && v.curLanding === 'books' && (v.cards > 0 || /还没有可推荐的图书/.test(v.empty)), v);
  await open('discover/');
  v = await view();
  ok('/discover/: the discovery page, the row "发现" is on', v.path === '/discover/' && v.space === 'dir' && v.title === '发现｜知树阅读' && /^发现/.test(v.cur) && !v.landing, v);
  await open('hot/');
  v = await view();
  ok('/hot/: the hot lists, the row "热榜" is on', v.hot && v.title === '热榜｜知树阅读' && /^热榜/.test(v.cur), v);
  await open('listen/');
  v = await view();
  ok('/listen/: today\'s listening, the row "今日听什么" is on', v.listen && v.title === '今日听什么｜知树阅读' && /^今日听什么/.test(v.cur), v);

  // ---- from the side list: the address changes, the page is not loaded again
  await open('');
  await J(`window.__keep=1`);
  await J(`document.querySelector('#cats [data-dlanding="watch"]').click()`); await sleep(700);
  v = await view();
  ok('a click on "看什么" in the side list: the address is /watch/, the page was not reloaded, the section is shown', v.path === '/watch/' && v.landing === 'watch' && (await J(`window.__keep`)) === 1 && v.picksTitle === '推荐视频', v);
  await J(`document.querySelector('#cats [data-dlanding="articles"]').click()`); await sleep(700);
  v = await view();
  ok('then "精选文章": /picks/articles/ with the recommended articles', v.path === '/picks/articles/' && v.picksTitle === '精选文章' && v.picks >= 1, v);
  // (the back button of the browser: what it does to the page is what the page does with the address: a script cannot press it, so the same event is sent)
  await J(`history.replaceState({}, '', '/watch/'); window.dispatchEvent(new PopStateEvent('popstate',{state:{}}))`); await sleep(600);
  v = await view();
  ok('"back" to /watch/: the page follows the address', v.path === '/watch/' && v.landing === 'watch' && v.picksTitle === '推荐视频' && (await J(`window.__keep`)) === 1, v);
  await J(`history.replaceState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate',{state:{}}))`); await sleep(600);
  v = await view();
  ok('"back" to / : the public space is at its start page again, no section', v.path === '/' && !v.landing && v.space === 'dir', v);

  // ---- notes belong to my shelf: the public space has no row for them, they are filed under the articles
  await J(`document.querySelector('#cats [data-dlanding="articles"]').click()`); await sleep(900);
  v = await J(`(()=>{ const art=state.dirData.items.filter(i=>i.type==='article').length, notes=state.dirData.items.filter(i=>i.type==='note').length; const row=document.querySelector('#cats [data-dlanding="articles"] .n'); return {noteRow:!!document.querySelector('#cats [data-dtype="note"]'), rowN:row?+row.textContent:-1, art, notes, tags:[...document.querySelectorAll('#grid .xmeta .tag')].filter(x=>x.textContent.trim()==='笔记').length}; })()`);
  ok('no "笔记" row in the public space; the notes are counted and listed in 精选文章 (their cards still say 笔记)', !v.noteRow && v.notes > 0 && v.rowN === v.art + v.notes && v.tags === v.notes, v);

  // ---- a search or a filter in a section: no recommendations, only what matches
  await J(`document.querySelector('#cats [data-dlanding="articles"]').click()`); await sleep(600);
  await J(`(()=>{ const q=document.querySelector('#q'); q.value='Nvidia'; q.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(900);
  v = await view();
  ok('a search inside the articles section leaves out the recommended block and "更多文章": the articles that match are listed', v.landing === 'articles' && v.picks === 0 && v.more === '' && v.cards >= 1, v);
  await J(`(()=>{ const q=document.querySelector('#q'); q.value=''; q.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(700);
  v = await view();
  ok('and when the search is cleared the recommendations are back', v.picks >= 1 && v.more === '更多文章', v);

  // ---- English
  await open('picks/articles/', 'en');
  v = await view();
  ok('English: "Article picks", the heading, the row and the title say the same word; the rows of the other sections are in English', v.title === 'Article picks｜ZhiTree Books' && v.h1 === 'Article picks' && /^Article picks/.test(v.cur) && v.more === 'More articles', v);
  ok('English: "What to watch" and "Book picks" in the side list', await J(`(()=>{ const t=[...document.querySelectorAll('#cats [data-dlanding]')].map(b=>b.textContent.trim().replace(/\\d+$/,'')); return t.includes('What to watch') && t.includes('Book picks') && t.includes('Article picks'); })()`));

  // ---- a phone: the same rows are in the drawer
  await c.mobile(375, 812, 2);
  await open('watch/');
  v = await view();
  ok('a phone: /watch/ opens the section too; nothing is wider than the screen', v.landing === 'watch' && (await J(`document.documentElement.scrollWidth<=innerWidth`)), v);
  await c.desktop(1280, 900, 1);

  ok('no script errors in the whole run', errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
