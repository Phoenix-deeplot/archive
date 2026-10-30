// e2e: "try these" in the subscribe window (starter shelves of the directory), on a desktop, a tablet and a phone
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/', DIRFILE = require('../paths').DIST + '/dir/directory.json';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };

const dirData = JSON.parse(fs.readFileSync(DIRFILE, 'utf8'));
const shelf = (id, name, feed, lang, extra) => ({ id, name, description: '', home: 'http://127.0.0.1:8841/blog/', kind: 'feed', lang, license: '', tags: [], n: 3, updated: '2026-10-20', feed, status: 'ok', ...extra });
const withStarters = list => { const d = JSON.parse(JSON.stringify(dirData)); d.shelves = d.shelves.filter(s => !s.id.startsWith('st-')).concat(list); return d; };
const STARTERS = [
  shelf('st-zh', '示例博客', 'http://127.0.0.1:8841/blog/feed.xml?s=zh', 'zh', { starter: true, tags: ['产品', '运营'], description: '一个用来试订阅的假博客，有中文文章。' }),
  shelf('st-en', 'Text Blog', 'http://127.0.0.1:8842/blog/feed.xml?s=en', 'en', { starter: true, tags: ['supply', 'lean', 'notes', 'extra'], description: 'A made-up blog whose feed carries the full text of its articles, for trying the reader.' }),
  shelf('st-en2', 'Excerpt Blog With A Rather Long Name To See How It Is Cut', 'http://127.0.0.1:8850/blog/feed.xml?s=en2', 'en', { starter: true }),
  shelf('st-no', 'Not a starter', 'http://127.0.0.1:8841/blog/feed.xml', 'en', {}),
  shelf('st-yes', 'Starter by "yes"', 'http://127.0.0.1:8841/blog/feed.xml', 'en', { starter: 'yes' }),
  shelf('st-link', 'A link shelf', '', 'en', { starter: true, kind: 'link' }),
];

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,idb,LS,render,refreshSubs,starterShelves,renderStarter}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async lang => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500); await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22'))`); await c.goto(BASE, 2500); };
  const openSub = async () => { await J(`document.querySelector('#addBtn').click()`); await sleep(400); await J(`document.querySelector('[data-atab="sub"]').click()`); await sleep(300); };
  const rows = () => J(`[...document.querySelectorAll('#fsStarterList .st-row')].map(r=>({name:r.querySelector('.st-name').textContent, sub:(r.querySelector('.st-sub')||{}).textContent||'', desc:(r.querySelector('.st-desc')||{}).textContent||'', btn:r.querySelector('button').textContent, off:r.querySelector('button').disabled}))`);

  fs.writeFileSync(DIRFILE.replace('dir/directory.json', 'recommended.json'), JSON.stringify({ version: 1, groups: [] }));          // only the directory's own starters here (the recommended page has its own test)
  fs.writeFileSync(DIRFILE, JSON.stringify(withStarters(STARTERS)));
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ the list: only real starters, the reader's language first
  await fresh('en');
  await openSub();
  let r = await rows();
  ok('English: only the three real starter feeds are offered (not "starter":"yes", not a link shelf, not unmarked ones)', r.length === 3, r);
  ok('English first, then the other language; the title and hint are shown', r[0].name === 'Text Blog' && r[2].name === '示例博客' && await J(`document.querySelector('#fsStarter h3').textContent`) === 'Try these', r.map(x => x.name));
  ok('each row: language and up to three tags, a short description, the button', r[0].sub === 'English · supply · lean · notes' && /full text/.test(r[0].desc) && r[0].btn === 'Subscribe', r[0]);
  ok('long names do not break the row (cut with an ellipsis, the button stays inside)', await J(`[...document.querySelectorAll('#fsStarterList .st-row')].every(r=>{ const b=r.querySelector('button').getBoundingClientRect(), x=r.getBoundingClientRect(); return b.right<=x.right+0.5 && r.scrollWidth<=r.clientWidth+1; })`));
  await c.shot(require('../paths').SHOTS + '/st_desktop_en.png');

  // ------------------------------------------------ typing hides it, clearing shows it again
  await J(`const i=document.querySelector('#fsUrl'); i.value='https://example.org/'; i.dispatchEvent(new Event('input',{bubbles:true}))`);
  ok('typing an address hides the list', await J(`document.querySelector('#fsStarter').hidden`));
  await J(`const i=document.querySelector('#fsUrl'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true}))`);
  ok('clearing it brings the list back', await J(`!document.querySelector('#fsStarter').hidden`));

  // ------------------------------------------------ one click subscribes; several in a row
  await J(`document.querySelector('#fsStarterList [data-st="st-en"]').click()`); await sleep(300);
  const one = await J(`({subs:state.cols.filter(x=>x.feed).map(x=>x.name+'|'+x.feed.url), btn:document.querySelector('#fsStarterList [data-st="st-en"]').textContent, off:document.querySelector('#fsStarterList [data-st="st-en"]').disabled, note:document.querySelector('#fsStarterAdded').textContent, cancel:document.querySelector('#addCancel').textContent, open:document.querySelector('#addDlg').open})`);
  ok('one click: the collection exists with the feed address; the button says Subscribed and is off; the dialog stays open and says how many; Cancel became Done', one.subs.length === 1 && one.subs[0] === 'Text Blog|http://127.0.0.1:8842/blog/feed.xml?s=en' && one.btn === 'Subscribed' && one.off && /Subscribed to 1/.test(one.note) && one.cancel === 'Done' && one.open, one);
  await J(`document.querySelector('#fsStarterList [data-st="st-zh"]').click()`); await J(`document.querySelector('#fsStarterList [data-st="st-en2"]').click()`); await sleep(9000);
  const three = await J(`({subs:state.cols.filter(x=>x.feed).length, items:Object.fromEntries(state.cols.filter(x=>x.feed).map(x=>[x.name, state.items.filter(i=>i.collection===x.id).length])), err:state.cols.filter(x=>x.feed).map(x=>x.feed.error).filter(Boolean), note:document.querySelector('#fsStarterAdded').textContent})`);
  ok('three fast clicks: three subscriptions, every first reading came back (none lost behind a busy refresh)', three.subs === 3 && Object.values(three.items).every(n => n >= 3) && three.err.length === 0 && /Subscribed to 3/.test(three.note), three);
  await c.shot(require('../paths').SHOTS + '/st_desktop_done.png');
  await J(`document.querySelector('#addCancel').click()`); await sleep(600);
  const shown = await J(`({col:state.col, name:(state.cols.find(x=>x.id===state.col)||{}).name, cards:document.querySelectorAll('.card').length})`);
  ok('"Done" closes the dialog and shows the last subscription with its articles', shown.name && shown.cards >= 3, shown);

  // ------------------------------------------------ again later: the subscribed ones are marked, the limit is respected
  await openSub();
  r = await rows();
  ok('opened again: all three are marked as subscribed', r.every(x => x.off && x.btn === 'Subscribed'), r);
  await J(`document.querySelector('#addCancel').click()`); await sleep(300);

  // ------------------------------------------------ Chinese UI, Chinese first
  await fresh('zh');
  await openSub();
  r = await rows();
  ok('Chinese: the Chinese feed first, texts in Chinese', r[0].name === '示例博客' && r[0].sub === '中文 · 产品 · 运营' && r[0].btn === '订阅' && await J(`document.querySelector('#fsStarter h3').textContent`) === '试试这些', r);
  await c.shot(require('../paths').SHOTS + '/st_desktop_zh.png');

  // ------------------------------------------------ no starters in the directory: no block at all
  fs.writeFileSync(DIRFILE, JSON.stringify(withStarters([])));
  await fresh('en'); await openSub();
  ok('a directory with no starters: the block is not there', await J(`document.querySelector('#fsStarter').hidden`));
  fs.writeFileSync(DIRFILE, JSON.stringify(withStarters(STARTERS)));

  // ------------------------------------------------ a tablet and a phone
  for (const [name, w, h, phone] of [['tablet', 768, 1024, false], ['phone', 375, 812, true]]) {
    if (phone) await c.mobile(w, h, 2); else await c.desktop(w, h, 1);
    await fresh('en'); await openSub();
    const m = await J(`(()=>{ const d=document.querySelector('#addDlg'), b=d.getBoundingClientRect(), rs=[...document.querySelectorAll('#fsStarterList .st-row')].map(r=>r.getBoundingClientRect()); const body=document.querySelector('#addDlg .dlg-body');
      return {dlgW:Math.round(b.width), cols:new Set(rs.map(r=>Math.round(r.left))).size, rowsInside:rs.every(r=>r.left>=b.left-0.5 && r.right<=b.right+0.5), pageScrollX:document.documentElement.scrollWidth>innerWidth+1, bodyScrollX:body.scrollWidth>body.clientWidth+1, bodyScrollable:body.scrollHeight>body.clientHeight}; })()`);
    ok(name + ': the dialog fits the screen, rows stay inside it, no sideways scrolling', m.rowsInside && !m.pageScrollX && !m.bodyScrollX, m);
    ok(name + ': ' + (phone ? 'one column' : 'two columns'), m.cols === (phone ? 1 : 2), m);
    if (phone) ok('phone: the list scrolls inside the dialog (buttons at the foot stay reachable)', m.bodyScrollable && await J(`(()=>{ const f=document.querySelector('#addDlg .dlg-foot').getBoundingClientRect(); return f.bottom<=innerHeight+1; })()`), m);
    await J(`document.querySelector('#fsStarterList [data-st="st-en"]').scrollIntoView({block:'center'}); document.querySelector('#fsStarterList [data-st="st-en"]').click()`); await sleep(2500);
    ok(name + ': the tap subscribes', await J(`state.cols.filter(x=>x.feed).length`) === 1);
    await c.shot(require('../paths').SHOTS + '/st_' + name + '.png');
  }
  await c.desktop(1280, 900, 1);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
