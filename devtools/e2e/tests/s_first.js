// e2e: a first visit is ONE window in two steps (what this is -> "what do you feel like reading?"), and the public space opens on a discovery page (no toolbar, no lists):
// the whole directory is one button away. (demo app :8820 with the directory fixture; headless Edge)
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const settle = await require('../settle')(c);
  const DAY = process.env.FREEZE_DAY || '2026-10-26';
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{ const R=Date, off=new R('${DAY}T12:00:00+08:00').getTime()-R.now(); class D extends R{ constructor(...a){ if(a.length===0) super(R.now()+off); else super(...a); } static now(){ return R.now()+off; } } window.Date=D; })();` });          // (the picks of "today" depend on the date: FREEZE_DAY=2026-10-27 replays the day this was written)
  const J = expr => c.js(`(()=>{ const {state,LS}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  writeDir();
  const visit = async (lang, pre) => {                                                                  // a visitor with nothing in this browser (pre: what an earlier visit left)
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820');
    if (pre) { await c.goto(BASE, 0); await settle(1500); await J(pre); }
    await c.goto(BASE + '?lang=' + lang, 0); await settle(3500);
  };
  const dlg = () => J(`(()=>{ const q=s=>document.querySelector(s), vis=s=>{ const e=q(s); return !!e && !e.hidden && e.offsetParent!==null; };
    return {open:q('#introDlg').open, title:q('#introTitle').textContent, intro:vis('#introIntro'), li4:getComputedStyle(q('#introIntro .intro-list li:nth-child(4)')).display, news:vis('#introNews'), ask:vis('#introAsk'),
      more:vis('#introMore'), next:vis('#introNext'), nextTxt:q('#introNext').textContent, close:vis('#introClose'), skip:vis('#introSkip'), go:vis('#introGo'), goOff:q('#introGo').disabled,
      intents:[...document.querySelectorAll('#introAsk [data-dr-intent]')].map(b=>b.textContent), chips:[...document.querySelectorAll('#introAsk [data-dr-col]')].map(b=>b.dataset.drCol+':'+b.getAttribute('aria-pressed')),
      moreCls:q('#introMore').className, nextH:Math.round(q('#introNext').getBoundingClientRect().height)}; })()`);
  const click = s => J(`document.querySelector(${JSON.stringify(s)}).click()`);
  const h2s = () => J(`[...document.querySelectorAll('#dirReco h2')].filter(h=>!h.closest('.ls')).map(h=>h.childNodes[0].textContent)`);
  await c.desktop(1280, 900, 1);

  // ================================================ A. the window, step 1
  await visit('zh');
  let d = await dlg();
  ok('a first visit opens the window with "这是什么？", the short form: three lines (the fourth is hidden), no list of what changed', d.open && d.title === '这是什么？' && d.intro && d.li4 === 'none' && !d.news && !d.ask, d);
  ok('step 1 buttons: the guide, and "下一步 ›" (the main one); "知道了" is not there', d.more && d.next && d.nextTxt === '下一步 ›' && !d.close && !d.skip && !d.go && !/primary/.test(d.moreCls), d);
  await click('#introNext'); await settle(900);
  d = await dlg();
  ok('step 2 is in the same window: "现在想看什么？", four moods and the columns that have articles; "看这几个栏目" waits for a pick, "先随便看看" is there', d.open && d.title === '现在想看什么？' && d.ask && !d.intro && !d.news && d.intents.join('|') === '摸鱼一下|学习进阶|看懂热点|深度收藏' && d.chips.length === 6 && d.go && d.goOff && d.skip && !d.next && !d.more && !d.close, d);
  await click('#introAsk [data-dr-col="read"]'); await click('#introAsk [data-dr-col="tech"]');
  d = await dlg();
  ok('two chips pressed: "看这几个栏目" can be pressed', d.chips.filter(x => /:true$/.test(x)).map(x => x.split(':')[0]).sort().join() === 'read,tech' && !d.goOff, d.chips);
  await click('#introGo'); await settle(1500);
  const after = await J(`({open:document.querySelector('#introDlg').open, space:state.space, pick:[...state.dPickT].sort().join(), off:LS.get('dirIntroOff',0), bar:document.querySelector('#dirBar').hidden, title:document.querySelector('#viewTitle').textContent, card:!!document.querySelector('#dirReco .dr-intro')})`);
  ok('the answer closes the window and lands on the discovery page of the public space with exactly those columns, the question is not asked again', !after.open && after.space === 'dir' && after.pick === 'read,tech' && after.off === 1 && after.bar && after.title === '发现' && !after.card, after);
  ok('and the page is the reader’s own home (one section for each ticked column)', (await h2s()).join('|').startsWith('今日 3 件值得看|继续探索|AI 与科技|读书与深度'), await h2s());

  // ================================================ B. a mood answers at once
  await visit('zh');
  await click('#introNext'); await settle(900);
  await click('#introAsk [data-dr-intent="learn"]'); await settle(1500);
  const mood = await J(`({open:document.querySelector('#introDlg').open, space:state.space, pick:[...state.dPickT].sort().join()})`);
  ok('a mood ("学习进阶") is an answer by itself: the window closes, the public space opens with its columns that have articles (学习与研究, AI 与科技)', !mood.open && mood.space === 'dir' && mood.pick === 'learn,tech', mood);

  // ================================================ C. "先随便看看"
  await visit('zh');
  await click('#introNext'); await settle(900); await click('#introSkip'); await sleep(500);
  const skip = await J(`({open:document.querySelector('#introDlg').open, space:state.space, pick:state.dPickT.size, off:LS.get('dirIntroOff',0)})`);
  ok('"先随便看看": the window closes, the reader stays where they were (the shelf), nothing is picked, the question is off for good', !skip.open && skip.space === 'mine' && skip.pick === 0 && skip.off === 1, skip);
  await click('[data-space="dir"]'); await settle(2000);
  ok('the public space then opens on the discovery page without the question card', !(await J(`!!document.querySelector('#dirReco .dr-intro')`)) && (await h2s())[0] === '今日 3 件值得看', await h2s());

  // ================================================ D. closed at step 1 (Esc): nothing was decided, the page still asks
  await visit('zh');
  await J(`document.querySelector('#introDlg').close()`); await sleep(300);
  ok('closing at step 1 decides nothing', await J(`LS.get('dirIntroOff',0)`) === 0 && await J(`state.space`) === 'mine');
  await click('[data-space="dir"]'); await settle(2000);
  ok('the discovery page then still asks (the card is the first thing, and the guide tip steps aside while it is there)', await J(`!!document.querySelector('#dirReco .dr-intro')`) && !(await J(`!!document.querySelector('#dirReco .dr-tip')`)), await h2s());

  // ================================================ E/F. who is not new
  await visit('zh', `localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2000-01-01"')`);
  d = await dlg(); for (let i = 0; i < 20 && !d.open; i++) { await sleep(300); d = await dlg(); }          // (in a long run the page is slower to open it: wait for it, up to six seconds)
  ok('somebody back after an update gets the news only: "更新说明", no question, "知道了"', d.open && d.title === '更新说明' && d.news && d.close && !d.next && !d.ask, d);
  await J(`document.querySelector('#introDlg').close()`);
  await click('#introLink'); await sleep(400);
  d = await dlg();
  ok('the footer "这是什么" shows the whole text with the news, and no question', d.open && d.title === '这是什么？' && d.li4 !== 'none' && d.news && d.close && !d.next, d);

  // ================================================ G. English
  await visit('en');
  d = await dlg();
  ok('English: "What is this?", the button says "Next ›"', d.open && d.title === 'What is this?' && d.nextTxt === 'Next ›', d);
  await click('#introNext'); await settle(900);
  d = await dlg();
  ok('English step 2: "What do you feel like reading?" with the English columns and buttons', d.title === 'What do you feel like reading?' && d.intents.join('|') === 'Unwind|Level up|Make sense of the news|Long reads' && (await J(`document.querySelector('#introSkip').textContent`)) === 'Just browse', d);

  // ================================================ H. a phone
  await c.mobile(390, 844, 2);
  await visit('zh');
  d = await dlg();
  const box = await J(`(()=>{ const r=document.querySelector('#introDlg .dlg').getBoundingClientRect(); return {l:Math.round(r.left), r:Math.round(r.right), b:Math.round(r.bottom), w:innerWidth, h:innerHeight, x:document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()`);
  ok('phone, step 1: the window fits the screen, the main button is at least 44px high', d.open && box.l >= 0 && box.r <= box.w && box.b <= box.h && box.x <= 1 && d.nextH >= 44, [d.nextH, box]);
  await click('#introNext'); await settle(900);
  const ph = await J(`({chips:[...document.querySelectorAll('#introAsk .dr-chip')].map(b=>Math.round(b.getBoundingClientRect().height)), intents:[...document.querySelectorAll('#introAsk .dr-intents .btn')].map(b=>Math.round(b.getBoundingClientRect().height)),
    foot:[...document.querySelectorAll('#introDlg .dlg-foot .btn')].filter(b=>b.offsetParent!==null).map(b=>Math.round(b.getBoundingClientRect().height)), x:document.documentElement.scrollWidth-document.documentElement.clientWidth})`);
  ok('phone, step 2: moods, chips and the two buttons are all at least 40–44px high and nothing scrolls sideways', ph.intents.every(h => h >= 44) && ph.chips.every(h => h >= 40) && ph.foot.every(h => h >= 44) && ph.x <= 1, ph);
  await click('#introSkip'); await sleep(400);
  await click('[data-space="dir"]'); await settle(2200);
  const pd = await J(`(()=>{ const bar=document.querySelector('#dirBar'); const h=[...document.querySelectorAll('#dirReco h2')][0]; return {bar:bar.offsetParent!==null, h2top:Math.round(h.getBoundingClientRect().top), x:document.documentElement.scrollWidth-document.documentElement.clientWidth, vh:innerHeight}; })()`);
  ok('phone: the public space shows no toolbar and no tab rows; the first section starts high on the first screen; nothing scrolls sideways', !pd.bar && pd.h2top < pd.vh * 0.5 && pd.x <= 1, pd);
  await c.desktop(1280, 900, 1);

  // ================================================ I. the discovery page, first level and second level
  await visit('zh', `localStorage.setItem('archive.guideTipOff','1')`);
  await J(`document.querySelector('#introDlg').close()`);
  await J(`LS.set('dirIntroOff',1)`);
  await click('[data-space="dir"]'); await settle(2200);
  const lv1 = await J(`({bar:document.querySelector('#dirBar').offsetParent!==null, title:document.querySelector('#viewTitle').textContent, cats:[...document.querySelectorAll('#cats .cat-btn')].map(b=>b.textContent.trim()), cur:[...document.querySelectorAll('#cats .cat-btn')].map(b=>b.getAttribute('aria-current')).join(),
    tagbox:getComputedStyle(document.querySelector('#tagbox')).display, shelves:getComputedStyle(document.querySelector('#dir')).display, label:getComputedStyle(document.querySelector('.dir-label')).display, body:document.body.classList.contains('dir-discover'),
    chips:[...document.querySelectorAll('#dirReco .dr-explore .dr-chip')].map(b=>b.textContent), browse:(document.querySelector('#dirReco [data-dr-browse]')||{}).textContent, tabsInPage:!!document.querySelector('#dTabs button') && document.querySelector('#dTabs').offsetParent!==null})`);
  ok('first level: no toolbar (no 栏目 ▾, no 栏目|平台, no tab rows), the title is "发现", the sidebar has "发现" (current), "热榜" and "今日听什么" side by side with 全部 / 文章 / … (the types, with their counts); no tag list, no shelf list', !lv1.bar && lv1.title === '发现' && lv1.cats[0] === '发现' && lv1.cats[1] === '热榜' && lv1.cats[2] === '今日听什么' && lv1.cats[3] === '精选图书' && lv1.cats[4].startsWith('全部') && lv1.cats.length >= 6 && lv1.cur.startsWith('true,false,false') && lv1.tagbox === 'none' && lv1.shelves === 'none' && lv1.label === 'none' && lv1.body && !lv1.tabsInPage, lv1);
  ok('sections: today, then "继续探索" right after it (every column that has articles, with its count, and the button to the whole directory), then the picks and the latest', (await h2s()).slice(0, 3).join('|') === '今日 3 件值得看|继续探索|编辑精选' && lv1.chips.length === 6 && lv1.chips.every(x => /\d$/.test(x)) && lv1.browse === '全部来源 · 平台 · 标签 ›', [await h2s(), lv1.chips, lv1.browse]);
  await c.shot(require('../paths').SHOTS + '/fv_discover.png');
  // a column chip: the second level, with that column on
  await click('#dirReco [data-dr-explore="biz"]'); await sleep(700);
  let lv2 = await J(`({bar:document.querySelector('#dirBar').offsetParent!==null, title:document.querySelector('#viewTitle').textContent, tab:state.dTab, reco:document.querySelector('#dirReco').hidden, chips:[...document.querySelectorAll('#viewSub .chip, #viewSub .btn')].map(b=>b.textContent.replace('✕','').trim()), cats:[...document.querySelectorAll('#cats .cat-btn')].map(b=>b.textContent.trim()).slice(0,2)})`);
  ok('a column chip opens the second level on that column: toolbar back, "发现世界", the line says 栏目：财经与商业 (and has no "← 回到首页" button: the sidebar’s 发现 is the way back)', lv2.bar && lv2.title === '发现世界' && lv2.tab === 'col:biz' && lv2.reco && lv2.chips.includes('栏目：财经与商业') && !lv2.chips.includes('← 回到首页') && lv2.cats[0] === '发现', lv2);
  await click('#cats [data-dbrowse="0"]'); await sleep(600);
  ok('the sidebar "发现" is back on the discovery page (no toolbar)', await J(`document.querySelector('#dirBar').offsetParent===null && !document.querySelector('#dirReco').hidden && document.querySelector('#viewTitle').textContent==='发现'`));
  // the whole directory
  await click('#dirReco [data-dr-browse]'); await sleep(700);
  lv2 = await J(`({bar:document.querySelector('#dirBar').offsetParent!==null, title:document.querySelector('#viewTitle').textContent, reco:document.querySelector('#dirReco').hidden, cards:document.querySelectorAll('#grid .card').length, back:[...document.querySelectorAll('#viewSub .btn')].map(b=>b.textContent), cats:[...document.querySelectorAll('#cats .cat-btn')].map(b=>b.textContent.trim()).slice(0,2),
    tagbox:getComputedStyle(document.querySelector('#tagbox')).display, shelves:getComputedStyle(document.querySelector('#dir')).display, tabs:document.querySelectorAll('#dTabs button').length>0})`);
  ok('"全部来源 · 平台 · 标签 ›": the second level without a filter: toolbar and tabs, the shelf list (no list of tags in the side any more), every article in one list (no sections), no "← 回到首页" button', lv2.bar && lv2.title === '发现世界' && lv2.reco && lv2.cards >= 30 && !lv2.back.includes('← 回到首页') && lv2.cats[0] === '发现' && lv2.tagbox === 'none' && lv2.shelves !== 'none' && lv2.tabs, lv2);
  await c.shot(require('../paths').SHOTS + '/fv_browse.png');
  await click('#cats [data-dbrowse="0"]'); await sleep(600);
  ok('the sidebar "发现" goes back to the discovery page too', await J(`document.querySelector('#dirBar').offsetParent===null && !document.querySelector('#dirReco').hidden && !state.dBrowse`));
  await click('#cats [data-dtype="all"]'); await sleep(600);
  ok('the sidebar "全部" opens the whole directory (toolbar, one list), and it is the current row, not 发现', await J(`state.dBrowse && document.querySelector('#dirBar').offsetParent!==null && document.querySelector('#dirReco').hidden && document.querySelector('#cats [data-dtype="all"]').getAttribute('aria-current')==='true' && document.querySelector('#cats [data-dbrowse="0"]').getAttribute('aria-current')==='false'`));
  const arts = await J(`+(document.querySelector('#cats [data-dlanding="articles"] .n')||{textContent:0}).textContent`);
  await click('#cats [data-dlanding="articles"]'); await sleep(600);
  await J(`(()=>{ const b=document.querySelector('#viewSub [data-dspan="all"]'); if(b) b.click(); })()`); await sleep(500);              // (the page of the articles shows this week or this month at first: "全部" is every one of them)
  ok('"文章" in the same list shows only articles (as many as its count), the toolbar stays; the type rows are still all there', await J(`state.dType==='article' && state.dBrowse && document.querySelector('#dirBar').offsetParent!==null && (document.querySelectorAll('#grid .card[data-did]').length + document.querySelectorAll('#dirReco .dr-picks .card').length)===${arts} && document.querySelectorAll('#cats .cat-btn').length>=5`), [arts, await J(`document.querySelectorAll('#grid .card[data-did]').length`)]);       // (the ads between the cards are not articles)
  await click('#cats [data-dbrowse="0"]'); await sleep(600);
  ok('going back to 发现 clears the type too, and the type rows are still beside it', await J(`state.dType==='all' && !state.dBrowse && document.querySelector('#dirBar').offsetParent===null && document.querySelectorAll('#cats .cat-btn').length>=5 && !document.querySelector('[data-clear="dhome"]')`));
  await click('[data-space="mine"]'); await sleep(500); await click('[data-space="dir"]'); await settle(1500);
  ok('leaving the public space and coming back starts on the discovery page again', await J(`!state.dBrowse && document.querySelector('#dirBar').offsetParent===null && !document.querySelector('#dirReco').hidden`));
  await J(`(()=>{ const q=document.querySelector('#q'); q.value='Hello'; q.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(700);
  ok('a search leaves the discovery page for the list with the toolbar', await J(`document.querySelector('#dirBar').offsetParent!==null && document.querySelector('#dirReco').hidden`));
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
