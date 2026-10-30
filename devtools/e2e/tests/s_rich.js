// e2e: what is behind a row is shown in the page (video / song windows, V2EX / README / Zhihu Daily in the reader, a hot search as a card with the news about it, a podcast with its episodes),
// and the player folds into a round button. (demo app :8820 + the fake hot-list service :8840 + podcast :8843 + read site :8850; headless Edge)
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const O = require('../paths').DIST + '/';
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840', POD = 'http://127.0.0.1:8843';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };
const get = p => fetch(SVC + p).then(r => r.json());

(async () => {
  writeDir();
  fs.copyFileSync(require('../paths').SRC + '/recommended.json', O + 'recommended.json');
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,render,openReader,pl,plAudio,plPlay,plFold,richOpen,embedOf,openSubmit,cardData,postData,withForm}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(120); } };
  const fresh = async (lang = 'zh', pre) => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang, 1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1'); ${pre || ''}`);
    await c.goto(BASE, 2800);
  };
  const toDir = async () => { await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800); };
  const openHot = async () => { await J(`document.querySelector('#cats [data-dhot]').click()`); await sleep(500); };
  const clickTab = async (sel, text) => { await J(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.startsWith(${JSON.stringify(text)})).click()`); await sleep(350); };
  const plat = async (col, name) => { await clickTab('#dirReco .hot-col', col); await clickTab('#dirReco .hot-plat', name); await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent.startsWith(${JSON.stringify(name)}) && document.querySelectorAll('#dirReco .hot-row').length>0`); };
  const frame = () => J(`(()=>{ try{ const d=document.querySelector('#frame').contentDocument; return d && d.body ? d.body.innerText : ''; }catch(e){ return ''; } })()`);
  const frameHas = async (re, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await frame(); if (re.test(v) || Date.now() - t0 > ms) return v; await sleep(150); } };
  const stub = () => J(`window.__opened=[]; window.open=(...a)=>{ window.__opened.push(String(a[0])); return null; }; window.__dp=[]; if(!window.__dpOn){ window.__dpOn=1; document.addEventListener('click',ev=>{ if(ev.target.closest && ev.target.closest('a.hot-t')){ window.__dp.push(ev.defaultPrevented); ev.preventDefault(); } },false); } 1`);
  const first = () => J(`document.querySelector('#dirReco .hot-t').click()`);
  await c.desktop(1280, 900, 1);

  await get('/__hot?real=1&reset=1');
  await fresh('zh'); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  await stub();

  // ================================================ A. a video plays in a window of the page (the platform's own player)
  await plat('综合热点', 'B 站热门视频');
  await first(); await sleep(400);
  const em = await J(`({open:document.querySelector('#embedDlg').open, src:(document.querySelector('#embedBox iframe')||{}).src, sandbox:(document.querySelector('#embedBox iframe')||{}).getAttribute('sandbox')||'', title:document.querySelector('#embedTitle').textContent,
    sub:document.querySelector('#embedSub').textContent, body:document.querySelector('#embedBody').hidden?'':document.querySelector('#embedBody').textContent, orig:document.querySelector('#embedOrig').href, origText:document.querySelector('#embedOrig').textContent,
    opened:window.__opened.length, reader:!document.querySelector('#reader').hidden, dp:window.__dp[0], ratio:document.querySelector('#embedBox').style.aspectRatio})`);
  ok('a Bilibili row opens the platform’s own player in a window of the page (no tab, no reader)', em.open && em.src === 'https://player.bilibili.com/player.html?bvid=BV1VvHK6FEV5&autoplay=0&high_quality=1&danmaku=0' && em.opened === 0 && !em.reader && em.dp === true, em);
  ok('...a sandboxed frame, the title, who and how many watched, the description, and the way to the original', /allow-scripts/.test(em.sandbox) && !/allow-top-navigation/.test(em.sandbox) && em.title === '一个视频' && /B 站热门视频 · 播放 94.5 万 · 阿狸/.test(em.sub) && /视频的简介/.test(em.body)
    && em.orig === 'https://www.bilibili.com/video/BV1VvHK6FEV5' && /bilibili\.com/.test(em.origText) && em.ratio.replace(/\s/g, '') === '16/9', em);
  await c.shot(require('../paths').SHOTS + '/rich_embed.png');
  await J(`document.querySelector('#embedDone').click()`); await sleep(300);
  ok('closing the window empties the frame (the video stops)', await J(`!document.querySelector('#embedDlg').open && document.querySelector('#embedBox').children.length===0`));

  // ================================================ B. a song in the NetEase player; a row with nothing to show goes to the platform as before
  await plat('读书与影音', '网易云音乐飙升榜');
  await first(); await sleep(400);
  const ne = await J(`({open:document.querySelector('#embedDlg').open, src:(document.querySelector('#embedBox iframe')||{}).src, h:document.querySelector('#embedBox').style.height})`);
  ok('a NetEase song: its own small player (66 px) in the window', ne.open && ne.src === 'https://music.163.com/outchain/player?type=2&id=300591&auto=0&height=66' && ne.h === '86px', ne);
  await J(`document.querySelector('#embedDone').click()`); await sleep(300);
  await plat('读书与影音', 'Steam 热销');
  await J(`window.__dp=[]`); await first(); await sleep(300);
  const st = await J(`({dp:window.__dp[0], open:document.querySelector('#embedDlg').open, reader:!document.querySelector('#reader').hidden, target:document.querySelector('#dirReco .hot-t').target})`);
  ok('a row with nothing to show (only a title and a price): the click is left to the browser, a tab of its own', st.dp === false && !st.open && !st.reader && st.target === '_blank', st);

  // ================================================ C. a hot search is a card with the news about it
  await plat('综合热点', '微博热搜');
  await first();
  await waitFor(`state.readingId && /^tmp:rich:/.test(state.readingId)`);
  let txt = await frameHas(/第一篇相关报道/);
  const card = await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return {title:document.querySelector('#readerTitle').textContent, id:state.readingId, links:[...d.querySelectorAll('a[data-rd]')].map(a=>a.textContent+'|'+a.getAttribute('href')), h2:(d.querySelector('h2')||{}).textContent, meta:(d.querySelector('.doc-meta')||{}).textContent, orig:(d.querySelector('.doc-src a')||{}).href, opened:window.__opened.length}; })()`);
  ok('a Weibo hot search: the reader opens a card (not Weibo): the title, where it is from and how hot, then the news about it', card.title === '姆巴佩事件' && /^tmp:rich:/.test(card.id) && card.h2 === '相关报道' && /微博热搜 · 热度 1070 万/.test(card.meta) && card.opened === 0, card);
  ok('...each story is a link (the address inside Bing’s link), and the way to Weibo itself is at the foot', card.links.length === 2 && card.links[0] === '第一篇相关报道|http://127.0.0.1:8850/a/1' && /来源甲/.test(txt) && /一句摘要/.test(txt) && /s\.weibo\.com/.test(card.orig), card);
  await c.shot(require('../paths').SHOTS + '/rich_card.png');
  await J(`document.querySelector('#frame').contentDocument.querySelector('a[data-rd]').click()`);
  await waitFor(`/^tmp:rel:/.test(state.readingId||'')`);
  txt = await frameHas(/库存周转率/);
  ok('a related story opens in the same reader (the text is read by the service)', /库存周转率等于销货成本/.test(txt) && (await J(`window.__opened.length`)) === 0, txt.slice(0, 200));
  await J(`document.querySelector('#readerBack').click()`); await sleep(700);
  ok('back from the story is the card again', await J(`!document.querySelector('#reader').hidden && /^tmp:rich:/.test(state.readingId||'')`));
  await J(`document.querySelector('#readerBack').click()`); await sleep(700);
  ok('and back again is the list of the hot page', await J(`document.querySelector('#reader').hidden && document.querySelectorAll('#dirReco .hot-row').length>0`));
  await J(`document.querySelectorAll('#dirReco .hot-t')[1].click()`);
  await waitFor(`state.readingId && /^tmp:rich:/.test(state.readingId)`);
  txt = await frameHas(/读不到/);
  ok('when the news cannot be asked for, the card is still there and says so', /相关报道现在读不到/.test(txt), txt.slice(0, 300));
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);

  // ================================================ D. a Zhihu question: its excerpt and picture, and the news
  await plat('综合热点', '知乎热榜');
  await first();
  await waitFor(`state.readingId && /^tmp:rich:/.test(state.readingId)`);
  txt = await frameHas(/第一篇相关报道/);
  const zq = await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return {img:(d.querySelector('.hc-img img')||{}).src, body:d.body.innerText.includes('这是问题的摘录'), note:d.body.innerText.includes('3365 回答')}; })()`);
  ok('a Zhihu question: the picture, the excerpt and the number of answers are on the card', zq.img === 'https://picx.zhimg.com/a.jpg' && zq.body && zq.note, zq);
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);

  // ================================================ E. V2EX and a README in the reader
  await plat('科技与开发', 'V2EX');
  await first();
  await waitFor(`state.readingId && /^tmp:rich:/.test(state.readingId)`);
  txt = await frameHas(/第一条回复/);
  ok('a V2EX topic: its text and its replies are in the reader', /昨天早上停电/.test(txt) && /第一条回复的内容/.test(txt) && /bob/.test(txt) && /V2EX · 生活 · alice · 2 条回复/.test(txt), txt.slice(0, 300));
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);
  await plat('科技与开发', 'GitHub');
  await first();
  await waitFor(`state.readingId && /^tmp:rich:/.test(state.readingId)`);
  txt = await frameHas(/A short readme/);
  const rd = await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return {h1:[...d.querySelectorAll('h1')].map(x=>x.textContent), img:(d.querySelector('img')||{}).src, docs:[...d.querySelectorAll('a')].map(a=>a.href).filter(h=>/docs/.test(h))[0], src:(d.querySelector('.doc-src a')||{}).href}; })()`);
  ok('a GitHub repository: its README is rendered (one heading, the picture, relative links made whole), the repository itself is one click away', rd.h1.join() === 'Hello repo' && rd.img === 'https://img.example/a.png' && rd.docs === 'https://raw.githubusercontent.com/o/r/HEAD/docs/x.md' && rd.src === 'https://github.com/o/r', rd);
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);

  // ================================================ F. a podcast of a chart: its episodes play in the bar
  await plat('读书与影音', 'Apple 播客榜 · 中国');
  await first();
  await waitFor(`state.readingId && /^tmp:rich:/.test(state.readingId)`);
  txt = await frameHas(/最新几集/);
  const eps = await J(`[...document.querySelector('#frame').contentDocument.querySelectorAll('a[data-ep]')].map(a=>a.textContent)`);
  ok('an Apple Podcasts show: the reader lists its latest episodes (what the show’s own feed carries)', eps.length === 4 && /^▶ Ep 3/.test(eps[0]) && /Tester · 商务 · 4 集/.test(txt), [eps, txt.slice(0, 200)]);
  await J(`document.querySelector('#frame').contentDocument.querySelector('a[data-ep]').click()`);
  await waitFor(`!plAudio.paused && plAudio.currentTime>0.2`);
  const pb = await J(`({title:document.querySelector('#plTitle').textContent, q:pl.q.join(), reader:!document.querySelector('#reader').hidden, src:plAudio.currentSrc})`);
  ok('a click on an episode plays it in the bar and the reader stays', /^Ep 3/.test(pb.title) && /^tmp:pod:/.test(pb.q) && pb.reader && pb.src === POD + '/ep3.wav', pb);

  // ================================================ G. the player folds (it is playing now, and the reader is open)
  const fo = await J(`({mini:document.body.classList.contains('pl-folded'), barHidden:getComputedStyle(document.querySelector('#player')).display, miniShown:getComputedStyle(document.querySelector('#plMini')).display, auto:pl.auto})`);
  ok('opening the reader folds the bar into the round button by itself (more room for the text); the sound plays on', fo.mini && fo.barHidden === 'none' && fo.miniShown === 'flex' && fo.auto === true && !(await J(`plAudio.paused`)), fo);
  const sz = await J(`(()=>{ const r=document.querySelector('#plMini').getBoundingClientRect(), a=document.querySelector('#plMiniOpen').getBoundingClientRect(), b=document.querySelector('#plMiniToggle').getBoundingClientRect(); return {w:r.width,h:r.height,left:r.left,bottom:innerHeight-r.bottom, a:[a.width,a.height], b:[b.width,b.height], gap:b.left-a.right, padB:getComputedStyle(document.body).paddingBottom, rb:getComputedStyle(document.querySelector('#reader')).bottom}; })()`);
  ok('the round button: two targets of 44 px side by side (cover = unfold, play / pause), in the corner away from the add button; the reader has the whole height', sz.a[0] >= 44 && sz.a[1] >= 44 && sz.b[0] >= 44 && sz.b[1] >= 44 && sz.gap >= 2 && sz.left <= 20 && sz.rb === '0px', sz);
  await J(`document.querySelector('#plMiniToggle').click()`); await sleep(300);
  ok('play / pause on it works, and does not unfold it', (await J(`plAudio.paused`)) && (await J(`document.body.classList.contains('pl-folded')`)));
  await J(`document.querySelector('#plMiniToggle').click()`); await sleep(300);
  await J(`document.querySelector('#readerBack').click()`); await sleep(700);
  ok('closing the reader unfolds the bar that it folded', await J(`!document.body.classList.contains('pl-folded') && getComputedStyle(document.querySelector('#player')).display!=='none'`));
  ok('the bar has a tab to fold it, and no button that closes it', await J(`!!document.querySelector('#player .pl-fold') && !document.querySelector('#player [data-pl="shut"]') && !document.querySelector('#player #plShut')`));
  await J(`document.querySelector('#player .pl-fold').click()`); await sleep(300);
  const man = await J(`({mini:document.body.classList.contains('pl-folded'), kept:LS.get('plMini',0), auto:pl.auto})`);
  ok('the tab folds it by hand: remembered (this browser), not "by the page"', man.mini && man.kept === 1 && man.auto === false, man);
  await J(`document.querySelector('#plMiniOpen').click()`); await sleep(300);
  ok('a tap on the cover unfolds it, and that is remembered too', await J(`!document.body.classList.contains('pl-folded') && LS.get('plMini',0)===0`));
  // reading while it was folded by hand: the reader's end does not unfold it
  await J(`plFold(true)`); await J(`state.tmp.set('tmp:x1',{id:'tmp:x1',source:'tmp',type:'link',url:'http://127.0.0.1:8850/a/2',title:'x',summary:'',content:'<p>hello</p>',keywords:[],lang:'en',date:'2026-10-27',category:'notes',from:'t'}); openReader('tmp:x1')`); await sleep(500);
  await J(`document.querySelector('#readerBack').click()`); await sleep(600);
  ok('a bar folded by hand stays folded when a reader opens and closes', await J(`document.body.classList.contains('pl-folded') && pl.auto===false`));
  await J(`plFold(false)`);
  await fresh('zh');
  await J(`localStorage.setItem('archive.plMini','1')`); await c.goto(BASE, 2500);
  ok('the fold is remembered across visits (before anything plays)', await J(`document.body.classList.contains('pl-folded')`));
  await J(`localStorage.removeItem('archive.plMini')`);

  // ================================================ H. the recommended page’s bar is above the player, and a swipe down folds it
  await fresh('zh');
  await J(`state.tmp.set('tmp:t1',{id:'tmp:t1',source:'tmp',type:'link',url:'${POD}/notes/ep1',title:'A sound',summary:'',audio:{url:'${POD}/ep1.wav',type:'audio/wav',dur:12},keywords:[],lang:'en',date:'2026-10-27',category:'notes',from:'t'}); plPlay('tmp:t1')`);
  await sleep(500);
  await J(`document.querySelector('[data-cat="reco"]').click()`); await sleep(1200);
  const stk = await J(`(()=>{ const b=document.querySelector('#rcAct').getBoundingClientRect(), p=document.querySelector('#player').getBoundingClientRect(), m=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2); return {bar:[Math.round(b.top),Math.round(b.bottom)], player:[Math.round(p.top),Math.round(p.bottom)], onTop:m && (m.closest('#rcAct')?'bar':m.closest('#player')?'player':m.tagName)}; })()`);
  ok('with the player open, the "selected / push" bar of the recommended page is on top of the page, above the player (desktop)', stk.onTop === 'bar' && stk.bar[1] <= stk.player[0], stk);
  await c.mobile(390, 844, 2); await sleep(600);
  const stm = await J(`(()=>{ const b=document.querySelector('#rcAct').getBoundingClientRect(), p=document.querySelector('#player').getBoundingClientRect(), m=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2); return {bar:[Math.round(b.top),Math.round(b.bottom)], player:[Math.round(p.top),Math.round(p.bottom)], onTop:m && (m.closest('#rcAct')?'bar':m.closest('#player')?'player':m.tagName)}; })()`);
  ok('...and on a phone', stm.onTop === 'bar' && stm.bar[1] <= stm.player[0], stm);
  await c.shot(require('../paths').SHOTS + '/rich_phone_bar.png');
  const sw = await J(`(()=>{ const bar=document.querySelector('#player'), r=bar.getBoundingClientRect(), x=r.left+60, y=r.top+30; const tg=bar.querySelector('.pl-title');
    const mk=(type,y2)=>new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[new Touch({identifier:1,target:tg,clientX:x,clientY:y2})],changedTouches:[new Touch({identifier:1,target:tg,clientX:x,clientY:y2})]});
    tg.dispatchEvent(mk('touchstart',y)); tg.dispatchEvent(mk('touchend',y+80)); return {mini:document.body.classList.contains('pl-folded')}; })()`);
  ok('a swipe down on the bar folds it (a phone)', sw.mini === true, sw);
  await J(`plFold(false)`);
  const sw2 = await J(`(()=>{ const bar=document.querySelector('#player'), r=bar.getBoundingClientRect(), x=r.left+60, y=r.top+30; const tg=bar.querySelector('.pl-seek');
    const mk=(type,y2)=>new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[new Touch({identifier:1,target:tg,clientX:x,clientY:y2})],changedTouches:[new Touch({identifier:1,target:tg,clientX:x,clientY:y2})]});
    tg.dispatchEvent(mk('touchstart',y)); tg.dispatchEvent(mk('touchend',y+80)); return {mini:document.body.classList.contains('pl-folded')}; })()`);
  ok('...but not when the finger is on the progress slider', sw2.mini === false, sw2);
  await c.desktop(1280, 900, 1);

  // ================================================ I. a card of the directory: a video plays in the window, a hot-search row is a card, an article is as before
  const DIRF = O + 'dir/directory.json', d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.items.push({ id: 'v1vvvvvvv1', title: '一个会播放的视频', summary: '视频的摘要', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', image: '', date: '2026-10-25', type: 'video', lang: 'en', tags: ['music'], shelf: 'ytC' });
  d.items.push({ id: 'w1wwwwwww1', title: '姆巴佩事件', summary: '第 1 名 · 热度 1070 万', url: 'https://s.weibo.com/weibo?q=%23x%23', image: '', date: '2026-10-25', type: 'article', lang: 'zh', tags: [], shelf: 'hotweibo' });
  d.shelves.find(s => s.id === 'ytC').n += 1; d.shelves.find(s => s.id === 'hotweibo').n += 1;
  fs.writeFileSync(DIRF, JSON.stringify(d));
  await fresh('zh'); await toDir();
  await J(`document.querySelector('#cats [data-dtype="all"]').click()`); await sleep(800);
  await J(`state.dLimit=999; render(); 1`); await sleep(500);
  await J(`window.__opened=[]; window.open=(...a)=>{ window.__opened.push(String(a[0])); return null; }; 1`);
  ok('both cards are in the list', await J(`!!document.querySelector('a[data-dopen="v1vvvvvvv1"]') && !!document.querySelector('a[data-dopen="w1wwwwwww1"]')`));
  await J(`document.querySelector('a[data-dopen="v1vvvvvvv1"]').click()`); await sleep(500);
  const dv = await J(`({open:document.querySelector('#embedDlg').open, src:(document.querySelector('#embedBox iframe')||{}).src, opened:window.__opened.length, reader:!document.querySelector('#reader').hidden})`);
  ok('a video card of the directory plays in the window (YouTube’s privacy-friendly player), no tab', dv.open && dv.src === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1' && dv.opened === 0 && !dv.reader, dv);
  await J(`document.querySelector('#embedDone').click()`); await sleep(300);
  await J(`document.querySelector('a[data-dopen="w1wwwwwww1"]').click()`);
  await waitFor(`state.readingId && /^tmp:rich:/.test(state.readingId)`);
  txt = await frameHas(/第一篇相关报道/);
  ok('a hot-search card of the directory (from a hot-list shelf) is the same card with the news', /相关报道/.test(txt) && /第一篇相关报道/.test(txt) && (await J(`window.__opened.length`)) === 0, txt.slice(0, 200));
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);
  await J(`document.querySelector('a[data-dopen="b1bbbbbbb1"]').click()`); await sleep(1500);
  ok('an ordinary article is read as before', await J(`!document.querySelector('#reader').hidden && /^tmp:b1bbbbbbb1/.test(state.readingId||'') && !document.querySelector('#embedDlg').open`));
  await J(`document.querySelector('#readerBack').click()`); await sleep(400);

  // ================================================ J. English
  await fresh('en'); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  await stub();
  await plat('Top stories', 'Weibo hot searches');
  await first();
  await waitFor(`state.readingId && /^tmp:rich:/.test(state.readingId)`);
  txt = await frameHas(/Related news/);
  ok('in English the card says "Related news" and the stories are asked for in English', /Related news/.test(txt), txt.slice(0, 200));
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);
  const asked = await fetch(SVC + '/__detail_asked').then(r => r.json());
  ok('the service was asked for the news with the language of the page', asked.some(u => /bing\.com\/news\/search/.test(u)), asked);

  // ================================================ K. the platform tabs: the hot-list platforms are fixed, each has its cards and the way to the live list
  {
    const DIRF2 = O + 'dir/directory.json', d2 = JSON.parse(fs.readFileSync(DIRF2, 'utf8'));
    const hs = (id, name, plat, n) => ({ id, name, description: name, home: 'https://example.org/', kind: 'feed', lang: 'zh', license: '', tags: ['热榜'], n, updated: '2026-10-27', feed: SVC + '/api/hot?n=10&p=' + id.slice(4), status: 'fixed', rights: 'unknown', platform: plat });
    d2.shelves.push(hs('hot-zhihu', '知乎热榜', 'zhihu', 2), hs('hot-qqmusic', 'QQ 音乐飙升榜', 'qqmusic', 1), hs('hot-hackernews', 'Hacker News', 'hn', 1));
    const hi = (id, title, shelf, url, extra) => ({ id, title, summary: '第 1 名 · 热度', url, image: '', date: '2026-10-27', type: 'article', lang: 'zh', tags: [], shelf, ...extra });
    d2.items.push(hi('hz1hhhhhh1', '知乎一', 'hot-zhihu', 'https://www.zhihu.com/question/1'), hi('hz2hhhhhh2', '知乎二', 'hot-zhihu', 'https://www.zhihu.com/question/2'), hi('hq1hhhhhh1', '一首歌', 'hot-qqmusic', 'https://y.qq.com/n/ryqq/songDetail/004VBMk71TdUuR'),
      hi('hn1hhhhhh1', 'An English headline', 'hot-hackernews', 'https://example.org/hn/1', { lang: 'en', title_zh: '一个英文标题', summary: '' }));
    d2.shelves.find(s => s.id === 'ytC').n += 0;
    fs.writeFileSync(DIRF2, JSON.stringify(d2));
    await get('/__hot?real=0');
    await fresh('zh'); await toDir();
    await J(`document.querySelector('#cats [data-dtype="all"]').click()`); await sleep(800);
    await J(`document.querySelector('[data-dtabs="plat"]').click()`); await sleep(600);
    const tabs = await J(`[...document.querySelectorAll('#dTabs [data-dtab]')].map(b=>b.getAttribute('data-dtab')+'|'+b.getAttribute('title'))`);
    ok('the platform side has the hot-list platforms as tabs of their own (they are fixed ones), with their names', tabs.includes('plat:zhihu|知乎') && tabs.includes('plat:qqmusic|QQ 音乐') && tabs.includes('plat:hn|Hacker News'), tabs);
    await J(`document.querySelector('#dTabs [data-dtab="plat:zhihu"]').click()`); await sleep(600);
    const zh1 = await J(`({cards:document.querySelectorAll('#grid .card, #grid .drow').length, live:(document.querySelector('#dSubs [data-hot-go]')||{}).textContent, go:(document.querySelector('#dSubs [data-hot-go]')||{}).dataset && document.querySelector('#dSubs [data-hot-go]').dataset.hotGo, subsHidden:document.querySelector('#dSubs').hidden})`);
    ok('inside a platform: its cards (the hot list’s two and the Zhihu column’s two), and "看实时热榜 ›" beside the tabs (it is the hot list of that platform)', zh1.cards === 4 && zh1.live === '看实时热榜 ›' && zh1.go === 'zhihu' && !zh1.subsHidden, zh1);
    await J(`document.querySelector('#dSubs [data-hot-go]').click()`);
    await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
    const hot1 = await J(`({page:document.body.classList.contains('dir-hot'), col:(document.querySelector('#dirReco .hot-col[aria-selected="true"]')||{}).textContent, plat:(document.querySelector('#dirReco .hot-plat[aria-selected="true"]')||{}).textContent})`);
    ok('the button opens the hot-list page on that platform (its column, its tab)', hot1.page && hot1.col === '综合热点' && hot1.plat === '知乎热榜', hot1);
    await J(`document.querySelector('#cats [data-dtype="all"]').click()`); await sleep(700);
    await J(`document.querySelector('[data-dtabs="plat"]').click()`); await sleep(400);
    await J(`document.querySelector('#dTabs [data-dtab="plat:qqmusic"]').click()`); await sleep(500);
    await J(`document.querySelector('#dSubs [data-hot-go]').click()`);
    await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
    const hot2 = await J(`({col:(document.querySelector('#dirReco .hot-col[aria-selected="true"]')||{}).textContent, plat:(document.querySelector('#dirReco .hot-plat[aria-selected="true"]')||{}).textContent})`);
    ok('another platform, another column: QQ Music is in "读书与影音"', hot2.col === '读书与影音' && hot2.plat === 'QQ 音乐飙升榜', hot2);
    // ---- M. the Chinese of an English title
    await J(`document.querySelector('#cats [data-dtype="all"]').click()`); await sleep(700);
    await J(`state.dLimit=999; render(); 1`); await sleep(400);
    const tz = await J(`({zh:[...document.querySelectorAll('.tz')].map(e=>e.textContent), lang:(document.querySelector('.tz')||{}).lang})`);
    ok('a Chinese page: an English title has its Chinese in small grey type under it (and a Chinese title has none)', tz.zh.join() === '一个英文标题' && tz.lang === 'zh', tz);
    await fresh('en'); await toDir();
    await J(`document.querySelector('#cats [data-dtype="all"]').click()`); await sleep(800);
    await J(`state.dLimit=999; render(); 1`); await sleep(400);
    ok('an English page does not show it', (await J(`document.querySelectorAll('.tz').length`)) === 0);
    // ---- L. books
    await fresh('zh'); await toDir();
    await J(`openSubmit({tab:'card'})`); await sleep(500);
    const f0 = await J(`({forms:[...document.querySelectorAll('#cardForms [data-form]')].map(b=>b.dataset.form+(b.getAttribute('aria-pressed')==='true'?'*':'')+':'+b.textContent), hint:document.querySelector('#cardFormHint').hidden, tab:document.querySelector('[data-stab="card"]').textContent, title:document.querySelector('#submitTitle').textContent, tags:cardData().tags})`);
    ok('the old "资料卡" tab is "书籍", with four forms (a book is the one chosen) and nothing added to the tags', f0.forms.join('|') === 'book*:一本书|list:书单|online:在线书籍|novel:小说' && f0.hint && f0.tab === '书籍' && f0.title === '书籍' && f0.tags === '', f0);
    await J(`document.querySelector('#cardTitle').value='三体'; document.querySelector('#cardSummary').value='刘慈欣的科幻小说，三部曲，讲述地球文明与三体文明的接触。'; document.querySelector('#cardTags').value='科幻, 小说, 刘慈欣'; document.querySelector('[data-form="list"]').click()`); await sleep(200);
    const f1 = await J(`({tags:cardData().tags, hint:document.querySelector('#cardFormHint').textContent, pressed:document.querySelector('[data-form="list"]').getAttribute('aria-pressed')})`);
    ok('"书单" puts its tag first (the other tags stay, five at most) and says how to write a list', f1.tags === '书单, 科幻, 小说, 刘慈欣' && /书名写在摘要里/.test(f1.hint) && f1.pressed === 'true', f1);
    await J(`document.querySelector('[data-form="novel"]').click()`); await sleep(100);
    ok('"小说" replaces the form tag (and does not repeat one that is there)', (await J(`cardData().tags`)) === '小说, 科幻, 刘慈欣' && /写文章/.test(await J(`document.querySelector('#cardFormHint').textContent`)), await J(`cardData().tags`));
    await J(`document.querySelector('[data-form="online"]').click()`); await sleep(100);
    const f2 = await J(`({go:document.querySelector('#submitGo').disabled, tags:cardData().tags, hint:document.querySelector('#cardFormHint').textContent})`);
    ok('"在线书籍" cannot be sent without the address it is read at', f2.go === true && /免费在线读/.test(f2.hint) && f2.tags.startsWith('在线书籍'), f2);
    await J(`document.querySelector('#cardUrl').value='http://127.0.0.1:8850/a/1'; document.querySelector('#cardUrl').dispatchEvent(new Event('input',{bubbles:true}))`); await sleep(200);
    ok('...and can with it', (await J(`document.querySelector('#submitGo').disabled`)) === false);
    await J(`document.querySelector('[data-stab="post"]').click()`); await sleep(200);
    await J(`document.querySelector('[data-pform="novel"]').click(); document.querySelector('#postTags').value='武侠'`); await sleep(100);
    const p1 = await J(`({tags:postData().tags, forms:[...document.querySelectorAll('#postForms [data-pform]')].map(b=>b.dataset.pform+(b.getAttribute('aria-pressed')==='true'?'*':''))})`);
    ok('writing a post: "小说（一章一篇）" adds the tag too', p1.tags === '小说, 武侠' && p1.forms.join() === 'post,list,novel*', p1);
    await J(`document.querySelector('#submitDlg').close()`);
    await J(`openSubmit({tab:'card'})`); await sleep(300);
    ok('opening the window again starts from "一本书" (and the post form from "文章")', await J(`document.querySelector('#cardForms [data-form="book"]').getAttribute('aria-pressed')==='true' && document.querySelector('#postForms [data-pform="post"]').getAttribute('aria-pressed')==='true' && cardData().tags===''`));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await c.desktop(1280, 900, 1);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('crash', e.stack || e); process.exit(2); });
