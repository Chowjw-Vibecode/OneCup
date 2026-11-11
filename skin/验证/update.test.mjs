import test from 'node:test';
import assert from 'node:assert/strict';
import {createSkinUpdater,canAutoInstall,selectSkinUpdate,UPDATE_STORAGE_KEY,RELEASES_URL,CHINA_MIRROR_STORAGE_KEY,CHINA_MIRROR_REPOSITORY} from '../update.js';
const flush=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
function release(v,{draft=false,prerelease=v.includes('-'),url,name,state='uploaded',size=100}={}){return{tag_name:'v'+v,draft,prerelease,assets:[{name:name??`onecup-${v}.zip`,browser_download_url:url??`https://github.com/Chowjw-Vibecode/OneCup/releases/download/v${v}/onecup-${v}.zip`,size,state}]};}
function native(){return{pageUrl:'http://localhost:25123/',apiUrl:'http://127.0.0.1:8080',host:{app:'decent.app',platform:'android'},connection:{connected:true,machineConnected:true,stale:false},settings:{simulatedDevices:[]},machineState:'idle',busy:false,canInstall:true};}
function fixture(options={}){
 let time=1_000_000,id=0,skinReads=0,installed=options.installed??'0.2.29-rc.12';const tasks=new Map(),values=options.values??new Map([[CHINA_MIRROR_STORAGE_KEY,'false']]),context=native(),calls=[],statuses=[];let reloads=0,checks=0;
 const client={get:async path=>{calls.push(['get',path]);if(path==='/machine/state')return options.machineRead??{state:{state:'idle'}};skinReads++;if(options.readback&&skinReads>1) return options.readback();return{id:'this-cup',version:installed};},post:async(path,data)=>{calls.push(['post',path,data]);if(options.install)return options.install({context,client,payload:data,setInstalled:v=>installed=v});installed='0.2.29-rc.13';return{success:true};}};
 let owner=client;
 const storage=options.storage??{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const updater=createSkinUpdater({currentVersion:options.currentVersion??'0.2.29-rc.12',getContext:()=>context,getClient:()=>owner,storage,events:null,now:()=>time,setTimer:(fn,delay)=>{const key=++id;tasks.set(key,{fn,at:time+delay});return key;},clearTimer:key=>tasks.delete(key),reload:()=>reloads++,onStatus:s=>statuses.push(s),fetchImpl:async(url,init)=>{checks++;calls.push(['fetch',url,init]);if(options.fetch)return options.fetch({url,context,setOwner:v=>owner=v});return{ok:true,json:async()=>[release('0.2.29-rc.13')]};}});
 async function advance(ms){const end=time+ms;let count=0;for(;;){const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++count>100)throw Error('timer loop');time=next[1].at;tasks.delete(next[0]);next[1].fn();await flush();}time=end;await flush();}
 return{updater,context,client,calls,statuses,values,advance,setInstalled:v=>installed=v,get reloads(){return reloads},get checks(){return checks},get tasks(){return tasks.size}};
}

test('numeric release ordering follows the RC channel across newer versions, without unrelated prerelease channels',()=>{
 assert.equal(selectSkinUpdate([release('0.2.29-rc.9'),release('0.2.29-rc.13'),release('0.2.30-rc.1'),release('0.2.29-beta.99')],'0.2.29-rc.12').version,'0.2.30-rc.1');
 assert.equal(selectSkinUpdate([release('0.2.29-rc.99'),release('0.2.29')],'0.2.29-rc.12').version,'0.2.29');
 assert.equal(selectSkinUpdate([release('0.2.30-rc.1'),release('0.2.30')],'0.2.29').version,'0.2.30');
 assert.equal(selectSkinUpdate([release('0.2.30')],'0.2.29-rc.12').version,'0.2.30');
 assert.equal(selectSkinUpdate([release('0.2.29-rc.12'),release('0.2.29-rc.11')],'0.2.29-rc.12'),null);
});

