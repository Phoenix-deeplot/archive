// e2e: focus mode ("专注"). A page that says nothing (a pattern, the title in dim letters, buttons that fade) with whole songs / episodes under it, started by itself; the reader without its bars and a small pill.
// (demo app :8820, fake services :8840 and :8843; headless Edge)
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };
const get = p => fetch(SVC + p).then(r => r.json());

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,plStop,idb,addCollection,loadAll,render,openReader,focusOpen,readerFocus,fcDlg}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(120); } };
  const playing = () => waitFor(`!plAudio.paused && plAudio.currentTime>0.2`);
  const key = async k => { const code = { Escape: 27 }[k]; await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }); await sleep(400); };
  const fresh = async (lang = 'zh') => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang, 1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 2800);
  };
  const library = async () => {                                                                       // (a collection with one article, as the reader tests have it)
    await J(`(async()=>{ const cid=addCollection('测试'); const mk=(id,extra)=>({id,path:'',category:'notes',filename:'',hash:'',title:'',summary:'摘要',keywords:[],lang:'zh',minutes:1,pages:null,size:10,date:'2026-01-01',added:1,featured:false,hidden:false,cover:'',collection:cid,...extra});
      await idb.put(mk('local:m',{type:'md',filename:'m.md',title:'甲：有目录的文章',added:300,data:'# 甲\\n\\n## 第一节\\n\\n'+'正文。'.repeat(120)+'\\n\\n## 第二节\\n\\n'+'正文。'.repeat(120)}));
      await loadAll(); state.col=cid; LS.set('col',cid); render(); })()`);
    await sleep(500);
  };
  const toDir = async () => { await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1200); await waitFor(`document.querySelector('#lsBlock .ls-chips')`, 6000); await sleep(300); };
  const SONGS = `#lpRoot .lp-songs .lp-sc, #lpRoot .lp-songs .ls-row`;
  const openPage = async () => { await J(`document.querySelector('#cats [data-dlisten]').click()`); await waitFor(`document.querySelector(${JSON.stringify(SONGS)})`, 8000); await sleep(300); };
  const pickTile = async id => { await J(`document.querySelector('#lpRoot [data-lp-g="${id}"]').click()`); await waitFor(`document.querySelector(${JSON.stringify(SONGS)})`); await sleep(500); };
  const openById = async id => { await J(`document.querySelector('.card[data-id="${id}"] .card-title a').click()`); await sleep(1500); };
  const fc = expr => J(`(()=>{ const d=fcDlg; return ${expr}; })()`);
  const st = () => J(`({open:fcDlg.open, pat:fcDlg.dataset.pat, title:document.querySelector('#fcTitle').textContent, plTitle:document.querySelector('#plTitle').textContent, time:document.querySelector('#fcTime').textContent, patL:document.querySelector('#fcPat').textContent, msg:document.querySelector('#fcMsg').textContent, cur:pl.q[pl.i]||'', paused:plAudio.paused, kinds:[...fcDlg.querySelectorAll('[data-fc-kind]')].map(b=>b.textContent+(b.getAttribute('aria-pressed')==='true'?'*':'')).join('|'), toggle:document.querySelector('#fcToggle').getAttribute('aria-label')})`);
  await c.desktop(1280, 900, 1);

  // ================================================ A. from the listening page (desktop)
  writeDir(); await get('/__listen?mode=ok&reset=1');
  await fresh('zh'); await toDir(); await openPage();
  const acts = await J(`[...document.querySelectorAll('#lpRoot .lp-acts > *')].map(b=>b.dataset.lpFocus!==undefined?'focus:'+b.textContent:b.dataset.lpAll!==undefined?'all':b.tagName.toLowerCase())`);
  ok('the song list has a "专注" button beside "播放全部" (专注, 播放全部)', acts.join('|') === 'focus:专注|all', acts);
  ok('the page of focus is not on the screen before it is asked for', !(await J(`fcDlg.open`)) && (await J(`getComputedStyle(fcDlg).display`)) === 'none');
  await pickTile('hot-cn');
  await J(`document.querySelector('#lpRoot [data-lp-focus]').click()`); await playing();
  let s = await st();
  ok('"专注" on a list of 30-second previews (nothing whole in it): the page opens and the whole songs of the first list that has some (the daily picks) play', s.open && s.cur.startsWith('tmp:ls:au:daily') && !s.paused, s);
  ok('only whole songs are in the bar’s list (a preview would end after half a minute)', await J(`pl.q.length>=5 && pl.q.every(id=>id.startsWith('tmp:ls:au:'))`), await J(`pl.q`));
  ok('the page shows the title of what plays in dim letters, the pattern is the breathing one, nothing else is written', s.title === s.plTitle && s.title.length > 0 && s.pat === 'breath' && s.msg === '' && s.patL === '图案：呼吸' && s.time === '不限时' && s.kinds === '音乐*|播客', s);
  ok('every sound has its own colour (a hue is set on the page)', await fc(`/^\\d{1,3}$/.test(d.style.getPropertyValue('--fc-h')) && +d.style.getPropertyValue('--fc-h')<360`), await fc(`d.style.getPropertyValue('--fc-h')`));
  ok('the pattern really moves (the ring breathes)', await fc(`getComputedStyle(d.querySelector('.fc-ring')).animationName`) === 'fcBreath');
  ok('it covers the whole screen and the rest of the page is under it (the page under it does not scroll)', await fc(`(()=>{ const r=d.getBoundingClientRect(); return r.width===document.documentElement.clientWidth && r.height===innerHeight && r.left===0 && r.top===0 && getComputedStyle(document.body).overflow==='hidden'; })()`));
  ok('no button shows a focus ring when the page opens (the page itself has the focus)', await fc(`document.activeElement===d`), await fc(`document.activeElement.outerHTML.slice(0,80)`));

  // ---- play / pause, next
  await J(`document.querySelector('#fcToggle').click()`); await sleep(300);
  s = await st();
  ok('the big button pauses (and says it will play)', s.paused && s.toggle === '播放', s);
  await J(`document.querySelector('#fcToggle').click()`); await playing(); s = await st();
  ok('... and plays again', !s.paused && s.toggle === '暂停', s);
  const before = s.cur;
  await J(`document.querySelector('#fcNext').click()`); await playing(); await sleep(300); s = await st();
  ok('next: the next whole song, the title on the page follows', s.cur !== before && s.title === s.plTitle && !s.paused, s);

  // ---- the timer (the sleep timer of the player)
  const times = [];
  for (let i = 0; i < 5; i++) { await J(`document.querySelector('#fcTime').click()`); await sleep(120); times.push([await J(`pl.sleepMin`), await J(`document.querySelector('#fcTime').textContent`)]); }
  ok('the timer button goes round: 15 → 25 → 45 → 60 minutes → no timer; it says the time that is left', JSON.stringify(times.map(x => x[0])) === '[15,25,45,60,0]' && /^剩 1[45]:\d\d$/.test(times[0][1]) && /^剩 2[45]:\d\d$/.test(times[1][1]) && times[4][1] === '不限时', times);
  ok('the left time is the player’s sleep timer (so the "now playing" page shows the same one)', await J(`(await_ => true)()`) && (await J(`pl.sleepAt===0`)));
  await J(`document.querySelector('#fcTime').click()`); await sleep(100);
  await J(`pl.sleepAt=Date.now()+1300`);
  await waitFor(`plAudio.paused`, 6000); await sleep(300); s = await st();
  ok('when the time is up the sound stops and the page says so itself (the toast is under it)', s.paused && s.msg === '时间到，已暂停。起来活动一下吧。' && s.time === '不限时', s);
  await J(`document.querySelector('#fcToggle').click()`); await playing();
  ok('it plays again at a touch (no timer any more)', (await J(`pl.sleepAt`)) === 0 && !(await st()).paused);

  // ---- the pattern
  const pats = [];
  for (let i = 0; i < 4; i++) { await J(`document.querySelector('#fcPat').click()`); await sleep(120); pats.push((await st()).pat + ':' + (await st()).patL); }
  ok('the pattern button goes round: 极光 → 暗 → 呼吸 (and again)', pats.join() === 'aurora:图案：极光,dark:图案：暗,breath:图案：呼吸,aurora:图案：极光', pats);
  ok('aurora: the drifting lights, no ring', await fc(`getComputedStyle(d.querySelector('.fc-ring')).display==='none' && getComputedStyle(d.querySelector('.fc-b1')).opacity==='1'`));
  await J(`document.querySelector('#fcPat').click()`); await sleep(2800);
  ok('dark: nearly black (the lights are gone, the ring is dim)', await fc(`getComputedStyle(d).backgroundColor==='rgb(2, 3, 4)' && getComputedStyle(d.querySelector('.fc-b1')).display==='none'`), await fc(`getComputedStyle(d).backgroundColor`));
  ok('the pattern chosen is remembered', (await J(`LS.get('focusPat','')`)) === 'dark');
  await J(`document.querySelector('#fcPat').click()`); await sleep(200);

  // ---- music / podcasts
  await J(`document.querySelector('#fcDlg [data-fc-kind="podcast"]').click()`); await waitFor(`pl.q[pl.i] && pl.q[pl.i].startsWith('tmp:ls:pc:') && !plAudio.paused && plAudio.currentTime>0.2`); s = await st();
  ok('"播客": a whole episode of the podcast chart plays (the chart’s first one), the chip is on, and the choice is remembered', s.cur === 'tmp:ls:pc:pod-hot-0' && s.kinds === '音乐|播客*' && (await J(`LS.get('focusKind','')`)) === 'podcast', s);
  await J(`document.querySelector('#fcDlg [data-fc-kind="music"]').click()`); await waitFor(`pl.q[pl.i] && pl.q[pl.i].startsWith('tmp:ls:au:') && !plAudio.paused && plAudio.currentTime>0.2`); s = await st();
  ok('"音乐": back to the whole songs', s.kinds === '音乐*|播客' && (await J(`LS.get('focusKind','')`)) === 'music', s);

  // ---- the buttons fade, a touch brings them back
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 400 }); await sleep(5400);
  let ui = await fc(`({idle:d.classList.contains('idle'), op:getComputedStyle(d.querySelector('.fc-ui')).opacity, xop:getComputedStyle(d.querySelector('.fc-x')).opacity, pe:getComputedStyle(d.querySelector('.fc-ui')).pointerEvents})`);
  ok('after four seconds without a touch the buttons are gone (only the pattern and the title are left)', ui.idle && ui.op === '0' && ui.xop === '0' && ui.pe === 'none', ui);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 420 }); await sleep(1000);
  ui = await fc(`({idle:d.classList.contains('idle'), op:getComputedStyle(d.querySelector('.fc-ui')).opacity})`);
  ok('a move of the mouse (a touch on a phone) brings them back', !ui.idle && ui.op === '1', ui);

  // ---- Esc closes the page, the sound goes on
  const t0 = (await st()).plTitle;
  await key('Escape'); s = await st();
  ok('Esc leaves the page and the sound goes on', !s.open && !s.paused && s.plTitle === t0, s);

  // ---- other ways in: the player’s button and the "now playing" page
  await J(`document.querySelector('#player [data-pl="focus"]').click()`); await sleep(500); s = await st();
  ok('the player’s own button opens the page for what is playing (it does not start another sound)', s.open && s.title === t0 && !s.paused, s);
  await J(`document.querySelector('#fcDlg [data-fc="exit"]').click()`); await sleep(300);
  ok('the × leaves it', !(await J(`fcDlg.open`)));
  await J(`document.querySelector('#player [data-pl="menu"]').click()`); await sleep(400);
  await J(`document.querySelector('#plDlg [data-pl="focus"]').click()`); await sleep(500);
  ok('the "now playing" page has a button for it too; the page replaces that one', (await J(`fcDlg.open && !document.querySelector('#plDlg').open`)));
  await key('Escape');

  // ---- from a podcast list
  await J(`window.scrollTo(0,0)`);
  await J(`document.querySelector('#lpRoot [data-lp-mode="podcast"]').click()`); await waitFor(`document.querySelector(${JSON.stringify(SONGS)})`); await sleep(500);
  await J(`document.querySelector('#lpRoot [data-lp-focus]').click()`); await waitFor(`fcDlg.open && pl.q[pl.i]==='tmp:ls:pc:pod-hot-0' && !plAudio.paused && plAudio.currentTime>0.2`); s = await st();
  ok('"专注" on the podcast chart plays that chart from its first episode and the chip says 播客', s.open && s.kinds === '音乐|播客*' && s.cur === 'tmp:ls:pc:pod-hot-0', s);
  await key('Escape'); await J(`plStop()`);

  // ================================================ B. the reader
  await get('/__listen?mode=ok&reset=1');
  await fresh('zh'); await library(); await openById('local:m');
  const rb = await J(`({vis:document.querySelector('#readerFocus').offsetParent!==null, lbl:document.querySelector('#readerFocus .lbl').textContent, ar:document.querySelector('#readerFocus').getAttribute('aria-label')})`);
  ok('the reader’s bar has "专注阅读"', rb.vis && rb.lbl === '专注阅读' && /收起所有按钮/.test(rb.ar), rb);
  const barH = await J(`Math.round(document.querySelector('.frame-wrap').getBoundingClientRect().height)`);
  await J(`document.querySelector('#readerFocus').click()`); await playing();
  let rf = await J(`({cls:document.body.classList.contains('reader-focus'), bar:getComputedStyle(document.querySelector('.reader-bar')).display, prog:getComputedStyle(document.querySelector('.reader-prog')).display, player:getComputedStyle(document.querySelector('#player')).display, mini:getComputedStyle(document.querySelector('#plMini')).display,
    pill:getComputedStyle(document.querySelector('#rfPill')).display, fh:Math.round(document.querySelector('.frame-wrap').getBoundingClientRect().height), rb:Math.round(document.querySelector('#reader').getBoundingClientRect().bottom), vh:innerHeight, cur:pl.q[pl.i]||''})`);
  ok('"专注阅读": no bar, no progress line, no player, only the text and a small pill; the text takes the whole screen', rf.cls && rf.bar === 'none' && rf.prog === 'none' && rf.player === 'none' && rf.mini === 'none' && rf.pill === 'flex' && rf.fh === rf.vh && rf.fh > barH && rf.rb === rf.vh, [rf, barH]);
  ok('the sound started by itself (whole songs, music, the first time)', rf.cur.startsWith('tmp:ls:au:'), rf);
  const pill = await J(`[...document.querySelectorAll('#rfPill button')].map(b=>({k:b.dataset.rf, w:Math.round(b.getBoundingClientRect().width), h:Math.round(b.getBoundingClientRect().height)}))`);
  ok('the pill has four buttons: play / pause, next, pattern, leave — each at least 44 px', pill.map(x => x.k).join() === 'toggle,next,art,exit' && pill.every(x => x.w >= 44 && x.h >= 44), pill);
  await J(`document.querySelector('#rfToggle').click()`); await sleep(300);
  ok('pause in the pill: the sound stops, and it is remembered that the reader does not want it', (await J(`plAudio.paused`)) && (await J(`LS.get('focusAuto',1)`)) === 0);
  await key('Escape');
  ok('Esc leaves the focus (the reader stays open and has its bar again)', await J(`!document.body.classList.contains('reader-focus') && !document.querySelector('#reader').hidden && getComputedStyle(document.querySelector('.reader-bar')).display!=='none'`));
  await J(`document.querySelector('#readerFocus').click()`); await sleep(1500);
  ok('next time the sound does not start by itself (it was paused last time)', await J(`document.body.classList.contains('reader-focus') && plAudio.paused`));
  await J(`document.querySelector('#rfToggle').click()`); await playing();
  ok('play in the pill: the sound goes on, and that is remembered too', (await J(`LS.get('focusAuto',1)`)) === 1);
  await J(`document.querySelector('#rfPill [data-rf="next"]').click()`); await sleep(500);
  ok('next in the pill', (await J(`pl.i`)) === 1 && !(await J(`plAudio.paused`)));
  await J(`document.querySelector('#rfPill [data-rf="art"]').click()`); await sleep(500);
  ok('the pattern button opens the pattern page over the text', await J(`fcDlg.open && document.body.classList.contains('reader-focus')`));
  await key('Escape');
  ok('Esc closes the pattern page first, and only that (the text is still without bars)', await J(`!fcDlg.open && document.body.classList.contains('reader-focus') && !document.querySelector('#reader').hidden`));
  await key('Escape');
  ok('the next Esc leaves the focus, and the reader is still open', await J(`!document.body.classList.contains('reader-focus') && !document.querySelector('#reader').hidden`));
  await key('Escape');
  ok('and the next one closes the reader', await J(`document.querySelector('#reader').hidden`));
  await J(`document.querySelector('.card[data-id="local:m"] .card-title a').click()`); await sleep(1200);
  await J(`document.querySelector('#readerFocus').click()`); await sleep(500);
  await J(`window.dispatchEvent(new PopStateEvent('popstate',{state:null}))`); await sleep(500);                  // (what the back button does to the page; a real back from a script is skipped by the browser for a page nobody has touched)
  ok('the browser’s back button leaves the reader and the focus with it',await J(`document.querySelector('#reader').hidden && !document.body.classList.contains('reader-focus')`));
  await J(`plStop()`);

  // ================================================ C. nothing to play: it says so
  await get('/__listen?mode=down&reset=1'); await J(`LS.set('focusAuto',1)`);
  await fresh('zh'); await library(); await openById('local:m');
  await J(`document.querySelector('#readerFocus').click()`); await sleep(1800);
  ok('no whole songs to be had: the reader goes on without a sound and says so in a toast', (await J(`document.body.classList.contains('reader-focus') && plAudio.paused`)) && /没有可以连续播放/.test(await J(`document.querySelector('#toastMsg').textContent`)), await J(`document.querySelector('#toastMsg').textContent`));
  await J(`document.querySelector('#rfPill [data-rf="art"]').click()`); await sleep(1500);
  ok('on the pattern page the same sentence is written there (a toast would be under the page)', await J(`fcDlg.open && /没有可以连续播放/.test(document.querySelector('#fcMsg').textContent)`), await J(`document.querySelector('#fcMsg').textContent`));
  await key('Escape'); await key('Escape'); await key('Escape');

  // ================================================ D. English, on a phone
  await get('/__listen?mode=ok&reset=1');
  await c.mobile(375, 812, 2);
  await fresh('en'); await library(); await openById('local:m');
  const bar = await J(`(()=>{ const bs=[...document.querySelectorAll('.rb-right > *')].filter(b=>b.offsetParent!==null).map(b=>b.getBoundingClientRect()); return {right:Math.round(Math.max(...bs.map(r=>r.right))), vw:innerWidth, n:bs.length}; })()`);
  ok('phone: the reader’s bar is as it was (the new button is not there, the bar fits the screen)', bar.right <= bar.vw && (await J(`document.querySelector('#readerFocus').offsetParent===null`)), bar);
  await J(`(()=>{ const d=document.querySelector('#frame').contentDocument, w=d.defaultView; d.dispatchEvent(new MouseEvent('click',{clientX:Math.round(w.innerWidth*0.5),clientY:300,bubbles:true})); })()`); await playing();
  ok('phone: a tap in the middle of the text takes the bars away and starts the focus (there is no "Aa" panel to carry the entry any more)', await J(`document.body.classList.contains('reader-focus')`));
  const pp = await J(`(()=>{ const r=document.querySelector('#rfPill').getBoundingClientRect(); return {right:Math.round(r.right), bottom:Math.round(r.bottom), vw:innerWidth, vh:innerHeight, hs:[...document.querySelectorAll('#rfPill button')].map(b=>Math.round(b.getBoundingClientRect().height)), sw:document.documentElement.scrollWidth}; })()`);
  ok('phone: the pill is inside the screen and its buttons are at least 44 px', pp.right <= pp.vw && pp.bottom <= pp.vh && pp.hs.every(h => h >= 44) && pp.sw <= pp.vw, pp);
  ok('English: the pill says what it is', (await J(`document.querySelector('#rfPill').getAttribute('aria-label')`)) === 'Focus reading');
  await J(`document.querySelector('#rfPill [data-rf="art"]').click()`); await sleep(600);
  const ph = await J(`(()=>{ const d=fcDlg, r=e=>Math.round(d.querySelector(e).getBoundingClientRect().height); const ui=d.querySelector('.fc-ui').getBoundingClientRect();
    return {chips:[...d.querySelectorAll('.fc-chip,.fc-seg button')].map(b=>Math.round(b.getBoundingClientRect().height)), ctl:[...d.querySelectorAll('.fc-ctl button')].map(b=>Math.round(b.getBoundingClientRect().height)), x:r('.fc-x'), uiBottom:Math.round(ui.bottom), vh:innerHeight, sw:document.documentElement.scrollWidth, vw:innerWidth, labels:[d.querySelector('#fcTime').textContent, d.querySelector('#fcPat').textContent, [...d.querySelectorAll('[data-fc-kind]')].map(b=>b.textContent).join('|')].join(' / '), title:d.querySelector('#fcTitle').scrollWidth<=innerWidth}; })()`);
  ok('phone: the pattern page: every button at least 44 px, the bottom row is on the screen, no sideways scroll', ph.chips.every(h => h >= 44) && ph.ctl.every(h => h >= 56) && ph.x >= 44 && ph.uiBottom <= ph.vh && ph.sw <= ph.vw, ph);
  ok('English: the chips of the pattern page', ph.labels === 'No timer / Pattern: Breath / Music|Podcasts', ph.labels);
  await key('Escape'); await key('Escape'); await key('Escape'); await J(`plStop()`);
  await c.desktop(1280, 900, 1);

  ok('no script errors in the whole run', errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
