// e2e: hot lists on the recommended page: an entry "hot:<id>" is the directory service's own list; it shows only when the service offers it (every list is on unless the owner turns it off),
// can be subscribed (not pushed to the directory), and the subscription reads the list as a feed
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const O = require('../paths').DIST + '/';
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };

const it = (id, name, name_en, feed, extra) => ({ id, name, name_en, zh: name + '的简介', en: name_en + ' — a short description', home: 'https://example.org/' + id, feed, lang: 'zh', tags: ['热榜'], tags_en: ['hot list'], rank: 0, ...extra });
const FIX = { version: 1, updated: '2026-10-23', groups: [
  { id: 'hot', zh: '热榜与趋势', en: 'Hot lists', items: [
    it('hot-github', 'GitHub 趋势', 'GitHub Trending', 'hot:github'), it('hot-juejin', '掘金热榜', 'Juejin', 'hot:juejin'),
    it('hot-weibo', '微博热搜', 'Weibo', 'hot:weibo'), it('hot-nothing', '不存在的榜', 'Nothing', 'hot:nothing'),
    it('plain', '普通博客', 'Plain blog', 'http://127.0.0.1:8841/blog/feed.xml?h=plain')] }] };
const get = p => fetch(SVC + p).then(r => r.json());

(async () => {
  fs.writeFileSync(O + 'recommended.json', JSON.stringify(FIX));
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const settle = await require('../settle')(c);
  const J = expr => c.js(`(()=>{ const {state,idb,LS,render,refreshSubs}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async lang => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 0); await settle(1500); await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22'))`); await c.goto(BASE, 0); await settle(2500); };
  const rows = () => J(`[...document.querySelectorAll('#recoPane .rc-row')].map(r=>({id:r.dataset.rid, name:r.querySelector('.rc-name a').textContent, href:r.querySelector('.rc-name a').href, chips:[...r.querySelectorAll('.rc-name .where')].map(x=>x.textContent).join('|'), sub:!!r.querySelector('[data-rsub]'), push:!!r.querySelector('[data-rpush]')}))`);
  const openReco = async () => { await J(`document.querySelector('[data-cat="reco"]').click()`); await settle(700); };
  await c.desktop(1280, 900, 1);

  // ================================================ the service offers its lists (all are on)
  await get('/__hot?');
  await fresh('zh'); await openReco();
  let r = await rows();
  ok('only the lists the service offers are shown (GitHub, Juejin and Weibo; "nothing" does not exist), plus the plain blog', r.map(x => x.id).sort().join() === 'hot-github,hot-juejin,hot-weibo,plain', r);
  const gh = r.find(x => x.id === 'hot-github');
  ok('a hot list is marked, links to the platform’s own page, can be subscribed but not pushed to the directory', gh && /热榜/.test(gh.chips) && gh.href === 'https://example.org/hot-github' && gh.sub && !gh.push, gh);
  ok('the plain blog can still be both', r.find(x => x.id === 'plain').sub && r.find(x => x.id === 'plain').push);
  ok('the button on the shelf counts what can be subscribed (4)', await J(`document.querySelector('[data-cat="reco"] .n').textContent`) === '4', await J(`document.querySelector('[data-cat="reco"] .n').textContent`));

  // ================================================ subscribe: the list is read as a feed
  await J(`document.querySelector('[data-rsub="hot-github"]').click()`); await sleep(200);
  await J(`document.querySelector('#rcSubGo').click()`);
  for (let t0 = Date.now(); Date.now() - t0 < 9000 && !(await J(`state.items.some(x=>x.id.startsWith('local:feed:')) || state.cols.some(x=>x.feed && x.feed.error)`)); ) await sleep(150);          // (the first reading of the list is on its way; the check below says what came)
  await settle(800);
  const sub = await J(`({cols:state.cols.filter(x=>x.feed).map(x=>x.name+'|'+x.feed.url), items:state.items.filter(x=>x.id.startsWith('local:feed:')).map(x=>x.title), err:state.cols.filter(x=>x.feed).map(x=>x.feed.error).filter(Boolean)})`);
  ok('the subscription points at the service’s list and its first reading came back (rank, title)', sub.cols.length === 1 && sub.cols[0] === 'GitHub 趋势|http://127.0.0.1:8840/api/hot?p=github' && sub.items.includes('项目 github 一') && sub.err.length === 0, sub);
  await openReco();
  ok('the subscribed list is shown as done', await J(`!!document.querySelector('.rc-row[data-rid="hot-github"] .rc-pick.done')`));

  // ================================================ the owner turns a list off
  await get('/__hot?disable=weibo');
  await fresh('zh'); await openReco();
  r = await rows();
  ok('with Weibo turned off at the service it is gone, the others stay', !r.some(x => x.id === 'hot-weibo') && r.some(x => x.id === 'hot-github') && !r.some(x => x.id === 'hot-nothing'), r.map(x => x.id));

  // ================================================ the service is down: no hot lists, the rest is fine
  await get('/__hot?down=1');
  await fresh('zh'); await openReco();
  r = await rows();
  ok('service down: no hot list is offered (it could not be checked), the plain blog still is', r.map(x => x.id).join() === 'plain', r);

  // ================================================ English
  await get('/__hot?');
  await fresh('en'); await openReco();
  const en = await J(`({chip:(document.querySelector('.rc-row[data-rid="hot-github"] .where')||{}).textContent, all:[...document.querySelectorAll('.rc-row[data-rid="hot-github"] .where')].map(x=>x.textContent).join('|')})`);
  ok('English chip', /Hot list \(live\)/.test(en.all), en);
  await c.shot(require('../paths').SHOTS + '/hot_reco_en.png');
  await get('/__hot?');

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e.stack || e); process.exit(2); });