test('only the exact uploaded skin ZIP in the expected GitHub release is eligible',()=>{
 const bad=[release('0.2.29-rc.13',{draft:true}),release('0.2.29-rc.13',{prerelease:false}),release('0.2.29-rc.13',{name:'thiscup-crystal.zip'}),release('0.2.29-rc.13',{url:'https://evil.invalid/skin.zip'}),release('0.2.29-rc.13',{state:'new'}),release('0.2.29-rc.13',{size:0}),release('0.2.29-rc.13',{url:'https://github.com/other/This-Cup/releases/download/v0.2.29-rc.13/onecup-0.2.29-rc.13.zip'})];
 assert.equal(selectSkinUpdate(bad,'0.2.29-rc.12'),null);
});

test('default is off and makes no network or storage writes until explicitly enabled',async()=>{
 const f=fixture();f.updater.start();await f.advance(12*3_600_000);assert.equal(f.checks,0);assert.equal(f.calls.length,0);assert.deepEqual([...f.values],[[CHINA_MIRROR_STORAGE_KEY,'false']]);f.updater.dispose();
});

test('native loopback, health, no simulation, idle and explicit clean-draft predicate are all required',()=>{
 const context=native();assert(canAutoInstall(context));
 for(const patch of [{host:null},{pageUrl:'http://127.0.0.1:25123/'},{apiUrl:'http://192.168.31.46:8080'},{pageUrl:'http://localhost:25123/?scene=taste'},{canInstall:false},{busy:true},{settings:{}},{settings:{simulatedDevices:['mock']}},{connection:{connected:true,machineConnected:true,stale:true}},{machineState:'espresso'},{machineState:'steam'},{machineState:'flush'},{machineState:'hotwater'},{machineState:'heating'}])assert.equal(canAutoInstall({...context,...patch}),false,JSON.stringify(patch));
});

test('enabling waits 60 seconds, installs only this skin URL, verifies exact version, then reloads',async()=>{
 const f=fixture();f.updater.start();f.updater.setEnabled(true);await f.advance(59_999);assert.equal(f.calls.length,0);await f.advance(1);assert.equal(f.reloads,1);
 assert.deepEqual(f.calls.filter(c=>c[0]==='post'),[['post','/webui/skins/install/url',{url:'https://github.com/Chowjw-Vibecode/OneCup/releases/download/v0.2.29-rc.13/onecup-0.2.29-rc.13.zip'}]]);
 assert.equal(f.calls.find(c=>c[0]==='fetch')[1],RELEASES_URL);assert.equal(f.calls.find(c=>c[0]==='fetch')[2].credentials,'omit');assert.equal(f.calls.find(c=>c[0]==='fetch')[2].referrerPolicy,'no-referrer');
 assert.deepEqual(f.calls.filter(c=>c[0]==='get').map(c=>c[1]),['/webui/skins/this-cup','/machine/state','/webui/skins/this-cup']);assert.equal(f.updater.status.phase,'reload_pending');assert.equal(JSON.parse(f.values.get(UPDATE_STORAGE_KEY)).pending,null);f.updater.dispose();
});

test('preference survives reopen and failed persistence is explicit and blocks installs',async()=>{
 const values=new Map(),f=fixture({values});f.updater.setEnabled(true);f.updater.dispose();const g=fixture({values});assert.equal(g.updater.enabled,true);g.updater.setEnabled(false);g.updater.dispose();assert.equal(fixture({values}).updater.enabled,false);
 const h=fixture({storage:{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}});h.updater.start();h.updater.setEnabled(true);await h.advance(60_000);assert.equal(h.updater.preferenceSaved,false);assert.equal(h.updater.status.phase,'storage_error');assert.equal(h.calls.length,0);h.updater.dispose();
});

test('dirty draft or operation delays the whole check until eligible, not just the installation',async()=>{
 const f=fixture();f.context.canInstall=false;f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.calls.length,0);f.context.canInstall=true;await f.advance(30_000);assert.equal(f.reloads,1);f.updater.dispose();
});

