// e2e: the player bar does not cover the side list (the language, theme, sync and backup buttons at its foot): on a wide screen the bar starts where the list ends,
// on a narrow one the list that slides out is above the bar. (demo :8820, fake services :8840; headless Edge)
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,plStop,plFold}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 12000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(150); } };
  const fresh = async () => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 2800);
  };
  const play = async () => {                                                                  // a song of today's listening plays in the bar
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(2000);
    await J(`document.querySelector('#cats [data-dlisten]').click()`); await waitFor(`document.querySelector('#lpRoot .ls-row, #lpRoot .lp-sc')`);
    await sleep(500); await J(`(document.querySelector('#lpRoot .ls-main') || document.querySelector('#lpRoot .lp-cv')).click()`);
    await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`); await sleep(500);
  };
  // what is on top at the middle of a button: is it the button (or the side list it is in), not the player?
  const top = sel => J(`(()=>{ const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(), e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2); return {inSide:!!(e && e.closest('.side')), inPlayer:!!(e && e.closest('#player,#plMini')), y:Math.round(b.bottom), vh:innerHeight}; })()`);
  writeDir(); await fetch(SVC + '/__listen?mode=ok&reset=1');

  // ---- a wide screen
  await c.desktop(1280, 900, 1);
  await fresh();
  await play();
  const bar = await J(`(()=>{ const r=document.querySelector('#player').getBoundingClientRect(), s=document.querySelector('.side').getBoundingClientRect(); return {left:Math.round(r.left), right:Math.round(r.right), side:Math.round(s.right), vw:innerWidth, bottom:Math.round(r.bottom), vh:innerHeight, hidden:document.querySelector('#player').hidden}; })()`);
  ok('a wide screen: the player bar starts where the side list ends and goes to the right edge of the page, at the bottom', !bar.hidden && bar.left === bar.side && bar.right === bar.vw && bar.bottom === bar.vh, bar);
  for (const sel of ['#langBtn', '#themeBtn', '#bkBtn']) { const t = await top(sel); ok('a wide screen, the player on: ' + sel + ' is not under the bar', t.inSide && !t.inPlayer, t); }
  await J(`plFold(true)`); await sleep(400);
  const mini = await J(`(()=>{ const r=document.querySelector('#plMini').getBoundingClientRect(), s=document.querySelector('.side').getBoundingClientRect(), shown=getComputedStyle(document.querySelector('#plMini')).display!=='none'; return {shown, left:Math.round(r.left), side:Math.round(s.right)}; })()`);
  ok('the folded player (the round button) sits in the page, not on the side list', mini.shown && mini.left >= mini.side, mini);
  for (const sel of ['#langBtn', '#themeBtn']) { const t = await top(sel); ok('folded: ' + sel + ' is reachable', t.inSide && !t.inPlayer, t); }
  await J(`plFold(false)`); await sleep(300);
  await J(`document.querySelector('#plToggle').click()`); await sleep(300);
  ok('the bar still plays and pauses (a click on its button works)', await J(`plAudio.paused`));
  await J(`plStop()`);

  // ---- a narrow screen: the list that slides out
  await c.mobile(375, 812, 2);
  await fresh();
  await play();
  await J(`document.querySelector('#menuBtn').click()`); await sleep(700);
  const open = await J(`document.body.classList.contains('drawer')`);
  ok('a phone: the menu button slides the side list out', open);
  for (const sel of ['#langBtn', '#themeBtn', '#bkBtn']) { const t = await top(sel); ok('a phone, the player on: ' + sel + ' is not under the bar', t.inSide && !t.inPlayer && t.y <= t.vh, t); }
  await J(`document.querySelector('#langBtn').click()`); await sleep(1200);
  ok('and the button works: the language changes', (await J(`state.lang`)) === 'en', await J(`state.lang`));
  await J(`document.querySelector('#langBtn').click()`); await sleep(600);
  await J(`document.body.classList.remove('drawer')`); await sleep(300);
  const pb = await J(`(()=>{ const r=document.querySelector('#player').getBoundingClientRect(); return {left:Math.round(r.left), right:Math.round(r.right), vw:innerWidth, bottom:Math.round(r.bottom), vh:innerHeight}; })()`);
  ok('a phone, the list closed: the bar is as it was, edge to edge at the bottom', pb.left === 0 && pb.right === pb.vw && pb.bottom === pb.vh, pb);
  await J(`plStop()`);
  await c.desktop(1280, 900, 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
