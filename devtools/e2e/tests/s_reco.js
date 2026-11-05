// e2e: the page of recommended sources: by group and traffic, subscribe in one go, push to the directory's review, what is done already is shown as done; three screen sizes
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const O = require('../paths').DIST + '/';
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };

const it = (id, name, name_en, lang, feed, rank, extra) => ({ id, name, name_en, zh: name + '的简介', en: name_en + ' — a short description', home: 'http://127.0.0.1:8841/blog/', feed, lang, tags: ['标签甲', '标签乙'], tags_en: ['tag a', 'tag b'], rank, full: false, ...extra });
const FIX = {
  version: 1, updated: '2026-10-22', groups: [
    { id: 'g1', zh: '中文 · 测试组', en: 'Chinese · test group', items: [
      it('zA', '甲博客', 'Blog A', 'zh', 'http://127.0.0.1:8841/blog/feed.xml?r=a', 1000, { starter: true, full: true }),
      it('zB', '乙博客', 'Blog B', 'zh', 'http://127.0.0.1:8842/blog/feed.xml?r=b', 500),
      it('zC', '丙博客（没有排名）', 'Blog C', 'zh', 'http://127.0.0.1:8850/blog/feed.xml?r=c', 0)] },
    { id: 'g2', zh: '英文 · 测试组', en: 'English · test group', items: [
      it('eA', '丁', 'Blog D', 'en', 'http://127.0.0.1:8841/blog/feed.xml?r=d', 3000),
      it('eB', '戊', 'Blog E', 'en', 'http://127.0.0.1:8842/blog/feed.xml?r=e', 20000),
      it('eL', '已在目录里的', 'Listed Blog', 'en', 'http://127.0.0.1:8841/blog/feed.xml?x=listed', 40000),
      it('eP', '已在审核的', 'Pending Blog', 'en', 'http://127.0.0.1:8841/blog/feed.xml?x=pending', 50000),
      it('eD', '目录里已有的站', 'In The Directory', 'en', 'http://127.0.0.1:8841/blog/feed.xml?x=indir', 60000, { home: 'https://supply-weekly.example/' })] }]
};
const DIRF = O + 'dir/directory.json';
const dir0 = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
const writeDir = fn => { const d = JSON.parse(JSON.stringify(dir0)); fn(d); fs.writeFileSync(DIRF, JSON.stringify(d)); };