test('machine state is freshly checked before POST and unexpected state never installs',async()=>{
 const f=fixture({machineRead:{state:{state:'espresso'}}});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(f.reloads,0);f.updater.dispose();
});

test('operation starting or gateway replacement during release fetch prevents installation',async()=>{
 for(const kind of ['busy','owner']){const f=fixture({fetch:async({context,setOwner})=>{if(kind==='busy')context.busy=true;else setOwner({get(){},post(){}});return{ok:true,json:async()=>[release('0.2.29-rc.13')]}}});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(f.reloads,0);f.updater.dispose();}
});

test('release failure stays isolated and is throttled across page reopen',async()=>{
 const values=new Map([[CHINA_MIRROR_STORAGE_KEY,'false']]),f=fixture({values,fetch:async()=>{throw Error('offline')}});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.updater.status.phase,'error');assert.equal(f.checks,1);f.updater.dispose();const g=fixture({values});g.updater.start();await g.advance(60_000);assert.equal(g.checks,0);g.updater.dispose();
});

test('uncertain POST is read back and is never blindly replayed, including after reopening',async()=>{
 const f=fixture({install:async()=>{throw Error('timeout')}});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.updater.status.phase,'awaiting_confirmation');assert.equal(f.reloads,0);await f.advance(120_000);assert.equal(f.calls.filter(c=>c[0]==='post').length,1);f.updater.dispose();
 const g=fixture({values:f.values});g.updater.start();await g.advance(60_000);assert.equal(g.calls.filter(c=>c[0]==='post').length,0);assert.equal(g.updater.status.phase,'awaiting_confirmation');g.setInstalled('0.2.29-rc.13');await g.advance(60_000);assert.equal(g.reloads,1);g.updater.dispose();
});

test('a timeout that actually installed can resolve successfully by exact version readback',async()=>{
 const f=fixture({install:async({setInstalled})=>{setInstalled('0.2.29-rc.13');throw Error('timeout')}});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.reloads,1);assert.equal(f.calls.filter(c=>c[0]==='post').length,1);f.updater.dispose();
});

test('installation finishing during an operation waits to reload instead of interrupting it',async()=>{
 const f=fixture({install:async({context,setInstalled})=>{setInstalled('0.2.29-rc.13');context.canInstall=false;return{success:true}}});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.updater.status.phase,'reload_pending');assert.equal(f.reloads,0);f.context.canInstall=true;await f.advance(30_000);assert.equal(f.reloads,1);f.updater.dispose();
});

test('opt-out during installation cannot undo native POST, still verifies, and does not reload',async()=>{
 let f;f=fixture({install:async({setInstalled})=>{f.updater.setEnabled(false);setInstalled('0.2.29-rc.13');return{success:true}}});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.updater.enabled,false);assert.equal(f.reloads,0);assert.equal(f.updater.status.phase,'reload_pending');assert(f.calls.some(c=>c[1]==='/webui/skins/this-cup'));assert.equal(f.calls.filter(c=>c[0]==='post').length,1);f.updater.dispose();
});

test('pending update is persisted before native POST and wrong readback ID cannot confirm it',async()=>{
 let f;f=fixture({install:async()=>{assert.equal(JSON.parse(f.values.get(UPDATE_STORAGE_KEY)).pending.version,'0.2.29-rc.13')},readback:()=>({id:'other-skin',version:'0.2.29-rc.13'})});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.updater.status.phase,'awaiting_confirmation');assert.equal(f.reloads,0);f.updater.dispose();
});

test('real DecaidClient request method gets a long install timeout and no other update endpoints',async()=>{
 const f=fixture();f.client.request=async(method,path,payload,timeout)=>{f.calls.push(['request',method,path,payload,timeout]);f.setInstalled('0.2.29-rc.13');return{success:true}};f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.deepEqual(f.calls.find(c=>c[0]==='request').slice(1),['POST','/webui/skins/install/url',{url:'https://github.com/Chowjw-Vibecode/OneCup/releases/download/v0.2.29-rc.13/onecup-0.2.29-rc.13.zip'},120_000]);assert.equal(f.calls.some(c=>c.includes('/webui/skins/update')||c.includes('/webui/skins/default')),false);f.updater.dispose();
});


