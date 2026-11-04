// e2e: a song has several sounds (cands); the bar tries them in order and goes on to the next sound when one is gone, never answers, or is not the song's length; a whole sound goes before a preview; the
// reader's choice of sounds (whole first / small first / free only); a big file on mobile data is asked for, not played; a song that nothing plays is skipped; the next song's beginning is asked for half way.
// (demo app :8820, fake services :8840 and :8843; headless Edge)
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
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,plSet,listenGo,listenTmp,lpLoad,lpGroupItems,lpIndex,plLoad,plNext,plCands,plNextIdx,plStop}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* the page is busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(100); } };
  await fetch(SVC + '/__listen?extra=1&reset=1');
  await c.desktop(1280, 900, 1);
  await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1200);
  await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.plStallMs','2000')`);
  await c.goto(BASE, 2500);
  await J(`lpIndex()`); await waitFor(`state.lp.idx`);
  await J(`lpLoad('fo-test')`); await waitFor(`lpGroupItems('fo-test','').items.length===8`);
  const items = () => J(`lpGroupItems('fo-test','').items.length`);
  ok('the list "fo-test" has its eight songs, each with its sounds (cands)', (await items()) === 8 && (await J(`lpGroupItems('fo-test','').items[0].cands.length`)) === 2, await items());
  const play = async n => { await J(`listenGo('fo:${n}', lpGroupItems('fo-test','').items)`); };
  const src = () => J(`plAudio.currentSrc || plAudio.src`);
  const going = () => J(`!!pl.loaded && !plAudio.paused && plAudio.currentTime>0.1`);
  const isSrc = f => src().then(s => new RegExp(f).test(s));
  const candsOf = n => J(`plCands(state.tmp.get(listenTmp(lpGroupItems('fo-test','').items[${n}]))).map(x=>x.p+(x.big?'*':'')+(x.k==='preview'?'~':'')).join()`);          // (the sounds of song n in the order they would be tried: * big, ~ preview)

  // ------------------------------------------------ the first sound is gone: the second plays
  await play(0);
  ok('the first sound is gone (404): the second sound of the song plays', (await waitFor(`pl.ci===1 && !!pl.loaded && !plAudio.paused && plAudio.currentTime>0.1`)) && await isSrc('/ep1\\.wav'), [await J(`pl.ci`), await src()]);
  ok('...the bar still has the song (no skip, no message that it cannot be played)', await J(`pl.q[pl.i]==='tmp:ls:fo:0' && document.querySelector('#toastMsg').textContent.indexOf('放不了')<0`));

  // ------------------------------------------------ a sound that never answers: after a few seconds the next
  await play(1);
  ok('a sound that never answers is given up after a few seconds: the second sound plays', (await waitFor(`pl.ci===1 && plAudio.currentTime>0.1`, 12000)) && await isSrc('/ep2\\.wav'), [await J(`pl.ci`), await src()]);

  // ------------------------------------------------ the length is not the song's
  await play(2);
  ok('a sound that is 6 seconds long for a song of 50 minutes is not believed: the second sound is tried (and plays: it is the last)', (await waitFor(`pl.ci===1 && plAudio.currentTime>0.1`, 8000)) && await isSrc('/ep2\\.wav'), [await J(`pl.ci`), await src(), await J(`plAudio.duration`)]);

  // ------------------------------------------------ whole before preview
  await play(3);
  await waitFor(`pl.loaded==='tmp:ls:fo:3' && plAudio.currentTime>0.1`);
  ok('a whole sound is tried before a preview, whatever the order the service gave', (await candsOf(3)) === 'audius,apple~' && await isSrc('/ep3\\.wav'), [await candsOf(3), await src()]);

  // ------------------------------------------------ the reader's choice of sounds
  await J(`plSet.src='free'`);
  ok('"only free sources": the sounds of NetEase and Bodian are left out (song 0 has NetEase and Audius)', (await candsOf(0)) === 'audius', await candsOf(0));
  await J(`plSet.src='speed'`);
  ok('"speed first": a small file before a big one (the big one is the first the service gave)', (await candsOf(4)) === 'audius,bodian*', await candsOf(4));
  await J(`plSet.src='whole'`);
  ok('"whole first" (the default): the order the service gave, whole before preview', (await candsOf(4)) === 'bodian*,audius', await candsOf(4));

  // ------------------------------------------------ mobile data
  await J(`Object.defineProperty(navigator,'connection',{value:{type:'cellular',saveData:false,effectiveType:'4g'},configurable:true})`);
  await play(4);
  ok('on mobile data the small sound plays and the big one is left alone', (await waitFor(`pl.loaded==='tmp:ls:fo:4' && plAudio.currentTime>0.1`)) && await isSrc('/ep2\\.wav') && (await J(`pl.cands.length`)) === 1, [await src(), await J(`pl.cands.length`)]);
  await play(5);
  await waitFor(`document.querySelector('#toastAct') && document.querySelector('#toastAct').textContent==='仍然播放'`, 4000);
  ok('only a big file is left: it is not played by itself, the reader is asked (about how big it is)', !(await J(`pl.loaded`)) && (await J(`document.querySelector('#toastAct').textContent`)) === '仍然播放' && /30 MB|29 MB/.test(await J(`document.querySelector('#toastMsg').textContent`)), [await J(`pl.loaded`), await J(`document.querySelector('#toastMsg').textContent`)]);
  await J(`document.querySelector('#toastAct').click()`);
  ok('"play anyway" plays it', (await waitFor(`pl.loaded==='tmp:ls:fo:5' && plAudio.currentTime>0.1`)) && await isSrc('/ep3\\.wav'), await src());
  await J(`plSet.data=false`); await J(`plStop()`);
  await play(4);
  ok('with "spare the mobile data" off the first sound is the big one', (await waitFor(`pl.loaded==='tmp:ls:fo:4' && plAudio.currentTime>0.1`)) && await isSrc('/ep1\\.wav'), await src());
  await J(`plSet.data=true; delete navigator.connection`);

  // ------------------------------------------------ nothing plays: on to the next song
  await play(6);
  ok('a song whose only sound is gone is skipped: the next song plays', (await waitFor(`pl.q[pl.i]==='tmp:ls:fo:7' && plAudio.currentTime>0.1`, 8000)), [await J(`pl.q[pl.i]`), await J(`document.querySelector('#toastMsg').textContent`)]);

  // ------------------------------------------------ the beginning of the next song is asked for half way
  await play(3);
  await waitFor(`pl.loaded==='tmp:ls:fo:3' && plAudio.duration>0`);
  await J(`plAudio.currentTime = plAudio.duration*0.6`);
  ok('half way through a song the next one is prepared (a hidden player with its beginning)', (await waitFor(`pl.pre==='tmp:ls:fo:4' || pl.pre!==''`, 4000)) && (await J(`!!pl.preA && /ep\\d\\.wav/.test(pl.preA.src)`)), [await J(`pl.pre`), await J(`pl.preA && pl.preA.src`)]);

  await J(`plStop()`); await fetch(SVC + '/__listen?mode=ok');
  const mine = errs.filter(e => !/adsbygoogle|googlesyndication/.test(e));
  ok('no script errors in the whole run', mine.length === 0, mine);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
