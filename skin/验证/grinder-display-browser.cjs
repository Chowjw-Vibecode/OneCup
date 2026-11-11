// Real grinder client + panel, synthetic WebSocket/GETs. Never connects to hardware.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const html=`<!doctype html><html lang="zh" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/ceramic.css"><link rel="stylesheet" href="/typography.css"><link rel="stylesheet" href="/grinder.css">
<button id="grinderButton" class="device-shortcut"><span>研磨</span><i></i></button><div id="grinderHost"></div>
<script type="module">
import {createGrinderClient} from '/grinder.js';
import {mountGrinderUI} from '/grinder-panel.js';
const copy=v=>JSON.parse(JSON.stringify(v)),calls=[];
let raw={available:true,connected:true,state:'grinding',busy:true,deviceId:'fixture-a',multiDevice:true,preferencesReady:true,workflowReady:true,initialized:true,parametersConfirmed:true,values:{targetAngle:550,servoAngle:550,motorRpm:900,feedRpm:30,bootSign:1},config:{grindSize:550,motorRpm:900,feedRpm:30,bootMode:'manual'}};
let socket,gate=null,resolveGate;
class FakeSocket{constructor(){socket=this;queueMicrotask(()=>this.onopen?.())}close(){}}
const api=createGrinderClient({baseUrl:location.origin,fetchImpl:async(url,init)=>{
 if(init.method!=='GET')throw Error('Unexpected motor write');calls.push(url);
 if(gate)await gate;return {ok:true,json:async()=>copy(raw)};
}});
api.getRecipe=async()=>copy(raw.config);api.stop=async()=>calls.push('stop');
api.start=api.apply=async()=>{calls.push('unsafe-command');throw Error('Unexpected command')};
const profile={title:'通知刷新测试',steps:[{flow:3,seconds:5}]},workflow={profile};
window.thisCup={client:{grinder:api},getWorkflow:()=>copy(workflow),getProfileIdentity:()=> 'fixture-profile',isRunning:()=>false,render(){}};
window.thisCupGrinderPanel.updateEntry();
api.observe({WebSocketImpl:FakeSocket,setTimer:()=>1,clearTimer(){}});
await api.getState();
const panel=mountGrinderUI(document.getElementById('grinderHost'),{client:{grinder:api},getWorkflow:()=>copy(workflow),getProfileIdentity:()=> 'fixture-profile',observationOnly:true});
window.lab={api,calls,panel,
 notify(){if(!gate)gate=new Promise(r=>resolveGate=r);socket.onmessage?.({data:'changed'})},
 async settle(){const r=resolveGate;gate=null;resolveGate=null;r?.();await api.getState()},
 async state(patch){Object.assign(raw,patch);await api.getState()},
 disconnect(){socket.onclose?.()},
 async reconnect(){await api.refreshObservation()},
};
</script></html>`;

(async()=>{
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
  const p=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.statusCode=404;return res.end()}
  res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'})[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch();const errors=[],results=[];
 try{
  for(const [width,height,dpr] of [[1007,602,1.33125],[1340,800,2]])for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:true});
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
   await page.goto(origin+'/fixture');await page.waitForFunction(()=>window.lab&&document.querySelector('.gp-dialog.is-running'));
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>lab.nodes={start:document.querySelector('[data-gp=start]'),stop:document.querySelector('.gp-run-actions [data-gp=stop]')});
   const snapshot=()=>page.evaluate(()=>{
    const start=document.querySelector('[data-gp=start]'),stop=document.querySelector('.gp-run-actions [data-gp=stop]');
    return {entry:document.getElementById('grinderButton').classList.contains('connected'),running:document.querySelector('.gp-dialog').classList.contains('is-running'),heading:document.querySelector('.gp-header h2').textContent,startVisible:!!start.getClientRects().length,startDisabled:start.disabled,stopVisible:!!stop.getClientRects().length,stopDisabled:stop.disabled,stopWidth:stop.getBoundingClientRect().width,sameNodes:lab.nodes.start===start&&lab.nodes.stop===stop,observation:lab.api.cachedState.observation};
   });
   const baseline=await snapshot();assert(baseline.entry&&baseline.running&&!baseline.startVisible&&baseline.stopVisible);
   for(let i=0;i<10;i++){
    await page.evaluate(()=>lab.notify());const checking=await snapshot();assert.equal(checking.observation,'checking');
    assert(checking.entry&&checking.running&&!checking.startVisible&&checking.startDisabled&&checking.stopVisible&&!checking.stopDisabled&&checking.sameNodes,JSON.stringify({phase:'notification',width,theme,checking}));
    assert(Math.abs(checking.stopWidth-baseline.stopWidth)<1);await page.evaluate(()=>lab.settle());
   }
   if(width===1007&&theme==='light')await page.screenshot({path:'/tmp/onecup-grinder-stable.png'});
   await page.evaluate(()=>lab.notify());await page.waitForFunction(()=>document.querySelector('.gp-state').textContent.includes('尚未确认'));
   const expired=await snapshot();assert(!expired.entry&&!expired.running&&expired.startDisabled&&expired.stopVisible&&!expired.stopDisabled);
   await page.evaluate(()=>lab.notify());assert(!(await snapshot()).entry,'repeated notifications must not extend an expired hold');await page.evaluate(()=>lab.settle());
   await page.evaluate(()=>lab.disconnect());const disconnected=await snapshot();assert(!disconnected.entry&&!disconnected.running&&disconnected.startDisabled&&disconnected.stopVisible&&!disconnected.stopDisabled);
   await page.evaluate(()=>lab.reconnect());await page.waitForFunction(()=>lab.api.cachedState.observation==='ready');
   await page.evaluate(()=>lab.state({deviceId:'fixture-b',state:'unknown'}));const changed=await snapshot();assert(!changed.entry&&!changed.running&&changed.startDisabled&&changed.stopVisible);
   await page.evaluate(()=>lab.state({state:'idle',busy:false}));await page.waitForFunction(()=>!document.querySelector('[data-gp=start]').disabled);
   const idle=await snapshot();assert(idle.entry&&!idle.running&&idle.startVisible&&!idle.startDisabled);
   await page.evaluate(()=>lab.state({state:'grinding',busy:true}));await page.evaluate(()=>lab.notify());
   await page.locator('.gp-run-actions [data-gp=stop]').tap();assert.equal(await page.evaluate(()=>lab.calls.filter(c=>c==='stop').length),1);await page.evaluate(()=>lab.settle());
   assert.equal(await page.evaluate(()=>lab.calls.includes('unsafe-command')),false);
   results.push({width,height,dpr,theme,notifications:10,timeout:true,disconnect:true,deviceChange:true,idle:true,stopAvailable:true});await page.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results,errors},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
