// e2e: the reading group (a QQ group): a card at the top of the guide (zh and en: the QR picture, the number, "copy", "save", "send feedback"), the picture and the cover are light (< 100 KB), the guide's card on
// the shelf has the cover, nothing is wider than a phone. (demo app :8820 with the real guide built into it, headless Edge)
const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('../cdp');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/';
const GUIDE = BASE + 'notes/guide/', GUIDE_EN = BASE + 'notes/guide/en/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };
const NO = '869727153';

(async () => {
  // ------------------------------------------------ the files
  const dist = path.join(P.DIST, 'notes', 'guide');
  const qr = path.join(dist, 'img', 'qq-group.webp'), cover = path.join(dist, 'cover.webp');
  ok('the QR picture and the cover are in the build and each is under 100 KB', fs.existsSync(qr) && fs.existsSync(cover) && fs.statSync(qr).size < 100 * 1024 && fs.statSync(cover).size < 100 * 1024, [fs.existsSync(qr) && fs.statSync(qr).size, fs.existsSync(cover) && fs.statSync(cover).size]);

  const c = await connect(9444);
  c.autoDialog(true);
  const errors = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || '').slice(0, 200)); });
  await c.send('Runtime.enable');
  try { await c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://127.0.0.1:8820' }); } catch (e) { /* (not every browser has it: the check below accepts both) */ }
  const J = expr => c.js(`(()=>{ return eval(${JSON.stringify(expr)}); })()`);
  const card = () => J(`(()=>{ const g=document.querySelector('#group'); if(!g) return null; const img=g.querySelector('.group-qr img'), a=[...g.querySelectorAll('.group-acts a')]; const r=g.getBoundingClientRect();
    return { text:g.textContent.replace(/\\s+/g,' '), loaded:img.complete && img.naturalWidth>0, nat:[img.naturalWidth,img.naturalHeight], num:g.querySelector('.group-no b').textContent, copy:g.querySelector('[data-copy]').textContent,
      save:a.map(x=>({t:x.textContent, href:x.getAttribute('href'), dl:x.hasAttribute('download'), tg:x.target})), btnH:[...g.querySelectorAll('.gcopy,.gbtn')].map(b=>Math.round(b.getBoundingClientRect().height)), over:document.documentElement.scrollWidth-document.documentElement.clientWidth, w:Math.round(r.width) }; })()`);

  await c.desktop(1280, 900, 1);
  // ------------------------------------------------ the guide, Chinese
  await c.goto(GUIDE, 1500); await sleep(800);
  const z = await card();
  ok('the Chinese guide has the card at its top: the picture loads, the number, "复制群号", "保存二维码", "写反馈" (the last one goes to #feedback of the whole page)', z && z.loaded && z.num === NO && z.copy === '复制群号' && z.save.map(x => x.t).join('|') === '保存二维码|写反馈' && z.save[0].dl && /qq-group\.webp$/.test(z.save[0].href) && /#feedback$/.test(z.save[1].href) && z.save[1].tg === '_top', z);
  ok('the card says what the group is for and which group it is', z && /共读群/.test(z.text) && /Ai 产品讨论群/.test(z.text) && /反馈/.test(z.text), z && z.text);
  ok('the card sits above the tabs (it is the first thing under the title)', await J(`!!(document.querySelector('#group').compareDocumentPosition(document.querySelector('.tabbar')) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(document.querySelector('header.top').compareDocumentPosition(document.querySelector('#group')) & Node.DOCUMENT_POSITION_FOLLOWING)`));
  await J(`document.querySelector('[data-copy]').click()`); await sleep(600);
  const t1 = await J(`document.querySelector('[data-copy]').textContent`);
  ok('"复制群号" says "已复制" for a moment (and goes back to "复制群号" after)', t1 === '已复制', t1);
  await sleep(1800);
  ok('... and then the button is as it was', (await J(`document.querySelector('[data-copy]').textContent`)) === '复制群号');

  // ------------------------------------------------ the guide, English
  await c.goto(GUIDE_EN, 1500); await sleep(800);
  const e = await card();
  ok('the English guide has the same card in English: the picture loads (the path goes up one folder), the number, "Copy the number", "Save the QR code", "Send feedback"', e && e.loaded && e.num === NO && e.copy === 'Copy the number' && e.save.map(x => x.t).join('|') === 'Save the QR code|Send feedback' && /#feedback$/.test(e.save[1].href) && /Reading group|reading group/.test(e.text), e);
  await J(`document.querySelector('[data-copy]').click()`); await sleep(600);
  ok('"Copy the number" says "Copied" for a moment', (await J(`document.querySelector('[data-copy]').textContent`)) === 'Copied');

  // ------------------------------------------------ a phone
  await c.mobile(375, 812, 2);
  await c.goto(GUIDE, 1500); await sleep(800);
  const pz = await card();
  ok('phone (Chinese): the card is as wide as the page and nothing sticks out sideways; the buttons are at least 40 px', pz && pz.over <= 0 && pz.btnH.length === 3 && pz.btnH.every(h => h >= 40) && pz.w <= 375, pz);
  await c.goto(GUIDE_EN, 1500); await sleep(800);
  const pe = await card();
  ok('phone (English): the same', pe && pe.over <= 0 && pe.btnH.every(h => h >= 40), pe);
  await c.shot(P.SHOTS + '/guide_group_phone.png');

  // ------------------------------------------------ the shelf: the guide's card has the cover
  await c.desktop(1280, 900, 1);
  await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500);
  await c.js(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1')`);
  await c.goto(BASE, 3000);
  const sh = await J(`(()=>{ const cs=[...document.querySelectorAll('#grid .card')]; const g=cs.find(x=>/使用指南/.test(x.textContent)); if(!g) return {found:false, titles:cs.map(x=>x.textContent.slice(0,20))}; const im=g.querySelector('.cover img'); return {found:true, src:im?im.getAttribute('src'):'', loaded:!!im && im.complete && im.naturalWidth>0, nat:im?[im.naturalWidth,im.naturalHeight]:null}; })()`);
  ok('on the shelf the card of the guide has the cover (the group, its number and the QR)', sh.found && /cover\.webp/.test(sh.src) && sh.loaded && sh.nat[0] === 1280, sh);
  await c.shot(P.SHOTS + '/shelf_guide_cover.png');

  ok('no script errors in the whole run', errors.length === 0, errors);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
