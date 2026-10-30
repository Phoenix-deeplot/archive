// A small Chrome DevTools Protocol client for the browser tests (Node 22+: the built-in WebSocket and fetch; nothing to install).
//   const { connect, sleep } = require('../cdp');  const c = await connect(9444);
//   c.send(method, params) · c.on(fn) · c.js(expr) · c.goto(url, settleMs) · c.clearSite(origin) · c.desktop(w, h, dpr) · c.mobile(w, h, dpr) · c.shot(file) · c.autoDialog(accept, log) · c.close()
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect(port = 9444) {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {                                              // (the browser may still be starting)
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl); } catch (e) { /* not up yet */ }
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('no page to drive on port ' + port);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('cannot open the DevTools socket on port ' + port)); });
  let id = 0;
  const pending = new Map(), listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else listeners.forEach(f => { try { f(m); } catch (e) { /* a listener must not break the client */ } });
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id; pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error('timeout: ' + method)); } }, 60000);
  });
  await send('Page.enable'); await send('Runtime.enable');
  const baseUA = (await send('Runtime.evaluate', { expression: 'navigator.userAgent', returnByValue: true })).result.value;
  const c = {
    send, sleep, on: f => listeners.push(f),
    async js(expr) {                                                                      // the value of an expression in the page (a promise is waited for); an exception in the page is thrown here
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) { const d = r.exceptionDetails; throw new Error('page: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text)); }
      return r.result.value;
    },
    async goto(url, settle = 800) {                                                       // navigate, wait until the page has loaded (at most 15 s), then settle
      const loaded = new Promise(res => { const f = m => { if (m.method === 'Page.loadEventFired') { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); res(); } }; listeners.push(f); setTimeout(res, 15000); });
      await send('Page.navigate', { url }); if (!/^about:/.test(url)) await loaded; await sleep(settle);
    },
    async clearSite(origin) { await send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }); },
    async desktop(width = 1280, height = 900, dpr = 1) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
      await send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await send('Emulation.setUserAgentOverride', { userAgent: baseUA });
    },
    async mobile(width = 375, height = 812, dpr = 2) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await send('Emulation.setUserAgentOverride', { userAgent: baseUA.replace(/Windows NT [\d.]+; Win64; x64/, 'Linux; Android 13; Pixel 7') + ' Mobile' });          // (still says HeadlessChrome: the fake services count only the test browser)
    },
    async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
    autoDialog(accept = true, log = []) {                                                 // alert / confirm / prompt answered at once; what they said is kept in `log`
      listeners.push(m => { if (m.method === 'Page.javascriptDialogOpening') { log.push(m.params.message); send('Page.handleJavaScriptDialog', { accept }).catch(() => {}); } });
      return log;
    },
    close() { try { ws.close(); } catch (e) { /* closed */ } },
  };
  return c;
}

module.exports = { connect, sleep };
