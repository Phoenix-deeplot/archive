// e2e: "今日听什么". A small block on the discovery page and a page of its own (the sidebar's "今日听什么" instead of "音频"): music and podcasts kept apart by a switch; the lists of the day as tiles,
// styles / podcast categories / shows as chips, the songs as cards or rows (thirty at a time: the next thirty come by themselves when the end is reached), sorted; a song plays in the bar and the ones
// after it follow, one that cannot be played is skipped; a video opens in its platform's player; the reader's language decides what comes first; a service that is down or says rubbish.
// (demo app :8820, fake services :8840 and :8843; headless Edge)
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const DIRF = require('../paths').DIST + '/dir/directory.json';
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840', POD = 'http://127.0.0.1:8843';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };
const get = p => fetch(SVC + p).then(r => r.json());

// the directory of the tests plus three podcast shows (names as a Chinese listener knows them); newest show first: 今夜不设防, 铿锵三人行, English Podcast
const withPods = (on = true) => {
  writeDir();
  const d = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
  if (on) {
    const shows = [['pod1', '铿锵三人行', 'zh', ['2026-10-25', '2026-10-24', '2026-10-23']], ['pod2', '今夜不设防', 'zh', ['2026-10-27', '2026-10-26']], ['pod3', 'English Podcast', 'en', ['2026-10-22', '2026-10-21']]];
    shows.forEach(([id, name, lang, dates], si) => {
      d.shelves.push({ id, name, description: '一个播客', home: POD + '/', kind: 'feed', lang, license: '', tags: [], n: dates.length, updated: '2026-10-20', feed: POD + '/feed.xml?d=' + id, status: 'ok' });
      dates.forEach((date, k) => d.items.push({ id: id + 'e' + k + 'xxxxxx', title: name + ' 第' + (dates.length - k) + '集', summary: '摘要', url: POD + '/notes/ep' + (si + 1), image: '', date, type: 'audio', lang, tags: [], shelf: id, audio: { url: POD + '/ep' + (si + 1) + '.wav', type: 'audio/wav', dur: 6 * (si + 1) } }));
    });
  }
  d.count = d.items.length;
  fs.writeFileSync(DIRF, JSON.stringify(d));
};

