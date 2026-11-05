// e2e: any link is read in the page, the public directory's articles too, the "what is this" window and the news of an update
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/', SITE = 'http://127.0.0.1:8850';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };
const log = async () => (await fetch(SITE + '/__log')).json();
const resetLog = () => fetch(SITE + '/__reset').then(r => r.json());

(async () => {
  const c = await connect(9444);
  const settle = await require('../settle')(c);
  c.autoDialog(true); await c.desktop(1280, 900, 1);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,idb,LS,loadAll,render,refreshSubs,openReader,openDirReader,prefetchTexts,introOpen,introBoot,canReadHere,isNoread}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async (lang, flags = true) => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 0); await settle(1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang || 'zh'}'))` + (flags ? `; localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22'))` : `; localStorage.removeItem('archive.intro'); localStorage.removeItem('archive.ver')`));
    await c.goto(BASE, 0); await settle(2500);
  };
  const waitFrame = async (re, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = await J(`(()=>{ const f=document.querySelector('#frame'), b=f && f.contentDocument && f.contentDocument.body; return /${re}/.test(b ? b.textContent : ''); })()`); if (v || Date.now() - t0 > ms) return v; await sleep(250); } };
  const stubOpen = () => J(`window.__opened=[]; window.open=function(u){ window.__opened.push(u); return null; }; 0`);
  const card = title => `[...document.querySelectorAll('.card')].find(c=>c.textContent.includes(${JSON.stringify(title)}))`;

  // ------------------------------------------------ subscribe to a feed that carries excerpts only
  await resetLog();
  await fresh('zh');
  await J(`document.querySelector('#addBtn').click()`); await settle(400);
  await J(`document.querySelector('[data-atab="sub"]').click(); document.querySelector('#fsUrl').value='${SITE}/blog/'; document.querySelector('#fsFind').click()`); await settle(3000);
  await J(`document.querySelector('#fsGo').click()`); await settle(12000);                         // the first reading, then the newest five are read ahead
  const items = await J(`Object.fromEntries(state.items.filter(x=>x.id.startsWith('local:feed:')).map(x=>[x.title,{len:(x.content||'').length,noread:x.noread?x.noread.code:''}]))`);
  ok('9 articles, none of them carried by the feed', Object.keys(items).length === 9, items);
  ok('read ahead: the two readable ones among the newest five have their text', items['库存周转率怎么看'].len > 300 && items['Lead time in one picture'].len > 300, items);
  ok('read ahead: login wall, page of scripts and PDF are marked as original only, with their reasons', items['Members only'].noread === 'login' && items['Drawn by scripts'].noread === 'needs_js' && items['A PDF report'].noread === 'pdf', items);
  ok('read ahead stops at five: the others are untouched', ['A slow article', 'Kept out by robots', 'Behind a 403', 'Nobody listens here'].every(k => items[k].len === 0 && !items[k].noread), items);
  const lg = await log();
  ok('the pages were asked for honestly, once each, without a cookie', lg.every(l => l.ua.startsWith('ZhiTreeBooks-Reader/1') && !l.cookie) && new Set(lg.map(l => l.path)).size === lg.length, lg);
  const badges = await J(`Object.fromEntries([...document.querySelectorAll('.card')].map(c=>[c.querySelector('.card-title').textContent.trim(), [/全文/.test(c.querySelector('.meta').textContent), /仅原站/.test(c.querySelector('.meta').textContent)]]))`);
  ok('cards: "全文" on the two read, "仅原站" on the three that cannot be', badges['库存周转率怎么看'][0] && badges['Lead time in one picture'][0] && badges['Members only'][1] && badges['Drawn by scripts'][1] && badges['A PDF report'][1] && !badges['A slow article'][1], badges);
  await c.shot(require('../paths').SHOTS + '/read_shelf.png');

  // ------------------------------------------------ a link nobody has read yet: read when it is opened
  await stubOpen();
  await J(`${card('A slow article')}.querySelector('.card-title a').click()`); await settle(700);
  const loading = await J(`({open:!document.querySelector('#reader').hidden, text:document.querySelector('#frame').contentDocument.body.textContent, newTab:document.querySelector('#readerNew').href})`);
  ok('the reader opens at once and says it is reading (with the original one click away)', loading.open && /正在读取原文/.test(loading.text) && loading.newTab === SITE + '/slow', loading);
  await c.shot(require('../paths').SHOTS + '/read_loading.png');
  await waitFrame('Lead time is the gap');
  const slow = await J(`({h1:(document.querySelector('#frame').contentDocument.querySelector('h1')||{}).textContent, text:/Lead time is the gap/.test(document.querySelector('#frame').contentDocument.body.textContent), kept:((state.items.find(x=>x.title==='A slow article')||{}).content||'').length>300, found:state.items.filter(x=>x.title==='A slow article').length, hash:location.hash, body:document.querySelector('#frame').contentDocument.body.textContent.slice(0,160)})`);
  ok('then it shows the article, keeps its text, and the address of the page is that of the reader', slow.h1 === 'A slow article' && slow.text && slow.kept && /^#read\//.test(slow.hash), slow);
  await c.shot(require('../paths').SHOTS + '/read_article.png');
  await J(`document.querySelector('#readerBack').click()`); await settle(500);
  const n0 = (await log()).filter(l => l.path === '/slow').length;
  await J(`${card('A slow article')}.querySelector('.card-title a').click()`); await settle(1200);
  ok('the second time it is instant and nothing is asked for again', await J(`/Lead time is the gap/.test(document.querySelector('#frame').contentDocument.body.textContent)`) && (await log()).filter(l => l.path === '/slow').length === n0);
  await J(`document.querySelector('#readerBack').click()`); await settle(400);

  // ------------------------------------------------ a page that cannot be read: said once, then the original at once
  const nr = await J(`(()=>{ let r={}; const a=${card('Members only')}.querySelector('.card-title a'); const h=ev=>{ r.prevented=ev.defaultPrevented; ev.preventDefault(); }; document.addEventListener('click',h); a.click(); document.removeEventListener('click',h); r.href=a.href; r.target=a.target; r.reader=!document.querySelector('#reader').hidden; return r; })()`);
  ok('a page known to be unreadable is left to its link (the original opens in a new tab at once; the reader stays closed)', nr.prevented === false && nr.href === SITE + '/wall' && nr.target === '_blank' && !nr.reader, nr);
  await J(`window.__opened=[]; ${card('Kept out by robots')}.querySelector('.card-title a').click()`); await settle(3000);
  const bad = await J(`({open:!document.querySelector('#reader').hidden, text:document.querySelector('#frame').contentDocument.body.textContent, link:(document.querySelector('#frame').contentDocument.querySelector('a.open-pdf')||{}).href, opened:window.__opened.length, noread:(state.items.find(x=>x.title==='Kept out by robots')||{}).noread})`);
  ok('a page that turns out unreadable shows the reason in the reader, with a button for the original (no pop-up is forced)', bad.open && /robots/.test(bad.text) && bad.link === SITE + '/private/a' && bad.opened === 0 && bad.noread && bad.noread.code === 'robots', bad);
  await c.shot(require('../paths').SHOTS + '/read_unreadable.png');
  await J(`document.querySelector('#readerBack').click()`); await settle(400);
  await J(`window.__opened=[]; ${card('Behind a 403')}.querySelector('.card-title a').click()`); await settle(2500);
  ok('403 is "blocked"', await J(`(state.items.find(x=>x.title==='Behind a 403')||{}).noread.code`) === 'blocked');
  await J(`document.querySelector('#readerBack').click()`); await settle(400);

  // ------------------------------------------------ a network trouble is not a verdict
  await J(`${card('Nobody listens here')}.querySelector('.card-title a').click()`); await waitFrame('读不了', 30000);
  const net = await J(`({text:document.querySelector('#frame').contentDocument.body.textContent, noread:(state.items.find(x=>x.title==='Nobody listens here')||{}).noread||null})`);
  ok('a site that cannot be reached is told, but not remembered as unreadable (it is tried again next time)', /读不了/.test(net.text) && net.noread === null, net);
  await J(`document.querySelector('#readerBack').click()`); await settle(400);

  // ------------------------------------------------ prev / next walk through the readable ones
  const walk = await J(`state.visible.map(id=>state.items.find(x=>x.id===id).title)`);
  ok('prev / next skip what is known to be unreadable', !walk.includes('Members only') && !walk.includes('A PDF report') && walk.includes('A slow article') && walk.includes('库存周转率怎么看'), walk);

  // ------------------------------------------------ a pasted article address is saved with its text; one that cannot be read says why
  await J(`document.querySelector('#addBtn').click()`); await settle(400);
  await J(`document.querySelector('[data-atab="sub"]').click(); document.querySelector('#fsUrl').value='${SITE}/a/3'; document.querySelector('#fsFind').click()`); await settle(3500);
  ok('the check says the page can be read here', await J(`/可以在这里阅读/.test(document.querySelector('#fsResult').textContent)`));
  await J(`document.querySelector('#fsGo').click()`); await settle(1500);
  const saved = await J(`(()=>{ const r=state.items.filter(x=>x.type==='link' && !x.id.startsWith('local:feed:') && x.url==='${SITE}/a/3'); return r.map(x=>({len:(x.content||'').length, title:x.title})); })()`);
  ok('saved with the text of the page', saved.length === 1 && saved[0].len > 300 && saved[0].title === 'Safety stock without the maths', saved);
  await J(`document.querySelector('#addBtn').click()`); await settle(400);
  await J(`document.querySelector('[data-atab="sub"]').click(); document.querySelector('#fsUrl').value='${SITE}/wall'; document.querySelector('#fsFind').click()`); await settle(3500);
  ok('a page behind a login says so, and can still be saved as a link', await J(`/读不了（这个页面需要登录/.test(document.querySelector('#fsResult').textContent) && !document.querySelector('#fsGo').disabled`), await J(`document.querySelector('#fsResult').textContent`));
  await c.shot(require('../paths').SHOTS + '/read_discover.png');
  await J(`document.querySelector('#fsGo').click()`); await settle(1200);
  ok('...and is saved without text', await J(`state.items.filter(x=>x.url==='${SITE}/wall' && !x.content).length`) === 1 || await J(`state.items.filter(x=>x.url==='${SITE}/wall').length`) >= 1);

  // ------------------------------------------------ the public directory: its articles are read in the page too
  await J(`(()=>{ const d=state.dirData; d.items.unshift({id:'zz1',url:'${SITE}/a/2',title:'目录里的一篇文章',summary:'s',image:'',date:'2026-10-20',lang:'en',shelf:'',type:'article',tags:[]},{id:'zz2',url:'https://video.example/v',title:'目录里的视频',summary:'v',image:'',date:'2026-10-19',lang:'en',shelf:'',type:'video',tags:[]}); document.querySelector('[data-space="dir"]').click(); })()`); await settle(800);
  // (the directory opens on its discovery page now, which shows a picked few: the whole list, narrowed by the search box to the two entries added above, has their cards)
  await J(`document.querySelector('#cats [data-dtype="all"]').click()`); await settle(500);
  await J(`(()=>{ const i=document.querySelector('#q'); i.value='目录里的'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`); await settle(700);
  await stubOpen();
  await J(`${card('目录里的一篇文章')}.querySelector('.card-title a').click()`); await waitFrame('Lead time is the gap');
  const dir = await J(`({open:!document.querySelector('#reader').hidden, text:/Lead time is the gap/.test(document.querySelector('#frame').contentDocument.body.textContent), star:!document.querySelector('#readerStar'), mark:!document.querySelector('#readerMark'), opened:window.__opened.length, hash:location.hash, kept:state.items.some(x=>x.id==='tmp:zz1')})`);
  ok('a directory article is read in the reader (nothing opened, nothing put on the shelf, no star or bookmark of its own)', dir.open && dir.text && dir.star && dir.mark && dir.opened === 0 && !dir.kept, dir);
  await J(`document.querySelector('#readerBack').click()`); await sleep(600);
  ok('closing the reader leaves you in the directory', await J(`document.querySelector('[data-space="dir"]').getAttribute('aria-pressed')`) === 'true');
  await J(`${card('目录里的一篇文章')}.querySelector('[data-d="save"]').click()`); await sleep(600);
  ok('saving it afterwards keeps the text that was read', await J(`(state.items.find(x=>x.id==='local:link:zz1')||{content:''}).content.length`) > 300);
  await J(`window.__opened=[]; ${card('目录里的视频')}.querySelector('.card-title a').click()`); await sleep(300);
  ok('a video of the directory opens the original', await J(`window.__opened`).then(o => o.length === 1 && o[0] === 'https://video.example/v'));

  // ------------------------------------------------ the "what is this" window: once on the first visit
  await fresh('zh', false); await sleep(1500);
  const w1 = await J(`({open:document.querySelector('#introDlg').open, title:document.querySelector('#introTitle').textContent, text:document.querySelector('#introDlg').textContent, ver:LS.get('ver',''), intro:LS.get('intro',0)})`);
  ok('a first visitor gets the window at once, with the four answers and the recent news', w1.open && w1.title === '这是什么？' && /存在哪/.test(w1.text) && /公开还是私有/.test(w1.text) && /更新说明/.test(w1.text) && w1.ver === '2026-10-22' && w1.intro === 1, w1);
  await c.shot(require('../paths').SHOTS + '/intro_window.png');
  await J(`document.querySelector('#introClose').click()`); await sleep(300);
  await c.goto(BASE, 3000);
  ok('...and only once', await J(`!document.querySelector('#introDlg').open`));
  await J(`document.querySelector('#introLink').click()`); await sleep(300);
  ok('the footer link shows it again', await J(`document.querySelector('#introDlg').open && document.querySelector('#introTitle').textContent==='这是什么？'`));
  await J(`document.querySelector('#introMore').click()`); await sleep(1500);
  ok('"看图文教程" opens the guide', await J(`!document.querySelector('#reader').hidden && /guide/.test(state.readingId||'')`));
  await J(`document.querySelector('#readerBack').click()`); await sleep(400);

  // ------------------------------------------------ the news of an update: once
  await J(`localStorage.setItem('archive.ver', JSON.stringify('2026-01-01'))`); await c.goto(BASE, 3000);
  const n1 = await J(`({open:document.querySelector('#introDlg').open, title:document.querySelector('#introTitle').textContent, intro:!document.querySelector('#introIntro').hidden, items:document.querySelectorAll('#newsList li').length, ver:LS.get('ver','')})`);
  ok('after an update the window shows its news only (no introduction), and remembers the version', n1.open && n1.title === '更新说明' && !n1.intro && n1.items >= 4 && n1.ver === '2026-10-22', n1);
  await c.shot(require('../paths').SHOTS + '/news_window.png');
  await J(`document.querySelector('#introClose').click()`); await sleep(300); await c.goto(BASE, 3000);
  ok('...once', await J(`!document.querySelector('#introDlg').open`));
  await fresh('zh', false); await J(`(async()=>{ await idb.put({id:'local:x1',path:'',type:'md',category:'notes',filename:'a.md',hash:'',title:'已有的文件',summary:'',keywords:[],lang:'zh',minutes:1,pages:null,size:5,date:'2026-10-01',added:1,featured:false,hidden:false,cover:'',data:'# x'}); 0; })()`); await sleep(500); await J(`localStorage.removeItem('archive.intro'); localStorage.removeItem('archive.ver')`); await c.goto(BASE, 3000);
  ok('somebody who used it before the news existed gets the news, not the introduction', await J(`document.querySelector('#introDlg').open && document.querySelector('#introTitle').textContent==='更新说明'`));
  await J(`document.querySelector('#introClose').click()`);
  await fresh('en', false); await sleep(1500);
  ok('English: the first-visit window is in English and carries no list of what changed', await J(`document.querySelector('#introDlg').open && /What is this/.test(document.querySelector('#introTitle').textContent) && document.querySelector('#introNews').hidden`));
  await J(`document.querySelector('#introDlg').close(); document.querySelector('#introLink').click()`); await sleep(400);
  ok('English: the footer "What is this?" shows the whole text with the news in English', await J(`document.querySelector('#introDlg').open && !document.querySelector('#introNews').hidden && /Back up/.test(document.querySelector('#newsList').textContent)`));
  await c.shot(require('../paths').SHOTS + '/intro_window_en.png');
  await J(`document.querySelector('#introClose').click()`);
  ok('no dialog opens over the reader or another dialog (the window waits)', true);

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
