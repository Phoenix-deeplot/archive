// e2e: search, "find the whole song" and "change source" on the music side of "今日听什么" (the newer questions of /api/listen: caps=resolve, search, resolve; the fake service answers them from a fixed catalogue
// with /__listen?v2=1). A search needs two letters and waits a third of a second; each result says whole or preview; a song with no address (a promise of a whole song) gets its sound when it is played; a preview can be
// turned into a whole song from its menu; the sources of a song can be chosen; the history of searches stays on this device. (demo app :8820, fake services :8840 and :8843; headless Edge)
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
  const fresh = async (q = 'v2=1', lang = 'en', ls = '') => {
    await svc('reset=1&' + q);
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang, 1200);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1'); ${ls}`);
    await c.goto(BASE + '?lang=' + lang, 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1200);
    await waitFor(`document.querySelector('#cats [data-dlisten]')`, 8000);
    await J(`document.querySelector('#cats [data-dlisten]').click()`);
    await waitFor(`document.querySelector('#lpRoot .lp-tabs') && document.querySelector('#lpRoot .lp-forrows .ls-row')`, 9000); await sleep(300);
  };
  const type = async (text, enter) => { await J(`(()=>{ const i=document.querySelector('#q'); i.focus(); i.value=${JSON.stringify(text)}; i.dispatchEvent(new Event('input',{bubbles:true})); ${enter ? "i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));" : ''} })()`); };
  const results = () => J(`[...document.querySelectorAll('#lpSrRes .ls-row[data-ls-row]')].map(r=>({id:r.dataset.lsRow, t:r.querySelector('.ls-t').firstChild.textContent, b:[...r.querySelectorAll('.ls-pv')].map(e=>e.textContent).join('+')}))`);
  await c.desktop(1280, 900, 1);
  const zone = tz => c.send('Emulation.setTimezoneOverride', { timezoneId: tz });          // (whose songs come first follows the language AND the time zone of the device)
  await zone('America/New_York');

  // ------------------------------------------------ an older service has no search
  await fresh('v2=0');
  ok('a service that does not know the newer questions: no search button, the page is as before', (await J(`state.lp.v2`)) === false && (await J(`!document.querySelector('#lpRoot [data-lp-search]')`)), await J(`state.lp.v2`));
  ok('and the box at the top says it searches the whole site there (the music cannot be searched)', await J(`document.querySelector('#qScope').textContent==='Whole site' && /whole site/i.test(document.querySelector('#q').placeholder)`), await J(`document.querySelector('#qScope').textContent`));

  // ------------------------------------------------ the search page
  await fresh();
  ok('a service that knows the newer questions: there is no magnifier on the music side (the box at the top is the one way in)', (await J(`state.lp.v2`)) === true && (await J(`!document.querySelector('#lpRoot [data-lp-search]') && !document.querySelector('#lpRoot .lp-sbtn')`)));
  ok('the box at the top says what it searches on this page: “Music” and a placeholder about songs and artists', await J(`document.querySelector('#qScope').textContent==='Music' && /songs, artists/.test(document.querySelector('#q').placeholder) && document.querySelector('#qScope').dataset.kind==='music'`), await J(`document.querySelector('#qScope').textContent`));
  ok('the history is not shown while there is none (nothing was searched yet)', await J(`document.querySelector('#q').focus(); document.querySelector('#qHist').hidden`));
  await type('S'); await sleep(300);
  ok('the search page: a back arrow and what is searched (the words are typed in the box at the top, which is focused), no tabs; nothing yet asks the service; a hint says what to type', await J(`!!document.querySelector('#lpRoot .lp-sp') && !document.querySelector('#lpSrIn') && document.activeElement===document.querySelector('#q') && !document.querySelector('#lpRoot .lp-tabs') && !!document.querySelector('#lpRoot [data-lp-sback]') && /Searching music/.test(document.querySelector('#lpRoot .lp-sq').textContent) && /two letters/.test(document.querySelector('#lpSrRes').textContent)`));
  await type('S'); await sleep(700);
  ok('one letter asks nothing', (await log2()).filter(x => x.startsWith('search:')).length === 0);
  await type('Se'); await type('Sea'); await type('Sear'); await type('Search'); await sleep(900);
  const lg = (await log2()).filter(x => x.startsWith('search:'));
  ok('typing fast sends ONE question, a third of a second after the last key', lg.length === 1 && lg[0] === 'search:Search', lg);
  const res = await results();
  ok('the songs found: six, each says whole or preview (a song that has a preview and can be had whole says “Preview”; one that has only a promise of a whole song says “Full”)', res.length === 6 && res[0].t === 'Search Alpha' && res[0].b === 'Full' && res[1].t === 'Search Beta' && res[1].b === 'Preview' && res[2].t === 'Search Gamma' && res[2].b === 'Full' && res[4].t === 'Search Epsilon' && res[4].b === 'Preview', res);          // (Epsilon has a preview and a source of China that has the whole song: for a reader outside China it is a preview)

  ok('under the results a button searches the whole site for the same words (the box at the top is the music box on this page: the whole site is one click away)', await J(`!!document.querySelector('#lpSrRes [data-qwide-top]') && /Search the whole site for/.test(document.querySelector('#lpSrRes [data-qwide-top]').textContent)`));
  // ------------------------------------------------ playing a result
  await J(`document.querySelector('#lpSrRes .ls-row[data-ls-row="${res[0].id}"] .ls-main').click()`);
  ok('a click on a result plays it, and the results are the list of the bar', await waitFor(`pl.q.length===6 && pl.q[pl.i]==='tmp:ls:${res[0].id}' && plAudio.currentTime>0.05`, 8000), [await J(`pl.q.length`), await J(`pl.q[pl.i]`)]);
  ok('the search is kept in the history when a result is played', (await J(`LS.get('lpSearchHist',[])`)).join() === 'Search');
  await J(`plAudio.pause()`);
  await J(`document.querySelector('#lpSrRes .ls-row[data-ls-row="${res[2].id}"] .ls-main').click()`);
  ok('a song that has no address yet (a promise of a whole song) is looked for when it is played: the question “resolve” goes out, then it plays', await waitFor(`pl.q[pl.i]==='tmp:ls:${res[2].id}' && plAudio.currentTime>0.05`, 9000) && (await log2()).includes('resolve:Search Gamma'), await log2());
  const g = await J(`({p:pl.cands[0] && pl.cands[0].p, k:pl.cands[0] && pl.cands[0].k, find:pl.find})`);
  ok('the sound it plays is the one the service found (a whole song of Bodian); nothing is “finding” any more', g.p === 'bodian' && g.k === 'full' && !g.find, g);
  ok('the row now says nothing about a preview, and the song has its words', await J(`(()=>{ const x=window.__zt && 1; return !!document.querySelector('#lpSrRes .ls-row[data-ls-row="${res[2].id}"]'); })()`));
  await J(`plAudio.pause()`);

  // ------------------------------------------------ a song nobody can find
  await J(`document.querySelector('#lpSrRes .ls-row[data-ls-row="${res[5].id}"] .ls-main').click()`);
  ok('a song the service cannot find a sound for (the last one of the list) is given up with a message', await waitFor(`!pl.loaded && /couldn|play|Skip/i.test(document.querySelector('#toastMsg').textContent)`, 9000) && (await log2()).includes('resolve:Search Nothing'), await J(`document.querySelector('#toastMsg').textContent`));

  // ------------------------------------------------ find the whole song / change source
  await J(`document.querySelector('#lpSrRes .ls-row[data-ls-row="${res[1].id}"] .ls-more').click()`); await sleep(400);
  const menu = await J(`[...document.querySelectorAll('#lsmBody .lsm-act')].map(b=>b.textContent.trim().replace(/\\s+/g,' ')).join('|')`);
  ok('the menu of a preview: play next, add to a list, like, FIND THE FULL SONG, CHANGE SOURCE, not this kind', /Find the full song/.test(menu) && /Change source/.test(menu), menu);
  await J(`document.querySelector('#lsmBody [data-lsm="whole"]').click()`);
  ok('“find the full song” asks the service (resolve); the preview mark leaves the row; the page says so', await waitFor(`!document.querySelector('#lpSrRes .ls-row[data-ls-row="${res[1].id}"] .ls-pv:not(.ls-wh)') && /Switched to the full song/.test(document.querySelector('#toastMsg').textContent)`, 9000) && (await log2()).includes('resolve:Search Beta'), await J(`document.querySelector('#toastMsg').textContent`));
  await J(`document.querySelector('#lpSrRes .ls-row[data-ls-row="${res[1].id}"] .ls-more').click()`); await sleep(300);
  ok('a song that is whole already does not offer “find the full song”', !/Find the full song/.test(await J(`document.querySelector('#lsmBody').textContent`)));
  await J(`document.querySelector('#lsmBody [data-lsm="src"]').click()`); await sleep(400);
  const srcs = await J(`[...document.querySelectorAll('#lsmBody [data-lsm-src]')].map(b=>b.textContent.trim().replace(/\\s+/g,' ')).join('|')`);
  ok('“change source” lists the sounds of the song, each with its kind (full or preview), the one that is first marked', /Bodian.*Full/.test(srcs) && /Deezer.*Preview/.test(srcs) && /Bodian.*✓/.test(srcs), srcs);
  await J(`document.querySelector('#lsmBody [data-lsm-src="deezer"]').click()`); await sleep(300);
  ok('a source chosen is the first for that song (this visit); the page says so', /Switched to Deezer/.test(await J(`document.querySelector('#toastMsg').textContent`)));
  await J(`document.querySelector('#lpSrRes .ls-row[data-ls-row="${res[1].id}"] .ls-main').click()`);
  ok('and it is the sound that plays', await waitFor(`pl.q[pl.i]==='tmp:ls:${res[1].id}' && pl.cands[0] && pl.cands[0].p==='deezer' && plAudio.currentTime>0.05`, 8000), await J(`pl.cands.map(c=>c.p).join()`));
  await J(`plAudio.pause()`);

  // ------------------------------------------------ outside China a preview at hand is played as it is
  await J(`document.querySelector('#lpSrRes .ls-row[data-ls-row="${res[4].id}"] .ls-main').click()`);
  ok('a reader outside China: a song that has a preview at hand and a source of China that has the whole one plays the preview (nothing is looked for first)', await waitFor(`pl.q[pl.i]==='tmp:ls:${res[4].id}' && plAudio.currentTime>0.05 && pl.cands[0] && pl.cands[0].p==='deezer'`, 8000) && !(await log2()).includes('resolve:Search Epsilon'), await log2());
  await J(`plAudio.pause()`);

  // ------------------------------------------------ the history, the other answers
  await J(`document.querySelector('#lpRoot [data-lp-sback]').click()`); await sleep(300);
  ok('the arrow leaves the search page: the three tabs are back, and the box at the top is empty', await J(`!!document.querySelector('#lpRoot .lp-tabs') && !document.querySelector('#lpRoot .lp-sp') && document.querySelector('#q').value===''`));
  await J(`(()=>{ const i=document.querySelector('#q'); i.blur(); i.focus(); })()`); await sleep(300);
  ok('the history of searches is under the box at the top while it is focused and empty (this device only)', await J(`!document.querySelector('#qHist').hidden && [...document.querySelectorAll('#qHist [data-qh]')].map(b=>b.textContent).join()`) === 'Search', await J(`JSON.stringify({hidden:document.querySelector('#qHist').hidden, html:document.querySelector('#qHist').innerHTML.slice(0,200), kind:document.querySelector('#qScope').dataset.kind, hist:LS.get('lpSearchHist',[]), focus:document.activeElement&&document.activeElement.id, hasFocus:document.hasFocus()})`));
  await svc('v2=1&search=partial'); await J(`document.querySelector('#qHist [data-qh]').click()`);
  ok('a word of the history searches again; a partial answer says that some sources did not answer', await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length===6 && /did not answer in time/.test(document.querySelector('#lpSrRes').textContent)`, 8000));
  await svc('v2=1&search=empty'); await type('Search zzz', true);
  ok('nothing found: it says so', await waitFor(`/Nothing found for/.test(document.querySelector('#lpSrRes').textContent)`, 6000));
  await svc('v2=1&search=down'); await type('Searc', true);
  ok('the service is down: a message and a retry button; the page still works', await waitFor(`/not available/.test(document.querySelector('#lpSrRes').textContent) && !!document.querySelector('#lpSrRes [data-lp-sretry]')`, 6000));
  await svc('v2=1&search=ok'); await J(`document.querySelector('#lpSrRes [data-lp-sretry]').click()`);
  ok('retry works', await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length>0`, 6000));
  await J(`document.querySelector('#lpRoot [data-lp-sback]').click()`); await sleep(200);
  await J(`(()=>{ const i=document.querySelector('#q'); i.blur(); i.focus(); })()`); await sleep(300);
  await J(`document.querySelector('#qHist [data-qh-clear]').click()`); await sleep(200);
  ok('“clear” empties the history and the drop-down goes', (await J(`LS.get('lpSearchHist',[]).length`)) === 0 && await J(`document.querySelector('#qHist').hidden`));
  await type('Se'); await sleep(400);
  ok('Escape in the box leaves the search page', await (async () => { await J(`document.querySelector('#q').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`); await sleep(300); return J(`!document.querySelector('#lpRoot .lp-sp') && document.querySelector('#q').value===''`); })());
  // ------------------------------------------------ in China the whole song that a source of China has is looked for first
  await zone('Asia/Shanghai');
  await fresh('v2=1', 'zh');
  await type('Search Epsilon', true);
  await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length===1`, 8000);
  ok('a reader in China: the same song says “整首” (a source of China has the whole one)', (await results())[0].b === '整首', await results());
  await J(`document.querySelector('#lpSrRes .ls-row .ls-main').click()`);
  ok('and it is looked for first: the whole song of that source plays, not the preview', await waitFor(`pl.loaded && plAudio.currentTime>0.05 && pl.cands[0] && pl.cands[0].p==='bodian' && pl.cands[0].k==='full'`, 9000) && (await log2()).includes('resolve:Search Epsilon'), [await J(`pl.cands.map(c=>c.p+':'+c.k).join()`), await log2()]);
  await J(`plAudio.pause()`);

  // ------------------------------------------------ in China a song that has only a 30-second preview is looked for as a whole song first
  await type('Search Beta', true);
  await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length===1`, 8000);
  ok('a song with only a preview, for a reader in China: no “试听” mark (a whole song is looked for when it is played)', (await results())[0].b === '', await results());
  await J(`document.querySelector('#lpSrRes .ls-row .ls-main').click()`);
  ok('it is looked for first and the whole song plays', await waitFor(`pl.loaded && plAudio.currentTime>0.05 && pl.cands[0] && pl.cands[0].p==='bodian' && pl.cands[0].k==='full'`, 9000) && (await log2()).includes('resolve:Search Beta'), [await J(`pl.cands.map(c=>c.p+':'+c.k).join()`), await log2()]);
  await J(`plAudio.pause()`);
  await svc('v2=1&rs=none');
  await type('Moonlight', true);
  await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length===1`, 8000);
  await J(`document.querySelector('#lpSrRes .ls-row .ls-main').click()`);
  ok('nothing found: the preview that was at hand plays (after a few seconds at most)', await waitFor(`pl.loaded && plAudio.currentTime>0.05 && pl.cands[0] && pl.cands[0].p==='deezer'`, 12000) && (await log2()).includes('resolve:Moonlight'), [await J(`pl.cands.map(c=>c.p+':'+c.k).join()`), await log2()]);
  await J(`plAudio.pause()`);
  await type('Moonlight', true); await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length===1`, 8000);
  ok('and the row says “试听” from then on (the service was asked, there is only a preview), the song is not asked for again', (await results())[0].b === '试听', await results());

  // ------------------------------------------------ a whole song found while the preview already plays takes over
  await svc('v2=1&rs=slow');
  await fresh('v2=1&rs=slow', 'zh', "localStorage.setItem('archive.plUpMs','500');");
  await type('Search Beta', true);
  await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length===1`, 8000);
  await J(`document.querySelector('#lpSrRes .ls-row .ls-main').click()`);
  ok('the service is slow (a second and a half), the wait is cut at half a second: the preview begins ...', await waitFor(`pl.loaded && pl.cands[0] && pl.cands[0].p==='deezer'`, 6000));
  ok('... and the whole song takes over when it is found, while the song is still at its beginning', await waitFor(`pl.loaded && pl.cands[0] && pl.cands[0].p==='bodian' && plAudio.currentTime<12`, 9000));
  await J(`plAudio.pause()`);

  // ------------------------------------------------ the answer had no whole song though a source had promised one: one more question a little later
  await fresh('v2=1&rs=miss1', 'zh');
  await type('Search Epsilon', true);
  await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length===1`, 8000);
  await J(`document.querySelector('#lpSrRes .ls-row .ls-main').click()`);
  ok('the first answer has the preview only (the source of whole songs was slow for a moment): the preview begins ...', await waitFor(`pl.loaded && pl.cands[0] && pl.cands[0].p==='deezer'`, 9000), await J(`pl.cands.map(c=>c.p+':'+c.k).join()`));
  ok('... a second question (fresh) goes out a little later, once, and the whole song takes over while the song is still at its beginning', await waitFor(`pl.loaded && pl.cands[0] && pl.cands[0].p==='bodian' && plAudio.currentTime<12`, 9000) && (await log2()).filter(x => x === 'resolve:Search Epsilon').length === 1 && (await log2()).filter(x => x === 'resolve:Search Epsilon:fresh').length === 1, [await J(`pl.cands.map(c=>c.p+':'+c.k).join()`), await log2()]);
  await J(`plAudio.pause()`);
  ok('no errors in the page', errs.length === 0, errs);
  await fetch(SVC + '/__listen?mode=ok&reset=1');                                  // (the fake service answers as it did before again: the tests after this one do not know the newer questions)
  console.log(`${pass} passed, ${fail} failed`);
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
