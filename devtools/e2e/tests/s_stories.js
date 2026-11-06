// e2e: the story podcasts on the podcast side of "今日听什么" (the lists of the service for a page that sends caps=resolve: by style, hot by platform): they come first in the row of the podcast lists, each is the newest
// episode of each show and plays; a reader of English and an older service do not get them; the group "故事 · 悬疑 · 睡前" of the recommended subscriptions is there and valid.
// (demo app :8820, fake services :8840 and :8843, with /__listen?v2=1; headless Edge)
const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* the page is busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(100); } };
  const svc = q => fetch(SVC + '/__listen?mode=ok&' + q).then(r => r.json());
  const fresh = async (q = 'v2=1', lang = 'zh') => {
    await svc('reset=1&' + q);
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang, 1200);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE + '?lang=' + lang, 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1200);
    await waitFor(`document.querySelector('#cats [data-dlisten]')`, 8000);
    await J(`document.querySelector('#cats [data-dlisten]').click()`);
    await waitFor(`document.querySelector('#lpRoot .lp-tabs')`, 9000); await sleep(300);
  };
  const toPodcasts = async () => { await J(`document.querySelector('#lpRoot [data-lp-mode="podcast"]').click()`); await waitFor(`document.querySelector('#lpRoot .lp-strip')`, 6000); await sleep(300); };
  const strip = () => J(`[...document.querySelectorAll('#lpRoot .lp-strip .lp-ch')].map(b=>b.textContent+(b.getAttribute('aria-pressed')==='true'?'*':''))`);
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ the service has the lists
  await fresh();
  await toPodcasts();
  const st = await strip();
  ok('the podcast side: the top list first, then the story lists (by style, then hot by platform), then the charts of the countries', st.slice(0, 2).join('|').startsWith('热门播客') && st.slice(1, 6).join('|') === '悬疑怪谈|真实罪案|喜马拉雅 · 故事热门|小宇宙 · 故事热门|荔枝FM · 故事热门' && st.indexOf('中国大陆播客榜') > 5, st);
  await J(`[...document.querySelectorAll('#lpRoot .lp-strip .lp-ch')].find(b=>b.textContent==='悬疑怪谈').click()`);
  await waitFor(`document.querySelectorAll('#lpRoot .lp-rows .ls-row, #lpRoot .lp-grid .lp-sc').length>=8`, 8000);
  const items = await J(`[...document.querySelectorAll('#lpRoot .ls-row, #lpRoot .lp-sc')].map(r=>r.textContent.trim().replace(/\\s+/g,' ').slice(0,60))`);
  ok('a list of stories: a row for each show (the newest episode of it), as in the charts of podcasts', items.length === 8 && /Story episode 0 of mystery/.test(items[0]) && /Story show mys0/.test(items[0]), items.slice(0, 2));
  await J(`(document.querySelector('#lpRoot .ls-row .ls-main') || document.querySelector('#lpRoot .lp-sc .lp-cv')).click()`);
  ok('a click plays the episode (whole, from the own server of the show): the bar plays it as an episode, speed and all, and the list of the bar is the list on the screen', await waitFor(`pl.q.length>=8 && plAudio.currentTime>0.05 && !document.body.classList.contains('pl-music')`, 9000), [await J(`pl.q.length`), await J(`plAudio.currentTime`)]);
  await J(`plAudio.pause()`);
  await J(`[...document.querySelectorAll('#lpRoot .lp-strip .lp-ch')].find(b=>/小宇宙/.test(b.textContent)).click()`);
  ok('a hot list of a platform opens too', await waitFor(`/Story episode 0 of hot-xiaoyuzhou/.test(document.querySelector('#lpRoot').textContent)`, 8000));

  // ------------------------------------------------ who does not get them
  await fresh('v2=1', 'en');
  await toPodcasts();
  ok('a reader of English does not get the lists of stories (they are in Chinese)', !(await strip()).some(x => /故事|悬疑|真实罪案/.test(x)), await strip());
  await fresh('v2=0');
  await toPodcasts();
  ok('an older service does not give them: the row of the podcast lists is as it was', !(await strip()).some(x => /悬疑怪谈|故事热门/.test(x)), await strip());

  // ------------------------------------------------ the recommended subscriptions
  const rec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'recommended.json'), 'utf8'));
  const gi = rec.groups.findIndex(g => g.id === 'stories-zh'), g = rec.groups[gi];
  ok('the recommended subscriptions have a group of stories, after the Chinese podcasts, flagged as podcasts (each can be listened to before it is subscribed)', gi === rec.groups.findIndex(x => x.id === 'podcasts-zh') + 1 && g.podcast === true && g.items.length >= 12 && /故事/.test(g.zh), g && g.items.length);
  const others = rec.groups.filter(x => x.id !== 'stories-zh').flatMap(x => x.items), mine = g.items;
  const feedKey = u => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
  ok('every show of it is valid: an id nobody else has, a name, a feed address, a line of why in both languages, tags; and a feed that no other group has', mine.every(i => /^pod-st-[a-z0-9]+$/.test(i.id) && i.name && /^https?:\/\//.test(i.feed) && i.zh && i.en && i.podcast === true && i.lang === 'zh' && i.tags.length >= 2)
    && new Set(mine.map(i => i.id)).size === mine.length && !mine.some(i => others.some(o => o.id === i.id)) && new Set(mine.map(i => feedKey(i.feed))).size === mine.length && !mine.some(i => others.some(o => feedKey(o.feed) === feedKey(i.feed))), mine.filter(i => others.some(o => feedKey(o.feed) === feedKey(i.feed))).map(i => i.id));
  ok('no errors in the page', errs.length === 0, errs);
  await fetch(SVC + '/__listen?mode=ok&reset=1');
  console.log(`${pass} passed, ${fail} failed`);
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