test('already newer native installation is never downgraded by an older open page',async()=>{
 const f=fixture({installed:'0.2.29-rc.14'});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(f.reloads,1);assert.equal(f.updater.status.version,'0.2.29-rc.14');f.updater.dispose();
});

test('stopping or disposing while release lookup is in flight cannot submit an installer',async()=>{
 for(const dispose of [false,true]){let f;f=fixture({fetch:async()=>{if(dispose)f.updater.dispose();else f.updater.stop();return{ok:true,json:async()=>[release('0.2.29-rc.13')]}}});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(f.reloads,0);f.updater.dispose();}
});


test('a pending target superseded by a newer native skin resolves to the actual version without replaying installation',async()=>{
 const values=new Map([[UPDATE_STORAGE_KEY,JSON.stringify({enabled:true,nextCheck:0,pending:{version:'0.2.29-rc.13',url:'https://github.com/Chowjw-Vibecode/OneCup/releases/download/v0.2.29-rc.13/onecup-0.2.29-rc.13.zip',apiOrigin:'http://127.0.0.1:8080'}})]]);
 const f=fixture({values,installed:'0.2.29-rc.14'});f.updater.start();await f.advance(60_000);
 assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(f.updater.status.phase,'reload_pending');assert.equal(f.updater.status.version,'0.2.29-rc.14');assert.equal(JSON.parse(values.get(UPDATE_STORAGE_KEY)).pending,null);assert.equal(f.reloads,1);f.updater.dispose();
});


test('an opt-out saved by another page during final machine read prevents installation and stays off',async()=>{
 const f=fixture();const get=f.client.get;f.client.get=async path=>{const result=await get(path);if(path==='/machine/state'){const latest=JSON.parse(f.values.get(UPDATE_STORAGE_KEY));f.values.set(UPDATE_STORAGE_KEY,JSON.stringify({...latest,enabled:false}));}return result;};
 f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);
 assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(JSON.parse(f.values.get(UPDATE_STORAGE_KEY)).enabled,false);assert.equal(f.updater.status.phase,'disabled');f.updater.dispose();
});

test('a pending update saved by another page during final read is verified rather than installed again',async()=>{
 const f=fixture();const get=f.client.get;f.client.get=async path=>{const result=await get(path);if(path==='/machine/state'){const latest=JSON.parse(f.values.get(UPDATE_STORAGE_KEY));f.values.set(UPDATE_STORAGE_KEY,JSON.stringify({...latest,pending:{version:'0.2.29-rc.13',url:'https://github.com/Chowjw-Vibecode/OneCup/releases/download/v0.2.29-rc.13/onecup-0.2.29-rc.13.zip',apiOrigin:'http://127.0.0.1:8080'}}));f.setInstalled('0.2.29-rc.13');}return result;};
 f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);
 assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(f.updater.status.phase,'reload_pending');assert.equal(f.reloads,1);f.updater.dispose();
});


test('a shared opt-out during native installation survives successful readback and prevents reload',async()=>{
 let f;f=fixture({install:async({setInstalled})=>{const latest=JSON.parse(f.values.get(UPDATE_STORAGE_KEY));f.values.set(UPDATE_STORAGE_KEY,JSON.stringify({...latest,enabled:false}));setInstalled('0.2.29-rc.13');return{success:true};}});
 f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.reloads,0);assert.equal(f.updater.enabled,false);assert.equal(JSON.parse(f.values.get(UPDATE_STORAGE_KEY)).enabled,false);assert.equal(f.updater.status.phase,'reload_pending');f.updater.dispose();
});

