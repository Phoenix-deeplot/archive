// e2e: the hot-list page ("热榜") of the public space: six columns, the platforms of the chosen column beside the list, ranked rows, what is asked and when,
// subscribe, read in the page, failing / slow / missing services, English, a phone. (demo app :8820 + the fake hot-list service on :8840; headless Edge)
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };
const get = p => fetch(SVC + p).then(r => r.json());

(async () => {
  writeDir();
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,render,openReader}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(120); } };
  const fresh = async (lang = 'zh', pre) => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang, 1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1'); ${pre || ''}`);
    await c.goto(BASE, 2800);
  };
  const toDir = async () => { await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800); };
  const openHot = async () => { await J(`document.querySelector('#cats [data-dhot]').click()`); await sleep(500); };
  const cols = () => J(`[...document.querySelectorAll('#dirReco .hot-col')].map(b=>b.textContent+(b.getAttribute('aria-selected')==='true'?'*':''))`);
  const tabs = () => J(`[...document.querySelectorAll('#dirReco .hot-plat')].map(b=>b.textContent+(b.getAttribute('aria-selected')==='true'?'*':''))`);
  const rows = () => J(`[...document.querySelectorAll('#dirReco .hot-row')].map(r=>({rank:r.querySelector('.hot-rank').textContent, top:r.querySelector('.hot-rank').classList.contains('hot-top'), title:r.querySelector('.hot-t').textContent, href:r.querySelector('.hot-t').href, note:(r.querySelector('.hot-n')||{}).textContent||'', side:(r.querySelector('.hot-side')||{}).textContent||'', alt:(r.querySelector('.hot-side a')||{}).textContent||''}))`);
  const head = () => J(`({h:(document.querySelector('#dirReco .hot-head h2')||{}).textContent, meta:(document.querySelector('#dirReco .hot-meta')||{}).textContent, state:(document.querySelector('#dirReco .hot-state')||{}).textContent||''})`);
  const clickTab = async (sel, text) => { await J(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.startsWith(${JSON.stringify(text)})).click()`); await sleep(350); };
  const asked = () => fetch(SVC + '/__hot_asked').then(r => r.json());
  await c.desktop(1280, 900, 1);

  // ================================================ A. the entry
  await get('/__hot?reset=1');
  await fresh('zh'); await toDir();
  const side = await J(`[...document.querySelectorAll('#cats .cat-btn')].map(b=>b.textContent.trim().replace(/\\d+$/,'')+(b.getAttribute('aria-current')==='true'?'*':'')).slice(0,4).join('|')`);
  ok('the sidebar of the public space has 热榜 beside 发现 / 全部 / 文章', /^发现\*\|热榜\|今日听什么\|全部/.test(side), side);
  ok('the discovery page itself has a "热榜 ›" button beside "全部来源 · 平台 · 标签 ›" (a phone does not open the sidebar by chance)', (await J(`[...document.querySelectorAll('#dirReco .dr-explore .dr-act')].map(b=>b.textContent.trim()).join('|')`)) === '热榜 ›|今日听什么 ›|全部来源 · 平台 · 标签 ›');
  await openHot();
  const page = await J(`({cls:document.body.classList.contains('dir-hot'), disc:document.body.classList.contains('dir-discover'), title:document.querySelector('#viewTitle').textContent, bar:document.querySelector('#dirBar').hidden, grid:document.querySelector('#grid').children.length,
    cur:[...document.querySelectorAll('#cats .cat-btn[aria-current="true"]')].map(b=>b.textContent.trim()).join('|'), tags:getComputedStyle(document.querySelector('#tagbox')).display, shelves:getComputedStyle(document.querySelector('#dir')).display})`);
  ok('热榜 is a page of its own: the title, no toolbar, no cards below, the sidebar marks it (and hides the shelf list)', page.cls && !page.disc && page.title === '热榜' && page.bar && page.grid === 0 && page.cur === '热榜' && page.tags === 'none' && page.shelves === 'none', page);
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  ok('six columns in the order of the service, the first is chosen', (await cols()).join('|') === '综合热点*|科技与开发|财经|国际|AI 与学术|读书与影音', await cols());
  ok('the platforms of the chosen column are tabs (小红书, B 站 and 公众号 are in; 百度 is not); the first one is chosen', (await tabs()).join('|') === '微博热搜*|知乎热榜|抖音热点|小红书热门|B 站热门视频|公众号热文|今日头条热榜|虎扑步行街热帖|知乎日报', await tabs());
  let r = await rows(), h = await head();
  ok('its list: 12 rows in order, each with the rank, the title as a link to the platform’s own page, the heat on the right, the note below', r.length === 12 && r[0].rank === '1' && r[0].title === '项目 weibo 一' && r[0].href === 'https://example.org/weibo/1' && /1\.2 万/.test(r[0].side) && r[0].note === '说明 weibo' && r[11].rank === '12', r.slice(0, 2));
  ok('the first three ranks are marked (colour), the rest are not', r.slice(0, 3).every(x => x.top) && !r[3].top, r.map(x => x.top));
  ok('the header says which list, and how old it is (the service read it 2 minutes ago)', h.h === '微博热搜' && /2 分钟前更新/.test(h.meta), h);
  ok('only the list that is shown was asked for', (await asked()).join() === 'weibo', await asked());

  // ================================================ B. platforms and columns
  await clickTab('#dirReco .hot-plat', '知乎热榜');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent==='知乎热榜' && document.querySelectorAll('#dirReco .hot-row').length>0`);
  r = await rows();
  ok('another platform: its own list (and the tab is the chosen one)', r[0].title === '项目 zhihu 一' && (await tabs()).includes('知乎热榜*') && !(await tabs()).includes('微博热搜*'), [r[0], await tabs()]);
  await clickTab('#dirReco .hot-plat', '微博热搜'); await sleep(300);
  ok('and back: the list of before is shown at once, it is not asked for again within 3 minutes', (await rows())[0].title === '项目 weibo 一' && (await asked()).join() === 'weibo,zhihu', await asked());
  await clickTab('#dirReco .hot-col', '科技与开发');
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0 && document.querySelector('#dirReco .hot-head h2').textContent.startsWith('GitHub')`);
  const tech = await tabs();
  ok('another column: its platforms (GitHub first, then Juejin, V2EX, Hacker News ...)', tech[0] === 'GitHub Trending（今日）*' && tech.includes('Hacker News') && tech.includes('Product Hunt') && tech.includes('少数派'), tech);
  await clickTab('#dirReco .hot-plat', 'Hacker News');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent==='Hacker News' && document.querySelectorAll('#dirReco .hot-row').length>0`);
  r = await rows();
  ok('a row can have a second link (the discussion), only where the list has one', r[0].alt === '讨论' && r[1].alt === '', [r[0].side, r[1].side]);
  await clickTab('#dirReco .hot-plat', 'BBC'.slice(0, 0) + '少数派');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent==='少数派' && document.querySelectorAll('#dirReco .hot-row').length>0`);
  r = await rows(); h = await head();
  ok('a list that is a feed has no rank: a dot instead, the date on the right, and the header says "newest first"', r[0].rank === '·' && /2026-10-26/.test(r[0].side) && !r[0].top && /按时间排列，最新在前/.test(h.meta), [r[0], h]);
  const sel = await J(`LS.get('hotSel',{})`);
  ok('the choice is remembered in this browser (the column, and the platform of each column)', sel.c === 'tech' && sel.p.tech === 'sspai' && sel.p.news === 'weibo', sel);

  // ================================================ C. a row: the platform’s page in a tab, or the text in the reader
  await J(`window.__dp=[]; window.__opened=[]; window.open=(...a)=>{ window.__opened.push(String(a[0])); return null; }; document.addEventListener('click',ev=>{ if(ev.target.closest && ev.target.closest('a.hot-t')){ window.__dp.push(ev.defaultPrevented); ev.preventDefault(); } },false)`);
  await J(`document.querySelector('#dirReco .hot-t').click()`); await sleep(1200);
  const rd = await J(`({reader:!document.querySelector('#reader').hidden, id:state.readingId||'', title:document.querySelector('#readerTitle').textContent, dp:window.__dp[0], opened:window.__opened.length})`);
  ok('an article list (a feed) is read in the page: the reader opens on a temporary item, the link was not followed', rd.reader && /^tmp:hot:/.test(rd.id) && rd.title === '项目 sspai 一' && rd.dp === true && rd.opened === 0, rd);
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);
  ok('and back is the same list', (await head()).h === '少数派' && await J(`document.querySelector('#reader').hidden`));
  await clickTab('#dirReco .hot-plat', 'Product Hunt');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent==='Product Hunt'`);
  await J(`window.__dp=[]; document.querySelector('#dirReco .hot-t').click()`); await sleep(300);
  ok('a platform’s own list that is not articles (Product Hunt) is not read in the page: the click is left to the browser (a tab of its own)', (await J(`window.__dp[0]`)) === false && await J(`document.querySelector('#reader').hidden`) && (await J(`document.querySelector('#dirReco .hot-t').target`)) === '_blank');
  ok('...with the usual safe attributes', /nofollow/.test(await J(`document.querySelector('#dirReco .hot-t').rel`)) && /noopener/.test(await J(`document.querySelector('#dirReco .hot-t').rel`)));

  // ================================================ D. subscribe
  await clickTab('#dirReco .hot-col', '综合热点');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent==='微博热搜'`);
  await clickTab('#dirReco .hot-col', '科技与开发');
  await clickTab('#dirReco .hot-plat', 'GitHub');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent.startsWith('GitHub') && document.querySelectorAll('#dirReco .hot-row').length>0`);
  ok('"订阅这个榜单" is on the header', (await J(`(document.querySelector('#dirReco [data-hot-sub]')||{}).textContent`)) === '订阅这个榜单');
  await J(`document.querySelector('#dirReco [data-hot-sub]').click()`); await sleep(1500);
  const sub = await J(`({cols:state.cols.filter(x=>x.feed).map(x=>x.name+'|'+x.feed.url), btn:document.querySelector('#dirReco [data-hot-sub]').textContent, off:document.querySelector('#dirReco [data-hot-sub]').disabled, toast:(document.querySelector('#toastMsg')||{}).textContent})`);
  ok('subscribing adds the service’s feed of that list to the shelf; the button says 已订阅 and waits', sub.cols.length === 1 && sub.cols[0] === 'GitHub Trending（今日）|http://127.0.0.1:8840/api/hot?p=github' && sub.btn === '已订阅' && sub.off, sub);
  ok('and the first reading of it came: 12 new articles on the shelf', await waitFor(`state.items.filter(x=>x.id.startsWith('local:feed:')).length===12`));
  await c.shot(require('../paths').SHOTS + '/hotpage_desktop.png');

  // ================================================ E. a list that cannot be read / is slow / comes back
  await get('/__hot?fail=juejin');
  await clickTab('#dirReco .hot-plat', '掘金热榜');
  await waitFor(`document.querySelector('#dirReco .hot-state')`);
  h = await head();
  ok('a list the service cannot read: the page says so (and why) with a retry button; the other tabs are fine', /这个榜单现在读不到/.test(h.state) && /HTTP 500/.test(h.state) && await J(`!!document.querySelector('#dirReco [data-hot-refresh].btn') && document.querySelectorAll('#dirReco .hot-plat').length>3`), h);
  await get('/__hot?'); await J(`document.querySelector('#dirReco .hot-state [data-hot-refresh]').click()`);
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  ok('"重试" asks again and the list is there', (await rows())[0].title === '项目 juejin 一');
  await get('/__hot?delay=900');
  await J(`document.querySelector('#dirReco [data-hot-refresh]').click()`); await sleep(250);
  const slow = await J(`({busy:document.querySelector('#dirReco .hot-list').getAttribute('aria-busy'), rows:document.querySelectorAll('#dirReco .hot-row').length})`);
  ok('a refresh in progress keeps the old rows on screen (busy for screen readers)', slow.busy === 'true' && slow.rows === 12, slow);
  await waitFor(`document.querySelector('#dirReco .hot-list').getAttribute('aria-busy')==='false'`);
  await clickTab('#dirReco .hot-plat', 'V2EX'); await sleep(250);
  ok('a slow list not asked for before: a loading line until it comes', /正在读取榜单/.test((await head()).state));
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  await get('/__hot?');

  // ================================================ F. leaving, and what the owner can switch
  await J(`document.querySelector('#cats [data-dbrowse="0"]').click()`); await sleep(700);
  const left = await J(`({cls:document.body.classList.contains('dir-hot'), disc:document.body.classList.contains('dir-discover'), title:document.querySelector('#viewTitle').textContent, hot:document.querySelectorAll('#dirReco .hot').length})`);
  ok('"发现" leaves the hot lists for the discovery page', !left.cls && left.disc && left.title === '发现' && left.hot === 0, left);
  await openHot(); await J(`document.querySelector('#cats [data-dtype="all"]').click()`); await sleep(600);
  ok('"全部" leaves them too (the list of everything)', !(await J(`document.body.classList.contains('dir-hot')`)) && (await J(`document.querySelectorAll('#grid .card').length`)) > 3);
  await get('/__hot?disable=weibo,douyin');
  await fresh('zh'); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  ok('a platform the owner turned off is not there; the first one that is on is chosen', (await tabs()).join('|').startsWith('知乎热榜*|小红书热门|B 站热门视频') && !(await tabs()).some(x => /微博|抖音/.test(x)), await tabs());
  await get('/__hot?disable=' + (await fetch(SVC + '/api/hot').then(r => r.json())).platforms.filter(p => p.col === 'money').map(p => p.id).join(','));
  await fresh('zh'); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-col').length>0`);
  ok('a column with nothing in it is not offered', (await cols()).join('|') === '综合热点*|科技与开发|国际|AI 与学术|读书与影音', await cols());
  await get('/__hot?'); await get('/__hot?reset=1');
  await fresh('zh'); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-col').length>0`);
  await clickTab('#dirReco .hot-col', '读书与影音');
  ok('YouTube’s list is not there without the owner’s key', !(await tabs()).some(x => /YouTube/.test(x)) && (await tabs()).some(x => /微信读书 · 小说榜/.test(x)) && (await tabs()).some(x => /飙升榜/.test(x)), await tabs());
  await get('/__hot?key=abc123');
  await fresh('zh'); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-col').length>0`);
  await clickTab('#dirReco .hot-col', '读书与影音');
  ok('...and is there with it', (await tabs()).some(x => /YouTube 热门/.test(x)), await tabs());
  await get('/__hot?');

  // ================================================ G. the service is down / the choice survives a reload
  await get('/__hot?down=1');
  await fresh('zh'); await toDir(); await openHot(); await sleep(900);
  h = await head();
  const down = await J(`({txt:(document.querySelector('#dirReco .hot-state')||{}).textContent||'', retry:!!document.querySelector('#dirReco [data-hot-retry]'), cols:document.querySelectorAll('#dirReco .hot-col').length})`);
  ok('the hot-list service is down: one plain line and a retry button, no empty tabs', /榜单服务现在连不上/.test(down.txt) && down.retry && down.cols === 0, down);
  await get('/__hot?'); await J(`document.querySelector('#dirReco [data-hot-retry]').click()`);
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  ok('"重试" after it is back: the lists are there', (await cols()).length === 6 && (await rows()).length === 12);
  await clickTab('#dirReco .hot-col', '国际'); await clickTab('#dirReco .hot-plat', 'BBC 国际');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent==='BBC 国际' && document.querySelectorAll('#dirReco .hot-row').length>0`);
  await c.goto(BASE, 2800); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  ok('after a reload the same column and platform are shown', (await cols()).includes('国际*') && (await tabs()).includes('BBC 国际*') && (await head()).h === 'BBC 国际', [await cols(), await tabs()]);

  // ================================================ G2. lists of a country: automatic (the service decides) or the reader's pick
  await get('/__hot?key=abc123&reset=1');
  const ua0 = await J(`navigator.userAgent`);
  await c.send('Emulation.setUserAgentOverride', { userAgent: ua0, acceptLanguage: 'en-US,en;q=0.9' });                // (this Edge says en-GB; the test says what it means)
  const opts = () => J(`({n:document.querySelectorAll('#dirReco .hot-region option').length, first:(document.querySelector('#dirReco .hot-region option')||{}).textContent, val:(document.querySelector('#dirReco .hot-region')||{}).value, h2:(document.querySelector('#dirReco .hot-head h2')||{}).textContent, title:(document.querySelector('#dirReco .hot-t')||{}).textContent})`);
  const pickCountry = async v => { await J(`(()=>{ const s=document.querySelector('#dirReco .hot-region'); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true})); })()`); await sleep(300); };
  await fresh('zh'); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-col').length>0`);
  await clickTab('#dirReco .hot-col', '国际'); await clickTab('#dirReco .hot-plat', 'Google 热搜');
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0 && document.querySelector('#dirReco .hot-region')`);
  let o = await opts();
  ok('a list of a country has a country picker: "自动" first, then the countries by name; the browser’s language (en-US here) decided: 美国', o.n > 40 && o.val === 'auto' && o.first === '自动（美国）' && o.h2 === 'Google 热搜 · 美国' && o.title === '项目 gtrends US 一', o);
  await clickTab('#dirReco .hot-plat', 'BBC'); await sleep(300);
  ok('only a list of a country has it (BBC does not)', await J(`!document.querySelector('#dirReco .hot-region')`));
  await clickTab('#dirReco .hot-plat', 'Google 热搜');
  await pickCountry('DE');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent==='Google 热搜 · 德国' && document.querySelectorAll('#dirReco .hot-row').length>0`);
  o = await opts();
  ok('picking a country asks the service for that country: 德国, its own rows, the choice is kept', o.val === 'DE' && o.title === '项目 gtrends DE 一' && (await asked()).includes('gtrends:DE') && await J(`LS.get('hotRegion','')`) === 'DE', [o, await asked()]);
  await clickTab('#dirReco .hot-col', '读书与影音'); await clickTab('#dirReco .hot-plat', 'YouTube');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent.startsWith('YouTube') && document.querySelectorAll('#dirReco .hot-row').length>0`);
  o = await opts();
  ok('the same pick is used by the other list of a country (YouTube: 德国), each country’s list is its own', o.val === 'DE' && o.h2 === 'YouTube 热门 · 德国' && o.title === '项目 youtube DE 一', o);
  await J(`document.querySelector('#dirReco [data-hot-sub]').click()`); await sleep(1200);
  const subc = await J(`state.cols.filter(x=>x.feed).map(x=>x.name+'|'+x.feed.url)`);
  ok('a list of a country is subscribed for a country: its address has it (so the subscription does not move around with the reader), and the name says it', subc.length === 1 && subc[0] === 'YouTube 热门 · 德国|http://127.0.0.1:8840/api/hot?p=youtube&region=DE', subc);
  await pickCountry('auto');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent==='YouTube 热门 · 美国' && document.querySelectorAll('#dirReco .hot-row').length>0`);
  o = await opts();
  ok('"自动" again: the service decides again (美国), the subscribe button is for that country (not subscribed yet)', o.val === 'auto' && o.first === '自动（美国）' && await J(`!document.querySelector('#dirReco [data-hot-sub]').disabled`), o);
  await pickCountry('JP'); await c.goto(BASE, 2800); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0 && document.querySelector('#dirReco .hot-region')`);
  o = await opts();
  ok('the country picked is kept across a reload (日本)', o.val === 'JP' && /日本/.test(o.h2), o);
  await pickCountry('auto');
  await J(`localStorage.setItem('archive.hotRegion', JSON.stringify('zz'))`); await c.goto(BASE, 2800); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  ok('a remembered country that makes no sense is "自动"', (await J(`state.hot.region`)) === 'auto');
  // the language of the browser decides when there is no address: Japanese
  const ua = ua0;
  await c.send('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'ja-JP,ja;q=0.9' });
  await get('/__hot?key=abc123&reset=1');
  await fresh('zh'); await toDir(); await openHot();
  await waitFor(`document.querySelectorAll('#dirReco .hot-col').length>0`);
  await clickTab('#dirReco .hot-col', '国际'); await clickTab('#dirReco .hot-plat', 'Google 热搜');
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0 && document.querySelector('#dirReco .hot-region')`);
  o = await opts();
  ok('with a Japanese browser and no address to go by, "自动" is 日本', o.first === '自动（日本）' && o.h2 === 'Google 热搜 · 日本' && (await asked()).includes('gtrends:JP'), [o, await asked()]);
  await c.send('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'en-US,en;q=0.9' });
  await get('/__hot?');

  // ================================================ H. a phone
  await c.mobile(390, 844, 2);
  await fresh('zh'); await toDir();
  await J(`document.querySelector('#dirReco [data-dr-hot]').click()`); await sleep(600);
  await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  const ph = await J(`(()=>{ const q=s=>document.querySelector(s), pl=q('#dirReco .hot-plats'), r=q('#dirReco .hot-row'), t=q('#dirReco .hot-t').getBoundingClientRect(), side=q('#dirReco .hot-side');
    return {sw:document.documentElement.scrollWidth, iw:innerWidth, dir:getComputedStyle(pl).flexDirection, pos:getComputedStyle(pl).position, tabH:Math.round(q('#dirReco .hot-plat').getBoundingClientRect().height), colH:Math.round(q('#dirReco .hot-col').getBoundingClientRect().height),
      listTop:Math.round(q('#dirReco .hot-list').getBoundingClientRect().top), platsBottom:Math.round(pl.getBoundingClientRect().bottom), sideBelow: side ? side.getBoundingClientRect().top >= t.bottom - 2 : null, titleW:Math.round(t.width), drawer:document.body.classList.contains('drawer')}; })()`);
  ok('phone: no sideways scrolling, the platforms are a row of tabs above the list (not beside it), each at least 40 px high', ph.sw <= ph.iw && ph.dir === 'row' && ph.pos === 'static' && ph.tabH >= 40 && ph.colH >= 40 && ph.platsBottom <= ph.listTop + 2, ph);
  ok('phone: the heat goes under the title and the title has the width of the row', ph.sideBelow === true && ph.titleW > 250 && !ph.drawer, ph);
  ok('phone: reached from the discovery page without opening the sidebar', await J(`document.body.classList.contains('dir-hot')`));
  await c.shot(require('../paths').SHOTS + '/hotpage_phone.png');
  await c.desktop(1280, 900, 1);

  // ================================================ I. English
  await get('/__hot?reset=1');
  await fresh('en'); await toDir();
  const sideEn = await J(`[...document.querySelectorAll('#cats .cat-btn')].map(b=>b.textContent.trim()).slice(0,4).join('|')`);
  ok('English: the row is "Hot lists"', /^Discover\|Hot lists\|What to listen to\|All/.test(sideEn), sideEn);
  await openHot(); await waitFor(`document.querySelectorAll('#dirReco .hot-row').length>0`);
  h = await head();
  ok('English: the title, the six columns, the platforms, the header', (await J(`document.querySelector('#viewTitle').textContent`)) === 'Hot lists' && (await cols()).join('|') === 'Top stories*|Tech & dev|Finance|World|AI & research|Books & media' && (await tabs())[0] === 'Weibo hot searches*' && /Updated 2 min ago/.test(h.meta), [await cols(), await tabs(), h]);
  await clickTab('#dirReco .hot-col', 'World'); await clickTab('#dirReco .hot-plat', 'BBC World');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent==='BBC World' && document.querySelectorAll('#dirReco .hot-row').length>0`);
  await clickTab('#dirReco .hot-plat', 'Google Trends');
  await waitFor(`document.querySelector('#dirReco .hot-region') && document.querySelectorAll('#dirReco .hot-row').length>0`);
  ok('English: the country picker says "Automatic (United States)" and names the countries in English', (await J(`document.querySelector('#dirReco .hot-region option').textContent`)) === 'Automatic (United States)' && (await J(`[...document.querySelectorAll('#dirReco .hot-region option')].some(o=>o.textContent==='Germany')`)) && /Google Trends · United States/.test((await head()).h));
  await clickTab('#dirReco .hot-plat', 'BBC World');
  await waitFor(`document.querySelector('#dirReco .hot-head h2').textContent==='BBC World' && document.querySelectorAll('#dirReco .hot-row').length>0`);
  ok('English: "Newest first" for a list in time order', /Newest first/.test((await head()).meta));
  ok('English: the subscribe button', /Subscribe to this list/.test(await J(`document.querySelector('#dirReco [data-hot-sub]').textContent`)));
  await c.shot(require('../paths').SHOTS + '/hotpage_en.png');
  await get('/__hot?');

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e.stack || e); process.exit(2); });