(async () => {
  const c = await connect(9444);
  const settle = await require('../settle')(c);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,idb,LS,render,addCollection}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async (lang, w = 1280, h = 900, phone = false) => {
    if (phone) await c.mobile(w, h, 2); else await c.desktop(w, h, 1);
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 0); await settle(1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22'))`);
    await c.goto(BASE, 0); await settle(2800);
  };
  const reset = (limit) => fetch(SVC + '/__submit_reset' + (limit != null ? '?limit=' + limit : ''), { method: 'POST' });
  const submits = async () => (await fetch(SVC + '/__submits')).json();
  const openReco = async () => { await J(`document.querySelector('[data-cat="reco"]').click()`); await settle(500); };
  const ids = sel => J(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(x=>x.dataset.rid||x.id)`);
  const tick = (kind, id) => J(`document.querySelector('[data-r${kind}="${id}"]').click()`);
  const lf = async k => { for (let i = 0; i < 3 && (await J(`state.lf`)) !== k; i++) { await J(`document.querySelector('#lfBtn').click()`); await sleep(350); } };          // (the language of the content is ONE button: each tap the next, all -> 中 -> EN -> all)
  const sumText = () => J(`document.querySelector('#rcSum').textContent`);

  fs.writeFileSync(O + 'recommended.json', JSON.stringify(FIX));
  await reset();

  // ------------------------------------------------ the way in: the left list and the banner
  await fresh('zh');
  const entry = await J(`(()=>{ const b=document.querySelector('[data-cat="reco"]'); return b && {text:b.textContent.replace(/\\s+/g,' ').trim(), cur:b.getAttribute('aria-current')}; })()`);
  ok('the left list has "推荐订阅" with the number of items not yet subscribed (8)', entry && /推荐订阅/.test(entry.text) && /8$/.test(entry.text), entry);
  ok('the banner invites a reader with no subscriptions (in the shelf, 全部)', await J(`!document.querySelector('#recoBanner').hidden && /还没有订阅/.test(document.querySelector('#recoBanner').textContent)`));
  await c.shot(require('../paths').SHOTS + '/rc_banner.png');
  await J(`document.querySelector('[data-reco-off]').click()`); await sleep(300);
  ok('"不再提示" hides it and it stays away after a reload', await J(`document.querySelector('#recoBanner').hidden`) && (await c.goto(BASE, 2500), await J(`document.querySelector('#recoBanner').hidden`)));
  await J(`localStorage.removeItem('archive.recoBannerOff')`); await c.goto(BASE, 0); await settle(2500);
  await J(`document.querySelector('[data-reco-open]').click()`); await settle(500);
  ok('the banner button opens the page', await J(`!document.querySelector('#recoPane').hidden && document.querySelector('#grid').innerHTML===''`) && await J(`document.querySelector('#recoBanner').hidden`));

  // ------------------------------------------------ the page: groups, order by traffic, filters
  const head = await J(`({title:document.querySelector('#viewTitle').textContent, sub:document.querySelector('#viewSub').textContent, groups:[...document.querySelectorAll('.rc-group h2')].map(h=>h.textContent), cur:document.querySelector('[data-cat="reco"]').getAttribute('aria-current')})`);
  ok('title, description with the count, the two groups in their order, the entry is current', head.title === '推荐订阅' && /8 个/.test(head.sub) && head.groups.join() === '中文 · 测试组,英文 · 测试组' && head.cur === 'true', head);
  ok('inside a group the busiest first (乙 500 before 甲 1000; no rank last)', (await ids('#rc-g1 .rc-row')).join() === 'zB,zA,zC' && (await ids('#rc-g2 .rc-row')).join() === 'eA,eB,eL,eP,eD');
  const row = await J(`(()=>{ const r=document.querySelector('[data-rid="zA"]'); return {name:r.querySelector('.rc-name a').textContent, href:r.querySelector('.rc-name a').href, chips:[...r.querySelectorAll('.where')].map(x=>x.textContent), desc:r.querySelector('.rc-desc').textContent, meter:(r.querySelector('.rc-meter')||{}).textContent||'', tip:(r.querySelector('.rc-meta span[title]')||{}).title, tags:r.querySelector('.rc-meta').textContent, picks:[...r.querySelectorAll('.rc-pick')].map(x=>x.textContent.trim())}; })()`);
  ok('a row: name linking to the site, language and full-text chips, description, the traffic dots with the rank in a tooltip, tags, the two ticks', row.name === '甲博客' && row.href === 'http://127.0.0.1:8841/blog/' && row.chips.includes('中文') && row.chips.includes('全文') === false && row.chips.includes('订阅源带全文') && row.desc === '甲博客的简介' && row.meter === '●●●●●' && /1,000/.test(row.tip) && /#标签甲 #标签乙/.test(row.tags) && row.picks.join() === '订阅,推送审核', row);
  ok('no dots for an item without a rank', await J(`!document.querySelector('[data-rid="zC"] .rc-meter')`));
  await c.shot(require('../paths').SHOTS + '/rc_page_desktop.png');
  await lf('en'); await sleep(200);
  ok('the language filter (EN) leaves the English group only', (await J(`[...document.querySelectorAll('.rc-group h2')].map(h=>h.textContent)`)).join() === '英文 · 测试组');
  await lf('all'); await sleep(200);
  await J(`const i=document.querySelector('#q'); i.value='乙博客'; i.dispatchEvent(new Event('input',{bubbles:true}))`); await settle(500);
  ok('the search box filters the recommendations too', (await ids('.rc-row')).join() === 'zB');
  await J(`const i=document.querySelector('#q'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true}))`); await settle(400);
  await J(`document.querySelectorAll('[data-rjump]')[2].click()`); await settle(500);
  ok('the group chips mark the chosen group and bring it into view', await J(`document.querySelectorAll('[data-rjump]')[2].getAttribute('aria-pressed')`) === 'true' && await J(`(()=>{ const r=document.querySelector('#rc-g2').getBoundingClientRect(); return r.top>=-5 && r.top<innerHeight; })()`));

  // ------------------------------------------------ what is in the directory already, what is asked already
  const dirRow = await J(`(()=>{ const r=document.querySelector('[data-rid="eD"]'); return {chips:[...r.querySelectorAll('.where')].map(x=>x.textContent), picks:[...r.querySelectorAll('.rc-pick')].map(x=>x.textContent.trim()+(x.classList.contains('done')?'!':''))}; })()`);
  ok('an item the directory lists already (found by its site address): shown as done for the push, "已在公共目录"', dirRow.chips.includes('已在公共目录') && dirRow.picks.join() === '订阅,✓ 已在公共目录!', dirRow);

  // ------------------------------------------------ tick and subscribe
  ok('nothing is ticked at the start, the buttons are off', await sumText() === '已选：订阅 0 个 · 推送审核 0 个' && await J(`document.querySelector('#rcSubGo').disabled && document.querySelector('#rcPushGo').disabled`));
  await tick('sub', 'zA'); await tick('sub', 'zB');
  ok('two ticked: the bar says so and the button counts them', await sumText() === '已选：订阅 2 个 · 推送审核 0 个' && await J(`document.querySelector('#rcSubGo').textContent`) === '订阅所选（2）' && await J(`!document.querySelector('#rcSubGo').disabled`));
  await c.shot(require('../paths').SHOTS + '/rc_ticked.png');
  await J(`document.querySelector('#rcSubGo').click()`); await settle(9000);
  const subd = await J(`({cols:state.cols.filter(x=>x.feed).map(x=>x.name+'|'+(state.items.filter(i=>i.collection===x.id).length)), err:state.cols.filter(x=>x.feed).map(x=>x.feed.error).filter(Boolean), pane:!document.querySelector('#recoPane').hidden, picks:[...document.querySelectorAll('[data-rid="zA"] .rc-pick,[data-rid="zB"] .rc-pick')].map(x=>x.textContent.trim()), cnt:document.querySelector('[data-cat="reco"] .n').textContent, sum:document.querySelector('#rcSum').textContent})`);
  ok('subscribed in one go: two collections with their feeds, both first readings arrived, the page stays, both rows say "已订阅", the count fell to 6', subd.cols.length === 2 && subd.cols.every(x => +x.split('|')[1] >= 3) && subd.err.length === 0 && subd.pane && subd.picks.filter(x => /已订阅/.test(x)).length === 2 && subd.cnt === '6' && /订阅 0 个/.test(subd.sum), subd);
  ok('the banner is gone now that there are subscriptions', await J(`document.querySelector('#recoBanner').hidden`));
  // the group tick
  await J(`document.querySelector('[data-rgroup="g2"]').click()`);
  ok('"整组选订阅" ticks every row of the group that is not subscribed (5)', await sumText() === '已选：订阅 5 个 · 推送审核 0 个');
  await J(`document.querySelector('[data-rgroup="g2"]').click()`);
  ok('...and a second click unticks them', await sumText() === '已选：订阅 0 个 · 推送审核 0 个');

  // ------------------------------------------------ push to the review
  await tick('push', 'zA'); await tick('push', 'zB'); await tick('push', 'eL'); await tick('push', 'eP'); await tick('push', 'eA');
  ok('five ticked for the review; the button is still off until the declaration is ticked', await J(`document.querySelector('#rcPushGo').textContent`) === '推送审核（5）' && await J(`document.querySelector('#rcPushGo').disabled`));
  await J(`document.querySelector('#rcRights').click()`);
  ok('with the declaration the button is on', await J(`!document.querySelector('#rcPushGo').disabled`));
  await reset();
  await J(`document.querySelector('#rcPushGo').click()`); await sleep(2500);
  const sent = await submits();
  ok('five requests (in the page\'s order), each {kind:url, the feed address, its tags, rights:true}', sent.length === 5 && sent.every(s => s.kind === 'url' && s.rights === true && /127\.0\.0\.1/.test(s.url) && Array.isArray(s.tags)) && sent[0].url === 'http://127.0.0.1:8841/blog/feed.xml?r=a' && sent[0].tags.join() === '标签甲,标签乙', sent.map(s => s.url));
  const after = await J(`({marked:Object.keys(LS.get('recoPushed',{})).length, rows:['zA','zB','eL','eP','eA'].map(id=>[...document.querySelector('[data-rid="'+id+'"]').querySelectorAll('.rc-pick')].map(x=>x.textContent.trim()).pop()), sum:document.querySelector('#rcSum').textContent, msg:document.querySelector('#rcMsg').hidden, toast:document.querySelector('#toastMsg').textContent})`);
  ok('all five are marked as asked (listed / pending ones too), their rows show "已提交审核", the toast says 3 pushed and 2 were there already', after.marked === 5 && after.rows.every(x => /已提交审核/.test(x)) && /推送审核 0 个/.test(after.sum) && /已推送 3 个/.test(after.toast) && /另有 2 个/.test(after.toast), after);
  await J(`document.querySelector('#rcRights').checked`);

  // a daily limit in the middle
  await reset(1);
  await tick('push', 'eB');
  await J(`(()=>{ const i=document.querySelector('[data-rpush="zC"]'); i.click(); })()`);
  await J(`document.querySelector('#rcRights').click()`); await sleep(100);
  const rightsOn = await J(`document.querySelector('#rcRights').checked`);
  if (!rightsOn) await J(`document.querySelector('#rcRights').click()`);
  await J(`document.querySelector('#rcPushGo').click()`); await sleep(2500);
  const lim = await J(`({msg:document.querySelector('#rcMsg').textContent, bad:document.querySelector('#rcMsg').classList.contains('bad'), eB:[...document.querySelector('[data-rid="eB"]').querySelectorAll('.rc-pick')].pop().textContent.trim(), zC:[...document.querySelector('[data-rid="zC"]').querySelectorAll('.rc-pick')].pop().textContent.trim()})`);
  ok('when the service says "too many today": what went is marked, the rest stays ticked, the message is the service\'s own', /已推送 1 个/.test(lim.msg) && /今天提交得太多了/.test(lim.msg) && lim.bad && /已提交审核/.test(lim.zC) && /推送/.test(lim.eB) && !/已提交/.test(lim.eB), lim);
  await reset();

  // ------------------------------------------------ the limit of 30 subscriptions
  await J(`(()=>{ for(let i=0;i<26;i++){ const id=addCollection('补位'+i); state.cols.find(x=>x.id===id).feed={url:'http://127.0.0.1:8841/blog/feed.xml?fill='+i,home:'',etag:'',modified:'',checked:Date.now(),error:'',fails:0}; } LS.set('cols',state.cols); render(); })()`);
  await sleep(300);
  await tick('sub', 'eA'); await tick('sub', 'eB'); await tick('sub', 'eL');
  ok('with 28 subscriptions a third tick is refused with the limit said (30)', /订阅 2 个/.test(await sumText()) && /最多订阅 30 个/.test(await J(`document.querySelector('#rcMsg').textContent`)), await J(`document.querySelector('#rcMsg').textContent`));
  await J(`state.recoSel.sub.clear(); render()`);

  // ------------------------------------------------ "try these" in the subscribe window comes from the list too
  await fresh('zh');
  await J(`document.querySelector('#addBtn').click()`); await sleep(400); await J(`document.querySelector('[data-atab="sub"]').click()`); await sleep(400);
  const st = await J(`[...document.querySelectorAll('#fsStarterList .st-name')].map(x=>x.textContent)`);
  ok('the subscribe window offers the items marked "starter" in recommended.json (only 甲博客)', st.join() === '甲博客', st);
  await J(`document.querySelector('#addCancel').click()`); await sleep(300);

  // ------------------------------------------------ English
  await fresh('en');
  await openReco();
  const en = await J(`({title:document.querySelector('#viewTitle').textContent, groups:[...document.querySelectorAll('.rc-group h2')].map(h=>h.textContent), name:document.querySelector('[data-rid="zA"] .rc-name a').textContent, picks:[...document.querySelectorAll('[data-rid="zA"] .rc-pick')].map(x=>x.textContent.trim()), sum:document.querySelector('#rcSum').textContent, tags:document.querySelector('[data-rid="zA"] .rc-meta').textContent})`);
  ok('English: title, group names, names, tick labels, tags', en.title === 'Recommended sources' && en.groups.join() === 'Chinese · test group,English · test group' && en.name === 'Blog A' && en.picks.join() === 'Subscribe,Push for review' && /Ticked: subscribe 0/.test(en.sum) && /#tag a #tag b/.test(en.tags), en);
  await c.shot(require('../paths').SHOTS + '/rc_page_en.png');

  // ------------------------------------------------ the address #recommend, and no list / no service
  await c.goto('about:blank', 200); await c.goto(BASE + '#recommend', 3000);
  ok('#recommend opens the page', await J(`!document.querySelector('#recoPane').hidden`) && !(await J(`location.hash`)));
  await J(`document.querySelector('[data-cat="all"]').click()`); await sleep(300); await J(`location.hash='#recommend'`); await sleep(500);
  ok('...and a link to it inside the open page does the same', await J(`!document.querySelector('#recoPane').hidden`));
  fs.unlinkSync(O + 'recommended.json');
  await fresh('zh');
  ok('without recommended.json there is no entry and no banner', await J(`!document.querySelector('[data-cat="reco"]') && document.querySelector('#recoBanner').hidden`));
  fs.writeFileSync(O + 'recommended.json', JSON.stringify(FIX));
  writeDir(d => { delete d.submit_api; });
  await fresh('zh');
  ok('a site without the service (no submit_api): nothing to subscribe or push with, so no entry', await J(`!document.querySelector('[data-cat="reco"]')`));
  fs.writeFileSync(DIRF, JSON.stringify(dir0));

  // ------------------------------------------------ a tablet and a phone
  for (const [name, w, h, phone] of [['tablet', 820, 1100, false], ['phone', 375, 812, true]]) {
    await fresh('zh', w, h, phone);
    await J(`document.querySelector('[data-cat="reco"]').click()`); await sleep(500);
    await tick('sub', 'zA'); await tick('push', 'zB');
    const m = await J(`(()=>{ const rows=[...document.querySelectorAll('.rc-row')].map(r=>r.getBoundingClientRect()), pane=document.querySelector('#recoPane').getBoundingClientRect(), bar=document.querySelector('#rcAct').getBoundingClientRect();
      return {cols:new Set(rows.map(r=>Math.round(r.left))).size, inside:rows.every(r=>r.left>=pane.left-0.5 && r.right<=pane.right+0.5), pageX:document.documentElement.scrollWidth>innerWidth+1, barBottom:Math.round(bar.bottom), vh:innerHeight, picksInside:[...document.querySelectorAll('.rc-picks')].every(p=>p.getBoundingClientRect().right<=p.closest('.rc-row').getBoundingClientRect().right+0.5)}; })()`);
    ok(name + ': rows inside the page, no sideways scrolling, ' + (phone ? 'one column' : 'two columns'), m.inside && !m.pageX && m.cols === (phone ? 1 : 2) && m.picksInside, m);
    await J(`document.querySelector('#rc-g2').scrollIntoView({block:'start'})`); await sleep(300);
    const bar = await J(`(()=>{ const b=document.querySelector('#rcAct').getBoundingClientRect(); return {bottom:Math.round(b.bottom), vh:innerHeight, top:Math.round(b.top)}; })()`);
    ok(name + ': the action bar stays in view while scrolling (sticky at the bottom)', bar.bottom <= bar.vh + 1 && bar.top > 0, bar);
    await c.shot(require('../paths').SHOTS + '/rc_page_' + name + '.png');
    if (phone) {
      await J(`document.querySelector('#menuBtn').click()`); await sleep(400);
      ok('phone: the entry is in the left list (drawer) too', await J(`!!document.querySelector('#cats [data-cat="reco"]') && getComputedStyle(document.querySelector('.side')).display!=='none'`));
      await J(`document.querySelector('#cats [data-cat="reco"]').click()`); await sleep(400);
      ok('phone: picking it closes the drawer', await J(`!document.body.classList.contains('drawer')`));
    }
  }
  await c.desktop(1280, 900, 1);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