test('successful readback does not clear a newer pending update submitted by another page',async()=>{
 let f;f=fixture({install:async({setInstalled})=>{const latest=JSON.parse(f.values.get(UPDATE_STORAGE_KEY));f.values.set(UPDATE_STORAGE_KEY,JSON.stringify({...latest,pending:{...latest.pending,version:'0.2.29-rc.14',url:'https://github.com/Chowjw-Vibecode/OneCup/releases/download/v0.2.29-rc.14/onecup-0.2.29-rc.14.zip'}}));setInstalled('0.2.29-rc.13');return{success:true};}});
 f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.reloads,0);assert.equal(f.updater.status.phase,'awaiting_confirmation');assert.equal(JSON.parse(f.values.get(UPDATE_STORAGE_KEY)).pending.version,'0.2.29-rc.14');assert.equal(f.calls.filter(c=>c[0]==='post').length,1);f.updater.dispose();
});

test('an unavailable or forbidden native installer releases pending state without replay or reload',async()=>{
 for(const status of [401,403,404,405]){const f=fixture({install:async()=>{throw Object.assign(new Error('rejected'),{status})}});f.updater.start();f.updater.setEnabled(true);await f.advance(60_000);assert.equal(f.updater.status.phase,'unsupported');assert.equal(JSON.parse(f.values.get(UPDATE_STORAGE_KEY)).pending,null);assert.equal(f.reloads,0);assert.equal(f.calls.filter(c=>c[0]==='post').length,1);f.updater.dispose();}
});


test('release checks repeat hourly without installing when no newer release exists',async()=>{
 const f=fixture({fetch:async()=>({ok:true,json:async()=>[]})});f.updater.start();f.updater.setEnabled(true);
 await f.advance(60_000);assert.equal(f.checks,1);
 await f.advance(3_599_999);assert.equal(f.checks,1);
 await f.advance(1);assert.equal(f.checks,2);
 await f.advance(3_600_000);assert.equal(f.checks,3);
 assert.equal(f.calls.some(c=>c[0]==='post'),false);f.updater.dispose();
});

test('legacy six-hour wait is shortened and persisted without changing the preference or pending state',async()=>{
 const values=new Map([[UPDATE_STORAGE_KEY,JSON.stringify({enabled:true,nextCheck:1_000_000+6*3_600_000,pending:null})]]);
 const f=fixture({values,fetch:async()=>({ok:true,json:async()=>[]})});f.updater.start();
 assert.deepEqual(JSON.parse(values.get(UPDATE_STORAGE_KEY)),{enabled:true,nextCheck:1_000_000+3_600_000,pending:null});
 await f.advance(3_599_999);assert.equal(f.checks,0);await f.advance(1);assert.equal(f.checks,1);
 assert.equal(f.calls.some(c=>c[0]==='post'),false);f.updater.dispose();
});


test('manual check works immediately with automatic updates off and keeps the switch off',async()=>{
 const f=fixture();f.context.canInstall=false;f.updater.start();await f.updater.checkNow();
 assert.equal(f.checks,1);assert.equal(f.updater.enabled,false);assert.equal(f.updater.status.phase,'available');
 assert.equal(f.updater.status.version,'0.2.29-rc.13');assert.equal(f.reloads,0);assert.equal(f.calls.some(c=>c[0]==='post'),false);
 await f.advance(60_000);assert.equal(f.checks,1);f.updater.dispose();
});

test('manual check bypasses the hourly wait while an open settings dialog still blocks installation',async()=>{
 const f=fixture({values:new Map([[CHINA_MIRROR_STORAGE_KEY,'false'],[UPDATE_STORAGE_KEY,JSON.stringify({enabled:true,nextCheck:1_000_000+3_600_000,pending:null})]])});
 f.context.canInstall=false;f.updater.start();await f.updater.checkNow();
 assert.equal(f.checks,1);assert.equal(f.updater.status.phase,'available');assert.equal(f.calls.some(c=>c[0]==='post'),false);
 await f.advance(60_000);assert.equal(f.checks,1);assert.equal(f.reloads,0);
 f.context.canInstall=true;await f.advance(30_000);assert.equal(f.checks,1);assert.equal(f.reloads,1);f.updater.dispose();
});

