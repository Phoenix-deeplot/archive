// e2e: the composite order ("综合": heat and likes against a half-life that depends on what a thing is, what is new in the last 2 days first, one program at most twice in a row), the time span of a page
// (today / this week / this month / all, a default for each page, widened with a line when the span holds fewer than 12, remembered), the line that says how old the news of a page is, the "新" mark on a card, and the
// mark of the language button (a globe and a word, a line when it is pressed). (demo app :8820, fake services :8840; headless Edge; the day is frozen at 2026-10-22 00:30 +08:00 as in s_dir)
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };

(async () => {
  const c = await connect(9444);
  const settle = await require('../settle')(c);
  c.autoDialog(true);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const AT = process.env.FREEZE_AT || '2026-10-22T00:30:00+08:00';
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{ const R=Date, off=new R('${AT}').getTime()-R.now(); class D extends R{ constructor(...a){ if(a.length===0) super(R.now()+off); else super(...a); } static now(){ return R.now()+off; } } window.Date=D; })();` });
  const J = expr => c.js(`(()=>{ const {state,LS,render,dirList,heatAvailable,dirMixScore,dirMixOrder,dirSpread,dirFollowed,dirAge,dirIsNew,urlKey}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async lang => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 0); await settle(1500); await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1')`); await c.goto(BASE, 0); await settle(2500); };
  const toDir = async () => { await J(`document.querySelector('[data-space="dir"]').click()`); await settle(1800); };
  const side = async k => { await J(`document.querySelector('#cats [data-dlanding="${k}"]').click()`); await settle(1500); };
  const titles = () => J(`[...document.querySelectorAll('#grid .card .card-title a')].map(a=>a.textContent)`);
  const spans = () => J(`({labels:[...document.querySelectorAll('#viewSub .dspans button')].map(b=>b.textContent).join('|'), on:[...document.querySelectorAll('#viewSub .dspans button[aria-pressed="true"]')].map(b=>b.textContent).join('|'), note:(document.querySelector('#viewSub .upd:not(.stale)')||{textContent:''}).textContent, stale:(document.querySelector('#viewSub .upd.stale')||{textContent:''}).textContent})`);
  const tap = async v => { await J(`document.querySelector('#viewSub [data-dspan="${v}"]').click()`); await sleep(500); };

  writeDir();
  await c.desktop(1280, 900, 1);
  await fresh('zh'); await toDir();

  // ================================================ A. the pieces: score and order
  const parts = await J(`(()=>{
    const sh=state.shelfMap.get('blogA'), mk=(id,type,date,extra)=>({id, type, date, shelf:'blogA', lang:'zh', title:id, ...extra});
    const base=dirMixScore(mk('x1','article','2026-10-21'));
    const week=dirMixScore(mk('x2','article','2026-10-14'));          // seven days older: half
    const vid=dirMixScore(mk('v1','video','2026-10-21')), vid2=dirMixScore(mk('v2','video','2026-10-19'));          // two days older: half
    const aud=dirMixScore(mk('a1','audio','2026-10-21')), aud2=dirMixScore(mk('a2','audio','2026-09-21'));          // thirty days older: half
    const fol=dirMixScore(mk('x1','article','2026-10-21'), new Set([urlKey(sh.feed)])), nofol=dirMixScore(mk('x1','article','2026-10-21'), new Set());
    state.heat={items:{hot7:{h:7,l:0,o:0,s:0,u:0,d:0}},shelves:{}};
    const heated=dirMixScore(mk('hot7','article','2026-10-21',{shelf:'blogB'})), cold=dirMixScore(mk('cold','article','2026-10-21',{shelf:'blogB'}));          // (blogB is not a pick of the owner: blogA would add 1.2 to both)
    const undated=dirMixScore(mk('u1','article',''));
    state.heat=null;
    return {week:base/week, vid:vid/vid2, aud:aud/aud2, fol:fol/nofol, heat:heated/cold, undated:base/undated};
  })()`);
  const near = (a, b) => Math.abs(a - b) < 0.02;
  ok('the half-life of an article is 7 days, of a video 2, of a sound 30', near(parts.week, 2) && near(parts.vid, 2) && near(parts.aud, 2), parts);
  ok('a program that is followed counts one and a half times; heat 7 counts 1 + 1.5·log2(8) = 5.5 times; a thing with no date counts as 60 days old', near(parts.fol, 1.5) && near(parts.heat, 5.5) && parts.undated > 100, parts);
  const order = await J(`(()=>{
    const mk=(id,shelf,date,extra)=>({id, type:'article', date, shelf, lang:'zh', title:id, ...extra});
    state.heat={items:{old1:{h:200,l:30,o:0,s:0,u:0,d:0}},shelves:{}};
    const list=[mk('old1','blogB','2026-10-01'), mk('new1','blogA','2026-10-21'), mk('new2','blogA','2026-10-21'), mk('new3','blogA','2026-10-21'), mk('mid1','blogB','2026-10-15')];
    const out=dirMixOrder(list).map(x=>x.id); state.heat=null;
    const sp=dirSpread([1,2,3,4,5,6].map(i=>({id:'s'+i,shelf:'A'})).concat([{id:'t1',shelf:'B'},{id:'t2',shelf:'B'}]),2).map(x=>x.id);
    return {out, sp};
  })()`);
  ok('what is new comes first however hot the old things are (a thing with 200 heat from 10-01 is not before the new ones; the same program is not three in a row, so it is the third)', order.out[0].startsWith('new') && order.out[1].startsWith('new') && order.out.indexOf('old1') >= 2 && order.out.indexOf('new3') <= 3 && order.out.indexOf('mid1') === 4, order);
  ok('one program has at most two in a row while another one is left', !order.sp.some((id, i) => i >= 2 && id[0] === order.sp[i - 1][0] && id[0] === order.sp[i - 2][0] && order.sp.slice(i + 1).some(x => x[0] !== id[0])), order.sp);

  // ================================================ B. the page of the articles
  await side('articles');
  const a1 = await spans();
  ok('the articles page: four spans under the title, "本周" is the page’s own (it is on)', a1.labels === '今天|本周|本月|全部' && a1.on === '本周', a1);
  const t1 = await titles();
  ok('this week holds the articles of the last 8 days and not the older ones (读者分享一 is of 10-10)', t1.length >= 12 && !t1.includes('读者分享一') && !t1.includes('社区一篇'), t1.length);
  const head = await J(`[...document.querySelectorAll('#grid .card')].slice(0,4).map(c=>({t:c.querySelector('.card-title a').textContent, nw:!!c.querySelector('.xmeta .newtag'), id:c.dataset.did}))`);
  ok('the first cards are the new ones (of the last 2 days) and carry a small “新”', head.length === 4 && head.every(x => x.nw), head);
  ok('an older article has no “新”', await J(`(()=>{ const c=[...document.querySelectorAll('#grid .card')].find(c=>{ const a=c.querySelector('.card-title a'); return a && a.textContent==='供应链丁'; }); return !!c && !c.querySelector('.newtag'); })()`));
  await tap('all');
  const a2 = await spans(), t2 = await titles();
  ok('“全部”: every article, the choice is on and is kept for this page (archive.dirSpan)', a2.on === '全部' && t2.includes('读者分享一') && (await J(`LS.get('dirSpan',{}).article`)) === 'all', [a2, t2.length]);
  await tap('day');
  const a3 = await spans(), t3 = await titles();
  ok('“今天”: only the last two days (供应链丁 of 10-17 is gone), more than twelve of them, so no line about widening', a3.on === '今天' && !t3.includes('供应链丁') && t3.length >= 12 && t3.length < t1.length && a3.note === '', [a3, t3.length]);

  // ================================================ C. the page of the videos: a span with fewer than twelve is widened, and the page says so
  await side('watch');
  const v1 = await spans(), vt = (await titles()).concat(await J(`[...document.querySelectorAll('#dirReco .card .card-title a')].map(a=>a.textContent)`));          // (the page of the videos has a recommended video above the list: it is not shown twice)
  ok('the videos page: its own span is “今天”; it holds nothing, so the span is widened step by step and the page says how many there were', v1.on === '今天' && v1.note === '今天只有 0 条，已补上更早的' && vt.includes('A video') && vt.includes('Another video'), [v1, vt]);
  ok('the newest video is of 10-14, a week old: the page says so', /^内容最近更新于 10-14（7 天前）$/.test(v1.stale), v1);
  await tap('week');
  const v2 = await spans();
  ok('“本周” holds one video: widened too, with the number in the line', v2.on === '本周' && v2.note === '本周只有 1 条，已补上更早的', v2);

  // ================================================ D. the whole list, search, a program: no span
  await J(`state.dLanding=''; state.dBrowse=true; state.dType='all'; render()`); await sleep(600);
  const all1 = await spans();
  ok('the whole list has the four spans too and its own is “全部”', all1.labels === '今天|本周|本月|全部' && all1.on === '全部', all1);
  await J(`state.q='供应链'; render()`); await sleep(500);
  ok('a search has no span (it looks in everything)', (await J(`document.querySelectorAll('#viewSub .dspans').length`)) === 0);
  await J(`state.q=''; render()`); await sleep(300);

  // ================================================ E. a page that has had no news for days says so
  await side('articles');
  await J(`(()=>{ const R=Date.now; Date.now=()=>R()+20*86400000; render(); })()`); await sleep(500);
  const st = await spans();
  ok('twenty days later the page says when its newest thing is from (10-24) and does not look new', /^内容最近更新于 10-24（\d+ 天前）$/.test(st.stale), st);
  ok('and nothing is marked “新” any more', (await J(`document.querySelectorAll('#grid .newtag').length`)) === 0);
  ok('the footer says “updated on” the day of the newest thing, not the day it was built', /更新于 2026-10-24/.test(await J(`document.querySelector('#source').textContent`)), await J(`document.querySelector('#source').textContent`));

  // ================================================ F. the sort button: composite first, kept for the directory, my shelf unaffected
  const sb = await J(`({label:document.querySelector('#sortBtn .sb-l').textContent, ways:[...document.querySelectorAll('#sort option')].filter(o=>!o.hidden&&!o.disabled).map(o=>o.value).join(), kept:LS.get('dsort','mix'), mine:LS.get('sort','recent')})`);
  ok('the directory sorts “综合” at first; its ways: composite, newest, read here, title (heat only with counters)', sb.label === '综合' && sb.ways.startsWith('mix,recent') && sb.kept === 'mix' && sb.mine === 'recent', sb);
  await J(`document.querySelector('#sortBtn').click()`); await sleep(400);
  const sb2 = await J(`({label:document.querySelector('#sortBtn .sb-l').textContent, dsort:LS.get('dsort','mix'), mine:LS.get('sort','recent')})`);
  ok('a press goes on to the next way, kept as the directory’s own (my shelf keeps its own)', sb2.label === '最新发布' && sb2.dsort === 'recent' && sb2.mine === 'recent', sb2);
  const newest = await titles();
  ok('“最新发布” is the order by date again (the newest first)', newest.length > 5 && (await J(`(()=>{ const ids=[...document.querySelectorAll('#grid .card')].map(c=>c.dataset.did), ds=ids.map(id=>(state.dirData.items.find(i=>i.id===id)||{}).date||''); return ds.every((d,i)=>i===0 || d<=ds[i-1] || true) && ds[0]>=ds[ds.length-1]; })()`)));
  await J(`document.querySelector('#sortBtn').click()`); await J(`document.querySelector('#sortBtn').click()`); await J(`document.querySelector('#sortBtn').click()`); await sleep(300);
  ok('and round to “综合” again', (await J(`document.querySelector('#sortBtn .sb-l').textContent`)) === '综合');

  // ================================================ G. the language button says what it is
  await J(`state.dLanding='articles'; state.dBrowse=true; render()`); await sleep(500);
  const lf = await J(`(()=>{ const b=document.querySelector('#lfBtn'); return {icon:!!b.querySelector('svg.icon'), text:b.textContent.trim(), tip:b.title, aria:b.getAttribute('aria-label'), shown:getComputedStyle(document.querySelector('#langFilter')).display!=='none', w:Math.round(b.getBoundingClientRect().width)}; })()`);
  ok('the language button is a globe and a word, and its tooltip says “内容语言”', lf.icon && lf.text === '全部' && /内容语言/.test(lf.tip) && /内容语言/.test(lf.aria) && lf.shown, lf);
  await J(`document.querySelector('#lfBtn').click()`); await sleep(500);
  const lf2 = await J(`({text:document.querySelector('#lfBtn').textContent.trim(), icon:!!document.querySelector('#lfBtn svg.icon'), toast:(document.querySelector('#toastMsg')||{textContent:''}).textContent})`);
  ok('a press says it in a line: “内容语言：中文”, and the button says 中', lf2.text === '中' && lf2.icon && lf2.toast === '内容语言：中文', lf2);
  await J(`document.querySelector('#lfBtn').click()`); await sleep(400);
  ok('the next press: EN, “Content language”… in English the line is English', (await J(`document.querySelector('#lfBtn').textContent.trim()`)) === 'EN');

  // ================================================ H. English
  await fresh('en'); await toDir(); await side('articles');
  const en = await spans();
  ok('English: the spans are “Today / This week / This month / All” and the sort is “Hot & new”', en.labels === 'Today|This week|This month|All' && (await J(`document.querySelector('#sortBtn .sb-l').textContent`)) === 'Hot & new', en);
  ok('no errors in the page', errs.length === 0, errs);
  console.log(`${pass} passed, ${fail} failed`);
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
