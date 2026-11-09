// e2e: the box at the top searches what the page is about, and says so (a label in the box and a placeholder): music and podcasts on the listening page (on the page, not in the whole site), the picked
// books, articles and videos in their own section (with a button to search the whole site), the hot lists (what has not the words is hidden), my shelf; only "all" and "discover" search the whole site.
// A podcast search finds shows to listen to or to follow. (demo app :8820, fake services :8840 and :8843; headless Edge)
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };

(async () => {
  const c = await connect(9444, { newShell: true });
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* the page is busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(100); } };
  const svc = q => fetch(SVC + '/__listen?mode=ok&' + q).then(r => r.json());
  const log2 = () => fetch(SVC + '/__listen_log2').then(r => r.json());
  const scope = () => J(`({chip:document.querySelector('#qScope').textContent, kind:document.querySelector('#qScope').dataset.kind, ph:document.querySelector('#q').placeholder, w:Math.round(document.querySelector('#qScope').getBoundingClientRect().width), padL:parseFloat(getComputedStyle(document.querySelector('#q')).paddingLeft)})`);
  const go = async name => { await J(`(()=>{ const b=[...document.querySelectorAll('.cat-btn')].find(x=>(x.textContent||'').trim().startsWith(${JSON.stringify(name)})); b.click(); })()`); await sleep(1800); };
  const type = async (text, enter) => { await J(`(()=>{ const i=document.querySelector('#q'); i.focus(); i.value=${JSON.stringify(text)}; i.dispatchEvent(new Event('input',{bubbles:true})); ${enter ? "i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));" : ''} })()`); };
  await c.desktop(1280, 900, 1);
  await svc('reset=1&v2=1');
  await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=en', 1200);
  await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1');`);
  await c.goto(BASE + '?lang=en', 2500);

  // ------------------------------------------------ my shelf
  const mine = await scope();
  ok('my shelf: the box says “My shelf”', mine.kind === 'mine' && mine.chip === 'My shelf' && /my shelf/i.test(mine.ph), mine);
  ok('the label is inside the box and the words start after it (the box is padded by the width of the label)', mine.w > 20 && mine.padL >= 36 + mine.w, mine);

  // ------------------------------------------------ the public space
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1500);
  const disc = await scope();
  ok('the discovery page searches the whole site', disc.kind === 'all' && disc.chip === 'Whole site' && /whole site/i.test(disc.ph), disc);
  await go('All');
  ok('the whole list searches the whole site', (await scope()).kind === 'all');
  await go('Book picks');
  ok('the picked books: “Books”', await J(`document.querySelector('#qScope').dataset.kind`) === 'books' && /books/i.test(await J(`document.querySelector('#q').placeholder`)), await scope());
  await go('Article picks');
  ok('the picked articles: “Articles”', (await scope()).kind === 'articles' && (await scope()).chip === 'Articles', await scope());
  await go('What to watch');
  ok('videos: “Videos”', (await scope()).kind === 'video' && (await scope()).chip === 'Videos', await scope());

  // ------------------------------------------------ a section keeps its search, and offers the whole site
  await go('Article picks');
  await type('zzzz-no-such-article');
  await waitFor(`state.q==='zzzz-no-such-article' && !document.querySelector('#viewSub .dspans') && /found 0|0 /.test(document.querySelector('#viewSub').textContent)`, 4000);          // (the box waits a moment before it searches; a page that has the time spans says "Only 0 this week" before it does)
  ok('words typed on a section stay in that section (the title is still the section) and a chip offers the whole site', await J(`document.getElementById('viewTitle').textContent==='Article picks' && !!document.querySelector('#viewSub [data-qwide]')`), [await J(`document.getElementById('viewTitle').textContent`), await J(`document.querySelector('#viewSub').textContent`)]);
  await J(`document.querySelector('#viewSub [data-qwide]').click()`); await sleep(1500);
  ok('the chip searches the whole site for the same words: the whole list, the words kept in the box', await J(`document.getElementById('viewTitle').textContent!=='Article picks' && document.querySelector('#q').value==='zzzz-no-such-article' && state.q==='zzzz-no-such-article'`), [await J(`document.getElementById('viewTitle').textContent`), await J(`document.querySelector('#q').value`)]);
  await J(`(()=>{ const i=document.querySelector('#q'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(600);

  // ------------------------------------------------ the hot lists
  await go('Hot lists');
  const hot = await scope();
  ok('the hot lists: “Hot lists”', hot.kind === 'hot' && hot.chip === 'Hot lists', hot);
  const rows0 = await waitFor(`document.querySelectorAll('#dirReco .hot-row').length`, 9000);
  if (rows0) {
    await type('zzzz-nothing-has-this');
    await sleep(500);
    ok('words typed on the hot lists hide what has not the words (the page stays the hot lists, nothing jumps to the whole site) and a line says so', await J(`document.getElementById('viewTitle').textContent==='Hot lists' && [...document.querySelectorAll('#dirReco .hot-row')].every(r=>r.hidden) && !!document.querySelector('#hotQNone')`), await J(`document.getElementById('viewTitle').textContent`));
    await type(''); await sleep(500);
    ok('an empty box shows every entry again', await J(`[...document.querySelectorAll('#dirReco .hot-row')].every(r=>!r.hidden) && !document.querySelector('#hotQNone')`));
  } else console.log('NOTE the hot lists have no entries in this rig: the filter is not tried');

  // ------------------------------------------------ the listening page: music and podcasts
  await go('What to listen to');
  await waitFor(`document.querySelector('#lpRoot .lp-tabs')`, 9000);
  ok('the listening page, music side: “Music”', (await scope()).kind === 'music' && (await scope()).chip === 'Music', await scope());
  await type('Search Alpha', true);
  ok('what is typed there is searched on the page (the songs are shown there, the page is not the whole list)', await waitFor(`document.querySelectorAll('#lpSrRes .ls-row').length>=1 && document.getElementById('viewTitle').textContent!=='All' && !!document.querySelector('#lpRoot .lp-sp')`, 9000), await J(`document.getElementById('viewTitle').textContent`));
  await J(`document.querySelector('#lpRoot [data-lp-sback]').click()`); await sleep(300);
  await J(`document.querySelector('#lpRoot [data-lp-mode="podcast"]').click()`); await sleep(1200);
  const pod = await scope();
  ok('the podcast side: “Podcasts”, a placeholder about the names of shows; the box is empty after the switch', pod.kind === 'podcast' && pod.chip === 'Podcasts' && /show names/i.test(pod.ph) && (await J(`document.querySelector('#q').value`)) === '', pod);
  await type('pod');
  ok('a podcast search finds shows: a row each with the name, who makes it and how many episodes', await waitFor(`document.querySelectorAll('#lpSrRes .ps-row').length===2`, 9000) && (await log2()).includes('psearch:pod') && /Test Podcast Show/.test(await J(`document.querySelector('#lpSrRes .ps-row').textContent`)) && /12 episodes/.test(await J(`document.querySelector('#lpSrRes .ps-row').textContent`)), await J(`document.querySelector('#lpSrRes').textContent.slice(0,140)`));
  ok('under the shows a button searches the whole site for the same words', await J(`!!document.querySelector('#lpSrRes [data-qwide-top]')`));
  const can = await J(`!!document.querySelector('#lpSrRes [data-ps-play]')`);
  if (can) {
    await J(`document.querySelector('#lpSrRes [data-ps-play="0"]').click()`);
    ok('“Listen” plays the newest episode of the show', await waitFor(`pl.q.length===1 && /^tmp:pod:/.test(pl.q[pl.i])`, 9000), await J(`pl.q.join()`));
    await J(`plAudio.pause()`);
  } else console.log('NOTE no feed service in this rig: the buttons of a show are not offered, so they are not tried');
  await type('zzzzz');
  ok('no show: it says so', await waitFor(`/No podcast found/.test(document.querySelector('#lpSrRes').textContent)`, 6000));
  await J(`document.querySelector('#lpSrRes [data-qwide-top]').click()`); await sleep(1500);
  ok('“search the whole site” leaves the listening page for the whole list with the words kept', await J(`!document.querySelector('#lpRoot .lp-sp') && document.querySelector('#q').value==='zzzzz' && state.q==='zzzzz' && (()=>{ const k=document.querySelector('#qScope').dataset.kind; return k==='all'; })()`), [await J(`document.getElementById('viewTitle').textContent`), await J(`document.querySelector('#q').value`), await scope()]);

  // ------------------------------------------------ an older service has no music search: the box searches the whole site there, as before
  await svc('reset=1&v2=0');
  await c.goto(BASE + '?lang=en', 2500);
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1500);
  await go('What to listen to');
  ok('a service that cannot search music: the listening page says “Whole site” (what is typed searches the whole site, as before)', (await scope()).kind === 'all', await scope());

  ok('no errors in the page', errs.length === 0, errs);
  await fetch(SVC + '/__listen?mode=ok&reset=1');
  console.log(`${pass} passed, ${fail} failed`);
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