test('manual check reports current or an error without enabling automatic updates',async()=>{
 for(const failure of [false,true]){const f=fixture({fetch:async()=>{if(failure)throw Error('offline');return{ok:true,json:async()=>[]}}});
 f.updater.start();await f.updater.checkNow();assert.equal(f.checks,1);assert.equal(f.updater.status.phase,failure?'error':'current');
 assert.equal(f.updater.enabled,false);assert.equal(f.calls.some(c=>c[0]==='post'),false);f.updater.dispose();}
});

test('repeated manual clicks during a check and a stopped page never duplicate work',async()=>{
 let resolve;const f=fixture({fetch:()=>new Promise(done=>resolve=done)});f.updater.start();const checking=f.updater.checkNow();
 await flush();await f.updater.checkNow();assert.equal(f.checks,1);f.updater.stop();
 resolve({ok:true,json:async()=>[release('0.2.29-rc.13')]});await checking;assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(f.reloads,0);f.updater.dispose();
});


test('enabling a previously disabled installation also caps an old six-hour reservation',async()=>{
 const values=new Map([[UPDATE_STORAGE_KEY,JSON.stringify({enabled:false,nextCheck:1_000_000+6*3_600_000,pending:null})]]);
 const f=fixture({values,fetch:async()=>({ok:true,json:async()=>[]})});f.updater.start();
 assert.equal(JSON.parse(values.get(UPDATE_STORAGE_KEY)).nextCheck,1_000_000+6*3_600_000);
 f.updater.setEnabled(true);assert.equal(JSON.parse(values.get(UPDATE_STORAGE_KEY)).nextCheck,1_000_000+3_600_000);
 await f.advance(3_600_000);assert.equal(f.checks,1);f.updater.dispose();
});


test('old clients select the transition release and its new updater selects the OneCup successor',async()=>{
 const {execFileSync}=await import('node:child_process');
 const bridge={tag_name:'v0.2.34',draft:false,prerelease:false,assets:[{name:'this-cup-0.2.34.zip',browser_download_url:'https://github.com/Chowjw-Vibecode/This-Cup/releases/download/v0.2.34/this-cup-0.2.34.zip',state:'uploaded',size:100}]};
 for(const v of ['0.2.31','0.2.32','0.2.33']){
  const source=execFileSync('git',['show',`v${v}:skin/update.js`],{encoding:'utf8'}).replace(/^import .*?;$/m,'const isUsageEnvironment=()=>true;');
  const old=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.equal(old.selectSkinUpdate([bridge],v).version,'0.2.34');
 }
 assert.equal(RELEASES_URL,'https://api.github.com/repos/Chowjw-Vibecode/OneCup/releases?per_page=100');
 assert.equal(selectSkinUpdate([release('0.2.35')],'0.2.34').url,'https://github.com/Chowjw-Vibecode/OneCup/releases/download/v0.2.35/onecup-0.2.35.zip');
});

test('an old in-flight transition URL still verifies without replaying installation',async()=>{
 const pending={version:'0.2.34',url:'https://github.com/Chowjw-Vibecode/This-Cup/releases/download/v0.2.34/this-cup-0.2.34.zip',apiOrigin:'http://127.0.0.1:8080'};
 const f=fixture({values:new Map([[UPDATE_STORAGE_KEY,JSON.stringify({enabled:true,nextCheck:0,pending})]]),installed:'0.2.34'});f.updater.start();await f.advance(60_000);
 assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(f.reloads,1);f.updater.dispose();
});

function mirrorRelease(v){const r=release(v),name=`onecup-${v}.zip`;return{tag_name:r.tag_name,prerelease:r.prerelease,body:`<!-- onecup-asset ${JSON.stringify({name,size:100,sha256:'a'.repeat(64)})} -->`,assets:[{name,browser_download_url:`https://gitee.com/${CHINA_MIRROR_REPOSITORY}/releases/download/v${v}/${name}`}]};}