(async () => {
  const c = await connect(9444);
  const dialogs = c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const AT = process.env.FREEZE_AT || '2026-10-28T12:00:00+08:00';          // ("today's three" take the entries of the last 72 hours: the made-up episodes are from 10-25 .. 27, the service's day is 10-28)
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{ const R=Date, off=new R('${AT}').getTime()-R.now(); class D extends R{ constructor(...a){ if(a.length===0) super(R.now()+off); else super(...a); } static now(){ return R.now()+off; } } window.Date=D; })();` });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(120); } };
  const fresh = async (lang = 'zh', view = 'cards') => {                                          // (cards: most of this test looks at cards; null = what a new reader gets)
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang, 1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')` + (view ? `; localStorage.setItem('archive.lpView', JSON.stringify('${view}'))` : ''));
    await c.goto(BASE, 2800);
  };
  const toDir = async () => { await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1200); await waitFor(`document.querySelector('#lsBlock .ls-chips')`, 6000); await sleep(400); };
  const SONGS = `#lpRoot .lp-songs .lp-sc, #lpRoot .lp-songs .ls-row, #lpRoot .lp-songs .hot-state`;
  const openPage = async () => { await J(`document.querySelector('#cats [data-dlisten]').click()`); await waitFor(`document.querySelector(${JSON.stringify(SONGS)})`, 8000); await sleep(300); };
  const chips = sel => J(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(b=>b.textContent+(b.getAttribute('aria-pressed')==='true'?'*':''))`);
  const modes = () => J(`[...document.querySelectorAll('#lpRoot .lp-modes button')].map(b=>b.textContent+(b.getAttribute('aria-selected')==='true'?'*':''))`);
  const tops = () => J(`[...document.querySelectorAll('#lpRoot .lp-strip .lp-ch')].map(c=>({id:c.dataset.lpG, name:c.textContent, on:c.getAttribute('aria-pressed')==='true', hidden:c.classList.contains('x')}))`);
  const songs = () => J(`[...document.querySelectorAll('#lpRoot .lp-songs [data-ls-row]')].map(r=>({id:r.dataset.lsRow, t:(r.querySelector('.lp-t')||r.querySelector('.ls-t')).textContent, a:(r.querySelector('.lp-a')||{}).textContent||'', m:(r.querySelector('.lp-m')||r.querySelector('.ls-m')).textContent, img:!!r.querySelector('img'), src:(r.querySelector('.ls-src')||{}).href||'', playing:r.classList.contains('is-playing')}))`);
  const head = () => J(`({h:document.querySelector('#lpRoot .lp-songs-h h3').textContent, n:document.querySelector('#lpRoot .lp-songs-h .lp-n').textContent, sub:(document.querySelector('#lpRoot .lp-sub')||{}).textContent||'', sort:document.querySelector('#lpRoot [data-lp-sort]').value, opts:[...document.querySelectorAll('#lpRoot [data-lp-sort] option')].map(o=>o.textContent), more:(document.querySelector('#lpRoot [data-lp-next]')||{}).textContent||''})`);
  const top0 = () => J(`window.scrollTo(0,0)`);                                    // (a list is chosen at the top of the page: a page that is scrolled to its end would load the next thirty of the new list at once)
  const pickChip = async text => { await top0(); await J(`[...document.querySelectorAll('#lpRoot .lp-strip .lp-ch')].find(b=>b.textContent.startsWith(${JSON.stringify(text)})).click()`); await waitFor(`document.querySelector(${JSON.stringify(SONGS)})`); await sleep(500); };
  const pickTile = async id => { await top0(); await J(`document.querySelector('#lpRoot [data-lp-g="${id}"]').click()`); await waitFor(`document.querySelector(${JSON.stringify(SONGS)})`); await sleep(500); };
  const tab = async m => { await top0(); await J(`document.querySelector('#lpRoot [data-lp-mode="${m}"]').click()`); await waitFor(`document.querySelector(${JSON.stringify(SONGS)})`); await sleep(600); };
  const podLog = async () => (await (await fetch(POD + '/__log')).json());
  const sorted = async (key) => { await top0(); await J(`(()=>{ const s=document.querySelector('#lpRoot [data-lp-sort]'); s.value=${JSON.stringify(key)}; s.dispatchEvent(new Event('change',{bubbles:true})); })()`); await sleep(300); };
  const scrollDown = async () => { await J(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(900); };
  const all = id => J(`state.lp.data.get('${id}|'+state.lang).items`);
  await c.desktop(1280, 900, 1);

  // ================================================ A. the small block on the discovery page
  withPods(); await get('/__listen?mode=ok&reset=1'); await fetch(POD + '/__reset');
  await fresh('zh'); await toDir();
  const tdy = await J(`({h:Math.round(document.querySelector('#dirReco .today').getBoundingClientRect().height)})`);
  ok('"today’s three" are small: the three of them together take less than 215 px (they took 350 before)', tdy.h < 215, tdy);
  ok('the small block comes right after "today"', await J(`(()=>{ const t=document.querySelector('#dirReco .dr-today'), l=document.querySelector('#lsBlock'); return !!t && !!l && !!(t.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING); })()`));
  ok('no long note under "today" and none under the small block (the page says less)', !(await J(`!!document.querySelector('#dirReco .dr-today .dr-note')`)) && !(await J(`!!document.querySelector('#lsBlock > .ls > .dr-note:not(.ls-sub), #lsBlock .ls>.dr-note:not(.ls-sub)')`)));
  ok('its title, the date of the service’s day and a way in', (await J(`document.querySelector('#lsBlock h2').textContent`)).startsWith('今日听什么') && /10月28日/.test(await J(`document.querySelector('#lsBlock h2').textContent`)) && (await J(`document.querySelector('#lsBlock [data-ls-open]').textContent`)) === '进入 ›');
  ok('chips (a Chinese reader): the daily picks, the Chinese chart first, a podcast chart', (await chips('#lsBlock .ls-chips .dr-chip')).join('|') === '每日推荐*|华语热歌|韩流|热门播客', await chips('#lsBlock .ls-chips .dr-chip'));
  let rows = await J(`[...document.querySelectorAll('#lsBlock .ls-row')].map(r=>({t:r.querySelector('.ls-t').textContent, m:r.querySelector('.ls-m').textContent, h:Math.round(r.querySelector('.ls-main').getBoundingClientRect().height)}))`);
  ok('six songs of the hundred, each a row at least 44 px high; a row says who it is by and “试听” when it is only a preview: no length, no “站内播放”', rows.length === 6 && rows.every(x => x.h >= 44) && rows.some(x => /试听/.test(x.m)) && rows.every(x => !/站内播放|\d+:\d\d|30 秒/.test(x.m)), rows);
  ok('the line under the chips says where the songs come from', (await J(`document.querySelector('#lsBlock .ls-sub').textContent`)) === '来源：Deezer · Audius · Apple Music');
  ok('the service was asked for the index and for one list, nothing more', JSON.stringify(await get('/__listen_log')) === JSON.stringify(['', 'daily']), await get('/__listen_log'));
  const sideTxt = await J(`[...document.querySelectorAll('#cats .cat-btn')].map(b=>b.textContent.trim().replace(/\\d+$/,''))`);
  ok('the sidebar has 今日听什么 where "音频" was; "音频" is gone', sideTxt.slice(0, 4).join('|') === '发现|热榜|今日听什么|全部' && !sideTxt.includes('音频'), sideTxt);
  await J(`[...document.querySelectorAll('#lsBlock .ls-chips .dr-chip')].find(b=>b.textContent==='热门播客').click()`); await sleep(900);
  ok('a podcast chart in the small block: episodes of shows (the show as the "artist"), six of them', (await J(`document.querySelectorAll('#lsBlock .ls-row').length`)) === 6 && /Show 0/.test(await J(`document.querySelector('#lsBlock .ls-row .ls-m').textContent`)), await J(`document.querySelector('#lsBlock .ls-row .ls-m').textContent`));
  await J(`[...document.querySelectorAll('#lsBlock .ls-chips .dr-chip')].find(b=>b.textContent==='华语热歌').click()`); await sleep(900);
  await J(`document.querySelector('#lsBlock [data-ls-go]').click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`);
  ok('a click plays it in the bar and the whole list (all ninety, not only the six on the screen) is behind it', (await J(`pl.q.filter(x=>x.startsWith('tmp:ls:')).length`)) === 90, await J(`pl.q.length`));
  await J(`plAudio.pause()`);

  // ================================================ B. the page: music
  await J(`document.querySelector('#lsBlock [data-ls-open]').click()`); await waitFor(`document.querySelector('#lpRoot .lp-songs .lp-sc')`); await sleep(300);
  ok('"进入 ›" opens the page with that list chosen; the sidebar row is the current one; no toolbar of the directory', (await J(`document.querySelector('#cats [data-dlisten]').getAttribute('aria-current')`)) === 'true' && (await J(`document.querySelector('#dirBar').hidden`)) && (await head()).h === '华语热歌', await head());
  ok('a switch keeps music and podcasts apart: 音乐 is the one chosen', (await modes()).join('|') === '音乐*|播客', await modes());
  let tp = await tops();
  ok('ONE strip of lists (music): the daily picks, the charts of the reader’s language first, the play lists, then the styles; the open one is pressed', tp.map(x => x.id).join() === 'daily,hot-cn,kr,hot-west,dzp-3155776842,dzp-7001,dzp-7002,aup-PLaaa,dzp-1313621735,dzp-1111142221,rock,hiphop,classical,chill,video' && tp.filter(x => x.on).map(x => x.id).join() === 'hot-cn', tp.map(x => x.id));
  ok('no tiles, no second row of tags, no “推荐发现” heading: the strip is the only choice of lists', await J(`!document.querySelector('#lpRoot .lp-card, #lpRoot .lp-tags, #lpRoot .lp-top, #lpRoot .lp-cards')`));
  ok('on a wide screen the strip shows fourteen and a button “更多（1）▾” opens the last one and closes it again', tp.filter(x => x.hidden).map(x => x.id).join() === 'video' && (await J(`document.querySelector('#lpRoot [data-lp-more]').textContent`)) === '更多（1）▾' && (await J(`getComputedStyle(document.querySelector('#lpRoot .lp-ch.x')).display`)) === 'none'
    && (await J(`document.querySelector('#lpRoot [data-lp-more]').click(), getComputedStyle(document.querySelector('#lpRoot .lp-ch.x')).display`)) === 'flex' && (await J(`document.querySelector('#lpRoot [data-lp-more]').click(), getComputedStyle(document.querySelector('#lpRoot .lp-ch.x')).display`)) === 'none');
  ok('the last five are the styles (no podcasts among them): 摇滚 说唱 古典 放松 音乐视频(海外)', (await chips('#lpRoot .lp-strip .lp-ch')).slice(-5).join('|') === '摇滚|说唱|古典|放松|音乐视频海外', await chips('#lpRoot .lp-strip .lp-ch'));
  const hl = await J(`(()=>{ const h=document.querySelector('#viewTitle').getBoundingClientRect(), p=document.querySelector('#viewSub').getBoundingClientRect(); return {t:document.querySelector('#viewTitle').textContent, s:document.querySelector('#viewSub').textContent, sameLine:Math.abs((h.bottom+h.top)/2-(p.bottom+p.top)/2)<24 && p.left>h.right-2, fs:parseFloat(getComputedStyle(document.querySelector('#viewTitle')).fontSize), sort:getComputedStyle(document.querySelector('#sort')).display, view:getComputedStyle(document.querySelector('#viewBtn')).display, lf:getComputedStyle(document.querySelector('#langFilter')).display}; })()`);
  ok('the title and its subtitle are one line (the subtitle after the title, no big heading); the top bar’s sort, cards / rows button and language filter are not on this page', hl.t === '今日听什么' && hl.s === '每日新歌/节目，喜欢不重样' && hl.sameLine && hl.fs <= 30 && hl.sort === 'none' && hl.view === 'none' && hl.lf === 'none', hl);
  ok('one row holds the switch (left) and the sort and cards / rows button (right)', await J(`(()=>{ const bar=document.querySelector('#lpRoot .lp-bar'); return !!bar.querySelector('.lp-modes') && !!bar.querySelector('[data-lp-sort]') && !!bar.querySelector('[data-lp-view]') && bar.getBoundingClientRect().height<60; })()`));
  let hd = await head();
  ok('the list that is open: its name, the number of songs, where they come from, "播放全部", the sort', hd.h === '华语热歌' && hd.n === '90 首' && hd.sub === '来源：Apple Music' && hd.sort === 'rank' && hd.opts.join('|') === '推荐序|时长|歌名 / 标题|艺人 / 节目'
    && /播放全部/.test(await J(`document.querySelector('#lpRoot .lp-songs-h [data-lp-all]').textContent`)), hd);

  await pickChip('摇滚');
  hd = await head(); let sg = await songs();
  ok('a style of two hundred songs: thirty are shown, as cards (cover or the artist’s first letter, title, artist, and “试听” for a preview), and a button says how many more', hd.h === '摇滚' && hd.n === '200 首' && hd.sub === '来源：Deezer · Audius · Apple Music' && sg.length === 30
    && sg[0].t.startsWith('rock ') && sg[0].a.startsWith('Artist ') && sg[0].m === '试听' && hd.more === '加载更多（30 / 200）' && (await tops()).filter(x => x.on).map(x => x.id).join() === 'rock', [hd, sg.slice(0, 2)]);
  const rank = await all('rock');
  await scrollDown();
  ok('at the end of the thirty the next thirty come by themselves (no click): sixty', (await songs()).length === 60 && (await head()).more === '加载更多（60 / 200）', [(await songs()).length, (await head()).more]);
  ok('the first thirty were not drawn again (the cards are the same elements: nothing blinks)', await J(`document.querySelectorAll('#lpRoot .lp-sc').length`) === 60);
  for (let k = 0; k < 8 && (await songs()).length < 200; k++) await scrollDown();
  ok('and so on to the end: two hundred, and then no button', (await songs()).length === 200 && (await head()).more === '' && (await J(`!document.querySelector('#lpRoot .lp-end')`)), [(await songs()).length, (await head()).more]);
  await sorted('dur');
  ok('sorted by length: the longest of ALL two hundred first (the sort works on the whole list), thirty shown again', (await songs()).length === 30 && (await J(`(()=>{ const it=state.lp.data.get('rock|zh').items.slice().sort((a,b)=>b.dur-a.dur)[0]; return document.querySelector('#lpRoot .lp-sc .lp-t').textContent===it.title; })()`)));
  await sorted('title'); sg = await songs();
  ok('sorted by title', JSON.stringify(sg.map(x => x.t)) === JSON.stringify(await J(`${JSON.stringify(sg.map(x => x.t))}.slice().sort((a,b)=>a.localeCompare(b,'zh-Hans-CN'))`)) && sg.length === 30, sg.slice(0, 3).map(x => x.t));
  await sorted('artist'); sg = await songs();
  ok('sorted by artist', JSON.stringify(sg.map(x => x.a)) === JSON.stringify(await J(`${JSON.stringify(sg.map(x => x.a))}.slice().sort((a,b)=>a.localeCompare(b,'zh-Hans-CN'))`)));
  ok('the sort and the list are kept for the next visit', (await J(`LS.get('lpSort','')`)) === 'artist' && (await J(`LS.get('lpG','')`)) === 'rock');
  await sorted('rank'); sg = await songs();
  ok('back to the service’s order', JSON.stringify(sg.map(x => x.id)) === JSON.stringify(rank.slice(0, 30).map(x => x.id)));
  await J(`document.querySelector('#lpRoot [data-lp-view]').click()`); await sleep(500);
  ok('the cards / rows button of the page turns the cards into rows (same songs, same order)', (await J(`document.querySelectorAll('#lpRoot .lp-rows .ls-row').length`)) === 30 && (await songs())[0].t === sg[0].t);
  await J(`document.querySelector('#lpRoot [data-lp-view]').click()`); await sleep(500);
  ok('... and back to cards (the choice is the page’s own: the shelf’s view is not touched)', (await J(`document.querySelectorAll('#lpRoot .lp-grid .lp-sc').length`)) === 30 && (await J(`LS.get('lpView','')`)) === 'cards' && (await J(`LS.get('view','')`)) === '');

  // ================================================ C. play
  await c.js('window.__zt.plStop()'); await fetch(POD + '/__reset');
  await J(`document.querySelectorAll('#lpRoot .lp-sc .lp-cv')[2].click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`);
  let b = await J(`({title:document.querySelector('#plTitle').textContent, q:pl.q.slice(), i:pl.i, src:plAudio.currentSrc})`);
  ok('a click on a cover plays that song; the bar’s list is the whole list from that one on (the third to the two-hundredth: 198), also what is not drawn yet', /^rock /.test(b.title) && b.q.length === 198 && b.q[b.i] === 'tmp:ls:' + rank[2].id && b.q[197] === 'tmp:ls:' + rank[199].id && b.src.startsWith(POD), [b.title, b.q.length]);
  ok('the card that plays is marked', (await songs())[2].playing && !(await songs())[0].playing);
  await J(`document.querySelector('#plNext').click()`); await waitFor(`/^rock /.test(document.querySelector('#plTitle').textContent) && !/Gone/.test(document.querySelector('#plTitle').textContent) && !plAudio.paused && document.querySelector('#plTitle').textContent!==${JSON.stringify(b.title)}`, 12000);
  ok('"next" lands on the song whose sound is gone (the fourth): the bar says so and goes on to the fifth by itself', /放不了，已跳到下一首/.test(await J(`document.querySelector('#toastMsg').textContent`)) && (await J(`pl.q[pl.i]`)) === 'tmp:ls:' + rank[4].id, [await J(`document.querySelector('#toastMsg').textContent`), await J(`pl.q[pl.i]`)]);
  await J(`plAudio.pause()`);
  await J(`document.querySelector('#lpRoot .lp-songs-h [data-lp-all]').click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`);
  ok('"播放全部" plays the first song of the list', (await J(`pl.q[pl.i]`)) === 'tmp:ls:' + rank[0].id, await J(`pl.q[pl.i]`));
  await J(`plAudio.pause()`);
  await pickTile('hot-west'); await J(`document.querySelector('#lpRoot .lp-songs-h [data-lp-all]').click()`); await waitFor(`/^hot-west /.test(document.querySelector('#plTitle').textContent) && !plAudio.paused`, 9000);
  ok('“播放全部” of another list loads that list and plays it from its first song', (await get('/__listen_log')).includes('hot-west') && (await head()).h === '欧美热歌', await head());
  await J(`plAudio.pause()`);

  // ================================================ D. podcasts: their own side, charts, categories, the shows of the directory
  await tab('podcast');
  hd = await head(); tp = await tops(); sg = await songs();
  ok('the switch moves to 播客: its list is the first podcast chart; "music" is not mixed in', (await modes()).join('|') === '音乐|播客*' && hd.h === '热门播客' && hd.n === '200 集' && sg.length === 30 && sg.every(x => /Episode \d+ of pod-hot-zh/.test(x.t)), [hd, await modes()]);
  ok('the strip (podcasts): the charts of the countries (the Chinese one first for this reader), the shows of the directory, then the categories', tp.map(x => x.id).join() === 'pod-hot,pod-cn,pod-us,pod,pc-news,pc-story,pc-english,pc-business' && tp[0].on, tp.map(x => x.id));
  ok('the last four are the categories: 新闻 故事 英语学习 商业 (not the styles of music)', (await chips('#lpRoot .lp-strip .lp-ch')).slice(-4).join('|') === '新闻|故事|英语学习|商业', await chips('#lpRoot .lp-strip .lp-ch'));
  ok('an episode of a chart says its show and how hot it is (its place in the chart); no length, no date, no “站内播放”', /^Show 0$/.test(sg[0].a) && sg[0].m === '🔥 第 1 名', sg[0]);
  ok('the sort has "榜单序" (the chart’s order), "最新", length, title and show', hd.opts.join('|') === '榜单序|最新|时长|歌名 / 标题|节目', hd.opts);
  await sorted('new'); sg = await songs();
  ok('sorted by newest: the newest of all two hundred first', (await J(`(()=>{ const it=state.lp.data.get('pod-hot|zh').items.slice().sort((a,b)=>b.date.localeCompare(a.date))[0]; return document.querySelector('#lpRoot .lp-sc .lp-t').textContent===it.title; })()`)));
  await sorted('rank');
  await pickChip('英语学习');
  hd = await head();
  ok('a category: its name, its episodes, "来源：Apple Podcasts"; the chip is the pressed one', hd.h === '英语学习' && hd.n === '40 集' && hd.sub === '来源：Apple Podcasts' && (await chips('#lpRoot .lp-strip .lp-ch')).slice(-4).join('|') === '新闻|故事|英语学习*|商业', [hd, await chips('#lpRoot .lp-strip .lp-ch')]);
  await J(`document.querySelectorAll('#lpRoot .lp-sc .lp-cv')[1].click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`);
  ok('an episode of a chart plays whole in the bar, with its show as the "show" of the bar, and the ones after it follow', /Episode 1 of pc-english-zh/.test(await J(`document.querySelector('#plTitle').textContent`)) && /Show 1/.test(await J(`document.querySelector('#plSub').textContent`)) && (await J(`pl.q.length`)) >= 39, [await J(`document.querySelector('#plTitle').textContent`), await J(`document.querySelector('#plSub').textContent`)]);
  await J(`plAudio.pause()`);
  await pickTile('pod');
  hd = await head(); sg = await songs();
  ok('the shows of the directory: a chip for each show, newest first, with the number of episodes; the newest episode of each show is the list', (await chips('#lpRoot .lp-shows .dr-chip')).join('|') === '全部节目*|今夜不设防2|铿锵三人行3|English Podcast2'
    && hd.h === '目录里的节目' && hd.n === '3 集' && sg.map(x => x.t).join('|') === '今夜不设防 第2集|铿锵三人行 第3集|English Podcast 第2集' && hd.opts[0] === '最新', [hd, sg.map(x => x.t), await chips('#lpRoot .lp-shows .dr-chip')]);
  await J(`[...document.querySelectorAll('#lpRoot .lp-shows .dr-chip')].find(b=>b.textContent.startsWith('铿锵三人行')).click()`); await sleep(400);
  hd = await head(); sg = await songs();
  ok('a show: all its episodes, newest first, under its own name', hd.h === '铿锵三人行' && hd.n === '3 集' && sg.map(x => x.t).join('|') === '铿锵三人行 第3集|铿锵三人行 第2集|铿锵三人行 第1集' && sg.every(x => x.a === '铿锵三人行'), [hd, sg.map(x => x.t)]);
  await c.js('window.__zt.plStop()');
  await J(`document.querySelectorAll('#lpRoot .lp-sc .lp-cv')[1].click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`);
  ok('an episode of a show plays and the episodes after it follow', /铿锵三人行 第2集/.test(await J(`document.querySelector('#plTitle').textContent`)) && (await J(`pl.q.filter(x=>x.startsWith('tmp:ls:pod:')).length`)) === 2, await J(`pl.q`));
  await J(`plAudio.pause()`);
  await tab('music');
  ok('the switch back to 音乐 returns to the music list chosen last (欧美热歌), not to a podcast one', (await head()).h === '欧美热歌' && (await modes()).join('|') === '音乐*|播客', [await head(), await modes()]);

  // ================================================ E. a music video is not a song of the bar
  await pickChip('音乐视频');
  hd = await head(); sg = await songs();
  ok('videos: six cards that say “overseas” (they need a network outside China) and nothing else about the player', hd.h === '音乐视频' && sg.length === 6 && sg.every(x => /海外/.test(x.m) && !/平台播放器/.test(x.m)) && sg.every(x => x.src === ''), sg.slice(0, 2));
  await J(`document.querySelectorAll('#lpRoot .lp-sc .lp-cv')[1].click()`); await sleep(500);
  ok('a click opens YouTube’s own player in a window', (await J(`document.querySelector('#embedDlg').open`)) && (await J(`(document.querySelector('#embedBox iframe')||{}).src`)) === 'https://www.youtube-nocookie.com/embed/abcdefghi01?rel=0&playsinline=1');
  await J(`document.querySelector('#embedDone').click()`); await sleep(300);

  // ================================================ F. a list that cannot be read, then can
  await get('/__listen?mode=ok&fail=hiphop');
  await pickChip('说唱');
  ok('a list the service cannot give says so, with a button', /这个榜单现在读不到/.test(await J(`document.querySelector('#lpRoot .lp-songs').textContent`)) && (await J(`!!document.querySelector('#lpRoot [data-lp-retry]')`)));
  await get('/__listen?mode=ok'); await J(`document.querySelector('#lpRoot [data-lp-retry]').click()`); await waitFor(`document.querySelector('#lpRoot .lp-sc')`); await sleep(300);
  ok('"重试" asks again and the list is there', (await songs()).length === 30 && (await head()).h === '说唱');

  // ================================================ G. kept for the next visit
  await c.goto(BASE, 2500); await toDir(); await openPage();
  ok('the list chosen last time is the one shown (the page remembers it in this browser)', (await head()).h === '说唱', await head());

  // ================================================ H. English: what comes first, the words, and what the service is told
  await get('/__listen?mode=ok&reset=1');
  await fresh('en'); await toDir();
  ok('English: the small block: Western hits first, the podcast chart', /^What to listen to today/.test(await J(`document.querySelector('#lsBlock h2').textContent`)) && (await chips('#lsBlock .ls-chips .dr-chip')).join('|') === 'Daily picks*|Western hits|Korea|Top podcasts' && (await J(`document.querySelector('#lsBlock [data-ls-open]').textContent`)) === 'Open ›', await chips('#lsBlock .ls-chips .dr-chip'));
  ok('the service is told the reader’s language, for the index and for the list', JSON.stringify(await get('/__listen_log')) === JSON.stringify(['@en', 'daily@en']), await get('/__listen_log'));
  ok('the daily picks of an English reader are other songs than a Chinese reader’s', /daily-en/.test(await J(`document.querySelector('#lsBlock .ls-row .ls-t').textContent`)), await J(`document.querySelector('#lsBlock .ls-row .ls-t').textContent`));
  await openPage();
  hd = await head(); tp = await tops();
  ok('English: the page, the switch, the strip in the reader’s order (Western before Chinese), the count, the subtitle, the sort', (await modes()).join('|') === 'Music*|Podcasts' && tp.map(x => x.id).join() === 'daily,hot-west,kr,hot-cn,dzp-1313621735,dzp-1111142221,dzp-3155776842,dzp-7001,dzp-7002,aup-PLaaa,rock,hiphop,classical,chill,video' && hd.n === '100 songs' && (await J(`document.querySelector('#viewSub').textContent`)) === 'New songs and shows every day, never the same twice' && hd.opts.join('|') === 'Recommended|Length|Title|Artist / show', [hd, tp.map(x => x.id)]);
  ok('English: the styles', (await chips('#lpRoot .lp-strip .lp-ch')).slice(-5).join('|') === 'Rock|Hip-hop & rap|Classical|Chill|Music videosGlobal');
  ok('English: a preview says “Preview”, a whole song says nothing more than who it is by', (await songs()).some(x => x.m === 'Preview') && (await songs()).some(x => x.m === ''), (await songs()).slice(0, 3).map(x => x.m));
  await tab('podcast'); hd = await head(); tp = await tops();
  ok('English: podcasts: "Top podcasts" first, then the US chart; the categories in English; a load-more button in English', hd.h === 'Top podcasts' && hd.n === '200 episodes' && tp.map(x => x.id).join() === 'pod-hot,pod-us,pod-cn,pod,pc-news,pc-story,pc-english,pc-business' && hd.more === 'Load more (30 / 200)'
    && (await chips('#lpRoot .lp-strip .lp-ch')).slice(-4).join('|') === 'News|Stories|Learn English|Business' && hd.opts.join('|') === 'Chart order|Newest|Length|Title|Show', [hd, tp.map(x => x.id)]);
  await c.js('window.__zt.plStop()');

  // ================================================ I. the language button on the page (the footer): "auto" and one button that switches
  await J(`document.body.classList.remove('drawer')`);
  ok('the footer has "自动" and ONE language button that says the language now (not three buttons)', (await J(`[...document.querySelectorAll('.side-foot .seg button')].map(b=>b.textContent).join('|')`)) === 'Auto|EN', await J(`[...document.querySelectorAll('.side-foot .seg button')].map(b=>b.textContent).join('|')`));
  await get('/__listen?mode=ok&reset=1');
  await J(`document.querySelector('#langBtn').click()`); await sleep(1500); await tab('music'); await sleep(500);
  hd = await head(); tp = await tops();
  ok('the button switches to 中文 at once: the page, the order of the tiles and what the service is asked for follow (a second tap goes back)', (await J(`state.lang`)) === 'zh' && (await J(`state.langAuto`)) === false && tp.map(x => x.id).slice(0, 4).join() === 'daily,hot-cn,kr,hot-west' && (await modes()).join('|') === '音乐*|播客' && (await get('/__listen_log')).some(x => x === '') , [await get('/__listen_log'), tp.map(x => x.id)]);
  await J(`document.querySelector('#langBtn').click()`); await sleep(1200);
  ok('... a second tap: English again', (await J(`state.lang`)) === 'en' && (await J(`document.querySelector('#langBtn').textContent`)) === 'EN');
  await J(`document.querySelector('[data-lang="auto"]').click()`); await sleep(800);
  ok('"自动" follows the system again (the button still says the language shown)', (await J(`state.langAuto`)) === true && (await J(`document.querySelector('[data-lang="auto"]').getAttribute('aria-pressed')`)) === 'true');

  // ================================================ J. a service that says rubbish, is down, is empty
  await get('/__listen?mode=junk&reset=1');
  await fresh('zh'); await toDir(); await openPage();
  tp = await tops();
  ok('rubbish is dropped: a list with a bad id, an unknown kind, no name, things that are not lists; the good ones stay (and the podcast one is on the podcast side)', tp.map(x => x.id).join() === 'good2,good' && (await chips('#lpRoot .lp-strip .lp-ch')).join('|') === '也好*|好的' && (await modes()).join('|') === '音乐*|播客', [tp.map(x => x.id), await chips('#lpRoot .lp-strip .lp-ch')]);
  await pickChip('好的'); sg = await songs();
  ok('the one good song is shown as TEXT, its picture is not http, its address is not a javascript: link, a date that is not a date is not shown; the song with a javascript: sound, a bad kind and no id are gone', sg.length === 1 && sg[0].t === '<img src=x onerror=alert(1)>' && !sg[0].img && sg[0].src === '' && dialogs.length === 0 && (await J(`document.querySelectorAll('#lpRoot img').length`)) === 0, [sg, dialogs]);
  await get('/__listen?mode=down&reset=1');
  await fresh('zh'); await toDir();
  ok('the service is down: the discovery block keeps the shows of the directory', (await chips('#lsBlock .ls-chips .dr-chip')).join('|') === '目录里的节目*', await chips('#lsBlock .ls-chips .dr-chip'));
  await openPage();
  ok('... and the page is the shows of the directory (the sidebar row stays; no switch, as there is no music; no error that hides them)', (await head()).h === '目录里的节目' && (await tops()).length === 1 && (await songs()).length === 3 && (await modes()).length === 0, [await head(), await modes()]);
  ok('a failed index is not asked again on every repaint', (await get('/__listen_asked')) === 1, await get('/__listen_log'));
  withPods(false); await get('/__listen?mode=down&reset=1');
  await fresh('zh'); await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(2500);
  ok('no podcasts and the service down: nothing on the discovery page; the sidebar row is there', (await J(`!document.querySelector('#lsBlock .ls')`)));
  await openPage();
  ok('... the page says the list cannot be read and offers "重试"', /现在读不到/.test(await J(`document.querySelector('#lpRoot').textContent`)) && (await J(`!!document.querySelector('#lpRoot [data-lp-retry]')`)));
  withPods(true); await get('/__listen?mode=ok&reset=1');

  // ================================================ K. a phone: rows, ONE strip that scrolls sideways, the songs on the first screen, a swipe changes the list
  await c.mobile(375, 812, 2);
  await fresh('zh', null); await toDir();
  const ph0 = await J(`({sw:document.documentElement.scrollWidth, iw:innerWidth, today:Math.round(document.querySelector('#dirReco .today').getBoundingClientRect().height), heroTop:Math.round(document.querySelector('#dirReco .hero').getBoundingClientRect().top), vh:innerHeight, rows:document.querySelectorAll('#lsBlock .ls-row').length})`);
  ok('a phone: "today’s three" are under 340 px and the hero is on the first screen; the small block shows four rows; no sideways scroll', ph0.sw <= ph0.iw && ph0.today < 340 && ph0.heroTop < ph0.vh * 0.6 && ph0.rows === 4, ph0);
  await J(`document.body.classList.add('drawer')`); await sleep(300); await J(`document.querySelector('#cats [data-dlisten]').click()`); await waitFor(`document.querySelector('#lpRoot .ls-row')`); await sleep(400);
  const ph = await J(`(()=>{ const q=s=>document.querySelector(s), r=e=>Math.round(e.getBoundingClientRect().height), st=q('#lpRoot .lp-strip'), first=q('#lpRoot .lp-rows .ls-row');
    return {sw:document.documentElement.scrollWidth, iw:innerWidth, rowsMode:!!q('#lpRoot .lp-rows') && !q('#lpRoot .lp-grid'), ox:getComputedStyle(st).overflowX, wrap:getComputedStyle(st).flexWrap, wide:st.scrollWidth>st.clientWidth+2, moreb:getComputedStyle(q('#lpRoot .lp-moreb')).display, xshown:getComputedStyle(q('#lpRoot .lp-ch.x')).display,
      firstTop:Math.round(first.getBoundingClientRect().top), vh:innerHeight, sortH:r(q('#lpRoot [data-lp-sort]')), viewH:r(q('#lpRoot [data-lp-view]')), allH:r(q('#lpRoot .lp-songs-h [data-lp-all]')), focusH:r(q('#lpRoot .lp-songs-h [data-lp-focus]')), modeH:Math.min(...[...document.querySelectorAll('#lpRoot .lp-modes button')].map(r)), chipH:Math.min(...[...document.querySelectorAll('#lpRoot .lp-ch')].map(r)), drawer:document.body.classList.contains('drawer')}; })()`);
  ok('a phone: rows by default; the strip scrolls sideways (all the chips, no “more” button); the first song is on the first screen; nothing scrolls sideways', ph.sw <= ph.iw && ph.rowsMode && ph.ox === 'auto' && ph.wrap === 'nowrap' && ph.wide && ph.moreb === 'none' && ph.xshown === 'flex' && ph.firstTop < ph.vh * 0.6, ph);
  ok('a phone: every control at least 44 px (sort, rows / cards, play all, focus, the music / podcasts switch) and the chips 40', ph.sortH >= 44 && ph.viewH >= 44 && ph.allH >= 44 && ph.focusH >= 44 && ph.modeH >= 44 && ph.chipH >= 40, ph);
  ok('the left list is closed (the page is the page)', !ph.drawer, ph);
  const swipe = async (x1, x2, y = 560) => { await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] }); for (let i = 1; i <= 6; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 6, y }] }); await sleep(12); } await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(900); };
  const cur = () => J(`state.lp.g`);
  const was = await cur();
  await swipe(300, 90);
  ok('a swipe to the left on the songs: the next list of the strip (daily picks → Chinese hits), the strip shows it pressed', was === 'daily' && (await cur()) === 'hot-cn' && (await tops()).filter(x => x.on).map(x => x.id).join() === 'hot-cn', [was, await cur()]);
  ok('the pressed chip is in view in the strip', await J(`(()=>{ const st=document.querySelector('#lpRoot .lp-strip'), on=st.querySelector('[aria-pressed="true"]'), a=st.getBoundingClientRect(), b=on.getBoundingClientRect(); return b.left>=a.left-1 && b.right<=a.right+1; })()`));
  await swipe(90, 300);
  ok('a swipe to the right: back to the first one', (await cur()) === 'daily', await cur());
  await swipe(90, 300);
  ok('a swipe to the right on the first one does nothing, and does not pull the left list out', (await cur()) === 'daily' && !(await J(`document.body.classList.contains('drawer')`)), [await cur(), await J(`document.body.className`)]);
  await J(`document.querySelector('#lpRoot [data-lp-mode="podcast"]').click()`); await waitFor(`document.querySelector('#lpRoot .ls-row')`); await sleep(600);
  ok('a phone: the podcast side too: a chart’s rows say the show and the place in the chart', await J(`(()=>{ const m=document.querySelector('#lpRoot .lp-rows .ls-m').textContent; return /^Show 0 · 🔥 第 1 名$/.test(m); })()`), await J(`document.querySelector('#lpRoot .lp-rows .ls-m').textContent`));
  await scrollDown();
  ok('a phone: scrolling to the end loads the next thirty too', (await songs()).length === 60, (await songs()).length);
  await J(`window.scrollTo(0,0)`); await J(`document.querySelector('#lpRoot [data-lp-view]').click()`); await sleep(500);
  ok('a phone: the button turns the rows into two columns of cards', (await J(`getComputedStyle(document.querySelector('#lpRoot .lp-grid')).gridTemplateColumns.split(' ').length`)) === 2);
  await J(`document.querySelectorAll('#lpRoot .lp-sc .lp-cv')[0].click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`);
  ok('a phone plays a song in the bar and the page is not wider than the screen', await J(`!document.querySelector('#player').hidden && document.documentElement.scrollWidth<=innerWidth`));
  await c.desktop(1280, 900, 1);

  // ================================================ L. what a new reader gets: rows (also on a wide screen), the heat of a chart, the choice kept
  await get('/__listen?mode=ok&reset=1');
  await fresh('zh', null); await toDir(); await openPage();
  await tab('music'); await pickTile('hot-cn');
  ok('a new reader gets rows, also on a wide screen (a chart is read down a list), two columns of them', (await J(`document.querySelectorAll('#lpRoot .lp-rows .ls-row').length`)) === 30 && !(await J(`!!document.querySelector('#lpRoot .lp-grid')`)) && (await J(`getComputedStyle(document.querySelector('#lpRoot .lp-rows')).gridTemplateColumns.split(' ').length`)) === 2);
  sg = await songs();
  ok('a chart says how hot a song is (its place in the chart) and “试听” for a preview, after who it is by: nothing else', /^Artist [A-Z] · 🔥 第 1 名 · 试听$/.test(sg[0].m) && sg.every(x => !/站内播放|\d+:\d\d|30 秒/.test(x.m)), sg.slice(0, 2).map(x => x.m));
  await sorted('title'); sg = await songs();
  ok('sorted by title the place in the chart stays the one of the chart (the number after the name is the song’s place minus one)', sg.every(x => { const i = +/(\d+)$/.exec(x.t)[1]; return x.m.includes('第 ' + (i + 1) + ' 名'); }), sg.slice(0, 3).map(x => [x.t, x.m]));
  await sorted('rank');
  await pickTile('daily'); sg = await songs();
  ok('the daily picks are not a chart: no place, only who it is by (and “试听”)', sg.every(x => !/🔥/.test(x.m)) && sg.some(x => !/试听/.test(x.m)), sg.slice(0, 3).map(x => x.m));
  await J(`document.querySelector('#lpRoot [data-lp-view]').click()`); await sleep(500);
  ok('the button makes it cards, and the choice is kept for the next visit', (await J(`!!document.querySelector('#lpRoot .lp-grid')`)) && (await J(`LS.get('lpView','')`)) === 'cards');
  await c.goto(BASE, 2500); await toDir(); await openPage();
  ok('... after a reload it is still cards', await J(`!!document.querySelector('#lpRoot .lp-grid')`));
  await J(`document.querySelector('[data-space="dir"]') && document.querySelector('#cats [data-dbrowse="0"]').click()`); await sleep(900);
  ok('the rest of the page is not touched: the discovery page has its own sort and cards / rows button again', (await J(`getComputedStyle(document.querySelector('#sort')).display`)) !== 'none' && (await J(`getComputedStyle(document.querySelector('#viewBtn')).display`)) !== 'none');

  ok('no script errors in the whole run', errs.length === 0, errs);

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
