// "Wait until the page is quiet" instead of a fixed time.
//   const settle = await require('../settle')(c);      c: the client of cdp.js, once per file (a second browser gets its own: settleB = await require('../settle')(B))
//   await settle(2500);                                 at most 2.5 s: back as soon as nothing in the page (nor in its frames) has changed and no request has been on its way for a short while, never later
// Quiet means: no change of the page's DOM (a MutationObserver in the page and in every frame, the reader's included) and no request in flight (CDP Network; one that has been on its way for more than 2 s is held or
// hanging on purpose, a test waits for that by a condition of its own, and it does not count), for about a fifth of the time asked for (0.3 to 0.8 s);
// (the time of the last change is read from performance.timeOrigin + performance.now(), not from Date: a test may have put another clock in the page, as s_first does)
// it also never answers before that much time has passed, so that what the page does a few hundred ms later (a debounce, a timer) is not looked at before it happened. A page that never gets quiet (a sound is
// playing, a request is held) is waited for the whole time, as with sleep(). Waits that are for a timer of more than a second, or for a fixed time on purpose, stay sleep().
const { sleep } = require('./cdp');
const WATCH = `(function(){ try{ if(window.__ztqOn) return; window.__ztqOn=1; var t=function(){ try{ top.__ztq=Math.round(performance.timeOrigin+performance.now()); }catch(e){ window.__ztq=Math.round(performance.timeOrigin+performance.now()); } }; t(); new MutationObserver(t).observe(document,{subtree:true,childList:true,attributes:true,characterData:true}); }catch(e){} })();`;

module.exports = async function settler(c) {
  const open = new Map(); let lastNet = Date.now();                                       // (the requests that are on their way: id -> when it began)
  c.on(m => {
    if (m.method === 'Network.requestWillBeSent') { open.set(m.params.requestId, Date.now()); lastNet = Date.now(); }
    else if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') { open.delete(m.params.requestId); lastNet = Date.now(); }
  });
  const busy = () => { const now = Date.now(); let n = 0; for (const t of open.values()) if (now - t < 2000) n++; return n; };
  await c.send('Network.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH });             // (every page that is opened from now on)
  await c.js(WATCH).catch(() => {});                                                     // (the page that is open now)
  return async function settle(max) {
    const quiet = Math.min(800, Math.max(300, Math.round(max * 0.2))), t0 = Date.now();
    let why = 'not asked';
    const done = how => { const w = Date.now() - t0; STATS.calls++; STATS.max += max; STATS.waited += w; if (how === 'time') { STATS.full++; STATS.fullMax += max; if (process.env.E2E_SETTLE_STATS === '2' && STATS.full <= 6) console.log(`settle(${max}) went to the end: ${why}`); } return w; };
    for (;;) {
      await sleep(40);
      const now = Date.now();
      if (now - t0 >= max) { done('time'); return; }
      if (now - t0 < quiet) continue;
      const n = busy(); if (n > 0) { why = n + ' request(s) in flight'; continue; }
      let last = 0; try { last = await c.js('window.__ztq||0'); } catch (e) { why = 'cannot ask the page: ' + String(e.message).slice(0, 60); continue; }          // (a page that is being replaced: ask again)
      why = `last change ${last ? now - last : 'never seen'} ms ago, last request ${now - lastNet} ms ago`;
      if (last && now - last >= quiet && now - lastNet >= quiet) { done('quiet'); return; }
    }
  };
};
// E2E_SETTLE_STATS=1: when the test ends, how many waits there were, how much time they were allowed and how much they took, and how many went to the end (a page that never gets quiet)
const STATS = { calls: 0, max: 0, waited: 0, full: 0, fullMax: 0 };
if (process.env.E2E_SETTLE_STATS) process.on('exit', () => console.log(`settle: ${STATS.calls} waits, allowed ${Math.round(STATS.max / 1000)} s, took ${Math.round(STATS.waited / 1000)} s; ${STATS.full} went to the end (allowed ${Math.round(STATS.fullMax / 1000)} s)`));
