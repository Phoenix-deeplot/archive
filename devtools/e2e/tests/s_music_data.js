// e2e: what happens to the sounds that "resolve" finds: a big file on mobile data waits for a tap (and says how big); an address that has run out is asked for again; when every sound of a song fails the service is asked
// once for new ones (a liked song kept long ago, an address that expired); the service down or without an answer: the song is given up and the next one plays. (demo app :8820, fake services :8840 and :8843; headless Edge)
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
    await waitFor(`document.querySelector('#lpRoot .lp-tabs') && document.querySelector('#lpRoot .lp-forrows .ls-row')`, 9000); await sleep(300);
  };
  const dy = async () => { await J(`window.scrollTo(0,0); document.querySelector('#lpRoot [data-lp-tab="chart"]').click()`); await sleep(400); await J(`document.querySelector('#lpRoot [data-lp-cgb="dy-hot"]').click()`); await waitFor(`document.querySelectorAll('#lpRoot .lp-rows .ls-row').length>=30`, 8000); };
  const go = n => J(`document.querySelector('#lpRoot .lp-rows .ls-row:nth-child(${n}) .ls-main').click()`);
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ a big file on mobile data
  await fresh('v2=1&rs=big');
  await dy();
  await J(`Object.defineProperty(navigator,'connection',{value:{type:'cellular',saveData:false,effectiveType:'4g'},configurable:true})`);
  await go(1);
  ok('mobile data: a whole song of about 30 MB is found but not played by itself; the page says how big it is and asks', await waitFor(`/30 ?MB/.test(document.querySelector('#toastMsg').textContent) && !pl.loaded`, 9000) && (await log2()).includes('resolve:Douyin Song 0'), await J(`document.querySelector('#toastMsg').textContent`));
  await sleep(600);
  ok('and it does not play meanwhile', (await J(`plAudio.paused && !pl.loaded`)));
  await J(`document.querySelector('#toastAct, #toast button').click()`);
  ok('“play it anyway” plays it', await waitFor(`pl.loaded && plAudio.currentTime>0.05`, 8000), await J(`document.querySelector('#toast').textContent`));
  await J(`plAudio.pause()`);
  await J(`delete navigator.connection`);
  await go(2);
  ok('on wifi (no mobile data) the big file plays by itself', await waitFor(`pl.q[pl.i].endsWith(':dy:01') && plAudio.currentTime>0.05`, 8000));
  await J(`plAudio.pause()`);

  // ------------------------------------------------ an address that has run out
  await svc('v2=1&rs=short');
  await go(3);
  await waitFor(`pl.q[pl.i].endsWith(':dy:02') && plAudio.currentTime>0.05`, 8000);
  const n1 = (await log2()).filter(x => x === 'resolve:Douyin Song 2').length;
  await J(`plAudio.pause()`); await sleep(2200);
  ok('the address of a sound that was found is good for a time (here two seconds); until then the same song is not looked for again', n1 === 1 && await J(`Z.plStale(state.tmp.get(pl.q[pl.i]))`), n1);
  await go(3);
  ok('after that a song that is played again is looked for again (a new address)', await waitFor(`plAudio.currentTime>0.05 && !Z.plStale(state.tmp.get(pl.q[pl.i]))`, 8000) && (await log2()).filter(x => x === 'resolve:Douyin Song 2').length === 2, await log2());
  await J(`plAudio.pause()`);

  // ------------------------------------------------ every sound fails: the service is asked once for new ones
  await fresh('v2=1&extra=1&rs=ok');
  await J(`Z.lpLoad('fo-test')`); await waitFor(`Z.lpGroupItems('fo-test','').items.length===8`);
  const play = n => J(`Z.listenGo('fo:${n}', Z.lpGroupItems('fo-test','').items)`);
  await play(6);
  ok('a song whose only sound is gone (404): the service is asked for new sounds once, and the song plays from what it found', await waitFor(`pl.q[pl.i]==='tmp:ls:fo:6' && plAudio.currentTime>0.05 && pl.cands[0] && pl.cands[0].p==='bodian'`, 12000) && (await log2()).includes('resolve:fo Only bad'), [await J(`pl.q[pl.i]`), await log2()]);
  await J(`plAudio.pause()`);
  for (const [mode, name] of [['none', 'the service has nothing either'], ['down', 'the service is down']]) {
    await fresh('v2=1&extra=1&rs=' + mode);
    await J(`Z.lpLoad('fo-test')`); await waitFor(`Z.lpGroupItems('fo-test','').items.length===8`);
    await play(6);
    ok(name + ': the song is given up (once asked for) and the next one, the last of the list, plays; no crash, no endless wait', await waitFor(`pl.q[pl.i]==='tmp:ls:fo:7' && plAudio.currentTime>0.05`, 12000) && (await log2()).filter(x => x === 'resolve:fo Only bad').length === 1, [await J(`pl.q[pl.i]`), await log2()]);
    await J(`plAudio.pause()`);
  }

  // ------------------------------------------------ a liked song with no sound yet is kept and found when it is played
  await fresh('v2=1&rs=ok');
  await dy();
  await J(`document.querySelector('#lpRoot .lp-rows .ls-row:nth-child(4) .ls-like').click()`); await sleep(300);
  const kept = await J(`(LS.get('lpLikes',[])[0]||{})`);
  ok('a song that has no sound yet can be liked: it is kept as a promise (need), with its title and artist', kept.need === true && kept.audio === '' && /Douyin Song 3/.test(kept.title) && kept.market === 'cn', kept);
  await J(`document.querySelector('#lpRoot [data-lp-tab="rec"]').click()`); await sleep(400);
  await J(`document.querySelector('#lpRoot [data-lp-my="my:likes"]').click()`); await sleep(500);
  ok('it is in “我喜欢的”', await J(`document.querySelectorAll('#lpRoot .ls-row').length`) === 1);
  await J(`document.querySelector('#lpRoot .ls-row .ls-main').click()`);
  ok('and it plays from there (the sound is found)', await waitFor(`plAudio.currentTime>0.05 && pl.cands[0] && pl.cands[0].p==='bodian'`, 9000) && (await log2()).includes('resolve:Douyin Song 3'), await log2());
  ok('no errors in the page', errs.length === 0, errs);
  await fetch(SVC + '/__listen?mode=ok&reset=1');                                  // (the fake service answers as it did before again: the tests after this one do not know the newer questions)
  console.log(`${pass} passed, ${fail} failed`);
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
