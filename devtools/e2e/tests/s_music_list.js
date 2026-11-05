// e2e: the music side of "今日听什么": three tabs (for you / charts / discover) instead of one strip of dozens of chips; a song is a clean row (rank, cover, title, artist, ♥, ⋯: no source, no heat, no arrow, no
// play button); ♥ and the menu of ⋯ (play next, add to a play list, like, not this kind); my things (liked, recent, play lists) kept in this browser; a click on a song makes its list the list of the bar;
// the region switch; the podcast side keeps its lists. (demo app :8820, fake services :8840 and :8843; headless Edge)
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
  const fresh = async (lang = 'zh') => {
    await fetch(SVC + '/__listen?mode=ok&reset=1');
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang, 1200);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1200);
    await waitFor(`document.querySelector('#cats [data-dlisten]')`, 8000);
    await J(`document.querySelector('#cats [data-dlisten]').click()`);
    await waitFor(`document.querySelector('#lpRoot .lp-tabs') && document.querySelector('#lpRoot .lp-forrows .ls-row')`, 9000); await sleep(300);
  };
  const tab = async k => { await J(`window.scrollTo(0,0); document.querySelector('#lpRoot [data-lp-tab="${k}"]').click()`); await sleep(500); };
  const rows = () => J(`[...document.querySelectorAll('#lpRoot .ls-row[data-ls-row]')].map(r=>r.dataset.lsRow)`);
  const cards = () => J(`[...document.querySelectorAll('#lpRoot .lp-forrows .ls-row')].map(r=>r.dataset.lsRow)`);
  await c.desktop(1280, 900, 1);
  await fresh('zh');

  // ------------------------------------------------ the three tabs
  const top = await J(`({tabs:[...document.querySelectorAll('#lpRoot .lp-tab')].map(b=>b.textContent+(b.getAttribute('aria-selected')==='true'?'*':'')).join('|'), region:!!document.querySelector('#lpRoot .lp-region'), oneRow:!!document.querySelector('#lpRoot .lp-bar .lp-modes') && !!document.querySelector('#lpRoot .lp-bar .lp-tabs'), chips:document.querySelectorAll('#lpRoot .lp-strip .dr-chip').length, sort:!!document.querySelector('#lpRoot [data-lp-sort], #lpRoot [data-lp-sortgo]'), view:!!document.querySelector('#lpRoot [data-lp-view]'), modes:[...document.querySelectorAll('#lpRoot .lp-modes button')].map(b=>b.textContent).join('|')})`);
  ok('the mode (music | podcasts) and the three tabs are ONE row; there is no switch for the region, no strip of chips, no sort and no card / row button on the music side', top.tabs === '推荐*|榜单|发现' && !top.region && top.oneRow && top.chips === 0 && !top.sort && !top.view && top.modes === '音乐|播客', top);

  // ------------------------------------------------ for you
  const rec = await J(`({hero:document.querySelectorAll('#lpRoot .lp-hero').length, heads:[...document.querySelectorAll('#lpRoot .lp-h')].map(h=>h.textContent).join('|'), order:(()=>{ const a=document.querySelector('#lpRoot .lp-shelf'), b=document.querySelector('#lpRoot .lp-forrows'); return !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); })(), songs:document.querySelectorAll('#lpRoot .lp-forrows .ls-row').length, cards:document.querySelectorAll('#lpRoot .lp-sc, #lpRoot .lp-songrow').length, mine:[...document.querySelectorAll('#lpRoot .lp-my')].map(b=>b.textContent.replace(/\s+/g,'')).join('|'), first3:[...document.querySelectorAll('#lpRoot .lp-shelf > *')].slice(0,3).every(b=>b.classList.contains('lp-my')), shelf:[...document.querySelectorAll('#lpRoot .lp-shelf .lp-gct')].map(b=>b.textContent).join('|'), play:(document.querySelector('#lpRoot .lp-playall')||{}).title, again:document.querySelectorAll('#lpRoot [data-lp-batch]').length, more:!!document.querySelector('#lpRoot .lp-end'), hearts:document.querySelectorAll('#lpRoot .lp-forrows .ls-like').length})`);
  ok('"for you": no radio card; the play lists FIRST (a row that BEGINS with my three squares: liked, recent, my lists, each with its number, then the featured lists, not the charts), then the songs for you as ROWS (thirty, a button for more at the end, ♥ on each), with an icon “播放” and an icon “换一批” at the head; no cards of songs', rec.hero === 0 && rec.heads === '精选歌单|为你推荐' && rec.order && rec.songs === 30 && rec.cards === 0 && rec.mine === '0我喜欢的|0最近播放|0我的歌单' && rec.first3 && /bedroom rave/.test(rec.shelf) && !/Top 100/.test(rec.shelf) && rec.play === '播放' && rec.again === 1 && rec.more && rec.hearts === 30, rec);
  await tab('chart');
  const row = await J(`(()=>{ const r=document.querySelector('#lpRoot .ls-row'), t=r.querySelector('.ls-t'), cs=getComputedStyle(t), rr=r.getBoundingClientRect(); return {h:Math.round(rr.height), size:cs.fontSize, ff:cs.fontFamily, weight:cs.fontWeight, artist:getComputedStyle(r.querySelector('.ls-m')).fontSize, src:!!r.querySelector('.ls-src'), ic:!!r.querySelector('.ls-ic'), like:!!r.querySelector('.ls-like'), more:!!r.querySelector('.ls-more'), cv:Math.round(r.querySelector('.ls-cv').getBoundingClientRect().width), meta:r.querySelector('.ls-m').textContent, heat:/🔥/.test(r.textContent)}; })()`);
  ok('a song is a clean row: 60px high, cover 48, title 16px in the sans family, artist 13px, ♥ and ⋯; no link to the source, no play circle, no heat', row.h >= 56 && row.cv === 48 && row.size === '16px' && !/Noto Serif|Songti|STSong|Georgia|Times/i.test(row.ff) && row.artist === '13px' && row.like && row.more && !row.src && !row.ic && !row.heat && /^Artist/.test(row.meta), { h: row.h, cv: row.cv, size: row.size, weight: row.weight, artist: row.artist, like: row.like, more: row.more, src: row.src, ic: row.ic, heat: row.heat, meta: row.meta, serif: /Noto Serif|Songti|STSong|Georgia|Times/i.test(row.ff) });
  await tab('rec');
  const c0 = await cards();
  await J(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(1100);
  const c60 = await cards();
  ok('at the end of the thirty the next thirty come by themselves (no click): sixty, and the first thirty are the same rows (nothing blinks); no place in front of any song (the mix has chart songs, a place means nothing there)', c60.length === 60 && c60.slice(0, 30).join() === c0.join() && await J(`!document.querySelector('#lpRoot .lp-forrows .ls-n')`), [c0.length, c60.length]);
  await J(`window.scrollTo(0,0)`); await sleep(200);
  await J(`document.querySelector('#lpRoot [data-lp-batch]').click()`); await sleep(400);
  const c1 = await cards();
  ok('"Next batch" (the icon at the head of the songs) starts another batch: back to thirty rows, all of them others than the first thirty before', c1.length === 30 && c1[0] !== c0[0] && !c1.some(x => c0.includes(x)), [c0[0], c1[0], c1.length]);
  await J(`document.querySelector('#lpRoot [data-lp-radio]').click()`);
  ok('the icon “播放” plays the songs for you: the whole list (more than a hundred songs) is the list of the bar, the first one plays', await waitFor(`pl.q.length>=100 && pl.q[pl.i]==='tmp:ls:${c1[0]}' && plAudio.currentTime>0.05`, 8000), [await J(`pl.q.length`), await J(`pl.q[pl.i]`)]);
  await J(`document.querySelector('#lpRoot .lp-forrows .ls-row[data-ls-row="${c1[5]}"] .ls-main').click()`);
  ok('a click on a song makes the list on the screen the list of the bar, from that song; the row that plays is marked', await waitFor(`pl.q.length>=100 && pl.q[pl.i]==='tmp:ls:${c1[5]}'`, 6000) && await J(`document.querySelector('#lpRoot .ls-row[data-ls-row="${c1[5]}"]').classList.contains('is-playing')`), [await J(`pl.q.length`), await J(`pl.q[pl.i]`)]);
  await J(`plAudio.pause()`);
  await tab('chart');
  const r1 = await rows();

  // ------------------------------------------------ ♥
  await J(`document.querySelector('#lpRoot .ls-row[data-ls-row="${r1[1]}"] .ls-like').click()`); await sleep(300);
  ok('♥ likes a song: the heart is on, it is kept in this browser, and the page says so', (await J(`document.querySelector('#lpRoot .ls-row[data-ls-row="${r1[1]}"] .ls-like').getAttribute('aria-pressed')`)) === 'true' && (await J(`LS.get('lpLikes',[]).length`)) === 1 && (await J(`LS.get('lpLikes',[])[0].id`)) === r1[1] && (await J(`document.querySelector('#toastMsg').textContent`)) === '已加入“我喜欢的”');
  await tab('chart'); await tab('rec');
  ok('"liked" on the first tab counts it', (await J(`document.querySelector('#lpRoot [data-lp-my="my:likes"] b').textContent`)) === '1');
  await J(`document.querySelector('#lpRoot [data-lp-my="my:likes"]').click()`); await sleep(400);
  const lk = await J(`({title:document.querySelector('#lpRoot .lp-songs-h h3').textContent, back:!!document.querySelector('#lpRoot .lp-back'), rows:document.querySelectorAll('#lpRoot .ls-row').length, tabs:document.querySelectorAll('#lpRoot .lp-tab').length})`);
  ok('"liked" opens the songs that were liked, with a back arrow', lk.title === '我喜欢的' && lk.back && lk.rows === 1 && lk.tabs === 3, lk);
  await J(`document.querySelector('#lpRoot .ls-row .ls-like').click()`); await sleep(300);
  ok('♥ again takes it out (the list there is empty now)', (await J(`LS.get('lpLikes',[]).length`)) === 0 && (await J(`document.querySelectorAll('#lpRoot .ls-row').length`)) === 0 && /还没有歌曲/.test(await J(`document.querySelector('#lpRoot .hot-state').textContent`)));
  await J(`document.querySelector('#lpRoot [data-lp-back]').click()`); await sleep(300);
  ok('the back arrow goes to the first tab', await J(`!!document.querySelector('#lpRoot .lp-shelf') && !!document.querySelector('#lpRoot .lp-forrows')`));

  // ------------------------------------------------ the menu of ⋯
  await J(`window.scrollTo(0,0)`); await tab('chart');
  await J(`document.querySelector('#lpRoot .ls-row[data-ls-row="${r1[2]}"] .ls-more').click()`); await sleep(400);
  const mn = await J(`({open:document.querySelector('#lsMenu').open, head:document.querySelector('#lsmHead .ls-t').textContent, acts:[...document.querySelectorAll('#lsmBody [data-lsm]')].map(b=>b.textContent.trim()).join('|')})`);
  ok('⋯ opens a sheet: the song, and play next / add to a play list / like / not this kind', mn.open && mn.acts === '下一首播放|加入歌单|喜欢|不想听这类' && mn.head.length > 3, mn);
  const mid = await J(`(()=>{ const d=document.querySelector('#lsMenu'), r=d.getBoundingClientRect(), cs=getComputedStyle(d); return {cx:Math.round((r.left+r.right)/2), vw:document.documentElement.clientWidth, top:Math.round(r.top), bottomGap:Math.round(innerHeight-r.bottom), w:Math.round(r.width), radius:[cs.borderTopLeftRadius,cs.borderTopRightRadius,cs.borderBottomLeftRadius,cs.borderBottomRightRadius].join('|')}; })()`);
  ok('the menu is a window in the middle of the screen (centred, with room above and below, four round corners), not a drawer at the bottom', Math.abs(mid.cx - mid.vw / 2) <= 2 && mid.top >= 40 && mid.bottomGap >= 40 && new Set(mid.radius.split('|')).size === 1 && mid.radius.split('|')[0] !== '0px', mid);
  await J(`document.querySelector('#lsmBody [data-lsm="next"]').click()`); await sleep(300);
  ok('"play next" puts the song right after the one that plays, and the sheet closes', (await J(`pl.q[pl.i+1]`)) === 'tmp:ls:' + r1[2] && !(await J(`document.querySelector('#lsMenu').open`)), [await J(`pl.q[pl.i+1]`), r1[2]]);
  await J(`document.querySelector('#lpRoot .ls-row[data-ls-row="${r1[3]}"] .ls-more').click()`); await sleep(300);
  await J(`document.querySelector('#lsmBody [data-lsm="add"]').click()`); await sleep(200);
  ok('"add to a play list" shows the lists there are (none yet) and a field for a new one', (await J(`!!document.querySelector('#lsmBody [data-lsm-new] input')`)) && (await J(`document.querySelectorAll('#lsmBody [data-lsm-list]').length`)) === 0);
  await J(`(()=>{ const f=document.querySelector('#lsmBody [data-lsm-new]'); f.querySelector('input').value='晨跑'; f.requestSubmit(); })()`); await sleep(400);
  ok('a new play list is made with the song in it', (await J(`LS.get('lpLists',[]).length`)) === 1 && (await J(`LS.get('lpLists',[])[0].name`)) === '晨跑' && (await J(`LS.get('lpLists',[])[0].songs[0].id`)) === r1[3] && (await J(`document.querySelector('#toastMsg').textContent`)) === '已加入“晨跑”');
  await J(`document.querySelector('#lpRoot .ls-row[data-ls-row="${r1[3]}"] .ls-more').click()`); await sleep(300);
  await J(`document.querySelector('#lsmBody [data-lsm="add"]').click()`); await sleep(200);
  await J(`document.querySelector('#lsmBody [data-lsm-list]').click()`); await sleep(300);
  ok('the same song again: the page says it is there already', (await J(`document.querySelector('#toastMsg').textContent`)) === '歌单里已经有这首了' && (await J(`LS.get('lpLists',[])[0].songs.length`)) === 1);
  await J(`document.querySelector('#lpRoot .ls-row[data-ls-row="${r1[4]}"] .ls-more').click()`); await sleep(300);
  await J(`document.querySelector('#lsmBody [data-lsm="no"]').click()`); await sleep(300);
  ok('"not this kind" takes the song out of the lists (and keeps a note, in this browser)', !(await J(`!!document.querySelector('#lpRoot .ls-row[data-ls-row="${r1[4]}"]')`)) && (await J(`LS.get('lpNo',{}).ids.includes(${JSON.stringify(r1[4])})`)));
  await J(`document.querySelector('#lpRoot .ls-row[data-ls-row="${r1[6]}"] .ls-more').click()`); await sleep(300);
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 40, y: 30, button: 'left', clickCount: 1 }); await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 40, y: 30, button: 'left', clickCount: 1 }); await sleep(300);
  ok('a tap outside the sheet closes it', !(await J(`document.querySelector('#lsMenu').open`)));

  // ------------------------------------------------ my play lists
  await J(`window.scrollTo(0,0)`); await tab('chart'); await tab('rec');
  ok('the play lists and the recent songs are counted on the first tab', (await J(`document.querySelector('#lpRoot [data-lp-my="my:lists"] b').textContent`)) === '1' && Number(await J(`document.querySelector('#lpRoot [data-lp-my="my:recent"] b').textContent`)) >= 2);
  await J(`document.querySelector('#lpRoot [data-lp-my="my:lists"]').click()`); await sleep(300);
  ok('"my play lists": a row for the list (name, how many songs), and a button for a new one', (await J(`document.querySelector('#lpRoot .ls-t').textContent`)) === '晨跑' && /1 首/.test(await J(`document.querySelector('#lpRoot .ls-m').textContent`)) && !!(await J(`document.querySelector('#lpRoot [data-lp-newlist]')`)));
  await J(`document.querySelector('#lpRoot [data-lp-my^="my:l:"]').click()`); await sleep(300);
  ok('a play list opens with its songs, "play all" and the ways to rename and delete it', (await J(`document.querySelector('#lpRoot .lp-songs-h h3').textContent`)) === '晨跑' && (await J(`document.querySelectorAll('#lpRoot .ls-row').length`)) === 1 && !!(await J(`document.querySelector('#lpRoot [data-lp-lrename]') && document.querySelector('#lpRoot [data-lp-ldel]')`)));
  await J(`document.querySelector('#lpRoot [data-lp-ldel]').click()`); await sleep(400);
  ok('delete (asked first) takes the play list away', (await J(`LS.get('lpLists',[]).length`)) === 0);

  // ------------------------------------------------ charts and the region
  await tab('chart');
  const ch = await J(`({regs:[...document.querySelectorAll('#lpRoot .lp-reg')].map(b=>b.textContent+(b.getAttribute('aria-selected')==='true'?'*':'')).join('|'), title:document.querySelector('#lpRoot .lp-songs-h h3').textContent, rank:[...document.querySelectorAll('#lpRoot .ls-n em')].slice(0,3).map(e=>e.textContent).join(), top:[...document.querySelectorAll('#lpRoot .ls-n.top')].length, pick:!!document.querySelector('#lpRoot [data-lp-cgb]'), back:!!document.querySelector('#lpRoot .lp-back')})`);
  ok('charts: one row of regions (China first for a Chinese reader), the chart of the region, a rank in front of each song, the first three in the accent colour', ch.regs === '中国*|欧美|日韩|全球' && ch.title === '华语热歌' && ch.rank === '1,2,3' && ch.top === 3 && !ch.back, ch);
  await J(`document.querySelector('#lpRoot [data-lp-cr="west"]').click()`); await sleep(500);
  ok('another region: its charts (several: a row of small tabs to change between them, not a menu)', (await J(`document.querySelector('#lpRoot .lp-reg[aria-selected="true"]').textContent`)) === '欧美' && (await J(`document.querySelectorAll('#lpRoot [data-lp-cgb]').length`)) === 3 && !(await J(`!!document.querySelector('#lpRoot select')`)), await J(`document.querySelectorAll('#lpRoot [data-lp-cgb]').length`));
  await J(`document.querySelector('#lpRoot [data-lp-cgb="dzp-1111142221"]').click()`); await sleep(600);
  ok('a small tab changes the chart', (await J(`document.querySelector('#lpRoot .lp-songs-h h3').textContent`)) === 'Deezer 英国 Top 100');
  ok('there is no region switch: whose songs come first follows the language of the page and the time zone (China first for a Chinese page)', !(await J(`!!document.querySelector('#lpRoot .lp-region, #lpRoot [data-lp-region]')`)) && (await J(`document.querySelector('#lpRoot .lp-reg[aria-selected="true"]').textContent`)) === '欧美');

  // ------------------------------------------------ discover
  await tab('disc');
  const dc = await J(`({heads:[...document.querySelectorAll('#lpRoot .lp-h')].map(h=>h.textContent).join('|'), cards:[...document.querySelectorAll('#lpRoot .lp-gg')].map(g=>[...g.querySelectorAll('.lp-gct')].map(x=>x.textContent).join(',')).join('|'), more:!!document.querySelector('#lpRoot [data-lp-styles]')})`);
  ok('discover: styles and scenes apart, as cards', dc.heads === '风格|场景' && /摇滚/.test(dc.cards) && dc.cards.split('|')[1] === '放松' && !/放松/.test(dc.cards.split('|')[0]) && !dc.more, dc);
  await J(`document.querySelector('#lpRoot [data-lp-g="rock"]').click()`); await waitFor(`document.querySelector('#lpRoot .ls-row')`, 6000);
  ok('a card opens the list with a back arrow (and its songs are rows)', (await J(`document.querySelector('#lpRoot .lp-songs-h h3').textContent`)) === '摇滚' && (await J(`!!document.querySelector('#lpRoot .lp-back')`)) && (await J(`document.querySelectorAll('#lpRoot .ls-row').length`)) === 30);
  await J(`document.querySelector('#lpRoot [data-lp-back]').click()`); await sleep(300);
  ok('back goes to the cards of the third tab', await J(`document.querySelector('#lpRoot .lp-tab[aria-selected="true"]').textContent`) === '发现' && !!(await J(`document.querySelector('#lpRoot .lp-gg')`)));

  // ------------------------------------------------ the podcast side keeps its lists
  await J(`document.querySelector('#lpRoot [data-lp-mode="podcast"]').click()`); await waitFor(`document.querySelector('#lpRoot .ls-row')`, 8000); await sleep(300);
  const pd = await J(`({tabs:document.querySelectorAll('#lpRoot .lp-tab').length, chips:document.querySelectorAll('#lpRoot .lp-strip .dr-chip').length, like:document.querySelectorAll('#lpRoot .ls-like').length, more:document.querySelectorAll('#lpRoot .ls-more').length, sort:!!document.querySelector('#lpRoot [data-lp-sortgo]'), region:!!document.querySelector('#lpRoot .lp-region')})`);
  ok('podcasts: the strip of charts and categories, the sort, no tabs, and no ♥ or ⋯ on an episode', pd.tabs === 0 && pd.chips > 5 && pd.like === 0 && pd.more === 0 && pd.sort && !pd.region, pd);
  await J(`document.querySelector('#lpRoot [data-lp-mode="music"]').click()`); await sleep(500);
  ok('back to music: the tab that was open', await J(`document.querySelector('#lpRoot .lp-tab[aria-selected="true"]').textContent`) === '发现');

  // ------------------------------------------------ the copy of the last visit
  await tab('rec');                                                                                  // (the tab that is open is the one that is shown at the next visit)
  await fetch(SVC + '/__listen?mode=ok&delay=6000');
  await c.goto(BASE, 0);
  const t1 = Date.now();
  const early = await waitFor(`document.querySelectorAll('#lsBlock .ls-row').length>0`, 5000);
  ok('at the next visit the small block shows songs at once, from the copy of the last visit, while the service is slow (it answers after six seconds)', early && Date.now() - t1 < 4500, Date.now() - t1);
  await J(`document.querySelector('#cats [data-dlisten]').click()`);
  ok('...and so does the page: the tabs and the songs of the first tab', await waitFor(`document.querySelector('#lpRoot .lp-tabs') && document.querySelectorAll('#lpRoot .lp-forrows .ls-row').length>0`, 4000));
  await sleep(6500);
  ok('when the service answers the songs are the new ones (the page was not blanked meanwhile)', await J(`document.querySelectorAll('#lpRoot .lp-forrows .ls-row').length>0 && state.lp.data.get('daily|zh').state==='ok'`));
  await fetch(SVC + '/__listen?mode=ok&delay=0');

  // ------------------------------------------------ a phone
  await c.mobile(390, 844, 2);
  await fresh('zh');
  const ph = await J(`(()=>{ const small=[...document.querySelectorAll('#lpRoot .lp-tab, #lpRoot .lp-modes button, #lpRoot .lp-refresh, #lpRoot .lp-playall, #lpRoot .lp-my, #lpRoot .lp-forrows .ls-like, #lpRoot .lp-forrows .ls-more')].map(b=>{ const r=b.getBoundingClientRect(); return [Math.round(r.width),Math.round(r.height)]; }); const bar=document.querySelector('#lpRoot .lp-bar').getBoundingClientRect(), rows=[...document.querySelectorAll('#lpRoot .lp-shelf')].map(e=>getComputedStyle(e).overflowX); return {x:document.documentElement.scrollWidth-document.documentElement.clientWidth, small:small.filter(([w,h])=>h<40||w<40).length, n:small.length, tabs:document.querySelectorAll('#lpRoot .lp-tab').length, barH:Math.round(bar.height), rows}; })()`);
  ok('phone: the mode and the three tabs are one line, every button of the page is at least 40px (♥ and ⋯ too), the row of play lists slides sideways, nothing else does', ph.x <= 1 && ph.small === 0 && ph.n > 14 && ph.tabs === 3 && ph.barH <= 60 && ph.rows.length === 1 && ph.rows.every(o => o === 'auto'), ph);
  await c.shot(require('../paths').SHOTS + '/ml_phone_rec.png');
  await tab('chart'); await c.shot(require('../paths').SHOTS + '/ml_phone_chart.png');
  await tab('disc'); await c.shot(require('../paths').SHOTS + '/ml_phone_disc.png');
  await c.desktop(1280, 900, 1);
  await J(`localStorage.removeItem('archive.lpRegion')`);

  const mine = errs.filter(e => !/adsbygoogle|googlesyndication/.test(e));
  ok('no script errors in the whole run', mine.length === 0, mine);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
