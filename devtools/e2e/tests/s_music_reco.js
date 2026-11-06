// e2e: the recommendation of the music side. What the reader does with songs is kept on this device only (a taste table: artists, kinds, parts of the world; half the weight after 30 days); the songs for you are the day's picks
// and the songs of the pool (the charts of the reader's side, given by the service) scored against it: a liked artist comes first (two songs of one artist in a batch of thirty at most), a song not wanted goes down, seven in ten
// of the reader's own side, every fifth song a stranger; the first time the page asks what the reader likes (once); "clear the records" clears it all. (demo app :8820, fake services :8840 and :8843; headless Edge)
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,render}=window.__zt||{}; const Z=window.__zt; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* the page is busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(100); } };
  const svc = q => fetch(SVC + '/__listen?mode=ok&' + q).then(r => r.json());
  const log2 = () => fetch(SVC + '/__listen_log2').then(r => r.json());
  const fresh = async (q = 'v2=1') => {
    await svc('reset=1&' + q);
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1200);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1200);
    await waitFor(`document.querySelector('#cats [data-dlisten]')`, 8000);
    await J(`document.querySelector('#cats [data-dlisten]').click()`);
    await waitFor(`document.querySelector('#lpRoot .lp-tabs') && document.querySelector('#lpRoot .lp-forrows .ls-row') && state.lp.pool`, 9000); await sleep(300);
  };
  const top = (n = 30) => J(`Z.lpRecItems().slice(0,${n}).map(x=>({id:x.id,a:x.artist,m:x.market,g:x.tags,need:x.need}))`);
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ the pool and the first question
  await fresh();
  ok('the service gives the pool of the reader\'s side (China for a reader in Chinese): 120 songs, names and places, no sounds', (await log2()).includes('pool:cn') && (await J(`state.lp.pool.side==='cn' && state.lp.pool.items.length===120 && state.lp.pool.items.every(x=>x.need && !x.audio)`)));
  const ask = await J(`({box:!!document.querySelector('#lpRoot .lp-ask'), chips:document.querySelectorAll('#lpRoot .lp-ask [data-lp-askk]').length, head:(document.querySelector('#lpRoot .lp-ask b')||{}).textContent, go:!!document.querySelector('#lpRoot [data-lp-askgo]'), skip:!!document.querySelector('#lpRoot [data-lp-askskip]'), before:document.querySelector('#lpRoot .lp-shelf').compareDocumentPosition(document.querySelector('#lpRoot .lp-ask')) & Node.DOCUMENT_POSITION_FOLLOWING})`);
  ok('the first time, between the play lists and the songs for you: “你爱听什么？”, ten kinds (styles and parts of the world), “好了” and “先不用”', ask.box && ask.chips === 10 && ask.head === '你爱听什么？' && ask.go && ask.skip && ask.before, ask);
  const t0 = await top(); const rock0 = t0.filter(x => (x.g || []).includes('rock')).length, jk0 = t0.filter(x => x.m === 'jp-kr').length;
  await J(`document.querySelector('#lpRoot [data-lp-askk="rock"]').click(); document.querySelector('#lpRoot [data-lp-askk="@jp-kr"]').click()`);
  ok('a kind is chosen with a tap (pressed)', await J(`document.querySelector('#lpRoot [data-lp-askk="rock"]').getAttribute('aria-pressed')==='true'`));
  await J(`document.querySelector('#lpRoot [data-lp-askgo]').click()`); await sleep(400);
  const T = await J(`Z.lpTaste()`); const t1 = await top(); const rock1 = t1.filter(x => (x.g || []).includes('rock')).length, jk1 = t1.filter(x => x.m === 'jp-kr').length;
  ok('“好了”: the taste table has rock and Japan-Korea (kept on this device), the question does not come again, and the songs for you lean that way (more rock than before; the share of each part of the world stays 70 / 15 / 15 until about twenty things are done)', T.g.rock && T.m['jp-kr'] && T.n === 1 && !(await J(`document.querySelector('#lpRoot .lp-ask')`)) && (await J(`LS.get('lpAsked',0)`)) === 1 && rock1 >= 4 && rock1 > rock0 && Math.abs(jk1 - jk0) <= 2, { rock0, rock1, jk0, jk1, T });

  // ------------------------------------------------ "not now" and the mix of the parts of the world
  await fresh();
  await J(`document.querySelector('#lpRoot [data-lp-askskip]').click()`); await sleep(300);
  ok('“先不用”: nothing is learned and the question does not come again', (await J(`Z.lpTaste().n`)) === 0 && (await J(`LS.get('lpAsked',0)`)) === 1 && !(await J(`document.querySelector('#lpRoot .lp-ask')`)));
  const mix = await top(30);
  const own = mix.filter(x => x.m === 'cn' || !x.m).length, near = mix.filter(x => x.m === 'jp-kr').length, far = mix.filter(x => x.m === 'west' || x.m === 'global').length;
  ok('no taste yet: seven in ten of the reader\'s own side (here 21 of 30), the rest from Japan and Korea and from the West', own >= 18 && own <= 24 && near >= 2 && far >= 2, { own, near, far });
  ok('an artist has two songs in a batch of thirty at most', (() => { const by = {}; mix.forEach(x => { by[x.a] = (by[x.a] || 0) + 1; }); return Math.max(...Object.values(by)) <= 2; })(), mix.map(x => x.a));
  const ids0 = mix.map(x => x.id);
  await J(`document.querySelector('#lpRoot [data-lp-batch]').click()`); await sleep(300);
  const ids1 = (await top(30)).map(x => x.id);
  ok('another batch begins thirty songs further on: none of the first batch is in it', ids1.every(x => !ids0.includes(x)));
  await J(`document.querySelector('#lpRoot [data-lp-batch]').click()`); await sleep(100);

  // ------------------------------------------------ a thing done changes the order
  await J(`state.lp.batch=0`);
  const pool = await J(`state.lp.pool.items`);
  const listAll = await J(`Z.lpRecItems().map(x=>x.id)`);
  const first30 = new Set(listAll.slice(0, 30).map(id => (pool.find(q => q.id === id) || {}).artist).filter(Boolean));
  const pickA = pool.filter(p => p.market === 'cn').find(p => !first30.has(p.artist) && pool.filter(q => q.artist === p.artist).length >= 3);
  await J(`Z.lpSignal(state.lp.pool.items.find(x=>x.id==='${pickA.id}'), 3)`);
  const after = await top(30);
  ok('a liked artist\'s songs come to the top (here +3 for a pool artist that was far down): two of them in the first thirty, no more', after.filter(x => x.a === pickA.artist).length === 2, { artist: pickA.artist, n: after.filter(x => x.a === pickA.artist).length });
  const victim = after.find(x => x.a && x.a !== pickA.artist);
  await J(`Z.lpSignal(Z.lpRecItems().find(x=>x.id==='${victim.id}'), -3)`);
  ok('a song not wanted (−3) takes its artist out of the first thirty', !(await top(30)).some(x => x.a === victim.a), victim);

  // ------------------------------------------------ the weight of old things
  const d = await J(`(()=>{ const now=Date.now(), D=86400000; return [Z.lpDecay([4, now], now), Z.lpDecay([4, now-30*D], now), Z.lpDecay([4, now-60*D], now), Z.lpDecay([-3, now-30*D], now)].map(v=>Math.round(v*100)/100); })()`);
  ok('a thing done counts half as much after 30 days, a quarter after 60 (and a dislike fades the same way)', d[0] === 4 && d[1] === 2 && d[2] === 1 && d[3] === -1.5, d);

  // ------------------------------------------------ the bar teaches
  await fresh();
  await J(`document.querySelector('#lpRoot [data-lp-askskip]').click()`); await sleep(300);
  const rows = await J(`[...document.querySelectorAll('#lpRoot .lp-forrows .ls-row')].slice(0,3).map(r=>({id:r.dataset.lsRow, a:r.querySelector('.ls-m').textContent}))`);
  await J(`document.querySelector('#lpRoot .lp-forrows .ls-row[data-ls-row="${rows[0].id}"] .ls-main').click()`);
  await waitFor(`pl.q[pl.i]==='tmp:ls:${rows[0].id}' && plAudio.currentTime>0.05`, 9000);
  const a0 = rows[0].a, tasteOf = a => J(`(Z.lpTaste().a[${JSON.stringify(a)}]||[0])[0]`);
  await J(`document.querySelector('#plNext').click()`); await sleep(300);
  ok('moving on within ten seconds counts against the song (−1 for its artist)', (await tasteOf(a0)) < -0.9 && (await tasteOf(a0)) > -1.1, await tasteOf(a0));
  const cur = await J(`pl.q[pl.i].slice(7)`), a1 = await J(`Z.lpSeen.get(pl.q[pl.i].slice(7)).artist`);
  await waitFor(`plAudio.currentTime>0.05 && plAudio.duration>0`, 8000);
  await J(`plAudio.currentTime=plAudio.duration-0.4`);
  ok('a song heard to the end counts for it (+1 for its artist)', await waitFor(`(Z.lpTaste().a[${JSON.stringify(a1)}]||[0])[0]>0.9`, 6000), await tasteOf(a1));
  await waitFor(`plAudio.currentTime>0.05 && plAudio.duration>0`, 8000);
  const a2 = await J(`Z.lpSeen.get(pl.q[pl.i].slice(7)).artist`), b2 = await tasteOf(a2);
  await J(`plAudio.currentTime=plAudio.duration-1.2`); await sleep(150); await J(`document.querySelector('#plNext').click()`); await sleep(300);
  ok('moving on after six tenths of a song counts a little for it (+0.5)', Math.abs((await tasteOf(a2)) - b2 - 0.5) < 0.05 || a2 === a1, [b2, await tasteOf(a2)]);
  await J(`plAudio.pause()`);
  const likedA = await J(`document.querySelector('#lpRoot .lp-forrows .ls-row .ls-m').textContent`), l0 = await tasteOf(likedA);
  await J(`document.querySelector('#lpRoot .lp-forrows .ls-row .ls-like').click()`); await sleep(300);
  const l1 = await tasteOf(likedA);
  ok('♥ counts for the song (+3 for its artist)', Math.abs(l1 - l0 - 3) < 0.05, [l0, l1]);
  await J(`document.querySelector('#lpRoot .lp-forrows .ls-row .ls-like').click()`); await sleep(300);
  ok('taking the ♥ back takes it away again', Math.abs((await tasteOf(likedA)) - l0) < 0.05, [l0, await tasteOf(likedA)]);

  // ------------------------------------------------ the pool plays through resolve; the pool down
  const pid = await J(`Z.lpRecItems().find(x=>x.id.startsWith('pool:')).id`);
  await J(`Z.listenGo('${pid}', Z.lpRecItems())`);
  ok('a song of the pool (it has no sound) plays: the service finds one when its turn comes', await waitFor(`pl.q[pl.i]==='tmp:ls:${pid}' && plAudio.currentTime>0.05 && pl.cands[0] && pl.cands[0].p==='bodian'`, 9000) && (await log2()).some(x => /^resolve:Pool /.test(x)), await log2());
  await J(`plAudio.pause()`);

  // ------------------------------------------------ clear the records
  await J(`document.querySelector('#player [data-pl="menu"]').click()`); await sleep(400);
  await J(`document.querySelector('#plSetBtn').click()`); await sleep(300);
  await J(`LS.set('lpSearchHist',['x'])`);
  await J(`document.querySelector('#plWipe').click()`); await sleep(300);
  ok('“清除这台设备上的听歌记录” clears what the recommendation learned and the searches (the songs liked and the play lists stay)', (await J(`Z.lpTaste().n`)) === 0 && (await J(`LS.get('lpSearchHist',[]).length`)) === 0 && (await J(`LS.get('lpRecent',[]).length`)) === 0, await J(`Z.lpTaste()`));
  await J(`document.querySelector('#plDlg').close()`);

  await fresh('v2=1&pool=down');
  ok('the pool down: the songs for you are still there (the day\'s picks), thirty rows, none from the pool', (await J(`document.querySelectorAll('#lpRoot .lp-forrows .ls-row').length`)) === 30 && !(await J(`[...document.querySelectorAll('#lpRoot .lp-forrows .ls-row')].some(r=>r.dataset.lsRow.startsWith('pool:'))`)));
  await fresh('v2=0');
  ok('an older service (no pool, no question): the songs for you as before, no question about what you like', !(await J(`document.querySelector('#lpRoot .lp-ask')`)) && (await J(`document.querySelectorAll('#lpRoot .lp-forrows .ls-row').length`)) === 30 && !(await J(`state.lp.pool`)));
  ok('no errors in the page', errs.length === 0, errs);
  console.log(`${pass} passed, ${fail} failed`);
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
