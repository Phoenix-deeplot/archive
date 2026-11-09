// A look at the whole thing with the REAL service and the REAL sources (not in the suite: it needs the internet and the answers change):
//   $env:SHELF_DIRECTORY = '<the shelf-directory folder with the new music code>'   (before the rig's fake service is replaced, see devtools/e2e/README.md "the real service")
//   then  /__listen?mode=real&reset=1  and  node devtools/e2e/tests/real_search_smoke.js [word ...]
// For each word: the box at the top says "音乐", the search is made on the page, the artist card (when the words name an artist), the first rows with where each song can be heard from, and the first song is
// played: is it a whole song (longer than a minute) or a preview? Then the first play list under the artist, and a podcast search. (headless Edge, a reader in China)
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/';
(async () => {
  const words = process.argv.slice(2).length ? process.argv.slice(2) : ['周杰伦', '邓紫棋', '陈奕迅'];
  const c = await connect(9444, { newShell: true });
  c.autoDialog(true, []);
  await c.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(150); } };
  await c.desktop(1280, 900, 1);
  await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1200);
  await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1');`);
  await c.goto(BASE + '?lang=zh', 2500);
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1500);
  await waitFor(`document.querySelector('#cats [data-dlisten]')`, 10000);
  await J(`document.querySelector('#cats [data-dlisten]').click()`);
  await waitFor(`document.querySelector('#lpRoot .lp-tabs')`, 15000);
  console.log('the box says:', await J(`document.querySelector('#qScope').textContent + ' | ' + document.querySelector('#q').placeholder`));
  for (const w of words) {
    await J(`(()=>{ const i=document.querySelector('#q'); i.focus(); i.value=${JSON.stringify(w)}; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); })()`);
    await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length>0`, 20000);
    if (!(await J(`document.querySelectorAll('#lpSrRes .ls-row').length`))) { console.log('\n== ' + w + ' ==\nNO ROWS; the page says:', await J(`document.querySelector('#lpSrRes').textContent.slice(0,200)`)); continue; }
    await waitFor(`!!document.querySelector('#lpSrRes .lp-art-h')`, 15000);
    const card = await J(`(()=>{ const a=document.querySelector('#lpSrRes .lp-art'); return a ? {name:a.querySelector('b').textContent, names:(a.querySelector('.lp-art-n')||{textContent:''}).textContent} : null; })()`);
    const rows = await J(`[...document.querySelectorAll('#lpSrRes .lp-srrows .ls-row')].slice(0,6).map(r=>r.querySelector('.ls-t').textContent.replace(/\\s+/g,' ').slice(0,18)+' | '+r.querySelector('.ls-m').textContent.replace(/\\s+/g,' ').slice(0,60))`);
    console.log('\n== ' + w + ' ==\nartist card:', JSON.stringify(card), '\nrows:', await J(`document.querySelectorAll('#lpSrRes .lp-srrows .ls-row').length`), '\nlists:', await J(`[...document.querySelectorAll('#lpSrRes [data-lp-pl]')].map(b=>b.textContent.trim().slice(0,16)).join(' / ')`));
    rows.forEach(r => console.log('  ', r));
    const t0 = Date.now();
    await J(`document.querySelector('#lpSrRes .lp-srrows .ls-row .ls-main').click()`);
    const started = await waitFor(`plAudio.currentTime>0.5 && !plAudio.paused`, 20000);
    const res = await J(`({t:+plAudio.currentTime.toFixed(1), dur:+(plAudio.duration||0).toFixed(0), host:(plAudio.currentSrc||'').split('/')[2], p:(pl.cands[pl.ci]||{}).p, k:(pl.cands[pl.ci]||{}).k})`);
    console.log('  the first song:', started ? 'starts after ' + (Date.now() - t0) + ' ms' : 'DID NOT START', JSON.stringify(res), res.dur > 60 ? '=> a WHOLE song' : '=> a preview at first');
    if (started && res.dur <= 60) {                                                                    // (the whole song takes over while the preview is at its beginning)
      const took = await waitFor(`(plAudio.duration||0)>60`, 14000);
      console.log('  ... a few seconds later:', took ? 'the WHOLE song took over ' + JSON.stringify(await J(`({dur:+(plAudio.duration||0).toFixed(0), t:+plAudio.currentTime.toFixed(1), host:(plAudio.currentSrc||'').split('/')[2], p:(pl.cands[pl.ci]||{}).p})`)) : 'still the preview');
    }
    await J(`plAudio.pause()`);
    await J(`(()=>{ const i=document.querySelector('#q'); i.value=''; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); })()`); await sleep(500);
  }
  // a play list under the first artist
  await J(`(()=>{ const i=document.querySelector('#q'); i.focus(); i.value=${JSON.stringify(words[0])}; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await waitFor(`!!document.querySelector('#lpSrRes [data-lp-pl]')`, 25000);
  await J(`document.querySelector('#lpSrRes [data-lp-pl]').click()`);
  await waitFor(`document.querySelectorAll('#lpSrRes .lp-srrows .ls-row').length>0 || /读不到/.test(document.querySelector('#lpSrRes').textContent)`, 20000);
  console.log('\nthe first play list:', await J(`document.querySelector('#lpSrRes .lp-secbar h3').textContent`), '->', await J(`document.querySelectorAll('#lpSrRes .lp-srrows .ls-row').length`), 'songs');
  // podcasts
  await J(`document.querySelector('#lpRoot [data-lp-sback]').click()`); await sleep(300);
  await J(`document.querySelector('#lpRoot [data-lp-mode="podcast"]').click()`); await sleep(1500);
  await J(`(()=>{ const i=document.querySelector('#q'); i.focus(); i.value='日谈'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await waitFor(`document.querySelectorAll('#lpSrRes .ps-row').length>0`, 20000);
  console.log('\npodcast search 日谈:', await J(`[...document.querySelectorAll('#lpSrRes .ps-row')].slice(0,4).map(r=>r.querySelector('b').textContent+' ('+r.querySelector('.ps-m').textContent+')').join(' / ')`));
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
