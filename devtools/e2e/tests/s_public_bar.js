// e2e: the public space on a phone (the new shell): every page has at most ONE row under the strip, the row slides sideways (no dropdown, no wrapping, no filter panel), nothing is left blank between the
// strip and the first content, every icon-only button has its tooltip, every button of the row is finger-sized, the language filter is offered only where there is a lot to filter.
// (demo app :8820, fake services :8840, headless Edge; the page in the new shell, a phone of 375 px)
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };
const get = p => fetch(SVC + p).then(r => r.json());

(async () => {
  const c = await connect(9444, { newShell: true });
  const settle = await require('../settle')(c);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async (lang = 'zh') => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang + '&shell=2', 0); await settle(1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 0); await settle(2800);
    await J(`document.querySelector('[data-space="dir"]').click()`); await settle(1500);
  };
  const go = async name => { await J(`[...document.querySelectorAll('#cats .cat-btn')].find(b=>b.textContent.trim().replace(/\\d+$/,'')===${JSON.stringify(name)}).click()`); await settle(1500); await J(`window.scrollTo(0,0)`); await sleep(200); };
  // what a page shows under the strip: the gap to the first thing that has height, the rows of controls, what slides, the icon buttons without a tooltip, the controls that are too small, the menus
  const look = () => J(`(()=>{
    const vis = e => !!e && e.offsetParent !== null && e.getBoundingClientRect().height > 0;
    const head = document.querySelector('header.top').getBoundingClientRect();
    const main = document.querySelector('.main');
    const kids = [...main.children].filter(vis).filter(e => !e.matches('header.top'));
    const first = kids.find(e => e.getBoundingClientRect().height > 8);
    const row = [document.querySelector('#dirBar'), document.querySelector('#lpRoot .lp-bar'), document.querySelector('.hot-views')].find(vis) || null;          // (the hot page’s own two-way switch is Codex’s: it never needs to slide)
    const slideEls = row ? [row, ...row.querySelectorAll('*')].filter(e => { const o = getComputedStyle(e).overflowX; return o === 'auto' || o === 'scroll'; }) : [];
    const icon = [...main.querySelectorAll('button')].filter(vis).filter(b => !b.textContent.trim() && b.querySelector('svg, i'));
    const noTip = icon.filter(b => !(b.title || b.getAttribute('aria-label'))).map(b => b.className + '|' + b.id);
    const line = document.querySelector('#dirBar .dir-line');
    const small = row ? [...row.querySelectorAll('button')].filter(vis).filter(b => { const r = b.getBoundingClientRect(); return r.height < 40 || r.width < 40; }).map(b => (b.textContent.trim() || b.id || b.className) + ':' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)) : [];
    const selects = [...main.querySelectorAll('select')].filter(vis).map(s => s.id || s.className);
    const lang = vis(document.querySelector('#langFilter'));
    return { gap: first ? Math.round(first.getBoundingClientRect().top - head.bottom) : 999, first: first ? first.tagName + '#' + first.id + '.' + String(first.className).slice(0, 24) : '', row: row ? (row.id || row.className) : '', rowH: row ? Math.round(row.getBoundingClientRect().height) : 0,
      slides: slideEls.length, lineOver: line && vis(line) ? line.scrollWidth - line.clientWidth : 0, icons: icon.length, noTip, small, selects, lang,
      panel: getComputedStyle(document.querySelector('#flPanel')).display, tools: getComputedStyle(document.querySelector('#stTools')).display, over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  })()`);

  writeDir(); await get('/__listen?mode=ok&reset=1');
  await c.mobile(375, 812, 2);
  await fresh('zh');
  const pages = ['发现', '热榜', '今日听什么', '精选图书', '全部', '精选文章', '看什么'];
  const L = {};
  for (const p of pages) { await go(p); L[p] = await look(); }

  // ---- no blank between the strip and the content, on every page
  for (const p of pages) ok(`${p}: no blank under the strip (the content starts within 24 px of it)`, L[p].gap <= 24 && L[p].gap >= -8, L[p]);
  // ---- no dropdown, no panel, no row of tools anywhere in the public space
  for (const p of pages) ok(`${p}: no dropdown, no filter panel, no row of tools, nothing wider than the screen`, L[p].selects.length === 0 && L[p].panel === 'none' && L[p].tools === 'none' && L[p].over <= 0, L[p]);
  // ---- one band under the strip (a content page: the switch and the tools, then the tabs: two short lines at most; hot and listen: one line), that slides sideways, finger-sized, every icon with its tooltip
  for (const p of pages.filter(x => x !== '发现')) { const content = ['全部', '精选文章', '看什么', '精选图书'].includes(p); ok(`${p}: one band of controls under the strip (${content ? 'at most 110 px: the switch + tools, the tabs' : 'one line, at most 64 px'}); it slides sideways; no line wider than the screen; every button at least 40 px; every icon button has a tooltip`, !!L[p].row && L[p].rowH <= (content ? 110 : 64) && (L[p].slides > 0 || p === '热榜') && L[p].lineOver <= 1 && L[p].small.length === 0 && L[p].noTip.length === 0, L[p]); }
  ok('发现: no band at all (nothing to filter on the front page)', L['发现'].row === '', L['发现']);
  // ---- the language filter only where there is a lot to filter
  ok('the language filter is on 精选图书, 精选文章 and 全部 only', pages.filter(p => L[p].lang).join() === '精选图书,全部,精选文章', pages.filter(p => L[p].lang));
  // ---- the language of the content is ONE button: each tap the next one (all -> 中 -> EN -> all), it says which is on, its tooltip says what the next tap gives
  await go('全部');
  const lfRead = () => J(`({lf:state.lf, text:document.querySelector('#lfBtn').textContent, tip:document.querySelector('#lfBtn').title, n:document.querySelectorAll('#langFilter button').length, h:Math.round(document.querySelector('#lfBtn').getBoundingClientRect().height), on:document.querySelector('#lfBtn').getAttribute('aria-pressed')})`);
  const l0 = await lfRead(); await J(`document.querySelector('#lfBtn').click()`); await sleep(350);
  const l1 = await lfRead(); await J(`document.querySelector('#lfBtn').click()`); await sleep(350);
  const l2 = await lfRead(); await J(`document.querySelector('#lfBtn').click()`); await sleep(350);
  const l3 = await lfRead();
  ok('the language is one button of at least 40 px: 全部 → 中 → EN → 全部, the list follows, the tooltip names the next one', l0.n === 1 && l0.h >= 40 && [l0, l1, l2, l3].map(x => x.lf).join() === 'all,zh,en,all' && [l0, l1, l2, l3].map(x => x.text).join() === '全部,中,EN,全部' && /^内容语言：全部（点一下换成 中文）/.test(l0.tip) && /换成 English/.test(l1.tip) && l0.on === 'false' && l1.on === 'true', [l0, l1, l2, l3]);
  // ---- the theme pop-up works in the public space too (it was hidden there by mistake)
  await go('发现');
  await J(`document.querySelector('#themeTop').click()`); await sleep(350);
  const th0 = await J(`({shown:getComputedStyle(document.querySelector('#themePop')).display!=='none' && !document.querySelector('#themePop').hidden, n:document.querySelectorAll('#themePop [data-thset]').length})`);
  await J(`document.querySelector('#themePop [data-thset="dark"]').click()`); await sleep(350);
  const th1 = await J(`document.documentElement.getAttribute('data-theme')`);
  await J(`document.querySelector('#themePop [data-thset="light"]').click()`); await sleep(350);
  const th2 = await J(`document.documentElement.getAttribute('data-theme')`);
  ok('发现世界, phone: the theme button opens its pop-up (three themes), and a choice changes the page (dark, then the classic one)', th0.shown && th0.n === 3 && th1 === 'dark' && th2 === 'light', [th0, th1, th2]);
  await go('全部');

  // ---- the sort button goes round and says so
  await go('全部');
  const s0 = await J(`document.querySelector('#sortBtn').title`);
  await J(`document.querySelector('#sortBtn').click()`); await sleep(500);
  const s1 = await J(`document.querySelector('#sortBtn').title`);
  ok('全部: the sort button is an icon whose tooltip names the sort, and a tap goes to the next one', !!s0 && !!s1 && s0 !== s1 && /^排序：/.test(s0), [s0, s1]);
  const v0 = await J(`document.querySelector('#viewBtn').title`);
  await J(`document.querySelector('#viewBtn').click()`); await sleep(500);
  ok('全部: the cards / rows button is an icon with a tooltip that changes with it', !!v0 && v0 !== await J(`document.querySelector('#viewBtn').title`), v0);

  // ---- English
  await fresh('en');
  const E = {};
  const names = await J(`[...document.querySelectorAll('#cats .cat-btn')].map(b=>b.textContent.trim().replace(/\\d+$/,'')).slice(0,7)`);
  for (const p of names) { await go(p); E[p] = await look(); }
  ok('English: the pages found keep the same shape (no blank, no dropdown, nothing wider than the screen, finger-sized, a tooltip on every icon)', Object.keys(E).length === 7 && Object.values(E).every(x => x.gap <= 24 && x.selects.length === 0 && x.over <= 0 && x.lineOver <= 1 && x.small.length === 0 && x.noTip.length === 0), E);

  ok('no script errors in the whole run', errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
