// e2e: podcasts. A followed feed's episodes keep where their sound is; a bar at the foot of the page plays it (play / pause / skip / speed / list / sleep timer / the place of each episode / lock-screen
// controls) and goes on while the reader reads. Fake podcast on :8843 (short WAV tones, served with byte ranges), the feed service on :8840, the demo app on :8820.
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/', POD = 'http://127.0.0.1:8843';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.desktop(1280, 900, 1);
  const J = expr => c.js(`(()=>{ const {state,idb,LS,pl,plAudio,plPlay,plEnqueue,plToggle,plStop,plRestore,plRender,refreshSubs,loadAll}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(150); } };
  const podLog = async () => (await (await fetch(POD + '/__log')).json());
  const fresh = async lang => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + (lang || 'zh'), 1500); await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"')`); await c.goto(BASE, 1800); };
  const subscribe = async () => {
    await J(`document.querySelector('#addBtn').click()`); await sleep(400);
    await J(`document.querySelector('[data-atab="sub"]').click(); document.querySelector('#fsUrl').value='${POD}/feed.xml'; document.querySelector('#fsFind').click()`); await sleep(3000);
    await J(`document.querySelector('#fsGo').click()`); await sleep(4500);
  };
  const ep = n => J(`(state.items.find(x=>x.title.startsWith('Ep ${n} '))||{}).id`);
  const card = n => `[...document.querySelectorAll('#grid .card')].find(c=>c.textContent.includes('Ep ${n} '))`;
  await fetch(POD + '/__reset');

  // ================================================ A. what a subscription keeps of an episode
  await fresh('zh'); await subscribe();
  const items = await J(`state.items.filter(x=>x.id.startsWith('local:feed:')).map(x=>({t:x.title, a:x.audio, img:x.image}))`);
  const by = Object.fromEntries(items.map(i => [i.t.slice(0, 4), i]));
  ok('four episodes; each keeps where its sound is (address, type, length) and nothing else of it', items.length === 4 && by['Ep 3'].a.url === POD + '/ep3.wav' && by['Ep 3'].a.dur === 6 && by['Ep 3'].a.type === 'audio/wav' && by['Ep 1'].a.dur === 12 && by['Ep 0'].a.url === POD + '/gone.mp3', items);
  ok('nothing of the sound was fetched: not by the service, not by the page (until a play)', (await podLog()).length === 0, await podLog());
  const cd = await J(`(()=>{ const c=${card(3)}; return {badge:/播客/.test(c.textContent), play:!!c.querySelector('.cover .play'), playH:Math.round(c.querySelector('.cover .play').getBoundingClientRect().height), acts:[...c.querySelectorAll('.acts .ibtn')].slice(0,2).map(b=>b.dataset.act), dur:/0:06/.test(c.textContent)}; })()`);
  ok('the card of an episode: a "播客" mark, the length, a play button on the cover (44px) and "play" / "add to the list" among its buttons', cd.badge && cd.play && cd.playH >= 44 && cd.acts.join() === 'play,enqueue' && cd.dur, cd);
  ok('the player is not there while nothing is chosen', await J(`document.querySelector('#player').hidden && !document.body.classList.contains('has-player')`));

  // ================================================ B. play
  await J(`window.__opened=[]; window.open=(...a)=>{ window.__opened.push(String(a[0])); return null; }`);
  await J(`${card(3)}.querySelector('.card-title a').click()`);
  await waitFor(`!plAudio.paused && plAudio.currentTime>0.4`);
  let b = await J(`({shown:!document.querySelector('#player').hidden, body:document.body.classList.contains('has-player'), title:document.querySelector('#plTitle').textContent, sub:document.querySelector('#plSub').textContent, paused:plAudio.paused, t:plAudio.currentTime,
    toggle:document.querySelector('#plToggle').getAttribute('aria-label'), playing:!!${card(3)}.classList.contains('is-playing'), src:plAudio.currentSrc, q:pl.q.length, ms:(navigator.mediaSession&&navigator.mediaSession.metadata)?navigator.mediaSession.metadata.title:null})`);
  ok('a click on the TITLE plays the episode: no tab was opened, the reader is closed, the page of the episode stays behind "notes"', (await J(`window.__opened`)).length === 0 && await J(`document.querySelector('#reader').hidden`) && await J(`!!${card(3)}.querySelector('[data-act="notes"]')`));
  ok('the bar appears with the title and the show, the sound plays, the button says 暂停, the card is marked', b.shown && b.body && /^Ep 3/.test(b.title) && /English Learning Show/.test(b.sub) && !b.paused && b.t > 0.3 && b.toggle === '暂停' && b.playing && b.src === POD + '/ep3.wav', b);
  ok('the lock-screen / media keys know what plays (Media Session metadata)', b.ms === b.title, b.ms);
  const lg = await podLog();
  ok('the sound came straight from the show’s server to the browser (not the update service)', lg.length >= 1 && lg.every(x => /Mozilla|Edg/.test(x.ua) && !/ZhiTree|Shelf/.test(x.ua)), lg);
  await J(`document.querySelector('#plToggle').click()`); await sleep(400);
  ok('the bar’s button pauses (and then says 播放)', await J(`plAudio.paused && document.querySelector('#plToggle').getAttribute('aria-label')==='播放'`));
  await J(`document.querySelector('#plToggle').click()`); await waitFor(`!plAudio.paused`);

  // ================================================ C. skip, speed
  await J(`${card(1)}.querySelector('.cover .play').click()`); await waitFor(`!plAudio.paused && /Ep 1/.test(document.querySelector('#plTitle').textContent) && plAudio.currentTime>0.3`);
  await J(`plAudio.pause()`); await sleep(200);
  await J(`document.querySelector('[data-pl="back"]').click()`); await sleep(300);
  ok('back 15 s at the start stays at 0', await J(`plAudio.currentTime`) < 0.3);
  await J(`document.querySelector('[data-pl="fwd"]').click()`); await sleep(400);
  ok('forward 30 s on a 12 s episode lands one second before its end (it does not run over)', await J(`plAudio.currentTime`) >= 10.5 && await J(`plAudio.currentTime`) <= 11.2, await J(`plAudio.currentTime`));
  await J(`document.querySelector('#plSeek').value=250; document.querySelector('#plSeek').dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#plSeek').dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(400);
  ok('the progress bar seeks (25 % of 12 s ≈ 3 s) and its time text follows', Math.abs(await J(`plAudio.currentTime`) - 3) < 0.6 && /0:03 \/ 0:12/.test(await J(`document.querySelector('#plSub').textContent`)), [await J(`plAudio.currentTime`), await J(`document.querySelector('#plSub').textContent`)]);
  ok('the browser asks the show’s server for the sound by byte ranges (so that seeking in a long episode is a request for the part wanted, not a download of the rest)', (await podLog()).length >= 2 && (await podLog()).every(x => /^bytes=\d+-/.test(x.range || '')), await podLog());
  await J(`document.querySelector('[data-pl="menu"]').click()`); await sleep(400);
  const sheet = await J(`({open:document.querySelector('#plDlg').open, rates:[...document.querySelectorAll('#plRates button')].map(x=>x.textContent).join('|'), sleeps:[...document.querySelectorAll('#plSleeps button')].map(x=>x.textContent).join('|'), list:document.querySelectorAll('#plList li').length})`);
  ok('the menu opens a sheet: speeds 0.75× … 2×, the sleep timer (不定时, 15, 30, 60 分钟, 本集结束) and the list', sheet.open && sheet.rates === '0.75×|1×|1.25×|1.5×|1.75×|2×' && sheet.sleeps === '不定时|15 分钟|30 分钟|60 分钟|本集结束' && sheet.list >= 1, sheet);
  await J(`document.querySelector('[data-plrate="1.5"]').click()`); await sleep(200);
  ok('1.5× is applied to the sound and kept', await J(`plAudio.playbackRate`) === 1.5 && await J(`LS.get('pl',{}).rate`) === 1.5 && await J(`document.querySelector('[data-plrate="1.5"]').getAttribute('aria-pressed')`) === 'true');
  await J(`document.querySelector('[data-plp="collapse"]').click()`); await sleep(200);

  // ================================================ D. the list, and on to the next one
  await J(`${card(2)}.querySelector('[data-act="enqueue"]').click()`); await sleep(300);
  await J(`${card(3)}.querySelector('[data-act="enqueue"]').click()`); await sleep(300);
  await J(`${card(3)}.querySelector('[data-act="enqueue"]').click()`); await sleep(200);
  const q = await J(`({n:pl.q.length, titles:pl.q.map(id=>state.items.find(x=>x.id===id).title.slice(0,4)), toast:document.querySelector('#toastMsg').textContent})`);
  ok('"add to the list" puts an episode at the end, once (a second tap says it is there already)', q.n === 3 && q.titles.join() === 'Ep 3,Ep 1,Ep 2' && /已经在播放列表/.test(q.toast), q);
  await J(`plAudio.play(); 1`); await sleep(300);
  await J(`plAudio.currentTime=plAudio.duration-0.6`);
  const next = await waitFor(`/Ep 2/.test(document.querySelector('#plTitle').textContent) && !plAudio.paused && plAudio.currentTime>0.2`, 9000);
  ok('when an episode ends the next one in the list starts by itself', next, await J(`document.querySelector('#plTitle').textContent`));
  ok('what was heard to the end is remembered as heard', await J(`(LS.get('plProg',{})[state.items.find(x=>x.title.startsWith('Ep 1 ')).id]||[])[2]`) === 1);
  await J(`plAudio.pause(); plAudio.currentTime=0; 1`); await sleep(500);                                                  // (a still moment: the checks below do not race the end of an 8-second sound)
  const bar = await J(`({prevOff:document.querySelector('#plPrev').disabled, nextOff:document.querySelector('#plNext').disabled, t0:document.querySelector('#plT0').textContent, t1:document.querySelector('#plT1').textContent, rate:document.querySelector('#plRate').textContent, vol:document.querySelector('#plVol').value,
    nextVis:document.querySelector('#plNext').offsetParent!==null, volVis:document.querySelector('.pl-vol').offsetParent!==null, h:Math.round(document.querySelector('#player').getBoundingClientRect().height), sub:getComputedStyle(document.querySelector('#plSub .pl-tm')).display})`);
  ok('the bar (desktop): previous is on, next is off at the end of the list, the time stands on both sides of a visible slider (now / total), a speed button and a volume slider, the time is not repeated under the title', !bar.prevOff && bar.nextOff && /^\d+:\d\d$/.test(bar.t0) && bar.t1 === '0:08' && bar.rate === '1.5×' && bar.nextVis && bar.volVis && bar.h >= 84 && bar.sub === 'none', bar);
  const steps = [];
  for (let i = 0; i < 6; i++) { await J(`document.querySelector('#plRate').click()`); steps.push(await J(`document.querySelector('#plRate').textContent + '/' + plAudio.playbackRate`)); }
  ok('the speed button steps 1.5 → 1.75 → 2 → 0.75 → 1 → 1.25 → 1.5 (the sound follows)', steps.join() === '1.75×/1.75,2×/2,0.75×/0.75,1×/1,1.25×/1.25,1.5×/1.5', steps);
  await J(`(()=>{ const v=document.querySelector('#plVol'); v.value=40; v.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  ok('the volume slider sets the volume and it is kept', Math.abs(await J(`plAudio.volume`) - 0.4) < 0.01 && await J(`LS.get('plVol',0)`) === 40);
  await J(`(()=>{ const v=document.querySelector('#plVol'); v.value=100; v.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await J(`document.querySelector('#plCover').click()`); await sleep(500);
  const np = await J(`({open:document.querySelector('#plDlg').open, title:document.querySelector('#plDlgTitle').textContent, hero:(document.querySelector('.pl-hero b')||{}).textContent, show:(document.querySelector('.pl-hero-t span')||{}).textContent, notes:(document.querySelector('.pl-notes')||{}).textContent||'', notesBtn:!!document.querySelector('#plNow [data-pl="notes"]'),
    ctl:[...document.querySelectorAll('#plDlg .pl-dctl .pl-btn')].map(b=>b.getAttribute('data-pl')).join(), seekD:!!document.querySelector('#plSeekD'), dt1:document.querySelector('#plDT1').textContent, cur:document.querySelector('#plTitle').textContent})`);
  ok('the cover of the bar opens the "now playing" page: the title, the show, what the episode is about, and (the play mode is for music only) previous / −15 / play / +30 / next with a slider and the time', np.open && np.title === '正在播放' && np.hero === np.cur && /English Learning Show/.test(np.show) && np.notes.length > 20 && np.notesBtn && np.ctl === 'mode,prev,back,toggle,fwd,next' && np.seekD && np.dt1 === '0:08', np);
  await J(`document.querySelector('#plToggleD').click()`); await sleep(500);
  ok('its play button plays (and both buttons say 暂停)', await J(`!plAudio.paused && document.querySelector('#plToggle').getAttribute('aria-label')==='暂停' && document.querySelector('#plToggleD').getAttribute('aria-label')==='暂停'`));
  await J(`document.querySelector('#plToggleD').click()`); await sleep(300);
  ok('and pauses (the bar follows)', await J(`plAudio.paused && document.querySelector('#plToggle').getAttribute('aria-label')==='播放' && document.querySelector('#plToggleD').getAttribute('aria-label')==='播放'`));
  await J(`(()=>{ const v=document.querySelector('#plSeekD'); v.value=500; v.dispatchEvent(new Event('input',{bubbles:true})); v.dispatchEvent(new Event('change',{bubbles:true})); })()`); await sleep(300);
  ok('its slider seeks (50 % of 8 s ≈ 4 s) and the bar’s slider moves with it', Math.abs(await J(`plAudio.currentTime`) - 4) < 0.7 && Math.abs(await J(`+document.querySelector('#plSeek').value`) - 500) < 40, [await J(`plAudio.currentTime`), await J(`document.querySelector('#plSeek').value`)]);
  await J(`document.querySelector('#plDlg [data-pl="prev"]').click()`); await sleep(300);
  ok('previous inside a long episode goes back to its start; "play" carries on', await J(`plAudio.currentTime`) < 0.6);
  await J(`document.querySelector('#plDlg [data-pl="notes"]').click()`);
  const nrd = await waitFor(`!document.querySelector('#reader').hidden && !document.querySelector('#plDlg').open`, 12000);
  ok('"节目说明全文" closes the page and opens the notes in the reader', nrd);
  await J(`document.querySelector('#readerBack').click()`); await sleep(400);
  await J(`plAudio.play(); 1`); await sleep(300);

  // ================================================ E. reading goes on beside it
    const playingTitle = await J(`document.querySelector('#plTitle').textContent`);
  await J(`${card(0)}.querySelector('[data-act="notes"]').click()`);
  await waitFor(`!document.querySelector('#reader').hidden && ((document.querySelector('#frame').contentDocument||{body:{textContent:''}}).body.textContent||'').includes('Show notes')`, 12000);
  const rd = await J(`(()=>{ const r=document.querySelector('#reader').getBoundingClientRect(), p=document.querySelector('#player').getBoundingClientRect(); return {open:!document.querySelector('#reader').hidden, still:!plAudio.paused, title:document.querySelector('#plTitle').textContent, barBottom:Math.round(p.bottom), vh:innerHeight, readerBottom:Math.round(r.bottom), barTop:Math.round(p.top), text:(document.querySelector('#frame').contentDocument||{body:{textContent:''}}).body.textContent.includes('Show notes'), playBtn:!document.querySelector('#readerPlay').hidden}; })()`);
  ok('an episode’s page opens in the reader (its show notes) while the sound goes on; the bar folds into the round button while one reads, so the reader has the whole height (and nothing is under it)', rd.open && rd.still && rd.title === playingTitle && rd.barBottom === 0 && rd.readerBottom === rd.vh && rd.text && await J(`document.body.classList.contains('pl-folded') && getComputedStyle(document.querySelector('#plMini')).display==='flex'`), rd);
  ok('the reader of an episode has a "播放这一集" button', rd.playBtn, rd);
  await c.shot(require('../paths').SHOTS + '/pod_reading.png');
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);
  ok('closing the reader leaves it playing', await J(`!plAudio.paused && document.querySelector('#reader').hidden`));

  // ================================================ F. the sleep timer and "end of this episode"
  await J(`document.querySelector('[data-pl="menu"]').click()`); await sleep(300);
  await J(`document.querySelector('[data-plsleep="-1"]').click()`); await sleep(200);
  ok('"本集结束" is set (pressed)', await J(`document.querySelector('[data-plsleep="-1"]').getAttribute('aria-pressed')`) === 'true' && await J(`pl.sleepEnd`));
  await J(`document.querySelector('[data-plp="collapse"]').click()`); await sleep(200);
  const curId = await J(`pl.q[pl.i]`);
  await J(`plAudio.currentTime=plAudio.duration-0.5`); await sleep(2500);
  ok('at the end of this episode it stops: paused, still the same episode, the next one did not start', await J(`plAudio.paused && pl.q[pl.i]`) === curId && await J(`!pl.sleepEnd`), [await J(`plAudio.paused`), await J(`pl.q[pl.i]===${JSON.stringify(curId)}`)]);
  await J(`document.querySelector('[data-pl="menu"]').click()`); await sleep(300);
  await J(`document.querySelector('[data-plsleep="15"]').click()`); await sleep(200);
  const sl = await J(`({at:pl.sleepAt-Date.now(), min:pl.sleepMin})`);
  ok('a 15-minute timer is set', sl.min === 15 && sl.at > 14 * 60000 && sl.at <= 15 * 60000, sl);
  await J(`pl.sleepAt=Date.now()-1; plAudio.currentTime=0; plAudio.play()`); await sleep(1800);
  ok('when the time is up the sound is paused and the page says so', await J(`plAudio.paused && pl.sleepAt===0`) && /到时间了/.test(await J(`document.querySelector('#toastMsg').textContent`)), await J(`document.querySelector('#toastMsg').textContent`));
  await J(`document.querySelector('[data-plp="collapse"]').click()`);

  // ================================================ G. the place of each episode, across a reload
  const e2 = await ep(2);
  await J(`plPlay(${JSON.stringify(e2)})`); await waitFor(`!plAudio.paused && plAudio.currentTime>2.2`, 9000);
  await J(`plAudio.pause()`); await sleep(400);
  const place = await J(`({p:LS.get('plProg',{})[${JSON.stringify(e2)}], saved:LS.get('pl',{})})`);
  ok('pausing keeps the place of the episode and the list (this browser only)', place.p && place.p[0] >= 2 && place.saved.cur === e2 && place.saved.t >= 2 && place.saved.q.length === 3 && place.saved.rate === 1.5, place);
  await c.goto(BASE, 2500);
  const back = await J(`({shown:!document.querySelector('#player').hidden, title:document.querySelector('#plTitle').textContent, paused:plAudio.paused, src:plAudio.getAttribute('src'), sub:document.querySelector('#plSub').textContent, prog:Math.round(parseFloat(((${card(2)}.querySelector('.cover .prog')||{style:{}}).style.width)||'0'))})`);
  ok('after a reload the bar is back with the same episode, paused at its place, and nothing was fetched yet', back.shown && /^Ep 2/.test(back.title) && back.paused && !back.src && /0:0[2-4] \/ 0:08/.test(back.sub), back);
  ok('the episode’s card shows how far it was heard', back.prog >= 20 && back.prog <= 60, back.prog);
  await fetch(POD + '/__reset');
  await J(`document.querySelector('#plToggle').click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.1`, 9000);
  const resumed = await J(`({t:plAudio.currentTime, rate:plAudio.playbackRate})`);
  ok('"play" then loads it and picks up a little before where it was left, at the speed that was chosen', resumed.t >= 1 && resumed.t <= 6 && resumed.rate === 1.5, resumed);
  ok('only now was the sound asked for', (await podLog()).length >= 1);

  // ================================================ H. a sound that is gone
  const e0 = await ep(0);
  await J(`plPlay(${JSON.stringify(e0)})`); await sleep(4000);
  const gone = await J(`({msg:document.querySelector('#toastMsg').textContent, act:document.querySelector('#toastAct').textContent, loaded:pl.loaded})`);
  ok('an episode whose sound is gone: the page says it cannot be played here and offers the original; it does not play on in silence', /放不了/.test(gone.msg) && gone.act === '打开原站' && gone.loaded === '', gone);
  ok('and the message names the server the sound came from and what the browser said (so that a reader can tell where it failed), after one more try of the same sound', /放不了[^·]*· 127\.0\.0\.1 · /.test(gone.msg) && /(网络连不上|声音文件有问题|浏览器不接受)/.test(gone.msg), gone.msg);

  // ================================================ I. an older subscription learns where the sounds are
  await J(`(async()=>{ for(const it of state.items.filter(x=>x.id.startsWith('local:feed:'))){ delete it.audio; delete it.image; const rec={...it}; delete rec.source; await idb.put(rec); } })()`);
  await J(`refreshSubs({force:true})`); await sleep(4500);
  ok('a subscription from before podcasts: the next reading gives its episodes their sound again', await J(`state.items.filter(x=>x.id.startsWith('local:feed:') && x.audio && x.audio.url).length`) === 4);

  // ================================================ J. the list, removing, closing
  await J(`document.querySelector('[data-pl="menu"]').click()`); await sleep(300);
  const n0 = await J(`document.querySelectorAll('#plList li[data-plid]').length`);
  await J(`document.querySelector('#plList li:last-child [data-plrm]').click()`); await sleep(300);
  ok('an episode can be taken out of the list', await J(`document.querySelectorAll('#plList li[data-plid]').length`) === n0 - 1, [n0, await J(`document.querySelectorAll('#plList li[data-plid]').length`)]);
  const nq = await J(`pl.q.length`);
  await J(`document.querySelector('#plClear').click()`); await sleep(400);
  ok('"清空" empties the list, stops the sound and takes the bar away, and the popup is folded', await J(`document.querySelector('#player').hidden && !document.body.classList.contains('has-player') && !plAudio.getAttribute('src') && pl.q.length===0 && LS.get('pl',{}).q.length===0 && !document.querySelector('#plDlg').open`));
  ok('...and the page offers to take it back (撤销)', await J(`document.querySelector('#toastAct').textContent`) === '撤销', await J(`document.querySelector('#toastAct').textContent`));
  await J(`document.querySelector('#toastAct').click()`); await sleep(400);
  ok('撤销 brings the list back, with the bar, paused', await J(`pl.q.length`) === nq && await J(`!document.querySelector('#player').hidden && plAudio.paused`), [nq, await J(`pl.q.length`)]);
  await J(`document.querySelector('[data-pl="menu"]').click()`); await sleep(300);
  await J(`document.querySelector('#plShut').click()`); await sleep(400);
  ok('"×" (close the player) stops it and takes the bar away (the page gets its room back), and the list is kept for the next song', await J(`document.querySelector('#player').hidden && !document.body.classList.contains('has-player') && !plAudio.getAttribute('src') && pl.q.length===${nq} && LS.get('pl',{}).q.length===${nq} && LS.get('pl',{}).closed===1 && !document.querySelector('#plDlg').open`));

  // ================================================ K. English
  await fresh('en'); await subscribe();
  await J(`${card(3)}.querySelector('.cover .play').click()`); await waitFor(`!plAudio.paused`);
  ok('English: the bar says "Pause", the card says "Podcast", the cover button "Play this episode"', await J(`document.querySelector('#plToggle').getAttribute('aria-label')`) === 'Pause' && /Podcast/.test(await J(`${card(3)}.textContent`)) && await J(`${card(3)}.querySelector('.cover .play').getAttribute('aria-label')`) === 'Play this episode');

  // ================================================ L. a phone
  await c.mobile(390, 844, 2);
  await fresh('zh'); await subscribe();
  await J(`${card(3)}.querySelector('.cover .play').click()`); await waitFor(`!plAudio.paused`);
  const ph = await J(`(()=>{ const p=document.querySelector('#player').getBoundingClientRect(); const btns=[...document.querySelectorAll('#player .pl-btn')].filter(b=>b.offsetParent!==null).map(b=>{ const r=b.getBoundingClientRect(); return [Math.round(r.width),Math.round(r.height)]; });
    const title=document.querySelector('#plTitle').getBoundingClientRect(); const last=[...document.querySelectorAll('#grid .card')].pop().getBoundingClientRect();
    return {x:document.documentElement.scrollWidth-document.documentElement.clientWidth, left:Math.round(p.left), right:Math.round(p.right), bottom:Math.round(p.bottom), vh:innerHeight, vw:innerWidth, btns, titleW:Math.round(title.width), pad:parseFloat(getComputedStyle(document.body).paddingBottom), cover:Math.round(document.querySelector('#plCover').getBoundingClientRect().height)}; })()`);
  ok('phone: the bar fits the screen edge to edge at the bottom, every button is at least 42×44, the title still has room, the page keeps room under its last card, nothing scrolls sideways', ph.x <= 1 && ph.left === 0 && ph.right === ph.vw && ph.bottom === ph.vh && ph.btns.every(([w, h]) => w >= 42 && h >= 44) && ph.titleW >= 90 && ph.pad >= 72, ph);
  await J(`document.querySelector('[data-pl="menu"]').click()`); await sleep(400);
  await J(`document.querySelector('[data-plp="set"]').click()`); await sleep(200);
  const sh = await J(`(()=>{ const d=document.querySelector('#plDlg .plp-in').getBoundingClientRect(); return {l:Math.round(d.left), r:Math.round(d.right), b:Math.round(d.bottom), vw:innerWidth, vh:innerHeight, chips:[...document.querySelectorAll('#plDlg .pl-chips button')].map(b=>Math.round(b.getBoundingClientRect().height)), x:document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()`);
  ok('phone: the sheet fits the screen and its buttons are at least 44px high', sh.l >= 0 && sh.r <= sh.vw && sh.b <= sh.vh && sh.chips.every(h => h >= 44) && sh.x <= 1, sh);
  await c.shot(require('../paths').SHOTS + '/pod_phone_sheet.png');
  await J(`document.querySelector('[data-plp="collapse"]').click()`); await sleep(300);
  await c.shot(require('../paths').SHOTS + '/pod_phone.png');
  await c.desktop(1280, 900, 1);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
