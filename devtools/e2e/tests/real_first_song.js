// A look at what happens between the press on the first song of a search and the sound, with the REAL service and sources (not in the suite; see real_search_smoke.js for how to start it):
// every request the press makes (resolve, the sounds) and every change of the sound source of the bar, with the time since the press.   node devtools/e2e/tests/real_first_song.js [word]
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/';
(async () => {
  const w = process.argv[2] || '周杰伦';
  const c = await connect(9444, { newShell: true });
  c.autoDialog(true, []);
  await c.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(120); } };
  await c.desktop(1280, 900, 1);
  await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1200);
  await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1');`);
  await c.goto(BASE + '?lang=zh', 2500);
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1500);
  await waitFor(`document.querySelector('#cats [data-dlisten]')`, 10000);
  await J(`document.querySelector('#cats [data-dlisten]').click()`);
  await waitFor(`document.querySelector('#lpRoot .lp-tabs')`, 15000);
  await J(`(()=>{ const i=document.querySelector('#q'); i.focus(); i.value=${JSON.stringify(w)}; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); })()`);
  await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length>0`, 20000);
  await waitFor(`!!document.querySelector('#lpSrRes .lp-art-h')`, 15000);
  await sleep(1500);
  const row = await J(`(()=>{ const r=document.querySelector('#lpSrRes .lp-srrows .ls-row'); return r.querySelector('.ls-t').textContent.trim()+' | '+r.querySelector('.ls-m').textContent.replace(/\\s+/g,' ').slice(0,80)+' | id='+r.dataset.lsRow; })()`);
  console.log('first row:', row);
  const t0 = Date.now(), ev = [];
  const stamp = s => ev.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + s);
  c.on(m => {
    if (m.method === 'Network.requestWillBeSent') { const u = m.params.request.url; if (/resolve=1/.test(u)) stamp('REQ resolve ' + decodeURIComponent(u.split('?')[1]).slice(0, 90)); else if (/kuwo|itunes|dzcdn|audius/.test(u)) stamp('REQ sound ' + u.split('/')[2]); }
    if (m.method === 'Network.responseReceived') { const u = m.params.response.url; if (/resolve=1/.test(u)) stamp('RES resolve ' + m.params.response.status); else if (/kuwo|itunes|dzcdn|audius/.test(u)) stamp('RES sound ' + m.params.response.status + ' ' + u.split('/')[2]); }
    if (m.method === 'Network.loadingFailed') stamp('FAIL ' + (m.params.errorText || '') + ' ' + (m.params.type || ''));
  });
  await J(`document.querySelector('#lpSrRes .lp-srrows .ls-row .ls-main').click()`);
  let last = '';
  for (let i = 0; i < 70; i++) {
    const s = await J(`JSON.stringify({ci:pl.ci, p:(pl.cands[pl.ci]||{}).p, k:(pl.cands[pl.ci]||{}).k, n:pl.cands.length, t:+plAudio.currentTime.toFixed(1), dur:+(plAudio.duration||0).toFixed(0), paused:plAudio.paused, err:plAudio.error&&plAudio.error.code, ready:plAudio.readyState})`);
    if (s !== last) { stamp('BAR ' + s); last = s; }
    const b = JSON.parse(s);
    if (b.t > 1.5 && !b.paused && b.dur > 60) break;                                   // (a whole song is playing)
    await sleep(250);
  }
  await J(`plAudio.pause()`);
  console.log(ev.join('\n'));
  console.log('toast:', await J(`(document.querySelector('#toastMsg')||{textContent:''}).textContent`));
  process.exit(0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
