// e2e: "listen" on a recommended podcast (without subscribing), and sounds in the public directory (a click on the card plays it; the bookmark keeps the sound)
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const O = require('../paths').DIST + '/';
const DIRF = O + 'dir/directory.json', RECO = O + 'recommended.json';
const BASE = 'http://127.0.0.1:8820/', POD = 'http://127.0.0.1:8843';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };
const dir0 = JSON.parse(fs.readFileSync(DIRF, 'utf8'));

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.desktop(1280, 900, 1);
  const J = expr => c.js(`(()=>{ const {state,idb,LS,pl,plAudio,plPlay,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(150); } };
  const fresh = async () => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1500); await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`); await c.goto(BASE, 3000); };
  const podLog = async () => (await (await fetch(POD + '/__log')).json());

  // ================================================ A. "试听" on a recommended podcast
  const row = (id, name, feed, extra) => ({ id, name, name_en: name, zh: name + '的简介', en: name, home: POD + '/', feed, lang: 'en', tags: ['听力'], tags_en: ['listening'], rank: 0, ...extra });
  fs.writeFileSync(RECO, JSON.stringify({ version: 1, updated: '2026-10-27', groups: [
    { id: 'podz', zh: '播客', en: 'Podcasts', podcast: true, items: [row('pz1', 'English Show', POD + '/feed.xml'), row('pz2', 'Gone Show', POD + '/nope.xml')] },
    { id: 'blogs', zh: '博客', en: 'Blogs', items: [row('bz1', '一个博客', 'http://127.0.0.1:8841/blog/feed.xml', { lang: 'zh' })] }] }));
  await fetch(POD + '/__reset');
  await fresh();
  await J(`state.cat='reco'; render(); 1`); await sleep(600);
  const rows = await J(`({listen:[...document.querySelectorAll('[data-rplay]')].map(b=>b.dataset.rplay), rows:document.querySelectorAll('.rc-row').length, label:(document.querySelector('[data-rplay] span')||{}).textContent})`);
  ok('the recommended page: "试听" is on the rows of a podcast group only (the two podcasts, not the blog)', rows.listen.join() === 'pz1,pz2' && rows.rows === 3 && rows.label === '试听', rows);
  await J(`document.querySelector('[data-rplay="pz1"]').click()`);
  await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`);
  const lis = await J(`({shown:!document.querySelector('#player').hidden, title:document.querySelector('#plTitle').textContent, show:(document.querySelector('#plSub .pl-show')||{}).textContent, cols:state.cols.length, items:state.items.filter(x=>x.id.startsWith('local:feed:')).length, src:plAudio.currentSrc,
    subbed:[...document.querySelectorAll('[data-rsub="pz1"]')].map(i=>i.checked).join(), q:pl.q.join()})`);
  ok('"试听" plays the newest episode at once, in the bar; nothing was subscribed or kept', lis.shown && /^Ep 3/.test(lis.title) && lis.show === 'English Show' && lis.cols === 0 && lis.items === 0 && lis.src === POD + '/ep3.wav' && lis.subbed === 'false' && /^tmp:pod:/.test(lis.q), lis);
  const lg = await podLog();
  ok('the sound came from the show’s server to the browser, not through the update service', lg.length >= 1 && lg.every(x => /Mozilla|Edg/.test(x.ua)), lg);
  await J(`document.querySelector('[data-rplay="pz2"]').click()`); await sleep(2500);
  const bad = await J(`({msg:document.querySelector('#toastMsg').textContent, btn:document.querySelector('[data-rplay="pz2"]').disabled, still:document.querySelector('#plTitle').textContent})`);
  ok('a podcast whose feed is gone: the page says it cannot be played (and says why); the button is usable again; what played before goes on', /试听不了/.test(bad.msg) && !bad.btn && /^Ep 3/.test(bad.still), bad);
  await c.shot(require('../paths').SHOTS + '/pod_reco.png');

  // ================================================ B. sounds in the public directory
  const d = JSON.parse(JSON.stringify(dir0));
  d.shelves = [{ id: 'pod1', name: 'English Learning Show', description: '', home: POD + '/', kind: 'feed', lang: 'en', license: '', tags: ['听力'], n: 2, updated: '2026-10-21', feed: POD + '/feed.xml', status: 'fixed', rights: 'unknown' },
    { id: 'blogZ', name: 'A blog', description: '', home: 'http://127.0.0.1:8850/blog/', kind: 'feed', lang: 'en', license: '', tags: ['tech'], n: 1, updated: '2026-10-18', feed: 'http://127.0.0.1:8841/blog/feed.xml', status: 'fixed', rights: 'unknown' }];
  d.items = [
    { id: 'au1aaaaaa1', title: 'Ep 1 How to order coffee in English', summary: 'Order a coffee, a tea, a snack.', url: POD + '/notes/ep1', image: '', date: '2026-10-19', type: 'audio', lang: 'en', tags: ['听力'], shelf: 'pod1', audio: { url: POD + '/ep1.wav', type: 'audio/wav', dur: 12 } },
    { id: 'au2aaaaaa2', title: 'Ep 2 Small talk that is not small', summary: 'Small talk.', url: POD + '/notes/ep2', image: '', date: '2026-10-20', type: 'audio', lang: 'en', tags: ['听力'], shelf: 'pod1', audio: { url: POD + '/ep2.wav', type: 'audio/wav', dur: 8 } },
    { id: 'ar1rrrrrr1', title: 'A plain article', summary: 'Words.', url: 'http://127.0.0.1:8850/blog/a1', image: '', date: '2026-10-18', type: 'article', lang: 'en', tags: ['tech'], shelf: 'blogZ' }];
  d.count = 3; d.tags = []; delete d.topics; delete d.columns;
  fs.writeFileSync(DIRF, JSON.stringify(d));
  fs.unlinkSync(RECO);
  await fetch(POD + '/__reset');
  await fresh();
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(2600);
  const marks = await J(`({marks:document.querySelectorAll('.play.ro').length, cats:[...document.querySelectorAll('#cats button')].map(b=>b.textContent.trim().replace(/\\d+$/,'')).join('|')})`);
  ok('the discovery page shows a play mark on the covers of episodes, and the sidebar has 今日听什么 (where 音频 was) beside 全部 / 文章', marks.marks >= 1 && /今日听什么/.test(marks.cats) && !/音频/.test(marks.cats) && /文章/.test(marks.cats), marks);
  await J(`document.querySelector('#cats [data-dtype="all"]').click()`); await sleep(700);
  const aud = await J(`({cards:document.querySelectorAll('#grid .card[data-did]').length, marks:document.querySelectorAll('#grid .card[data-did] .play.ro').length, titles:[...document.querySelectorAll('#grid .card[data-did] .play.ro')].map(x=>x.closest('.card').querySelector('.card-title').textContent.slice(0,4)).sort().join()})`);
  ok('"全部" lists the three, the two episodes with their play marks', aud.cards === 3 && aud.marks === 2 && aud.titles === 'Ep 1,Ep 2', aud);
  await J(`window.__opened=[]; window.open=(...a)=>{ window.__opened.push(String(a[0])); return null; }`);
  await J(`document.querySelector('#grid .card[data-did="au1aaaaaa1"] .card-title a').click()`);
  await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`);
  const dp = await J(`({title:document.querySelector('#plTitle').textContent, src:plAudio.currentSrc, opened:window.__opened.length, reader:document.querySelector('#reader').hidden, tmp:state.tmp.has('tmp:au1aaaaaa1'), show:(document.querySelector('#plSub .pl-show')||{}).textContent})`);
  ok('a click on a card of the directory plays the episode here: the bar, its sound, no tab, no reader', /^Ep 1/.test(dp.title) && dp.src === POD + '/ep1.wav' && dp.opened === 0 && dp.reader && dp.tmp && dp.show === 'English Learning Show', dp);
  await J(`document.querySelector('#grid .card[data-did="au1aaaaaa1"] .card-title a').click()`); await sleep(400);
  ok('a second click on the same card pauses it', await J(`plAudio.paused`));
  await J(`document.querySelector('#grid .card[data-did="au1aaaaaa1"] [data-d="save"]').click()`); await sleep(700);
  const kept = await J(`(()=>{ const r=state.items.find(x=>x.id==='local:link:au1aaaaaa1'); return r ? {audio:r.audio, type:r.type} : null; })()`);
  ok('the bookmark keeps the sound with the saved link', kept && kept.audio && kept.audio.url === POD + '/ep1.wav' && kept.type === 'link', kept);
  await J(`document.querySelector('[data-space="mine"]').click()`); await sleep(1000);
  const mine = await J(`(()=>{ const c=[...document.querySelectorAll('#grid .card')].find(x=>x.dataset.id==='local:link:au1aaaaaa1'); return c ? {play:!!c.querySelector('.cover .play'), notes:!!c.querySelector('[data-act="notes"]')} : null; })()`);
  ok('on my shelf the saved episode is a card with a play button like any subscribed one', mine && mine.play && mine.notes, mine);
  await J(`document.querySelector('#grid .card[data-id="local:link:au1aaaaaa1"] .card-title a').click()`); await waitFor(`!plAudio.paused`);
  ok('and a click on it plays it (the saved copy, not the transient one)', await J(`pl.q[pl.i]`) === 'local:link:au1aaaaaa1');
  fs.writeFileSync(DIRF, JSON.stringify(dir0));
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { try { fs.writeFileSync(DIRF, JSON.stringify(dir0)); if (fs.existsSync(RECO)) fs.unlinkSync(RECO); } catch (x) {} console.error(e); process.exit(2); });
