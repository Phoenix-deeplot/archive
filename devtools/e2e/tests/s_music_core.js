// e2e: the popup of the player (it IS the player: no page of its own): ⌄ folds it and the sound goes on, × closes the player (sound stops, bar goes, the list is kept), "clear" empties the list and "undo" brings
// it back; a tap outside of it and three minutes without a touch fold it; no "done" button; the settings are four small things behind a gear; a phone. (demo app :8820, fake services :8840 and :8843; headless Edge)
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
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,plSet,listenGo,lpLoad,lpGroupItems,lpIndex,plLoad}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* the page is busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(100); } };
  const open = () => J(`document.querySelector('#player [data-pl="menu"]').click()`);
  const isOpen = () => J(`document.querySelector('#plDlg').open`);
  const fresh = async () => {
    await fetch(SVC + '/__listen?mode=ok&reset=1');
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1200);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 2500);
    await J(`lpIndex()`); await waitFor(`state.lp.idx`);
    await J(`lpLoad('chill')`); await waitFor(`lpGroupItems('chill','').items.length>5`);
    await J(`listenGo(lpGroupItems('chill','').items[0].id, lpGroupItems('chill','').items.slice(0,4))`);
    await waitFor(`pl.q.length===4 && pl.loaded && plAudio.currentTime>0.05`);
  };
  await c.desktop(1280, 900, 1);
  await fresh();

  // ------------------------------------------------ what is in the popup
  await open(); await sleep(300);
  const top = await J(`({open:document.querySelector('#plDlg').open, title:document.querySelector('#plDlgTitle').textContent, btns:[...document.querySelectorAll('#plDlg .plp-top .plp-ic')].map(b=>b.dataset.plp||b.id).join(), done:!!document.querySelector('#plDone'), foot:!!document.querySelector('#plDlg .dlg-foot'),
    ctl:[...document.querySelectorAll('#plDlg .pl-dctl .pl-btn')].filter(b=>getComputedStyle(b).display!=='none').map(b=>b.getAttribute('data-pl')).join(), qn:document.querySelector('#plQn').textContent, clear:document.querySelector('#plClear').textContent.trim(), set:document.querySelector('#plSetSheet').hidden, rows:document.querySelectorAll('#plList li[data-plid]').length})`);
  ok('the popup: ⌄ (fold) at the left, 正在播放, ⚙ and × (close the player) at the right', top.open && top.title === '正在播放' && top.btns === 'collapse,set,plShut', top);
  ok('there is no "完成" button and no row of buttons at the foot', !top.done && !top.foot, top);
  ok('music: the controls are the play mode, previous, play, next (no −15 / +30); the list says how many songs and has "清空" at its right; the settings are not shown', top.ctl === 'mode,prev,toggle,next' && top.qn === '4 首' && top.clear === '清空' && top.set && top.rows === 4, top);

  // ------------------------------------------------ ⌄ folds it, the sound goes on
  await J(`document.querySelector('[data-plp="collapse"]').click()`); await sleep(200);
  ok('⌄ folds the popup and the sound goes on', !(await isOpen()) && !(await J(`plAudio.paused`)));

  // ------------------------------------------------ a tap outside folds it
  await open(); await sleep(300);
  const r = await J(`(()=>{ const b=document.querySelector('#plDlg .plp-in').getBoundingClientRect(); return {top:Math.round(b.top), left:Math.round(b.left), vh:innerHeight}; })()`);
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 60, y: Math.max(20, Math.round(r.top / 2)), button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 60, y: Math.max(20, Math.round(r.top / 2)), button: 'left', clickCount: 1 }); await sleep(300);
  ok('a tap on what is behind the popup folds it (the player is not closed)', !(await isOpen()) && !(await J(`document.querySelector('#player').hidden`)) && !(await J(`plAudio.paused`)), [r, await isOpen()]);
  await open(); await sleep(300);
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.left + 120, y: r.top + 150, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.left + 120, y: r.top + 150, button: 'left', clickCount: 1 }); await sleep(300);
  ok('...a tap inside it does not', await isOpen());

  // ------------------------------------------------ three minutes without a touch
  await J(`(()=>{ window.__t={off:0}; const R=Date.now.bind(Date); Date.now=()=>R()+window.__t.off; })()`);
  await J(`window.__t.off=170000`); await sleep(1500);
  ok('after 170 seconds without a touch it is still open', await isOpen());
  await J(`document.querySelector('#plDlg').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);        // (a touch: the three minutes start again)
  await J(`window.__t.off=170000+170000`); await sleep(1500);
  ok('a touch starts the three minutes again: 170 seconds after it, still open', await isOpen());
  await J(`window.__t.off=170000+170000+20000`); await sleep(1700);
  ok('after three minutes without a touch it folds by itself, and the sound goes on', !(await isOpen()) && !(await J(`plAudio.paused`)));
  await J(`window.__t.off=0`);

  // ------------------------------------------------ the settings behind the gear
  await open(); await sleep(300);
  await J(`document.querySelector('[data-plp="set"]').click()`); await sleep(200);
  const st = await J(`({shown:!document.querySelector('#plSetSheet').hidden, exp:document.querySelector('#plSetBtn').getAttribute('aria-expanded'), rows:[...document.querySelectorAll('#plSetSheet .plp-row')].filter(r=>!r.hidden).map(r=>r.querySelector('.l').textContent), srcs:[...document.querySelectorAll('#plSrcs button')].map(b=>b.textContent+(b.getAttribute('aria-pressed')==='true'?'*':'')).join('|'),
    sw:document.querySelector('#plDataSw').getAttribute('aria-checked'), sleeps:document.querySelectorAll('#plSleeps button').length, links:[...document.querySelectorAll('#plSetSheet .plp-link')].map(b=>b.textContent.trim()).join('|')})`);
  ok('the gear shows the settings: three things for music (the source, the line about mobile data, the timer), each with a default', st.shown && st.exp === 'true' && st.rows.join('|') === '音源|手机流量下小字提示|定时关闭' && st.srcs === '整首优先*|速度优先|只用免费合规源' && st.sw === 'true' && st.sleeps === 5, st);
  ok('...and two small links at its foot: the focus mode, and clearing what this device remembers', st.links === '专注模式 ›|清除这台设备上的听歌记录', st.links);
  await J(`document.querySelector('[data-plsrc="speed"]').click()`); await sleep(150);
  ok('a choice of sounds is applied and kept', (await J(`plSet.src`)) === 'speed' && (await J(`LS.get('plSet',{}).src`)) === 'speed' && (await J(`document.querySelector('[data-plsrc="speed"]').getAttribute('aria-pressed')`)) === 'true');
  await J(`document.querySelector('#plDataSw').click()`); await sleep(150);
  ok('the switch for mobile data is applied and kept', (await J(`plSet.data`)) === false && (await J(`LS.get('plSet',{}).data`)) === false && (await J(`document.querySelector('#plDataSw').getAttribute('aria-checked')`)) === 'false');
  await J(`document.querySelector('[data-plsrc="whole"]').click(); document.querySelector('#plDataSw').click()`);
  await J(`document.querySelector('#plWipe').click()`);
  ok('"clear what this device remembers" says it did', /已清除/.test(await J(`document.querySelector('#toastMsg').textContent`)));
  await J(`document.querySelector('[data-plp="setx"]').click()`); await sleep(150);
  ok('the settings close again (the popup stays)', (await J(`document.querySelector('#plSetSheet').hidden`)) && (await isOpen()));
  await J(`document.querySelector('[data-plp="set"]').click()`); await sleep(100);
  await J(`document.querySelector('[data-plp="collapse"]').click()`); await sleep(150); await open(); await sleep(200);
  ok('a popup that was folded with the settings open comes back with them closed', await J(`document.querySelector('#plSetSheet').hidden`));

  // ------------------------------------------------ clear, and undo
  await J(`document.querySelector('#plClear').click()`); await sleep(500);
  ok('"清空" empties the list at once: no songs, the sound stopped, the bar gone, the popup folded', await J(`pl.q.length===0 && pl.i===-1 && !plAudio.getAttribute('src') && document.querySelector('#player').hidden && !document.querySelector('#plDlg').open && LS.get('pl',{}).q.length===0`));
  ok('...and the page says so and offers 撤销 (no question asked first)', (await J(`document.querySelector('#toastMsg').textContent`)) === '已清空' && (await J(`document.querySelector('#toastAct').textContent`)) === '撤销' && !(await J(`document.querySelector('#toast').classList.contains('show')===false`)));
  await J(`document.querySelector('#toastAct').click()`); await sleep(500);
  ok('撤销 brings the four songs back, the same one in the bar, paused', await J(`pl.q.length===4 && pl.i===0 && !document.querySelector('#player').hidden && plAudio.paused`), [await J(`pl.q.length`), await J(`pl.i`)]);

  // ------------------------------------------------ × closes the player
  await J(`plLoad(1,true)`); await waitFor(`pl.i===1 && plAudio.currentTime>0.05`);
  await open(); await sleep(300);
  await J(`document.querySelector('#plShut').click()`); await sleep(500);
  ok('× closes the player: the sound stops, the bar goes, the popup folds', await J(`plAudio.paused && !plAudio.getAttribute('src') && document.querySelector('#player').hidden && !document.body.classList.contains('has-player') && !document.querySelector('#plDlg').open`));
  ok('...but the list is kept (and so is the place in it)', await J(`pl.q.length===4 && pl.i===1 && LS.get('pl',{}).q.length===4 && LS.get('pl',{}).closed===1`), [await J(`pl.q.length`), await J(`pl.i`)]);
  await c.goto(BASE, 2200);
  ok('after a reload the player is still closed (nothing comes back by itself)', await J(`document.querySelector('#player').hidden && pl.closed===true`));
  await J(`lpIndex()`); await waitFor(`state.lp.idx`); await J(`lpLoad('chill')`); await waitFor(`lpGroupItems('chill','').items.length>5`);
  await J(`listenGo(lpGroupItems('chill','').items[2].id, lpGroupItems('chill','').items.slice(0,4))`); await waitFor(`!document.querySelector('#player').hidden && plAudio.currentTime>0.05`);
  ok('a song played after that brings the bar back', await J(`!document.querySelector('#player').hidden && pl.closed===false`));

  // ------------------------------------------------ a phone
  await c.mobile(390, 844, 2);
  await c.goto(BASE, 2000);
  await J(`lpIndex()`); await waitFor(`state.lp.idx`); await J(`lpLoad('chill')`); await waitFor(`lpGroupItems('chill','').items.length>5`);
  await J(`listenGo(lpGroupItems('chill','').items[0].id, lpGroupItems('chill','').items.slice(0,4))`); await waitFor(`pl.q.length===4 && pl.loaded`);
  await J(`document.querySelector('#plMiniOpen').click()`).catch(() => {}); await open().catch(() => {}); await sleep(400);
  if (!(await isOpen())) await J(`document.querySelector('#player [data-pl="menu"], #plMini [data-pl]').click()`).catch(() => {});
  await J(`document.querySelector('[data-plp="set"]').click()`); await sleep(200);
  const ph = await J(`(()=>{ const d=document.querySelector('#plDlg').getBoundingClientRect(), small=[...document.querySelectorAll('#plDlg .plp-ic, #plDlg .pl-chips button, #plDlg .plp-clear, #plDlg .plp-link, #plDlg .pl-dctl .pl-btn')].filter(b=>b.offsetParent!==null).map(b=>{ const r=b.getBoundingClientRect(); return [Math.round(r.width),Math.round(r.height)]; }); return {l:Math.round(d.left), r:Math.round(d.right), b:Math.round(d.bottom), vw:innerWidth, vh:innerHeight, small:small.filter(([w,h])=>h<44||w<40).length, n:small.length, x:document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()`);
  ok('phone: the popup fits the screen at the bottom, every button of it is at least 44px high, nothing scrolls sideways', ph.l >= 0 && ph.r <= ph.vw && ph.b <= ph.vh && ph.small === 0 && ph.n >= 10 && ph.x <= 1, ph);
  await c.shot(require('../paths').SHOTS + '/mc_popup_phone.png');
  await J(`document.querySelector('[data-plp="setx"]').click()`); await sleep(200);
  await c.shot(require('../paths').SHOTS + '/mc_popup_phone_queue.png');
  await c.desktop(1280, 900, 1);
  await J(`localStorage.removeItem('archive.plSet')`);

  const mine = errs.filter(e => !/adsbygoogle|googlesyndication/.test(e));
  ok('no script errors in the whole run', mine.length === 0, mine);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
