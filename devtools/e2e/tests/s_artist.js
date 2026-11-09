// e2e: the artist of a search on the music side of "今日听什么" (the fake service knows the artist 测试歌手 under three spellings): a card (name, other names, play all, save as a play list), the best songs of
// every source as one list (each row says where the song can be heard from, a preview marked), the play lists that go with the name (their songs open under the artist, with an arrow back), and what the page does
// when the page of the artist cannot be read. (demo app :8820, fake services :8840 and :8843; headless Edge)
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
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* the page is busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(100); } };
  const svc = q => fetch(SVC + '/__listen?mode=ok&' + q).then(r => r.json());
  const log2 = () => fetch(SVC + '/__listen_log2').then(r => r.json());
  const fresh = async (q = 'v2=1') => {
    await svc('reset=1&' + q);
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=en', 1200);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1');`);
    await c.goto(BASE + '?lang=en', 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1200);
    await waitFor(`document.querySelector('#cats [data-dlisten]')`, 8000);
    await J(`document.querySelector('#cats [data-dlisten]').click()`);
    await waitFor(`document.querySelector('#lpRoot .lp-tabs') && document.querySelector('#lpRoot .lp-forrows .ls-row')`, 9000); await sleep(300);
  };
  const type = async (text, enter) => { await J(`(()=>{ const i=document.querySelector('#q'); i.focus(); i.value=${JSON.stringify(text)}; i.dispatchEvent(new Event('input',{bubbles:true})); ${enter ? "i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));" : ''} })()`); };
  await c.desktop(1280, 900, 1);

  await fresh();
  await type('测试歌手', true);
  ok('the words name an artist: a card on top with the name', await waitFor(`!!document.querySelector('#lpSrRes .lp-art') && document.querySelector('#lpSrRes .lp-art b').textContent==='测试歌手'`, 9000), await J(`document.querySelector('#lpSrRes').textContent.slice(0,120)`));
  ok('the page of the artist is asked for once (by the name the search gave)', await waitFor(`document.querySelectorAll('#lpSrRes .lp-art-h').length>=1`, 9000) && (await log2()).filter(x => x === 'artist:测试歌手').length === 1, await log2());
  ok('the card says the other names of the artist and has two buttons: play all, save as a play list', await J(`(()=>{ const a=document.querySelector('#lpSrRes .lp-art'); return /Test Singer/.test(a.querySelector('.lp-art-n').textContent) && /測試歌手/.test(a.querySelector('.lp-art-n').textContent) && !!a.querySelector('[data-lp-artplay]') && !!a.querySelector('[data-lp-artsave]') && !!a.querySelector('.lp-art-cv img'); })()`));
  const rows = await J(`[...document.querySelectorAll('#lpSrRes .lp-srrows .ls-row')].map(r=>({t:r.querySelector('.ls-t').firstChild.textContent, m:r.querySelector('.ls-m').textContent}))`);
  ok('the best songs: four, each says where it can be heard from; a preview is marked (a song with a whole source and a preview, a preview only ...)', rows.length === 4 && /波点音乐/.test(rows[0].m) && /Deezer \(preview\)/.test(rows[0].m) && /Deezer \(preview\)/.test(rows[1].m) && !/波点/.test(rows[1].m) && /Audius/.test(rows[2].m) && !/preview/.test(rows[2].m), rows);
  ok('the play lists of the artist: two tiles under the songs', await J(`document.querySelectorAll('#lpSrRes [data-lp-pl]').length===2 && /play lists/i.test(document.querySelector('#lpSrRes').textContent)`));

  // ---- play all, save as a play list
  await J(`document.querySelector('#lpSrRes [data-lp-artplay]').click()`);
  ok('“Play all” plays the first song with the songs of the artist as the list of the bar', await waitFor(`pl.q.length===4 && pl.q[pl.i]==='tmp:ls:sr:08'`, 9000), [await J(`pl.q.length`), await J(`pl.q[pl.i]`)]);
  await J(`plAudio.pause()`);
  await J(`document.querySelector('#lpSrRes [data-lp-artsave]').click()`); await sleep(400);
  const saved = await J(`(()=>{ const a=JSON.parse(localStorage.getItem('archive.lpLists')||'[]'); return a.map(l=>({name:l.name, n:l.songs.length})); })()`);
  ok('“Save as a play list” makes a list of the songs (nothing was made before this click); the page says so', saved.length === 1 && saved[0].name === '测试歌手 · Top songs' && saved[0].n === 4 && /Saved as the play list/.test(await J(`document.querySelector('#toastMsg').textContent`)), saved);

  // ---- a play list under the artist
  await J(`document.querySelector('#lpSrRes [data-lp-pl="ne:pl:555"]').click()`);
  ok('a play list of the artist opens under the artist: its name, an arrow back, the songs (asked for with the id of the list)', await waitFor(`document.querySelectorAll('#lpSrRes .lp-srrows .ls-row').length===4 && /测试歌手热门单曲/.test(document.querySelector('#lpSrRes .lp-secbar').textContent) && !!document.querySelector('#lpSrRes [data-lp-plback]')`, 8000) && (await log2()).includes('plist:ne:pl:555'), await J(`document.querySelector('#lpSrRes').textContent.slice(0,100)`));
  await J(`document.querySelector('#lpSrRes [data-lp-plplay]').click()`);
  ok('“Play all” of the play list plays its songs', await waitFor(`pl.q.length===4 && /tmp:ls:ne:7000/.test(pl.q[pl.i])`, 8000), await J(`pl.q.join()`));
  await J(`plAudio.pause()`);
  await J(`document.querySelector('#lpSrRes [data-lp-plback]').click()`); await sleep(300);
  ok('the arrow goes back to the artist (the card is there again)', await J(`!!document.querySelector('#lpSrRes .lp-art') && !document.querySelector('#lpSrRes [data-lp-plback]')`));

  // ---- the page of the artist cannot be read: the search's own rows are shown, with a word about it
  await fresh('v2=1&artist=down');
  await type('测试歌手', true);
  ok('the page of the artist cannot be read: the card stays, a line says so, and the songs the search found are shown', await waitFor(`!!document.querySelector('#lpSrRes .lp-art') && /cannot be read right now/.test(document.querySelector('#lpSrRes').textContent) && document.querySelectorAll('#lpSrRes .ls-row').length===3`, 9000), await J(`document.querySelector('#lpSrRes').textContent.slice(0,160)`));

  // ---- a name that is not an artist: a plain search
  await svc('v2=1&artist=ok');
  await type('Search Beta', true);
  ok('words that are no artist: the songs only, no card, no page of an artist asked for', await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length===1`, 8000) && !(await J(`!!document.querySelector('#lpSrRes .lp-art')`)) && !(await log2()).some(x => x === 'artist:Search Beta'), await log2());
  ok('a row of a plain search says where the song can be heard from too', await J(`/Deezer \\(preview\\)/.test(document.querySelector('#lpSrRes .ls-row .ls-m').textContent)`), await J(`document.querySelector('#lpSrRes .ls-row .ls-m').textContent`));
  ok('no errors in the page', errs.length === 0, errs);
  await fetch(SVC + '/__listen?mode=ok&reset=1');
  console.log(`${pass} passed, ${fail} failed`);
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
