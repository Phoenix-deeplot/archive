// NOT part of the suite: the page against the REAL service (shelf-directory with stories.py and audiobooks.py) on the REAL sources: the story lists on the podcast side, the audiobooks on the books page, a chapter that plays.
// Needs the internet and the folder of the directory service that has them:  $env:SHELF_DIRECTORY='E:\Ztree\shelf-directory'  (before rig.ps1: sync_dev.py reads it)  then  node tests/real_stories_smoke.js
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840', DIRF = P.DIST + '/dir/directory.json';
(async () => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  d.shelves.push({ id: 'books', name: '精选图书', description: '', home: '', kind: 'books', lang: '', license: '', tags: [], n: 1, updated: '2026-10-22', feed: '', status: 'ok', featured: true, rights: 'licensed' });
  d.items.push({ id: 'tale0001', title: 'The Tale', summary: 'A summary that is long enough to be a summary of a book.', url: 'http://127.0.0.1:8850/a/x', image: '', date: '', type: 'book', lang: 'en', tags: ['小说'], shelf: 'books', author: 'A', license: 'public-domain', bid: 'tale' });
  d.count = d.items.length; d.booklists = []; fs.writeFileSync(DIRF, JSON.stringify(d));
  const c = await connect(9444);
  c.autoDialog(true, []);
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 30000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(150); } };
  await fetch(SVC + '/__listen?mode=real0&reset=1');
  const go = async (path) => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1200);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('zh')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE + '?lang=zh', 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1500);
  };
  await go();
  await J(`document.querySelector('#cats [data-dlisten]').click()`);
  await waitFor(`document.querySelector('#lpRoot .lp-tabs')`, 20000);
  await J(`document.querySelector('#lpRoot [data-lp-mode="podcast"]').click()`); await sleep(1500);
  console.log('podcast strip:', JSON.stringify(await J(`[...document.querySelectorAll('#lpRoot .lp-strip .lp-ch')].map(b=>b.textContent).slice(0,12)`)));
  await J(`[...document.querySelectorAll('#lpRoot .lp-strip .lp-ch')].find(b=>b.textContent==='悬疑怪谈').click()`);
  console.log('mystery rows:', await waitFor(`document.querySelectorAll('#lpRoot .ls-row, #lpRoot .lp-sc').length>=4 && document.querySelectorAll('#lpRoot .ls-row, #lpRoot .lp-sc').length`, 40000), JSON.stringify(await J(`[...document.querySelectorAll('#lpRoot .ls-row, #lpRoot .lp-sc')].slice(0,5).map(r=>r.textContent.trim().replace(/\\s+/g,' ').slice(0,60))`)));
  await J(`(document.querySelector('#lpRoot .ls-row .ls-main') || document.querySelector('#lpRoot .lp-sc .lp-cv')).click()`);
  console.log('a story plays:', await waitFor(`pl.loaded && plAudio.currentTime>0.3`, 40000), await J(`plAudio.currentSrc.slice(0,60)`), await J(`plAudio.duration`));
  await J(`plAudio.pause()`);
  await J(`window.__zt.plStop()`);
  await go();
  await J(`document.querySelector('#cats [data-dlanding="books"]').click()`); await sleep(1500);
  await waitFor(`document.querySelector('#dTabs [data-bgenre="audio"]')`, 30000);
  console.log('tabs:', await J(`[...document.querySelectorAll('#dTabs [data-bgenre]')].map(b=>b.textContent).join('|')`));
  await J(`document.querySelector('#dTabs [data-bgenre="audio"]').click()`);
  await waitFor(`document.querySelectorAll('#abRoot .ab-card').length>0`, 30000);
  console.log('books:', await J(`document.querySelectorAll('#abRoot .ab-card').length`), JSON.stringify(await J(`[...document.querySelectorAll('#abRoot .ab-card')].map(b=>b.querySelector('b').textContent)`)));
  for (const title of ['红楼梦', '爱丽丝梦游仙境']) {
    await J(`document.querySelector('#abRoot [data-ab-back]') && document.querySelector('#abRoot [data-ab-back]').click()`); await sleep(300);
    await J(`[...document.querySelectorAll('#abRoot .ab-card')].find(b=>b.querySelector('b').textContent===${JSON.stringify(title)}).click()`);
    console.log(title, 'chapters:', await waitFor(`document.querySelectorAll('#abRoot .ab-ch').length>0 && document.querySelectorAll('#abRoot .ab-ch').length`, 30000), JSON.stringify(await J(`document.querySelector('#abRoot .ab-hero .ab-m').textContent`)));
    await J(`document.querySelector('#abRoot .ab-go').click()`);
    console.log('   plays:', await waitFor(`pl.loaded && plAudio.currentTime>0.3`, 40000), await J(`pl.q[pl.i]`), await J(`plAudio.currentSrc.slice(0,60)`), await J(`Math.round(plAudio.duration)`));
    await J(`plAudio.pause()`);
  }
  await fetch(SVC + '/__listen?mode=ok&reset=1');
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
