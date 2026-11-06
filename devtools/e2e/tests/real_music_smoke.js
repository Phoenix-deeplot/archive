// NOT part of the suite: the page against the REAL music service (shelf-directory's listen.py with music_sources.py) on the REAL sources, to see that the whole way works: the catalogue, a search, a song found
// and played, the Douyin chart, the words. It needs the internet and the folder of the directory service with the newer questions:
//   $env:SHELF_DIRECTORY='E:\Ztree\wt\claude-music-sources'   (before rig.ps1: sync_dev.py reads it)   then   node tests/real_music_smoke.js
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,render}=window.__zt||{}; const Z=window.__zt; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(150); } };
  await fetch(SVC + '/__listen?mode=real0&reset=1');
  await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1200);
  await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
  await c.goto(BASE, 2500);
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1200);
  await waitFor(`document.querySelector('#cats [data-dlisten]')`, 8000);
  await J(`document.querySelector('#cats [data-dlisten]').click()`);
  console.log('page up:', await waitFor(`document.querySelector('#lpRoot .lp-tabs')`, 20000));
  console.log('v2:', await J(`state.lp.v2`), 'groups:', await J(`state.lp.idx ? state.lp.idx.groups.length : 0`), 'has dy-hot:', await J(`!!(state.lp.idx && state.lp.idx.groups.find(g=>g.id==='dy-hot'))`), 'scenes:', await J(`state.lp.idx ? state.lp.idx.groups.filter(g=>g.kind==='scene').map(g=>g.id).join() : ''`));
  console.log('pool:', await waitFor(`state.lp.pool && state.lp.pool.items.length`, 25000));
  console.log('for you rows:', await waitFor(`document.querySelectorAll('#lpRoot .lp-forrows .ls-row').length>=30 && document.querySelectorAll('#lpRoot .lp-forrows .ls-row').length`, 25000));
  await J(`document.querySelector('#lpRoot [data-lp-search]').click()`); await sleep(300);
  await J(`(()=>{ const i=document.querySelector('#lpSrIn'); i.value='晴天 周杰伦'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length>0`, 20000);
  console.log('search rows:', JSON.stringify(await J(`[...document.querySelectorAll('#lpSrRes .ls-row')].slice(0,6).map(r=>r.querySelector('.ls-t').textContent+' | '+r.querySelector('.ls-m').textContent)`)));
  await J(`document.querySelector('#lpSrRes .ls-row .ls-main').click()`);
  console.log('plays:', await waitFor(`pl.loaded && plAudio.currentTime>0.3`, 40000), JSON.stringify(await J(`({cur:pl.q[pl.i], cands:pl.cands.map(c=>c.p+':'+c.k+':'+(c.big?'big':'')).join(), src:plAudio.currentSrc.slice(0,70), dur:plAudio.duration, t:plAudio.currentTime})`)));
  await J(`document.querySelector('#player [data-pl="menu"]').click()`); await sleep(1500);
  console.log('lyrics tab:', await waitFor(`!document.querySelector('#plLyrTab').hidden`, 15000), JSON.stringify(await J(`[...document.querySelectorAll('#plLyr p')].length`)));
  await J(`document.querySelector('#plLyrTab').click()`); await sleep(500);
  console.log('first lyric lines:', JSON.stringify(await J(`[...document.querySelectorAll('#plLyr p')].slice(0,3).map(p=>p.textContent)`)));
  await J(`document.querySelector('#plDlg').close(); plAudio.pause()`);
  await J(`window.scrollTo(0,0)`);
  await J(`document.querySelector('#lpRoot [data-lp-sback]').click()`); await sleep(300);
  await J(`document.querySelector('#lpRoot [data-lp-tab="chart"]').click()`); await sleep(500);
  await J(`document.querySelector('#lpRoot [data-lp-cgb="dy-hot"]').click()`);
  console.log('douyin rows:', await waitFor(`document.querySelectorAll('#lpRoot .lp-rows .ls-row').length>=20 && document.querySelectorAll('#lpRoot .lp-rows .ls-row').length`, 20000), await J(`document.querySelector('#lpRoot .lp-rows .ls-row .ls-t').textContent`));
  await J(`document.querySelector('#lpRoot .lp-rows .ls-row .ls-main').click()`);
  console.log('douyin song plays:', await waitFor(`pl.loaded && plAudio.currentTime>0.3`, 40000), JSON.stringify(await J(`({cur:pl.q[pl.i], cands:pl.cands.map(c=>c.p+':'+c.k).join(), t:plAudio.currentTime, find:pl.find})`)));
  await J(`plAudio.pause()`);
  await fetch(SVC + '/__listen?mode=ok&reset=1');
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