test('China mirror defaults on without enabling automatic installs; explicit off survives reload',async()=>{
 const values=new Map(),f=fixture({values,fetch:async()=>({ok:true,json:async()=>[mirrorRelease('0.2.29-rc.13')]})});
 assert.equal(f.updater.chinaMirrorEnabled,true);assert.equal(f.updater.enabled,false);
 f.updater.start();await f.advance(60_000);assert.equal(f.checks,0);assert.equal(values.size,0);
 await f.updater.checkNow();assert.equal(f.checks,1);assert.equal(f.updater.status.source,'china');assert.equal(f.calls.some(c=>c[0]==='post'),false);
 f.updater.setChinaMirrorEnabled(false);f.updater.dispose();
 const reopened=fixture({values});assert.equal(reopened.updater.chinaMirrorEnabled,false);assert.equal(reopened.updater.enabled,false);reopened.updater.dispose();
});

test('China selection persists independently and manual checks use the mirror without enabling updates',async()=>{
 const f=fixture({fetch:async()=>({ok:true,json:async()=>[mirrorRelease('0.2.29-rc.13')]})});f.context.canInstall=false;f.updater.start();f.updater.setChinaMirrorEnabled(true);await f.updater.checkNow();
 assert.equal(f.updater.enabled,false);assert.equal(f.updater.chinaMirrorEnabled,true);assert.equal(f.values.get(CHINA_MIRROR_STORAGE_KEY),'true');assert.equal(f.checks,1);assert.match(f.calls.find(c=>c[0]==='fetch')[1],/^https:\/\/gitee.com\/api\/v5\//);
 assert.equal(f.updater.status.source,'china');assert.equal(f.updater.status.phase,'available');assert.equal(f.calls.some(c=>c[0]==='post'),false);f.updater.dispose();
 const g=fixture({values:f.values});assert.equal(g.updater.chinaMirrorEnabled,true);assert.equal(g.updater.enabled,false);g.updater.dispose();
});

test('China metadata failures fall back to GitHub and install only once',async()=>{
 for(const bad of ['offline','metadata']){const f=fixture({fetch:async({url})=>{if(url.startsWith('https://gitee.com/')){if(bad==='offline')throw Error('offline');return{ok:true,json:async()=>[{tag_name:'v0.2.29-rc.13',prerelease:true,assets:[]}]};}return{ok:true,json:async()=>[release('0.2.29-rc.13')]};}});
 f.updater.start();f.updater.setChinaMirrorEnabled(true);f.updater.setEnabled(true);await f.advance(60_000);
 assert.equal(f.checks,2);assert.equal(f.reloads,1);assert.equal(f.calls.filter(c=>c[0]==='post').length,1);assert.match(f.calls.find(c=>c[0]==='post')[2].url,/^https:\/\/github.com\/Chowjw-Vibecode\/OneCup\//);assert.equal(f.updater.status.fallback,true);f.updater.dispose();}
});

test('a mirror choice changed during a lookup cannot install the previous route',async()=>{
 let resolve;const f=fixture({fetch:()=>new Promise(done=>resolve=done)});f.updater.start();f.updater.setChinaMirrorEnabled(true);f.updater.setEnabled(true);const checking=f.updater.checkNow();await flush();
 f.updater.setChinaMirrorEnabled(false);resolve({ok:true,json:async()=>[mirrorRelease('0.2.29-rc.13')]});await checking;
 assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(f.reloads,0);assert.equal(f.updater.chinaMirrorEnabled,false);f.updater.dispose();
});

test('mirror pending is verified even when the mirror preference is now off',async()=>{
 const pending={version:'0.2.35',url:`https://gitee.com/${CHINA_MIRROR_REPOSITORY}/releases/download/v0.2.35/onecup-0.2.35.zip`,apiOrigin:'http://127.0.0.1:8080'};
 const f=fixture({values:new Map([[CHINA_MIRROR_STORAGE_KEY,'false'],[UPDATE_STORAGE_KEY,JSON.stringify({enabled:true,nextCheck:0,pending})]]),installed:'0.2.35'});f.updater.start();await f.advance(60_000);
 assert.equal(f.calls.some(c=>c[0]==='post'),false);assert.equal(f.reloads,1);assert.equal(f.updater.chinaMirrorEnabled,false);f.updater.dispose();
});


test('an audited native mirror download error switches to the same GitHub version once',async()=>{
 const message="Couldn't install the skin. The service refused access. Check repository access or try again later.";
 const f=fixture({fetch:async({url})=>({ok:true,json:async()=>url.startsWith('https://gitee.com/')?[mirrorRelease('0.2.29-rc.13')]:[release('0.2.29-rc.13'),release('0.2.30')]}),install:async({payload,setInstalled})=>{if(payload.url.startsWith('https://gitee.com/'))throw Object.assign(Error(message),{status:500,details:{error:message}});setInstalled('0.2.29-rc.13');}});
 f.context.nativeCommit='14361a94b32888f6a81182e9e239f513d39d060c';f.updater.start();f.updater.setChinaMirrorEnabled(true);f.updater.setEnabled(true);await f.advance(60_000);
 assert.equal(f.calls.filter(c=>c[0]==='post').length,1);assert.equal(f.updater.status.phase,'available');assert.equal(f.updater.status.fallback,true);
 await f.advance(30_000);const posts=f.calls.filter(c=>c[0]==='post');assert.equal(posts.length,2);assert.match(posts[1][2].url,/github.com.*onecup-0.2.29-rc.13.zip$/);assert.equal(f.reloads,1);f.updater.dispose();
});

test('unknown native commits and non-download mirror failures keep pending without another POST',async()=>{
 for(const kind of ['unknown-build','copy','timeout']){
  const message=kind==='copy'?"Couldn't install the skin. Check storage space and file permissions, then try again.":"Couldn't install the skin. The connection took too long. Try again.";
  const f=fixture({fetch:async()=>({ok:true,json:async()=>[mirrorRelease('0.2.29-rc.13')]}),install:async()=>{throw Object.assign(Error(message),{status:kind==='timeout'?0:500,details:kind==='timeout'?null:{error:message}})}});
  f.context.nativeCommit=kind==='unknown-build'?'other':'14361a94b32888f6a81182e9e239f513d39d060c';f.updater.start();f.updater.setChinaMirrorEnabled(true);f.updater.setEnabled(true);await f.advance(120_000);
  assert.equal(f.calls.filter(c=>c[0]==='post').length,1);assert.equal(f.updater.status.phase,'awaiting_confirmation');assert(JSON.parse(f.values.get(UPDATE_STORAGE_KEY)).pending);f.updater.dispose();
 }
});


test('turning China off during the final native reads cancels an unsubmitted mirror install',async()=>{
 const f=fixture({fetch:async({url})=>({ok:true,json:async()=>url.startsWith('https://gitee.com/')?[mirrorRelease('0.2.29-rc.13')]:[release('0.2.29-rc.13')]})});
 const originalGet=f.client.get;f.client.get=async path=>{const value=await originalGet(path);if(path==='/machine/state')f.updater.setChinaMirrorEnabled(false);return value;};
 f.updater.start();f.updater.setChinaMirrorEnabled(true);f.updater.setEnabled(true);await f.advance(60_000);
 assert.equal(f.calls.filter(c=>c[0]==='post').length,0);assert.equal(JSON.parse(f.values.get(UPDATE_STORAGE_KEY)).pending,null);
 await f.advance(30_000);assert.equal(f.calls.filter(c=>c[0]==='post').length,1);assert.match(f.calls.find(c=>c[0]==='post')[2].url,/^https:\/\/github\.com\//);f.updater.dispose();
});
