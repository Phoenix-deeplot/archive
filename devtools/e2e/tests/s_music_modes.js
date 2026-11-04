// e2e: the play mode of music (the list again, one song again, shuffled, in order and stop): one button in the bar that goes round and says the mode; what each mode does when a song ends and on "next" / "previous";
// the choice is kept; a podcast episode has no play mode (the speed and the jumps instead). (demo app :8820, fake services :8840 and :8843; headless Edge)
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
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,listenGo,lpLoad,lpGroupItems,lpIndex,plLoad,plNext,plPrev,plNextIdx}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* the page is busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(100); } };
  await fetch(SVC + '/__listen?mode=ok&reset=1');
  await c.desktop(1280, 900, 1);
  await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1200);
  await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
  await c.goto(BASE, 2500);
  await J(`lpIndex()`); await waitFor(`state.lp.idx`);
  await J(`lpLoad('chill')`); await waitFor(`lpGroupItems('chill','').items.length>5`);
  const items = () => J(`lpGroupItems('chill','').items.slice(0,4)`);
  const start = async () => { await J(`localStorage.removeItem('archive.plMode'); plStopQ()`).catch(() => {}); };
  const mode = () => J(`pl.mode`);
  const setMode = async m => { for (let i = 0; i < 5 && (await mode()) !== m; i++) await J(`document.querySelector('#plMode').click()`); };
  const endSoon = async () => { await waitFor(`plAudio.duration>0 && isFinite(plAudio.duration)`); await J(`plAudio.currentTime=Math.max(0,plAudio.duration-0.4)`); };
  await J(`listenGo(${JSON.stringify((await items())[0].id)}, lpGroupItems('chill','').items.slice(0,4))`);
  await waitFor(`pl.q.length===4 && pl.loaded && plAudio.currentTime>0.05`);

  // ------------------------------------------------ the button
  ok('music: the bar has the play-mode button and not the speed and the jumps', await J(`document.body.classList.contains('pl-music') && getComputedStyle(document.querySelector('#plMode')).display!=='none' && getComputedStyle(document.querySelector('#plRate')).display==='none' && [...document.querySelectorAll('#player .sk')].every(b=>getComputedStyle(b).display==='none')`));
  ok('the mode is "the list again" at the start (and the button says so)', (await mode()) === 'list' && (await J(`document.querySelector('#plMode').title`)) === '列表循环', [await mode(), await J(`document.querySelector('#plMode').title`)]);
  const seen = [];
  for (let i = 0; i < 4; i++) { await J(`document.querySelector('#plMode').click()`); seen.push((await mode()) + '/' + (await J(`document.querySelector('#toastMsg').textContent`))); }
  ok('the button goes round: one song again, shuffled, in order, the list again; each time it says which', seen.join('|') === 'one/单曲循环|shuffle/随机播放|order/顺序播放|list/列表循环', seen);
  ok('the choice is kept (this browser)', (await J(`LS.get('plMode','')`)) === 'list');

  // ------------------------------------------------ the list again: after the last song the first
  await setMode('list');
  await J(`plLoad(3,true)`); await waitFor(`pl.i===3 && plAudio.currentTime>0.05`);
  await endSoon();
  ok('the list again: after the last song comes the first', await waitFor(`pl.i===0 && plAudio.currentTime>=0`, 6000), await J(`pl.i`));
  ok('...and "next" on the last song goes to the first too', await (async () => { await J(`plLoad(3,true)`); await waitFor(`pl.i===3`); await J(`document.querySelector('#plNext').click()`); return waitFor(`pl.i===0`, 4000); })());

  // ------------------------------------------------ in order: after the last song it stops
  await setMode('order');
  await J(`plLoad(3,true)`); await waitFor(`pl.i===3 && plAudio.currentTime>0.05`);
  ok('in order: on the last song "next" has nothing to go to (the button is off)', await J(`document.querySelector('#plNext').disabled`));
  await endSoon(); await sleep(1200);
  ok('...and when it ends the sound stops there (nothing starts again)', (await J(`pl.i`)) === 3 && (await J(`plAudio.paused || plAudio.ended`)), [await J(`pl.i`), await J(`plAudio.paused`)]);
  await J(`plLoad(1,true)`); await waitFor(`pl.i===1 && plAudio.currentTime>0.05`); await endSoon();
  ok('in order: a song in the middle goes on to the next', await waitFor(`pl.i===2`, 6000), await J(`pl.i`));

  // ------------------------------------------------ one song again
  await setMode('one');
  await J(`plLoad(1,true)`); await waitFor(`pl.i===1 && plAudio.currentTime>0.05`); await endSoon();
  await sleep(1500);
  ok('one song again: when it ends the same song starts again (the place in the list does not change)', (await J(`pl.i`)) === 1 && !(await J(`plAudio.paused`)) && (await J(`plAudio.currentTime`)) < 3, [await J(`pl.i`), await J(`plAudio.currentTime`)]);
  await J(`document.querySelector('#plNext').click()`);
  ok('...but "next" still goes to the next song (a hand that wants another one gets another one)', await waitFor(`pl.i===2`, 4000), await J(`pl.i`));

  // ------------------------------------------------ shuffled
  await setMode('shuffle');
  await J(`plLoad(0,true)`); await waitFor(`pl.i===0 && plAudio.currentTime>0.05`);
  const order = [0];
  for (let i = 0; i < 3; i++) { await J(`document.querySelector('#plNext').click()`); await waitFor(`pl.i!==${order[order.length - 1]}`, 4000); order.push(await J(`pl.i`)); }
  ok('shuffled: four songs are four different ones before any comes again', new Set(order).size === 4, order);
  await J(`document.querySelector('#plPrev').click()`);
  ok('shuffled: "previous" goes back to the song that was before (not to the one above in the list)', await waitFor(`pl.i===${order[2]}`, 4000), [order, await J(`pl.i`)]);
  const nx = await J(`plNextIdx(false)`);
  ok('shuffled: the song that will come is decided before it comes (it is the same for the player and for the prefetch)', (await J(`plNextIdx(false)`)) === nx && (await J(`plNextIdx(true)`)) === nx, nx);

  // ------------------------------------------------ a podcast: no play mode
  await J(`lpLoad('pod-cn')`); await waitFor(`lpGroupItems('pod-cn','').items.length>2`);
  await J(`listenGo(lpGroupItems('pod-cn','').items[0].id, lpGroupItems('pod-cn','').items.slice(0,3))`);
  await waitFor(`pl.loaded && pl.loaded.indexOf('pc:')>0`);
  ok('an episode: no play mode, the speed and the jumps are there', await J(`!document.body.classList.contains('pl-music') && getComputedStyle(document.querySelector('#plMode')).display==='none' && getComputedStyle(document.querySelector('#plRate')).display!=='none' && [...document.querySelectorAll('#player .sk')].every(b=>getComputedStyle(b).display!=='none')`));
  await J(`plAudio.pause()`);

  await c.goto(BASE, 1800);
  ok('after a reload the mode is as it was (shuffled)', (await J(`pl.mode`)) === 'shuffle', await J(`pl.mode`));
  await J(`localStorage.removeItem('archive.plMode')`);
  const mine = errs.filter(e => !/adsbygoogle|googlesyndication/.test(e));
  ok('no script errors in the whole run', mine.length === 0, mine);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
