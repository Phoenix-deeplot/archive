// e2e: the feedback box: the link at the foot of the side list shows only when the service says it is set up; the small window (kind, words, an optional contact, a hidden honeypot); what is sent; the answers
// (thanks, enough for today, the service's own words, down); the address #feedback opens it; one light line (a toast) once after the first thing saved; nothing of it in a reader; a phone; English
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', API = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  const errors = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || '').slice(0, 200)); });
  await c.send('Runtime.enable');
  const J = expr => c.js(`(()=>{ const {state,LS,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fb = async (q = '') => (await fetch(API + '/__fb' + q)).json();
  const fresh = async (lang = 'zh', hash = '') => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1')`);
    await c.goto(BASE + hash, 2800);
  };
  const open = () => J(`document.querySelector('#fbDlg').open`);
  const status = () => J(`document.querySelector('#fbStatus').textContent`);
  const toastNow = () => J(`({msg:document.querySelector('#toastMsg').textContent, act:document.querySelector('#toastAct').textContent, shown:getComputedStyle(document.querySelector('#toast')).opacity!=='0' && getComputedStyle(document.querySelector('#toast')).visibility!=='hidden'})`);
  const type = async (msg, kind, contact) => {
    await J(`(()=>{ const m=document.querySelector('#fbMsg'); m.value=${JSON.stringify(msg)}; m.dispatchEvent(new Event('input',{bubbles:true})); ${kind ? `document.querySelector('#fbKinds [data-k=${JSON.stringify(kind)}]').click();` : ''} ${contact ? `document.querySelector('#fbContact').value=${JSON.stringify(contact)};` : ''} })()`);
  };

  writeDir();
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ not set up: no link, the address does nothing
  await fb('?reset=1&on=0&mode=ok');
  await fresh('zh', '#feedback');
  ok('the service says it is not set up: the link is not there and #feedback opens nothing', await J(`document.querySelector('#fbSpan').hidden`) && !(await open()), [await J(`document.querySelector('#fbSpan').hidden`), await open()]);

  // ------------------------------------------------ set up: the link at the foot of the side list
  await fb('?on=1');
  await fresh('zh');
  ok('set up: the link "反馈" is at the foot of the side list, beside "这是什么"', await J(`!document.querySelector('#fbSpan').hidden && document.querySelector('#fbLink').textContent==='反馈' && document.querySelector('#fbSpan').closest('.legal-links')!==null`));
  await J(`document.querySelector('#fbLink').click()`); await sleep(400);
  const o = await J(`({open:document.querySelector('#fbDlg').open, kinds:[...document.querySelectorAll('#fbKinds button')].map(b=>b.textContent+(b.getAttribute('aria-pressed')==='true'?'*':'')).join('|'), count:document.querySelector('#fbCount').textContent, focus:document.activeElement.id, hp:(()=>{ const r=document.querySelector('#fbWebsite').getBoundingClientRect(); return r.right<0 || r.left<-1000; })(), hpAria:document.querySelector('#fbWebsite').getAttribute('aria-hidden'), ph:document.querySelector('#fbMsg').placeholder, note:document.querySelector('#fbDlg .dlg-body').innerText.includes('只有站长看得到')})`);
  ok('the window opens: four kinds ("有想法" chosen), the words box with its count and focus, the contact, the note on who can read it, the honeypot out of sight', o.open && o.kinds === '出问题了|有想法*|内容|其他' && o.count === '0 / 1000' && o.focus === 'fbMsg' && o.hp && o.hpAria === 'true' && /最多 1000/.test(o.ph) && o.note, o);
  await c.shot(P.SHOTS + '/feedback_dialog.png');
  ok('the window has one small line for the reading group: its QQ number and a button that copies it (a tap says so, or selects the number where the browser will not copy)', await J(`document.querySelector('#fbDlg .fb-group b').textContent`) === '869727153' && await J(`document.querySelector('#fbCopy').textContent`) === '复制群号');
  await J(`document.querySelector('#fbCopy').click()`); await sleep(500);
  const cp = await toastNow();
  ok('"复制群号" copies the number: the toast says so, or the number is selected for the reader to copy', /已复制群号/.test(cp.msg) || (await J(`String(getSelection())`)) === '869727153', [cp, await J(`String(getSelection())`)]);
  await J(`getSelection().removeAllRanges()`);

  // ------------------------------------------------ sending
  await J(`document.querySelector('#fbSend').click()`); await sleep(400);
  ok('nothing written: it says so and sends nothing', (await status()) === '先写点什么' && (await fb()).log.length === 0 && (await open()));
  await type('第一条反馈：书里的字有点小', 'bug', 'me@example.org');
  ok('the count follows what is typed', (await J(`document.querySelector('#fbCount').textContent`)) === '13 / 1000');
  await J(`document.querySelector('#fbSend').click()`); await sleep(1200);
  const sent = (await fb()).log;
  ok('sent once, as written: words, kind, contact, the page, the language, the version, an empty honeypot', sent.length === 1 && sent[0].msg === '第一条反馈：书里的字有点小' && sent[0].kind === 'bug' && sent[0].contact === 'me@example.org' && /^[A-Za-z0-9_./#-]{1,24}$/.test(sent[0].where) && sent[0].lang === 'zh' && /^[0-9A-Za-z._-]{1,20}$/.test(sent[0].ver) && sent[0].website === '', sent);
  const t1 = await toastNow();
  ok('the window closes, a line says thanks, and the boxes are empty for next time', !(await open()) && /谢谢，收到了/.test(t1.msg) && (await J(`document.querySelector('#fbMsg').value===''&&document.querySelector('#fbContact').value===''`)), t1);

  // ------------------------------------------------ the answers
  await fb('?mode=rate');
  await J(`document.querySelector('#fbLink').click()`); await sleep(300);
  await type('第二条');
  await J(`document.querySelector('#fbSend').click()`); await sleep(900);
  ok('enough for today: it says so, the window stays open and the words are kept', /今天写得够多了/.test(await status()) && (await open()) && (await J(`document.querySelector('#fbMsg').value`)) === '第二条' && (await J(`!document.querySelector('#fbSend').disabled`)));
  await fb('?mode=bad');
  await J(`document.querySelector('#fbSend').click()`); await sleep(900);
  ok('a wrong request: the service\'s own words are shown', /请求格式不对/.test(await status()) && (await open()));
  await fb('?mode=down');
  await J(`document.querySelector('#fbSend').click()`); await sleep(900);
  ok('the service down: its words, the window stays', /暂时不可用/.test(await status()) && (await open()));
  await fb('?mode=ok');
  await J(`document.querySelector('#fbSend').click()`); await sleep(1000);
  ok('and when it is back the same words go', !(await open()) && (await fb()).log.length === 5 && (await fb()).log[4].msg === '第二条');
  await J(`document.querySelector('#fbLink').click()`); await sleep(300);
  await J(`document.querySelector('#fbDlg').dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await sleep(300);
  ok('a click outside the window closes it; "取消" too', !(await open()));
  await J(`document.querySelector('#fbLink').click()`); await sleep(300);
  await J(`document.querySelector('#fbClose').click()`); await sleep(300);
  ok('"取消" closes it too', !(await open()));

  // ------------------------------------------------ the address
  await J(`location.hash='#feedback'`); await sleep(700);
  ok('#feedback opens the window and the address is cleaned', (await open()) && (await J(`location.hash`)) === '', [await open(), await J(`location.hash`)]);
  await J(`document.querySelector('#fbClose').click()`); await sleep(300);
  await fresh('zh', '#feedback');
  ok('...and also when the page is opened on it', (await open()) && (await J(`location.hash`)) === '');
  await J(`document.querySelector('#fbClose').click()`); await sleep(300);

  // ------------------------------------------------ one light line, once
  await fb('?reset=1&mode=ok');
  await fresh('zh');
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1500);
  await J(`document.querySelector('#cats [data-dtype="all"]').click()`); await sleep(900);
  await J(`document.querySelector('#grid .card [data-d="save"]').click()`); await sleep(900);
  const first = await toastNow();
  ok('after the first thing saved the page says "已收藏" first', /已收藏|收藏/.test(first.msg), first);
  await sleep(3200);
  const nudge = await toastNow();
  ok('a little later one light line asks for feedback, with a button; no window comes up', /有想法可以告诉我/.test(nudge.msg) && nudge.act === '写反馈' && !(await open()), nudge);
  await J(`document.querySelector('#toastAct').click()`); await sleep(500);
  ok('the button opens the window', await open());
  await J(`document.querySelector('#fbClose').click()`); await sleep(300);
  await J(`(()=>{ const b=[...document.querySelectorAll('#grid .card [data-d="save"]')][1]; b.click(); })()`); await sleep(3800);
  ok('a second save does not ask again (once for this browser)', !/有想法可以告诉我/.test((await toastNow()).msg) && (await J(`LS.get('fbNudge',0)`)) === 1);
  await fresh('zh'); await J(`LS.set('fbNudge',1)`);

  // ------------------------------------------------ nothing of it in a reader
  await J(`document.querySelector('[data-space="mine"]').click()`); await sleep(800);
  await J(`document.querySelector('#grid .card .card-title a, #grid .card a')?.click()`); await sleep(2500);
  const rd = await J(`({reader:!document.querySelector('#reader').hidden, inReader:!!document.querySelector('#reader #fbLink, #reader #fbSpan, #reader #fbDlg'), dlg:document.querySelector('#fbDlg').open})`);
  ok('in the reader there is no feedback link, window or line of its own', !rd.inReader && !rd.dlg, rd);

  // ------------------------------------------------ a phone
  await c.mobile(390, 780, 3); await sleep(500);
  await fresh('zh');
  await J(`document.body.classList.add('drawer')`); await sleep(300);
  await J(`document.querySelector('#fbLink').click()`); await sleep(500);
  const ph = await J(`(()=>{ const d=document.querySelector('#fbDlg').getBoundingClientRect(), k=[...document.querySelectorAll('#fbKinds button')].map(b=>Math.round(b.getBoundingClientRect().height)), m=document.querySelector('#fbMsg').getBoundingClientRect(); return {open:document.querySelector('#fbDlg').open, left:Math.round(d.left), right:Math.round(d.right), vw:innerWidth, bottom:Math.round(d.bottom), vh:innerHeight, kinds:Math.min(...k), msgW:Math.round(m.width), over:document.documentElement.scrollWidth>innerWidth, drawerClosed:!document.body.classList.contains('drawer')}; })()`);
  ok('on a phone the window fits the screen, the kinds are 44 px high, the words box is wide, the side list gives way', ph.open && ph.left >= 0 && ph.right <= ph.vw && ph.bottom <= ph.vh && ph.kinds >= 44 && ph.msgW > 250 && !ph.over && ph.drawerClosed, ph);
  await c.shot(P.SHOTS + '/feedback_phone.png');
  await J(`document.querySelector('#fbClose').click()`); await sleep(300);
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ English
  await fresh('en');
  await J(`document.querySelector('#fbLink').click()`); await sleep(400);
  const en = await J(`({title:document.querySelector('#fbTitle').textContent, link:document.querySelector('#fbLink').textContent, kinds:[...document.querySelectorAll('#fbKinds button')].map(b=>b.textContent).join('|'), send:document.querySelector('#fbSend').textContent, ph:document.querySelector('#fbMsg').placeholder})`);
  ok('English: the title, the link, the kinds, "Send", the hint in the words box', en.title === 'Feedback' && en.link === 'Feedback' && en.kinds === 'Something is wrong|An idea|Content|Other' && en.send === 'Send' && /at most 1000/.test(en.ph), en);
  await type('English words');
  await J(`document.querySelector('#fbSend').click()`); await sleep(1000);
  const last = (await fb()).log.slice(-1)[0];
  ok('English: the language goes with it, and the thanks are in English', last.lang === 'en' && /Thank you/.test((await toastNow()).msg), last);

  ok('no script errors in the whole run', errors.length === 0, errors);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); process.exit(2); });
