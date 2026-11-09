// e2e: the public directory page: ONE row on a content page (columns | platforms and their tabs that slide sideways; no drop-down of programs or columns any more), domain tabs (an ARTICLE belongs to its own domain),
// platform tabs (names of at most 7 characters, in one row), the home page (today: a hero and two beside it; picks in a waterfall; programs worth following; the latest), the cards (a Xiaohongshu-style waterfall,
// a cover of its own without a picture, the summary / the heart / the eye / the flame on every card), the list / card button, like / dislike, the anonymous counters, a phone, English
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };
const get = async p => (await fetch(SVC + p)).json();
const seed = rows => get('/__stat_seed?d=' + encodeURIComponent(JSON.stringify(rows)));
const N = 37;                                     // the fixture's entries

(async () => {
  const c = await connect(9444);
  const settle = await require('../settle')(c);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const AT = process.env.FREEZE_AT || '2026-10-22T00:30:00+08:00';          // (the fixture's entries are from 2026-10-19 .. 24 and "today" takes those of the last 72 hours: the page is shown at an hour when that holds, and an entry of 10-20 is two days old)
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{ const R=Date, off=new R('${AT}').getTime()-R.now(); class D extends R{ constructor(...a){ if(a.length===0) super(R.now()+off); else super(...a); } static now(){ return R.now()+off; } } window.Date=D; })();` });
  const J = expr => c.js(`(()=>{ const {state,idb,LS,render,statSend,statFlush,statApi,loadHeat,heatAvailable,dirList,markDirRead,subscribeNow,dirMeta,dirWhy}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async (lang, intro) => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 0); await settle(1500); await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1')` + (intro ? '' : `; localStorage.setItem('archive.dirIntroOff','1')`)); await c.goto(BASE, 0); await settle(2500); };
  const toDir = async () => { await J(`document.querySelector('[data-space="dir"]').click()`); await settle(1800); };
  const titles = () => J(`[...document.querySelectorAll('#grid .card .card-title a')].map(a=>a.textContent)`);
  const tabs = () => J(`[...document.querySelectorAll('#dTabs button')].map(b=>b.textContent)`);
  const h2s = () => J(`[...document.querySelectorAll('#dirReco h2')].filter(h=>!h.closest('.ls')).map(h=>h.childNodes[0].textContent)`);
  const clickTab = async k => { await J(`document.querySelector('#dTabs [data-dtab="${k}"]').click()`); await sleep(350); };
  const mode = async m => { await J(`document.querySelector('[data-dtabs="${m}"]').click()`); await sleep(300); };
  const picked = () => J(`({p:LS.get('dirPick',[]).length, t:LS.get('dirPickT',[]).slice().sort().join()})`);
  const mixIds = () => J(`[...document.querySelectorAll('#dirReco .dr-mix .card')].map(x=>x.dataset.did)`);
  const aboveIds = () => J(`[...document.querySelectorAll('#dirReco .card')].map(x=>x.dataset.did)`);
  const aboveN = () => J(`state.dirAbove ? state.dirAbove.size : 0`);
  const statLog = async () => (await get('/__stat_log')).flatMap(x => { try { return JSON.parse(x.body).events; } catch (e) { return []; } });

  writeDir();
  await c.desktop(1280, 900, 1);

  // ================================================ A. no counters: the structure
  await get('/__stat_reset?off=1');
  await fresh('zh'); await toDir();
  const home = await J(`({h2:[...document.querySelectorAll('#dirReco h2')].filter(h=>!h.closest('.ls')).map(h=>h.childNodes[0].textContent), hero:document.querySelectorAll('#dirReco .today .hero').length, side:document.querySelectorAll('#dirReco .today .tcard').length, above:state.dirAbove.size, cards:document.querySelectorAll('#grid .xcard').length, cols:getComputedStyle(document.querySelector('#grid')).gridTemplateColumns.split(' ').length})`);
  ok('home sections of a reader with no history: today (a hero and two beside it), the editor’s picks, programs worth following, the latest', home.h2.join('|') === '今日 3 件值得看|继续探索|编辑精选|值得订阅|最新更新' && home.hero === 1 && home.side === 2, home);
  const above = await aboveIds(), below = await J(`[...document.querySelectorAll('#grid .card[data-did]')].map(x=>x.dataset.did)`);
  ok('what is shown above (3 + 6 picks) is not shown again below; no entry twice', home.above === 9 && home.above === above.length && below.length === Math.min(24, N - home.above) && !below.some(id => above.includes(id)) && new Set(above).size === above.length, [home.above, above.length, below.length]);
  const today3 = await J(`[...document.querySelectorAll('#dirReco .today .card')].map(x=>x.dataset.did)`);
  ok('today’s three are of three different programs', (await J(`new Set(${JSON.stringify(today3)}.map(id=>state.dirData.items.find(i=>i.id===id).shelf)).size`)) === 3, today3);
  const geo = await J(`(()=>{ const t=document.querySelector('#dirReco .today'), h=t.querySelector('.hero').getBoundingClientRect(), s=[...t.querySelectorAll('.tcard')].map(x=>x.getBoundingClientRect()); return {cols:getComputedStyle(t).gridTemplateColumns.split(' ').length, hh:Math.round(h.height), hw:Math.round(h.width), sw:s.map(r=>Math.round(r.width)), left:h.left<s[0].left, sameTop:Math.abs(h.top-s[0].top)<2, titleColor:getComputedStyle(t.querySelector('.hero .card-title a')).color, bm:[...t.querySelectorAll('.bm')].map(b=>[Math.round(b.getBoundingClientRect().width),Math.round(b.getBoundingClientRect().height)])}; })()`);
  ok('the hero is on the left and compact (two columns, about 200px tall, wider than the two beside it), its title is white on the picture, every bookmark is ≥ 44px', geo.cols === 2 && geo.hh >= 190 && geo.hh <= 230 && geo.hw > geo.sw[0] * 1.4 && geo.left && geo.sameTop && geo.titleColor === 'rgb(255, 255, 255)' && geo.bm.every(([w, h]) => w >= 44 && h >= 44), geo);
  ok('nothing on the page scrolls sideways: no horizontal scroller on the home page (the row of tabs of a content page slides on purpose, see below)', await J(`[...document.querySelectorAll('#dirReco *')].every(e=>{ const o=getComputedStyle(e).overflowX; return o!=='auto' && o!=='scroll'; })`));
  const mix = await mixIds();
  const mixInfo = await J(`(()=>{ const ids=${JSON.stringify(mix.slice(0, 6))}; const its=ids.map(id=>state.dirData.items.find(i=>i.id===id)); const per={}; its.forEach(i=>per[i.shelf]=(per[i.shelf]||0)+1); return {n:ids.length, uniq:new Set(${JSON.stringify(mix)}).size, all:${mix.length}, maxPerShelf:Math.max(...Object.values(per)), topics:new Set(its.flatMap(i=>i.topics)).size}; })()`);
  ok('the picks: 6 different cards (two whole rows of three), at most 2 of any one program, 3+ domains', mixInfo.n === 6 && mixInfo.uniq === 6 && mixInfo.all === 6 && mixInfo.maxPerShelf <= 2 && mixInfo.topics >= 3, mixInfo);
  const wf = await J(`(()=>{ const g=document.querySelector('#dirReco .dr-mix'), cs=[...g.querySelectorAll('.xcard')], r=x=>x.getBoundingClientRect(); const row=cs.slice(0,3), cov=cs.map(x=>Math.round(r(x.querySelector('.xcover')).height)); return {cols:getComputedStyle(g).gridTemplateColumns.split(' ').length, n:cs.length, sameTop:row.every(x=>Math.abs(r(x).top-r(row[0]).top)<1), sameH:row.every(x=>Math.abs(r(x).height-r(row[0]).height)<1), covers:[...new Set(cov)], over:g.scrollWidth-g.clientWidth, w:Math.round(r(cs[0]).width), foot:row.every(x=>Math.abs(r(x.querySelector('.card-foot')).bottom-r(row[0].querySelector('.card-foot')).bottom)<1)}; })()`);
  ok('the picks are a TIDY grid: three columns, every card of a row has the same top, the same height, the same cover height (all covers one shape) and its footer on the same line', wf.cols === 3 && wf.n === 6 && wf.sameTop && wf.sameH && wf.covers.length === 1 && wf.foot && wf.over <= 0, wf);
  ok('the latest is the same grid (3 columns), the button on the toolbar offers the list', home.cols === 3 && await J(`!!document.querySelector('#viewBtn') && getComputedStyle(document.querySelector('#viewBtn')).display!=='none'`));
  const card = await J(`(()=>{ const cs=[...document.querySelectorAll('#dirReco .dr-mix .xcard')].slice(0,6); return {noType:cs.every(c=>!c.querySelector('.xmeta .tag') || state.dirData.items.find(i=>i.id===c.dataset.did).type!=='article'), lang:cs.every(c=>{ const it=state.dirData.items.find(i=>i.id===c.dataset.did); return (it.lang==='en')===!!c.querySelector('.lm'); }), foot:cs.every(c=>c.querySelectorAll('.card-foot button').length===2 && c.querySelectorAll('.card-foot .cstat').length===1 && !c.querySelector('.cstat.heart span') && !c.querySelector('.ext')), tags:cs.every(c=>c.querySelectorAll('.chips .kw').length<=2), lines:cs.every(c=>getComputedStyle(c.querySelector('.card-title')).webkitLineClamp==='2'), mono:cs.every(c=>!!c.querySelector('.xmeta .mono-sm'))}; })()`);
  ok('a card: no "文章" label, the language only when it is not the page’s own (EN), without counters the footer has the heart (no number) and the bookmark, no open arrow, at most two tags, a title of two lines at most, the program’s round mark before its name', card.noType && card.lang && card.foot && card.tags && card.lines && card.mono, card);
  const rk = await J(`(()=>{ const c=document.querySelector('.card[data-did="hotweibo_1"]'); if(!c) return null; const w=c.querySelector('.why'); return {why:w&&w.textContent, cls:w&&w.className, mark:[...c.querySelectorAll('svg text')].map(x=>x.textContent)}; })()`);
  ok('an entry of a hot list says so (热榜第 1 名) and its generated cover has the rank as the big number', rk && rk.why === '热榜第 1 名' && /why-rank/.test(rk.cls) && rk.mark.includes('1'), rk);
  ok('there is no "published today" pill (it would be on most cards)', await J(`document.querySelectorAll('.why-new').length===0 && !/今天发布/.test(document.body.textContent)`));
  const rowA = await J(`(()=>{ const c=document.querySelector('.card[data-did="a1aaaaaaa1"]'); return c ? {meta:c.querySelector('.xmeta').textContent, sum:!!c.querySelector('.sum, .xquote'), cls:c.className} : null; })()`);
  ok('dates are days: this year’s without the year (10-20); a summary that only repeats the title is left out', rowA && /10-20/.test(rowA.meta) && !rowA.sum, rowA);
  await c.shot(require('../paths').SHOTS + '/dir_v2_desktop.png');

  // the list button: light rows, on the home page too
  await J(`document.querySelector('#viewBtn').click()`); await settle(500);
  const lat = await J(`(()=>{ const r=document.querySelector('#grid .drow'); const th=r.querySelector('.row-thumb').getBoundingClientRect(), bm=r.querySelector('.bm').getBoundingClientRect(); return {cols:getComputedStyle(document.querySelector('#grid')).gridTemplateColumns.split(' ').length, thumb:[Math.round(th.width),Math.round(th.height)], bm:[Math.round(bm.width),Math.round(bm.height)], svg:!!r.querySelector('.row-thumb svg'), over:document.documentElement.scrollWidth-document.documentElement.clientWidth, cls:document.querySelector('#grid').className, n:document.querySelectorAll('#grid .drow').length, picks:document.querySelectorAll('#dirReco .dr-mix .drow').length, above:state.dirAbove.size, stats:!!r.querySelector('.xmeta .cstat.heart'), saved:LS.get('view','grid')}; })()`);
  ok('the list button works on the home page: the picks and the latest are light rows (a small cover, a 44px bookmark), the choice is kept', /dir-rows/.test(lat.cls) && lat.n === Math.min(24, N - lat.above) && lat.picks === 6 && lat.above === 9 && lat.cols === 1 && lat.svg && lat.bm[0] >= 44 && lat.bm[1] >= 44 && lat.thumb[0] >= 100 && lat.over <= 0 && lat.stats && lat.saved === 'list', lat);
  const rowSum = await J(`[...document.querySelectorAll('#grid .drow')].some(r=>{ const s=r.querySelector('.sum'); return s && getComputedStyle(s).display!=='none'; })`);
  ok('a row shows its summary (two lines) and the counters line', rowSum);
  await c.shot(require('../paths').SHOTS + '/dir_v2_list.png');
  await J(`document.querySelector('#viewBtn').click()`); await settle(500);
  ok('and the button turns the cards back', await J(`/dcards/.test(document.querySelector('#grid').className) && getComputedStyle(document.querySelector('#grid')).gridTemplateColumns.split(' ').length===3 && LS.get('view','grid')==='grid'`));
  // never more than three columns, two on a tablet
  await c.desktop(1700, 1000, 1); await settle(600);
  const wide = await J(`({cols:getComputedStyle(document.querySelector('#grid')).gridTemplateColumns.split(' ').length, w:Math.round(document.querySelector('#grid .xcard').getBoundingClientRect().width)})`);
  ok('on a wide screen the cards stay three in a row (never more), just wider', wide.cols === 3 && wide.w >= 330, wide);
  await c.desktop(768, 1024, 1); await settle(900);
  const tab2 = await J(`({cols:getComputedStyle(document.querySelector('#grid')).gridTemplateColumns.split(' ').length, picks:getComputedStyle(document.querySelector('#dirReco .dr-mix')).gridTemplateColumns.split(' ').length, n:document.querySelectorAll('#dirReco .dr-mix .xcard').length})`);
  ok('on a tablet two in a row (the picks are 6: three whole rows)', tab2.cols === 2 && tab2.picks === 2 && tab2.n === 6, tab2);
  await c.desktop(1280, 900, 1); await settle(900);

  // the hero opens in the reader, a bookmark does not shuffle the page
  const heroId = today3[0];
  await J(`document.querySelector('#dirReco .hero .bm').click()`); await settle(500);
  ok('a bookmark on the hero: it stays the hero (the page is not shuffled), pressed, saved', await J(`document.querySelector('#dirReco .hero').dataset.did`) === heroId && await J(`document.querySelector('#dirReco .hero .bm').getAttribute('aria-pressed')`) === 'true' && await J(`state.items.some(x=>x.id==='local:link:${heroId}')`));
  await J(`document.querySelector('#dirReco .hero .bm').click()`); await settle(400);
  ok('and the same tap takes it back', await J(`document.querySelector('#dirReco .hero .bm').getAttribute('aria-pressed')`) === 'false' && await J(`!state.items.some(x=>x.id==='local:link:${heroId}')`));
  await J(`document.querySelector('#dirReco .hero .hero-link').click()`); await settle(2200);
  ok('a tap on the hero opens its article in the reader', await J(`!document.querySelector('#reader').hidden && /^tmp:/.test(state.readingId||'')`), await J(`state.readingId`));
  await J(`document.querySelector('#readerBack').click()`); await settle(500); await J(`render()`); await sleep(300);
  ok('read, it is not today’s any more (the hero is another one)', await J(`document.querySelector('#dirReco .hero').dataset.did`) !== heroId);
  await J(`(()=>{ LS.set('dirRead',{}); state.dirRead={}; render(); })()`); await sleep(300);

  const shuf = (await mixIds()).slice(0, 6);
  await J(`document.querySelector('[data-dr-shuffle]').click()`); await sleep(300);
  const shuf2 = (await mixIds()).slice(0, 6);
  ok('"换一批" takes other picks (6 again, not all the same)', shuf2.length === 6 && shuf2.some(id => !shuf.includes(id)), [shuf, shuf2]);
  await J(`(()=>{ state.mixSeed=0; render(); })()`); await sleep(300);

  // the domains: an article belongs to ITS domain
  const tabNames = await tabs();
  ok('the tabs are the COLUMNS that have articles, an article in exactly one: AI 与科技 17, 学习与研究 2, 财经与商业 5 (供应链 is inside), 视频与创作者 2, 读书与深度 1 (the program names its own domain), 全球正在发生 8', tabNames.join('|') === '全部37|AI 与科技17|学习与研究2|财经与商业5|视频与创作者2|读书与深度1|全球正在发生8', tabNames);
  ok('every article has at most one column (35 of 37 have one; the two reader links have none)', await J(`state.dirData.items.every(i=>typeof i.col==='string') && state.dirData.items.filter(i=>i.col).length===35`));
  ok('the eight columns are the built-in ones (names, order)', await J(`state.dirData.columns.map(c=>c.id).join()`) === 'fun,tech,learn,biz,work,video,read,world');
  await J(`state.dsort='recent'; LS.set('dsort','recent'); render()`); await sleep(500);                    // (the order by date: the page's own language first inside a day; the composite order has its own tests, s_fresh)
  const dayZh = await J(`(()=>{ const ids=[...document.querySelectorAll('#grid .card[data-did]')].map(x=>x.dataset.did); const day=ids.map(id=>state.dirData.items.find(i=>i.id===id)).filter(i=>i.date==='2026-10-22'); return day.length ? {n:day.length, first:day[0].lang, langs:[...new Set(day.map(i=>i.lang))].join()} : null; })()`);
  ok('the page’s own language comes first inside a day (a Chinese page: a Chinese entry first, the English ones are still there)', dayZh && dayZh.first === 'zh' && /en/.test(dayZh.langs), dayZh);
  ok('"换一批" is a button of the page’s own look (.btn)', await J(`document.querySelector('[data-dr-shuffle]').classList.contains('btn')`));
  const ds = await J(`(()=>{ const m=state.dirData.items.filter(i=>i.shelf==='mixed'); return m.map(i=>i.topics.join('+')).join(','); })()`);
  ok('one program of two domains: the chip article is 科技, the market article is 金融, the neutral ones stay with the program’s first (科技)', ds === 'tech,finance,tech,tech', ds);
  const multi = await J(`state.dirData.items.filter(i=>i.topics.length>1).length`);
  ok('few articles are in two domains (the tabs show different articles)', multi <= 37 * 0.3, multi);
  await clickTab('col:tech');
  const subs0 = await J(`[...document.querySelectorAll('#dSubs button')].map(b=>b.textContent).join('|')`);
  ok('inside a column its domains are a second line (全部 17, 科技 10, 编程 7)', subs0 === '全部17|科技10|编程7', subs0);
  const techTitles = await titles();
  ok('科技: the chip article is in, the market article is not; the unguessed program 数码评测周报 is in by its name', techTitles.includes('New AI chip from Nvidia doubles speed') && !techTitles.includes('Stock markets fall as inflation worries grow') && techTitles.includes('新机评测：手机') && techTitles.includes('A quiet story about nothing much'), techTitles);
  await clickTab('col:biz');
  ok('财经与商业: the 4 supply-chain articles and the market article (5)', (await titles()).length === 5 && (await titles()).includes('Stock markets fall as inflation worries grow'), await titles());
  await J(`document.querySelector('#dSubs [data-dsub="finance"]').click()`); await sleep(350);
  ok('the second line narrows to one domain: 金融 has the market article only, not the chip article', (await titles()).join('|') === 'Stock markets fall as inflation worries grow', await titles());
  ok('inside a column there is no home page, just its entries as cards of the grid', await J(`document.querySelector('#dirReco').hidden && /dcards/.test(document.querySelector('#grid').className) && document.querySelectorAll('#grid .xcard').length===1`));
  await clickTab('col:tech');
  ok('changing the column clears the second line', await J(`!state.dSub && document.querySelectorAll('#grid .xcard').length===17`));
  const sm = await J(`(()=>{ const c=document.querySelector('#grid .card[data-did="m1mmmmmmm1"]'); const cv=c.querySelector('.xcover'); const hs=[...document.querySelectorAll('#grid .xcover')].map(x=>Math.round(x.getBoundingClientRect().height)); return {cover:cv.className, quote:(c.querySelector('.xquote')||{}).textContent, sum:!!c.querySelector('.xbody .sum'), lm:(c.querySelector('.lm')||{}).textContent, fs:cv.style.getPropertyValue('--fs'), shapes:[...new Set(hs)], n:hs.length}; })()`);
  ok('a card without a picture: the cover carries the start of the summary (a text cover on the program’s colour), the body does not repeat it; EN; and every cover of the page has the same height', /xtext/.test(sm.cover) && /^Nvidia says/.test(sm.quote) && !sm.sum && sm.lm === 'EN' && sm.fs && sm.shapes.length === 1 && sm.n >= 10, sm);
  await J(`document.querySelector('#grid .card[data-did="m4mmmmmmm4"]').scrollIntoView({block:'center'})`);
  const coverOk = `(()=>{ const c=document.querySelector('#grid .card[data-did="m4mmmmmmm4"] .xcover'); return /xtext/.test(c.className) && !c.querySelector('img') && /This one has a picture/.test(c.textContent); })()`;
  for (let i = 0; i < 80 && !(await J(coverOk)); i++) await sleep(150);                                // (the name of the missing host takes a few seconds to fail on a slow resolver)
  ok('a cover picture that cannot be loaded is replaced by a cover of our own (the summary on the program’s colour)', await J(coverOk));
  await J(`document.querySelector('#viewBtn').click()`); await settle(400);
  ok('the list button turns the tab into light rows (and the choice is kept)', await J(`/dir-rows/.test(document.querySelector('#grid').className) && document.querySelectorAll('#grid .drow').length>=10 && LS.get('view','grid')==='list'`));
  await J(`document.querySelector('#viewBtn').click()`); await sleep(300);
  await clickTab('');
  await mode('plat');
  ok('platform side: the FIXED platforms first (GitHub 7, 微博 6, YouTube 2, 知乎 2, Hacker News 2: names cut to 7 characters), then ALL the dynamic ones (an independent site is a platform of its own, named by its program; what readers shared is "其他"): one row, nothing behind "更多"', (await tabs()).join('|') === '全部37|GitHub7|微博6|YouTube2|知乎2|Hacker…2|供应链周刊4|Money …4|Tech N…3|其他3|数码评测周报2|每日新闻简报2', await tabs());
  ok('a cut name keeps its full name as the tooltip', await J(`[...document.querySelectorAll('#dTabs button')].find(b=>b.textContent.startsWith('Hacker')).title`) === 'Hacker News');
  ok('every tab label is at most 7 characters (plus its number)', await J(`[...document.querySelectorAll('#dTabs button')].every(b=>[...b.firstChild.textContent].length<=7)`));
  const wrap = await J(`(()=>{ const t=document.querySelector('#dTabs'); return {wrap:getComputedStyle(t).flexWrap, ox:getComputedStyle(t).overflowX, bar:document.documentElement.scrollWidth<=document.documentElement.clientWidth+1}; })()`);
  ok('the tabs are ONE row that slides sideways (no wrapping, no folding), and the page itself does not', wrap.wrap === 'nowrap' && wrap.ox === 'auto' && wrap.bar, wrap);
  await clickTab('plat:zhihu');
  ok('the 知乎 tab: the two articles of a Zhihu column', (await titles()).join() === '知乎专栏一,知乎专栏二', await titles());
  await clickTab('plat:weibo');
  ok('the 微博 tab: the hot list of Weibo (6), each with its rank as the reason', (await titles()).length === 6 && await J(`[...document.querySelectorAll('#grid .card .why-rank')].map(x=>x.textContent).sort().join()`) === '热榜第 1 名,热榜第 2 名,热榜第 3 名,热榜第 4 名,热榜第 5 名,热榜第 6 名', await titles());
  await clickTab('');
  const mixP = await J(`(()=>{ const ids=[...document.querySelectorAll('#dirReco .dr-mix .card')].slice(0,6).map(x=>x.dataset.did); const its=ids.map(id=>state.dirData.items.find(i=>i.id===id)); return {n:ids.length, plats:new Set(its.map(i=>i.plat)).size}; })()`);
  ok('on the platform side the picks mix the platforms (the first 6 cards of 5 or more platforms)', mixP.n === 6 && mixP.plats >= 5, mixP);

  // ---------------------------------------------- the picker of programs and of columns is gone: what an older version ticked is kept as an interest and hides nothing
  ok('there is no dropdown any more: no "节目" / "栏目" button, no panel, no backdrop, no "更多"', await J(`!document.querySelector('#dPickBtn') && !document.querySelector('#dPick') && !document.querySelector('#dPickBack') && !document.querySelector('#dTabsMore')`));
  await J(`localStorage.setItem('archive.dirPick', JSON.stringify(['blogA','ytC']))`); await c.goto(BASE, 0); await settle(2500); await toDir();
  ok('programs ticked by an older version hide nothing: the home page is there and no chip says "已选"', await J(`!document.querySelector('#dirReco').hidden && !document.querySelector('#viewSub [data-clear="dpick"]')`));
  await mode('plat'); await clickTab('plat:youtube');
  ok('and a platform tab shows all of its entries (YouTube 2, not only the ticked program)', (await titles()).length === 2, await titles());
  await clickTab(''); await mode('topic');
  await J(`localStorage.removeItem('archive.dirPick')`);

  // ---------------------------------------------- columns ticked once (the first visit's question) are an interest: the home is the reader's own, the tabs and the list are everything
  await J(`localStorage.setItem('archive.dirPickT', JSON.stringify(['tech','biz']))`); await c.goto(BASE, 0); await settle(2500); await toDir();
  ok('two columns as interests: the home page is the reader\'s own (today, one small section of each, "更多 ›", the programs of those columns, the latest)', (await h2s()).join('|') === '今日 3 件值得看|继续探索|AI 与科技|财经与商业|值得订阅|最新更新' && await J(`[...document.querySelectorAll('#dirReco .dr-col')].every(s=>s.querySelectorAll('.card').length===3 && !!s.querySelector('[data-dr-colmore]'))`), await h2s());
  ok('...but the tabs are all six columns and the list is not narrowed (no "已选 2 个栏目" chip)', (await tabs()).join('|') === '全部37|AI 与科技17|学习与研究2|财经与商业5|视频与创作者2|读书与深度1|全球正在发生8' && (await titles()).length === Math.min(24, N - await aboveN()) && await J(`!document.querySelector('#viewSub [data-clear="dpick"]')`), [await tabs(), await titles(), await aboveN()]);
  await J(`document.querySelector('#dirReco [data-dr-colmore="tech"]').click()`); await settle(400);
  ok('"更多 ›" of a section opens that column (17 articles)', await J(`state.dTab`) === 'col:tech' && (await titles()).length === 17, await titles());
  const scope = await J(`({chips:[...document.querySelectorAll('#viewSub .chip')].map(x=>x.textContent.replace('✕','').trim()), home:!!document.querySelector('#viewSub [data-clear="dhome"]')})`);
  ok('one line says where you are (栏目：AI 与科技), nothing about ticks, and no "← 回到首页" button', !scope.home && scope.chips.some(x => x === '栏目：AI 与科技') && !scope.chips.some(x => /已选/.test(x)), scope);
  await J(`document.querySelector('#dSubs [data-dsub="dev"]').click()`); await sleep(350);
  ok('inside the column, the domain is on the line too (领域：编程, 7 articles)', (await titles()).length === 7 && await J(`[...document.querySelectorAll('#viewSub .chip')].some(x=>x.textContent.includes('领域：编程'))`));
  await J(`document.querySelector('#cats [data-dbrowse="0"]').click()`); await settle(400);
  ok('the sidebar’s "发现" clears the column, the domain and the rest at once (the interests stay): the home page is back', await J(`!state.dTab && !state.dSub && !document.querySelector('#dirReco').hidden && !document.querySelector('#viewSub [data-clear="dhome"]') && state.dPickT.size===2`));
  await clickTab('col:biz');
  ok('a column tab narrows to its 5 articles', (await titles()).length === 5, await titles());
  await clickTab('');
  await mode('plat');
  ok('on the platform side the same interests do not change the page (everything, the home page)', await J(`!document.querySelector('#dirReco').hidden`));
  await mode('topic');
  await J(`localStorage.removeItem('archive.dirPickT')`); await c.goto(BASE, 0); await settle(2500); await toDir();


  // a first visit: the question, the moods, the interests
  await fresh('zh', true);
  await toDir();
  const q1 = await J(`({h2:[...document.querySelectorAll('#dirReco h2')].filter(h=>!h.closest('.ls')).map(h=>h.childNodes[0].textContent), intents:[...document.querySelectorAll('[data-dr-intent]')].map(b=>b.textContent), chips:[...document.querySelectorAll('[data-dr-col]')].map(b=>b.textContent), go:!!document.querySelector('[data-dr-intro-go]') && document.querySelector('[data-dr-intro-go]').disabled})`);
  ok('a first visit starts with the question "现在想看什么？": four moods and the columns that have articles to pick as interests (nothing is guessed), "看这几个栏目" waits for a pick', q1.h2[0] === '现在想看什么？' && q1.intents.join('|') === '摸鱼一下|学习进阶|看懂热点|深度收藏' && q1.chips.join('|') === 'AI 与科技|学习与研究|财经与商业|视频与创作者|读书与深度|全球正在发生' && q1.go === true, q1);
  await J(`document.querySelector('[data-dr-col="read"]').click()`); await sleep(300);
  ok('a column chip is a toggle; with one picked "看这几个栏目" can be pressed', await J(`document.querySelector('[data-dr-col="read"]').getAttribute('aria-pressed')==='true' && !document.querySelector('[data-dr-intro-go]').disabled`));
  await J(`document.querySelector('[data-dr-intro-skip]').click()`); await sleep(300);
  ok('"先随便看看": the question goes away for good, nothing is picked, the editor’s picks are there', await J(`!document.querySelector('.dr-intro') && state.dPickT.size===0 && LS.get('dirIntroOff',0)===1`) && (await h2s()).includes('编辑精选'));
  await fresh('zh', true); await toDir();
  await J(`document.querySelector('[data-dr-intent="learn"]').click()`); await settle(500);
  ok('a mood ("学习进阶") ticks its columns that have articles (学习与研究, AI 与科技; 职场与产品 has none), the question goes away, the page is the reader’s own home', await J(`LS.get('dirPickT',[]).slice().sort().join()`) === 'learn,tech' && !(await J(`!!document.querySelector('.dr-intro')`)) && (await h2s()).join('|').startsWith('今日 3 件值得看|继续探索|AI 与科技|学习与研究'), [await J(`LS.get('dirPickT',[])`), await h2s()]);
  // away for more than 30 days
  await fresh('zh'); await J(`localStorage.setItem('archive.dirVisit', JSON.stringify({first:Date.now()-100*864e5,last:Date.now()-40*864e5}))`); await c.goto(BASE, 0); await settle(2500); await toDir();
  const cold = await J(`(()=>{ const s=document.querySelector('#dirReco .dr-cold'); return s ? {h2:s.querySelector('h2').textContent, note:s.querySelector('.dr-note').textContent, n:s.querySelectorAll('.card').length, order:[...document.querySelectorAll('#dirReco section:not(.ls)')].slice(0,3).map(x=>x.className.replace('dr-sec ',''))} : null; })()`);
  ok('away for 40 days: "你可能错过了" (the newest pieces, whole rows) comes right after today and the way on, with how long it has been', cold && cold.h2 === '你可能错过了' && /40 天/.test(cold.note) && cold.n >= 3 && cold.order[2] === 'dr-cold', cold);
  await c.goto(BASE, 0); await settle(2500); await toDir();
  ok('and the next visit is not a "cold" one any more', await J(`!document.querySelector('#dirReco .dr-cold')`));
  await fresh('zh');

  // what an older version ticked (domains) moves to the column they belong to
  await J(`localStorage.setItem('archive.dirPickT', JSON.stringify(['tech','finance','nonsense']))`); await c.goto(BASE, 0); await settle(2500); await toDir();
  ok('what an older version ticked (domains) moves to their columns: tech -> tech, finance -> biz, the unknown one is dropped', await J(`LS.get('dirPickT',[]).slice().sort().join()`) === 'biz,tech', await J(`LS.get('dirPickT',[])`));
  await J(`localStorage.removeItem('archive.dirPickT')`); await c.goto(BASE, 0); await settle(2500); await toDir();

  // ================================================ B. counters, heat, the heart and the eye, personal recommendations
  await get('/__stat_reset');
  await seed([
    { t: 'open', k: 'item', id: 'b2bbbbbbb2', n: 30 }, { t: 'save', k: 'item', id: 'b2bbbbbbb2', n: 5 }, { t: 'open', k: 'item', id: 'a1aaaaaaa1', n: 40 }, { t: 'open', k: 'item', id: 'y1yyyyyyy1', n: 25 },
    { t: 'like', k: 'item', id: 'a2aaaaaaa2', n: 7 }, { t: 'dislike', k: 'item', id: 'a2aaaaaaa2', n: 2 },
    { t: 'sub', k: 'shelf', id: 'blogB', n: 8 }, { t: 'open', k: 'shelf', id: 'blogA', n: 20 }, { t: 'open', k: 'shelf', id: 'ytC', n: 5 }]);
  await fresh('zh'); await toDir();
  ok('with counters the page is the same shape (the hot strips are gone: today’s three come from the heat)', (await h2s()).join('|') === '今日 3 件值得看|继续探索|编辑精选|值得订阅|最新更新', await h2s());
  const hero = await J(`(()=>{ const h=document.querySelector('#dirReco .hero'); const w=h.querySelector('.why'); return {id:h.dataset.did, why:w&&w.textContent, cls:w&&w.className}; })()`);
  ok('today’s first is one of the busiest, and says why (the owner’s pick, or "本周热读")', ['a1aaaaaaa1', 'b2bbbbbbb2', 'y1yyyyyyy1', 'a2aaaaaaa2'].includes(hero.id) && /^(站长推荐|本周热读)$/.test(hero.why || '') && /why-(pick|heat)/.test(hero.cls), hero);
  const subs = await J(`[...document.querySelectorAll('#dirReco .dr-subs .dr-card h3')].map(h=>h.textContent)`);
  ok('programs worth following: the owner’s pick first (供应链周刊), then the busiest ones; at most 3', subs[0] === '供应链周刊' && subs.length === 3, subs);
  await clickTab('col:biz');
  const cs = await J(`(()=>{ const f=id=>{ const c=document.querySelector('#grid .card[data-did="'+id+'"]'); return {stats:[...c.querySelectorAll('.cstat:not(.fire)')].map(x=>x.textContent).join('|'), heart:!!c.querySelector('button.cstat.heart'), eyes:c.querySelectorAll('.cstat:not(.heart):not(.fire)').length, fire:!!c.querySelector('.cstat.fire'), why:(c.querySelector('.why')||{}).textContent||''}; }; return {a1:f('a1aaaaaaa1'), a2:f('a2aaaaaaa2'), a4:f('a4aaaaaaa4')}; })()`);
  ok('a number that is 0 is not shown: ♥ and 👁 (a1 ♥0 👁40 → only 40, a2 ♥7 👁0 → only 7, a4 0|0 → none), the heart stays a button on every card, and the flame (heat) where there is some', cs.a1.stats === '|40' && cs.a2.stats === '7' && cs.a4.stats === '' && cs.a1.eyes === 1 && cs.a2.eyes === 0 && cs.a4.eyes === 0 && cs.a1.heart && cs.a2.heart && cs.a4.heart && cs.a1.fire && cs.a2.fire && !cs.a4.fire, cs);
  ok('the reason is a pill on the cover, ONE per card, and the owner’s pick comes first even where the entry is busy (a1, a2, a4 are all of the picked program)', cs.a1.why === '站长推荐' && cs.a2.why === '站长推荐' && cs.a4.why === '站长推荐', cs);
  await clickTab('col:tech');
  ok('a busy entry of a program that is not the owner’s pick says "本周热读" (b2); a quiet one says nothing', (await J(`(document.querySelector('#grid .card[data-did="b2bbbbbbb2"] .why')||{}).textContent`)) === '本周热读' && (await J(`(document.querySelector('#grid .card[data-did="b3bbbbbbb3"] .why')||{}).textContent||''`)) === '');
  await clickTab('col:biz');
  ok('the heart is a button (pressed state), the eye is not', await J(`(()=>{ const c=document.querySelector('#grid .card[data-did="a1aaaaaaa1"]'); return c.querySelector('.cstat.heart').tagName==='BUTTON' && c.querySelector('.cstat.heart').getAttribute('aria-pressed')==='false' && c.querySelector('.cstat:not(.heart):not(.fire)').tagName==='SPAN'; })()`));
  await J(`document.querySelector('#grid .card[data-did="a1aaaaaaa1"] .cstat.heart').click()`); await sleep(250);
  const hp = await J(`(()=>{ const x=document.querySelector('#grid .card[data-did="a1aaaaaaa1"] .cstat.heart'); return {pressed:x.getAttribute('aria-pressed'), n:x.textContent, vote:LS.get('dirVote',{}).a1aaaaaaa1}; })()`);
  ok('a tap on the heart likes it at once (1), remembers it here', hp.pressed === 'true' && hp.n === '1' && hp.vote === 1, hp);
  await J(`statFlush()`); await settle(500);
  ok('and it is counted once: one "like"', (await statLog()).filter(e => e.t === 'like' && e.id === 'a1aaaaaaa1').length === 1, await statLog());
  await J(`document.querySelector('#grid .card[data-did="a1aaaaaaa1"] .cstat.heart').click()`); await sleep(250);
  ok('the same tap again takes it back (the 0 is not shown)', await J(`document.querySelector('#grid .card[data-did="a1aaaaaaa1"] .cstat.heart').getAttribute('aria-pressed')`) === 'false' && await J(`document.querySelector('#grid .card[data-did="a1aaaaaaa1"] .cstat.heart').textContent`) === '' && await J(`LS.get('dirVote',{}).a1aaaaaaa1===undefined`));
  await J(`statFlush()`); await settle(500);
  ok('and what was sent is a change, never a person: like then unlike', (await statLog()).filter(e => e.id === 'a1aaaaaaa1').map(e => e.t).join() === 'like,unlike', await statLog());
  await J(`document.querySelector('#viewBtn').click()`); await settle(400);
  ok('in rows the numbers are on the line under the title (♥ is a button there too)', await J(`(()=>{ const c=document.querySelector('#grid .card[data-did="a1aaaaaaa1"]'); return !!c.querySelector('.xmeta .cstat.heart') && [...c.querySelectorAll('.xmeta .cstat:not(.fire):not(.heart)')].map(x=>x.textContent).join()==='40'; })()`));
  await J(`document.querySelector('#viewBtn').click()`); await sleep(300);
  await clickTab('');
  await mode('topic');

  // reading and liking in the reader
  await J(`document.querySelector('.card[data-did="a2aaaaaaa2"] .card-title a').click()`); await settle(2200);
  const pill = await J(`({vis:!document.querySelector('#rVote').hidden, like:document.querySelector('#rLikeN').textContent, dis:document.querySelector('#rDislikeN').textContent, pressed:document.querySelector('#rLike').getAttribute('aria-pressed')})`);
  ok('the reader of a directory article has the heart / thumb-down with the counts (7, 2)', pill.vis && pill.like === '7' && pill.dis === '2' && pill.pressed === 'false', pill);
  await J(`document.querySelector('#rLike').click()`); await sleep(200);
  ok('a like in the reader: shown at once (8), remembered in this browser', await J(`document.querySelector('#rLikeN').textContent`) === '8' && await J(`document.querySelector('#rLike').getAttribute('aria-pressed')`) === 'true' && await J(`LS.get('dirVote',{}).a2aaaaaaa2`) === 1);
  await J(`document.querySelector('#rLike').click()`); await sleep(150); await J(`document.querySelector('#rDislike').click()`); await sleep(200);
  ok('from like to dislike: the like is taken back, the dislike counted (7, 3)', await J(`document.querySelector('#rLikeN').textContent`) === '7' && await J(`document.querySelector('#rDislikeN').textContent`) === '3' && await J(`LS.get('dirVote',{}).a2aaaaaaa2`) === -1);
  await c.shot(require('../paths').SHOTS + '/dir_vote.png');
  await J(`document.querySelector('#readerBack').click()`); await settle(500);

  // for you, folded into the picks
  const picksNote = () => J(`(document.querySelector('#dirReco .dr-picks .dr-note')||{textContent:''}).textContent`);
  await J(`(()=>{ LS.set('dirVote',{}); state.vote={}; LS.set('dirRead',{}); state.dirRead={}; render(); })()`); await settle(400);
  ok('with nothing read the picks say nothing personal', !/不离开你的设备/.test(await picksNote()) && await J(`!document.querySelector('[data-dr-clear]')`));
  await J(`(()=>{ ['a1aaaaaaa1','a2aaaaaaa2','b1bbbbbbb1'].forEach(id=>markDirRead(id)); render(); })()`); await settle(500);
  ok('after reading 3 articles the same picks say what they used (and where the data stays), and offer to clear it (a button of the page’s own look)', /不离开你的设备/.test(await picksNote()) && await J(`!!document.querySelector('[data-dr-clear]') && document.querySelector('[data-dr-clear]').classList.contains('btn')`));
  const you = await J(`(()=>{ const f=id=>state.dirData.items.find(i=>i.id===id); return {rec:dirWhy(f('m2mmmmmmm2'),true), plain:dirWhy(f('m2mmmmmmm2'),false), pick:dirWhy(f('a3aaaaaaa3'),true)}; })()`);
  ok('after reading 3 articles of 财经与商业, a recommendation of another one says "因为你常看 · 财经与商业" (a plain list says nothing); the owner’s pick still comes first', you.rec && you.rec[0] === 'you' && /因为你常看 · 财经与商业/.test(you.rec[1]) && you.plain === null && you.pick && you.pick[0] === 'pick', you);
  ok('there is no separate "为你推荐" section', !(await h2s()).includes('为你推荐'), await h2s());
  const seen = await J(`[...document.querySelectorAll('#dirReco .today .card, #dirReco .dr-picks .card')].map(x=>x.dataset.did)`);
  ok('what was read is not recommended again (today, the picks)', !seen.some(id => ['a1aaaaaaa1', 'a2aaaaaaa2', 'b1bbbbbbb1'].includes(id)), seen);
  ok('with a history the picks are "为你精选", and "最近读过" lists the last three opened (newest first), no repeat in the list', (await h2s()).includes('为你精选') && (await h2s()).includes('最近读过') && await J(`[...document.querySelectorAll('#dirReco .dr-recent .card')].map(x=>x.dataset.did).sort().join()`) === 'a1aaaaaaa1,a2aaaaaaa2,b1bbbbbbb1' && !await J(`!!document.querySelector('#grid .card[data-did="a1aaaaaaa1"]')`), [await h2s(), await J(`[...document.querySelectorAll('#dirReco .dr-recent .card')].map(x=>x.dataset.did).sort().join()`), await J(`!!document.querySelector('#grid .card[data-did="a1aaaaaaa1"]')`)]);
  await J(`(()=>{ LS.set('dirVote',{a3aaaaaaa3:-1}); state.vote={a3aaaaaaa3:-1}; render(); })()`); await settle(400);
  ok('what was disliked is not shown above any more (it is in the list)', !(await aboveIds()).includes('a3aaaaaaa3'), await aboveIds());
  await J(`document.querySelector('[data-dr-clear]').click()`); await settle(400);
  ok('"清除这些记录" empties the records, the note loses its personal part', await J(`Object.keys(LS.get('dirRead',{})).length===0 && Object.keys(LS.get('dirVote',{})).length===0`) && !/不离开你的设备/.test(await picksNote()));
  await J(`document.querySelector('[data-dr-shuffle]').click()`); await sleep(300);
  ok('"换一批" works (the page stays whole)', (await mixIds()).length >= 6 && (await h2s()).length === 5, await mixIds());

  // do not track: a like stays here, nothing is sent
  await get('/__stat_reset'); await seed([{ t: 'open', k: 'item', id: 'b2bbbbbbb2', n: 12 }]);
  const dnt = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(navigator,'doNotTrack',{get:()=>'1'})" });
  await fresh('zh'); await toDir(); await clickTab('col:tech');
  await J(`document.querySelector('#grid .card[data-did="b2bbbbbbb2"] .cstat.heart').click()`); await sleep(200); await J(`statFlush()`); await settle(500);
  ok('with "do not track": the like is kept here and used for recommendations, nothing is sent', await J(`LS.get('dirVote',{}).b2bbbbbbb2`) === 1 && (await get('/__stat_log')).length === 0, await get('/__stat_log'));
  await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: dnt.identifier });

  // ================================================ C. a phone
  await get('/__stat_reset'); await seed([{ t: 'open', k: 'item', id: 'b2bbbbbbb2', n: 30 }, { t: 'sub', k: 'shelf', id: 'blogB', n: 8 }]);
  await c.mobile(390, 844, 2);
  await fresh('zh'); await toDir();
  const ph0 = await J(`(()=>{ const h=document.querySelector('#dirReco .hero').getBoundingClientRect(); return {over:document.documentElement.scrollWidth-document.documentElement.clientWidth, bar:document.querySelector('#dirBar').offsetParent!==null, heroTop:Math.round(h.top), vh:innerHeight, viewBtn:getComputedStyle(document.querySelector('#viewBtn')).display, today:getComputedStyle(document.querySelector('#dirReco .today')).gridTemplateColumns.split(' ').length}; })()`);
  ok('phone: the discovery page has no toolbar, so the hero is on the first screen; no sideways scroll; today is one column; the card / list button is there', ph0.over <= 0 && !ph0.bar && ph0.heroTop < ph0.vh * 0.6 && ph0.today === 1 && ph0.viewBtn !== 'none', ph0);
  await J(`document.querySelector('#dirReco [data-dr-browse]').click()`); await settle(500);
  const ph = await J(`(()=>{ const t=document.querySelector('#dTabs'); return {over:document.documentElement.scrollWidth-document.documentElement.clientWidth, wrap:getComputedStyle(t).flexWrap, ox:getComputedStyle(t).overflowX, tabsH:Math.round(t.getBoundingClientRect().height), slides:t.scrollWidth>t.clientWidth}; })()`);
  ok('phone, the whole directory: no sideways scroll of the page; the column tabs are ONE row that slides (not two lines, no "更多"), and it is one line high', ph.over <= 0 && ph.wrap === 'nowrap' && ph.ox === 'auto' && ph.tabsH <= 60 && ph.slides, ph);
  const tgt = await J(`[...document.querySelectorAll('#dTabs button, #dTabsMode button')].filter(b=>b.offsetParent!==null).map(b=>Math.round(b.getBoundingClientRect().height))`);
  ok('phone: the tabs and the 栏目 / 平台 switch are at least 40px tall', tgt.length >= 5 && tgt.every(h => h >= 40), tgt);
  await J(`document.querySelector('#cats [data-dbrowse="0"]').click()`); await settle(500);                  // (back to the discovery page: its cards are looked at next)
  const pr = await J(`(()=>{ const g=document.querySelector('#dirReco .dr-mix'), cs=[...g.querySelectorAll('.xcard')], k=cs[0], r=x=>x.getBoundingClientRect(), bm=r(k.querySelector('.card-foot [data-d="save"]')), cv=r(k.querySelector('.xcover')); return {cols:getComputedStyle(g).gridTemplateColumns.split(' ').length, wide:Math.round(r(cs[0]).width), same:Math.abs(r(cs[0]).width-r(cs[1]).width)<1 && Math.abs(r(cs[0]).top-r(cs[1]).top)<1, square:Math.abs(cv.width-cv.height)<2, title:getComputedStyle(k.querySelector('.card-title')).fontSize, chipsHidden:[...document.querySelectorAll('#dirReco .xcard .chips')].every(x=>getComputedStyle(x).display==='none'), ext:document.querySelectorAll('#grid .ext, #dirReco .ext').length, inside:[...document.querySelectorAll('#dirReco .xcard, #grid .xcard')].every(x=>r(x).right<=innerWidth+0.5), bm:[Math.round(bm.width),Math.round(bm.height)], footIn:bm.right<=r(k).right+0.5, grid:getComputedStyle(document.querySelector('#grid')).gridTemplateColumns.split(' ').length}; })()`);
  ok('phone: the cards are two in a row, aligned (same width and top), square covers, the title is 14px+, no open arrow, a 44px bookmark inside the card, everything inside the screen', pr.cols === 2 && pr.same && pr.square && parseFloat(pr.title) >= 14 && pr.chipsHidden && pr.ext === 0 && pr.inside && pr.footIn && pr.grid === 2 && pr.bm[0] >= 44 && pr.bm[1] >= 44, pr);
  const phSum = await J(`(()=>{ const c=[...document.querySelectorAll('#grid .xcard')].find(x=>!x.querySelector('.xtext')); return c ? {show:getComputedStyle(c.querySelector('.sum')||document.body).display, has:!!c.querySelector('.sum')} : null; })()`);
  ok('phone: a card with a picture keeps its two-line summary (a card with a text cover has it on the cover)', !phSum || !phSum.has || phSum.show !== 'none', phSum);
  const cov = await J(`(()=>{ const q=document.querySelector('.xcover.xtext'); const r=q.getBoundingClientRect(), t=q.querySelector('.xquote').getBoundingClientRect(); return {fits:t.bottom<=r.bottom+1 && t.top>=r.top-1, fs:getComputedStyle(q.querySelector('.xquote')).fontSize}; })()`);
  ok('phone: the text on a text cover fits inside its cover (the cover grows with the text)', cov.fits, cov);
  await c.shot(require('../paths').SHOTS + '/dir_v2_phone.png');
  await J(`document.querySelector('#viewBtn').click()`); await settle(500);
  const pl = await J(`(()=>{ const r=document.querySelector('#grid .drow'), bm=r.querySelector('.bm').getBoundingClientRect(); return {cols:getComputedStyle(document.querySelector('#grid')).gridTemplateColumns.split(' ').length, bm:[Math.round(bm.width),Math.round(bm.height)], over:document.documentElement.scrollWidth-document.documentElement.clientWidth, inside:[...document.querySelectorAll('#grid .drow')].every(x=>x.getBoundingClientRect().right<=innerWidth+0.5), sum:[...document.querySelectorAll('#grid .drow .sum')].every(s=>getComputedStyle(s).webkitLineClamp==='1')}; })()`);
  ok('phone, the list button: one column of rows, a 44px bookmark, a one-line summary, nothing sideways', pl.cols === 1 && pl.bm[0] >= 44 && pl.bm[1] >= 44 && pl.over <= 0 && pl.inside && pl.sum, pl);
  await c.shot(require('../paths').SHOTS + '/dir_v2_phone_list.png');
  await J(`document.querySelector('#viewBtn').click()`); await settle(400);
  await J(`document.querySelector('#dirReco [data-dr-browse]').click()`); await settle(500);
  await clickTab('col:biz');
  ok('phone: a column tab is cards too (5 of them)', await J(`document.querySelectorAll('#grid .xcard').length`) === 5);
  await clickTab('');
  await c.desktop(1280, 900, 1);

  // ================================================ D. English
  await fresh('en'); await toDir();
  const en = await J(`({h2:[...document.querySelectorAll('#dirReco h2')].filter(h=>!h.closest('.ls')).map(h=>h.childNodes[0].textContent), tabs:[...document.querySelectorAll('#dTabs button')].map(b=>b.textContent).slice(0,3), lm:(document.querySelector('.card[data-did="a1aaaaaaa1"] .lm')||{}).textContent, why:(document.querySelector('.card[data-did="b2bbbbbbb2"] .why')||{}).textContent, mode:document.querySelector('#dTabsMode').textContent.replace(/\s+/g,' ').trim()})`);
  ok('English: the section titles, the column tabs (whole words), the language mark of a Chinese article (中文), the reason in English, the switch "Column Platform"', en.h2.join('|') === '3 to read today|Keep exploring|Editor’s picks|Worth following|Latest' && en.tabs[1].startsWith('AI & Tech') && en.lm === '中文' && en.why === 'Hot this week' && /Column/.test(en.mode) && /Platform/.test(en.mode), en);
  await J(`state.dsort='recent'; LS.set('dsort','recent'); render()`); await sleep(500);
  const dayEn = await J(`(()=>{ const ids=[...document.querySelectorAll('#grid .card[data-did]')].map(x=>x.dataset.did); const day=ids.map(id=>state.dirData.items.find(i=>i.id===id)).filter(i=>i.date==='2026-10-22'); return day.length ? {n:day.length, first:day[0].lang, langs:[...new Set(day.map(i=>i.lang))].join()} : null; })()`);
  ok('the page’s own language comes first inside a day (an English page: an English entry first)', dayEn && dayEn.first === 'en' && /zh/.test(dayEn.langs), dayEn);
  await mode('topic');
  await c.shot(require('../paths').SHOTS + '/dir_desktop_en.png');

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e.stack || e); process.exit(2); });
