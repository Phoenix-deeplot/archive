// RSSHub detection in the public collection form. The route is only prefilled; preview still needs an explicit lookup.
const {connect} = require('../cdp');
const path = require('path');
const BASE = process.env.RSSHUB_ENTRY_URL || 'http://127.0.0.1:'+(process.env.E2E_APP_PORT||'8920');
const CDP = Number(process.env.E2E_CDP_PORT || 9450);
let pass=0;
function ok(name, value, extra){ if(!value) throw new Error(name+(extra?' '+JSON.stringify(extra):'')); pass++; console.log('PASS',name); }
(async()=>{
  const c=await connect(CDP);
  try{
    const wait=async expr=>{ const end=Date.now()+20000; while(Date.now()<end){ if(await c.js(expr)) return; await new Promise(r=>setTimeout(r,120)); } throw new Error('Timed out: '+expr); };
    const typeUrl=async value=>c.js("(()=>{const e=document.querySelector('#submitUrl');e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await c.clearSite(BASE);
    await c.mobile(390,844,1);
    await c.goto(BASE+'/?lang=zh');
    await wait("!!window.__zt?.state.dirData && typeof window.__zt.openSubmit==='function'");
    await c.js("window.__entryOldFetch=window.fetch;window.__entryDiscoverCalls=[];window.fetch=(url,opt)=>{let body={};try{body=JSON.parse(opt&&opt.body||'{}')}catch(e){}if(String(url).endsWith('/api/feed')&&body.action==='discover'){window.__entryDiscoverCalls.push(body);return Promise.resolve({ok:true,status:200,json:async()=>({ok:true,kind:'feed',feed:'https://rsshub.example.test/bilibili/user/video/2267573.xml',home:'https://space.bilibili.com/2267573',title:'RSSHub 测试路由',found:1,items:[{title:'最新动态',date:'2026-11-07'}],resolution:{scope:'route'}})})}return window.__entryOldFetch(url,opt)}");
    await c.js("window.__zt.openSubmit({tab:'url'})");
    const route='rsshub://bilibili/user/video/2267573';
    await typeUrl(route);
    ok('rsshub scheme shows the dedicated subscription entry',await c.js("!document.querySelector('#submitRsshubTip').hidden && document.querySelector('#submitRsshubToSub').textContent.includes('按订阅解析') && document.querySelector('#submitSubTip').hidden"));
    await c.js("document.querySelector('#submitRsshubToSub').click()");
    ok('entry switches to subscribe tab with route prefilled and no lookup or subscription',await c.js("document.querySelector('#addDlg').open && !document.querySelector('#addSubPane').hidden && document.querySelector('#fsUrl').value==='rsshub://bilibili/user/video/2267573' && document.querySelector('#fsResult').hidden && document.querySelector('#fsGo').hidden && window.__entryDiscoverCalls.length===0 && window.__zt.state.cols.filter(x=>x.feed).length===0"));
    const mobile=await c.js("(()=>{const r=document.querySelector('.fs-row').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,left:r.left,right:r.right}})()");
    ok('mobile subscription input row fits the viewport',mobile.scroll<=mobile.width && mobile.left>=0 && mobile.right<=mobile.width+1,mobile);
    await c.shot(path.join(__dirname,'..','.demo','rsshub-entry-mobile.png'));
    await c.js("document.querySelector('#fsFind').click()");
    await wait("window.__entryDiscoverCalls.length===1 && !document.querySelector('#fsResult').hidden");
    ok('lookup sends the original RSSHub route through discover and renders a preview',await c.js("window.__entryDiscoverCalls[0].action==='discover' && window.__entryDiscoverCalls[0].url==='rsshub://bilibili/user/video/2267573' && document.querySelector('#fsResult').textContent.includes('RSSHub 测试路由') && document.querySelector('#fsResult').textContent.includes('最新动态')"));
    ok('preview does not subscribe until the user confirms',await c.js("!document.querySelector('#fsGo').disabled && window.__zt.state.cols.filter(x=>x.feed).length===0"));
    await c.js("document.querySelector('#addDlg').close();window.__zt.openSubmit({tab:'url'})");
    await typeUrl('https://adminbook.zhitree.cn/rsshub/bilibili/user/video/2267573');
    ok('self-hosted /rsshub/ path shows the dedicated entry',await c.js("!document.querySelector('#submitRsshubTip').hidden && document.querySelector('#submitSubTip').hidden"));
    await typeUrl('https://rsshub.app/bilibili/user/video/2267573');
    ok('known RSSHub host shows the dedicated entry',await c.js("!document.querySelector('#submitRsshubTip').hidden && document.querySelector('#submitSubTip').hidden"));
    await typeUrl('https://example.org/article');
    ok('ordinary URLs keep the existing collect and general subscribe choices',await c.js("document.querySelector('#submitRsshubTip').hidden && !document.querySelector('#submitSubTip').hidden && !document.querySelector('#submitTabs').hidden"));
    await c.js("window.fetch=window.__entryOldFetch");
    console.log(pass+' passed, 0 failed');
  }finally{ c.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
