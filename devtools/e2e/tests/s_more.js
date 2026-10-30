// e2e: the lists of the directory add the next page by themselves when their end comes into view (the button stays for those who like to press it); the directory page has no count line any more
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const DIRF = require('../paths').DIST + '/dir/directory.json';
const BASE = 'http://127.0.0.1:8820/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };

const withBulk = n => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.shelves.push({ id: 'bulk', name: '大量文章', description: '很多文章', home: 'http://127.0.0.1:8841/blog/', kind: 'feed', lang: 'zh', license: '', tags: [], n, updated: '2026-10-20', feed: 'http://127.0.0.1:8841/blog/feed.xml?d=bulk', status: 'ok' });
  for (let i = 0; i < n; i++) d.items.push({ id: 'bulk' + String(i).padStart(4, '0') + 'zzzz', title: 'Bulk ' + String(i).padStart(3, '0'), summary: '摘要', url: 'http://127.0.0.1:8850/blog/b' + i, image: '', date: '2026-09-' + String(1 + i % 28).padStart(2, '0'), type: 'article', lang: 'zh', tags: [], shelf: 'bulk' });
  d.count = d.items.length;
  fs.writeFileSync(DIRF, JSON.stringify(d));
  return d.items.length;
};

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async (lang = 'zh') => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang, 1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 2800);
  };
  const cards = () => J(`document.querySelectorAll('#grid .card').length`);
  const shown = async () => { const m = /\((\d+) \/ (\d+)\)/.exec((await row()).text); return m ? +m[1] : -1; };                  // (the button says how many of the list are drawn: the grid also holds a few cards that are not the list)
  const uniq = async () => J(`(()=>{ const cs=[...document.querySelectorAll('#grid .xcard')], keys=cs.map(c=>(c.querySelector('a')||{}).href||c.textContent); return cs.length===new Set(keys).size; })()`) && (await J(`document.querySelectorAll('#grid .xcard').length`)) === (await shown());          // (every card of the list is there once; the grid also holds in-feed ads)
  const row = () => J(`({hidden:document.querySelector('#moreRow').hidden, text:document.querySelector('#moreBtn').textContent})`);
  const end = async () => { await J(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(1100); };
  await c.desktop(1280, 900, 1);

  const total = withBulk(150); await fetch('http://127.0.0.1:8840/__listen?mode=ok&reset=1');
  await fresh('zh');
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
  ok('the discovery page has no count line ("共 N 条，来自 N 个书架，更新于…")', !/共\s*\d+\s*条|来自\s*\d+\s*个书架|更新于/.test(await J(`document.querySelector('#viewSub').textContent`)) && !/共\s*\d+\s*条/.test(await J(`document.querySelector('#dirReco').textContent`)), await J(`document.querySelector('#viewSub').textContent`));
  await J(`[...document.querySelectorAll('#cats .cat-btn')].find(b=>b.textContent.trim().startsWith('全部')).click()`); await sleep(1200);
  ok('all: the first page (sixty) is drawn and the row for more is there', (await shown()) === 60 && !(await row()).hidden, [await cards(), await row()]);
  ok('the list has no count line either', !/共\s*\d+\s*条|来自\s*\d+\s*个书架/.test(await J(`document.querySelector('#viewSub').textContent`)), await J(`document.querySelector('#viewSub').textContent`));
  const t0 = (await row()).text;
  await end();
  ok('the end comes into view: sixty more come by themselves, no click', (await shown()) === 120 && (await uniq()), [await cards(), await row()]);
  await end();
  const left = total - 120;
  ok('and the next page; the cards are all different', (await shown()) === Math.min(180, total) && (await uniq()), await row());
  for (let k = 0; k < 4 && !(await row()).hidden; k++) await end();
  ok('to the end: every item is there and the row is gone', (await shown()) === total && (await row()).hidden && (await uniq()), [await cards(), total, await row()]);
  ok('the button still exists for the ones who press it (it was "' + t0 + '")', /\d/.test(t0));

  // the button still does what it did
  await J(`state.dLimit=60; render(); window.scrollTo(0,0)`); await sleep(600);
  ok('back to sixty at the top of the page (nothing loads while the end is far)', (await shown()) === 60, await row());
  await J(`document.querySelector('#moreBtn').click()`); await sleep(500);
  ok('a press on the button adds the next sixty', (await shown()) === 120, await row());

  // a search shows how many it found (the one count that stays)
  await J(`window.scrollTo(0,0)`);
  await J(`(()=>{ const q=document.querySelector('#q'); q.value='Bulk 01'; q.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(900);
  const sub = await J(`document.querySelector('#viewSub').textContent`);
  ok('a search says how many it found', /\d/.test(sub) && sub.length > 0 && !/来自\s*\d+\s*个书架/.test(sub), sub);

  // a phone
  await c.mobile(375, 812, 2);
  await fresh('zh');
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
  await J(`document.body.classList.add('drawer')`); await sleep(300);
  await J(`[...document.querySelectorAll('#cats .cat-btn')].find(b=>b.textContent.trim().startsWith('全部')).click()`); await sleep(1200);
  const n0 = await shown();
  await end(); await end();
  ok('a phone: the end of the list loads the next page too', n0 === 60 && (await shown()) >= 120, [n0, await row()]);
  await c.desktop(1280, 900, 1);

  // English
  await fresh('en');
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800);
  ok('English: no count line on the discovery page', !/\d+\s*(items|entries)[^.]{0,30}shel(f|ves)|updated\s+\d{4}/i.test(await J(`document.querySelector('#viewSub').textContent`)), await J(`document.querySelector('#viewSub').textContent`));

  ok('no script errors in the whole run', errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
