// Development integration checks only: current source + DOM/API doubles.
// No browser, real network, timers or hardware is started by this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {beanSnapshot} from '../cup-telemetry.js';
import {stageLabel} from '../stage-labels.js';
import {isPreparation,isProfileSample} from '../brew-timeline.js';
import {readFile} from 'node:fs/promises';

const ceramicSource=await readFile(new URL('../ceramic-ui.js',import.meta.url),'utf8');
const appSource=await readFile(new URL('../app.js',import.meta.url),'utf8');
const beansSource=await readFile(new URL('../beans.js',import.meta.url),'utf8');
const copy=x=>structuredClone(x);
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function productionFunction(name){
 const declarations=[...appSource.matchAll(/^(?:async )?function (\w+)\(/gm)],index=declarations.findIndex(match=>match[1]===name);
 assert(index>=0,name);return appSource.slice(declarations[index].index,declarations[index+1]?.index??appSource.length);
}
function errorExplainer(state){
 const start=appSource.indexOf('const strings = {'),end=appSource.indexOf('const paramSpec = {',start);
 assert(start>=0&&end>start);
 const extra=[...appSource.matchAll(/^Object\.assign\(strings\.(?:zh|en), \{[\s\S]*?^\}\);/gm)].filter(match=>match.index>end).map(match=>match[0]).join('\n');
 const context=vm.createContext({s:state,TypeError});
 vm.runInContext(appSource.slice(start,end)+'\n'+extra+'\n'+productionFunction('explainError'),context);
 return context.explainError;
}
function dom(){
 const ids=new Map(),selectors=new Map(),lists=new Map();
 class Element{
  constructor(){this.children=[];this.dataset={};this.style={setProperty(name,value){this[name]=value;}};this.attributes={};this.textContent='';this.value='';this.hidden=false;this.disabled=false;this.className='';this.classList={toggle:(name,on)=>{const names=new Set(this.className.split(/\s+/).filter(Boolean));on?names.add(name):names.delete(name);this.className=[...names].join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};}
  setAttribute(name,value){this.attributes[name]=String(value);}getAttribute(name){return this.attributes[name]??null;}removeAttribute(name){delete this.attributes[name];}
  append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}before(){}after(){}focus(){}remove(){this.removed=true;}
  querySelector(selector){this.selectors??=new Map();if(!this.selectors.has(selector))this.selectors.set(selector,new Element());return this.selectors.get(selector);}
  querySelectorAll(selector){if(selector==='small')return this.small??=Array.from({length:2},()=>new Element());return [];}
 }
 const get=id=>{if(!ids.has(id)){const el=new Element();el.id=id;el.parentElement=new Element();ids.set(id,el);}return ids.get(id);};
 const document={body:new Element(),activeElement:new Element(),getElementById:get,createElement:()=>new Element(),
  querySelector(selector){if(selector==='.ceramic-tools')return null;if(selector==='.ceramic-message')return document.body.children.find(el=>el.className.includes('ceramic-message')&&!el.removed)||null;if(!selectors.has(selector))selectors.set(selector,new Element());return selectors.get(selector);},
  querySelectorAll:selector=>lists.get(selector)??[]};
 const likes=['like','neutral','dislike'].map(value=>{const el=new Element();el.dataset.ceramicLike=value;return el;});lists.set('[data-ceramic-like]',likes);
 const steps=['temperature:1','flow:1','duration:1'].map(value=>{const el=new Element();el.dataset.ceramicSteamStep=value;return el;});
 lists.set('[data-ceramic-steam-step]',steps);lists.set('[data-ceramic-steam-step],[data-ceramic-steam-edit]',steps);
 return {document,get,likes,steps,lists};
}
function fixture({language='en',mode='ready',canStart=false}={}){
 const d=dom(),calls=[],storage=new Map([['/machine/settings',{steamPurgeMode:0}]]),notices=[];
 const workflow={profile:{title:'Recipe',steps:[{temperature:92}],target_weight:56},context:{targetDoseWeight:16,targetYield:56,coffeeName:'Original bean'},steamSettings:{targetTemperature:155,flow:1,duration:40},hotWaterData:{targetTemperature:80,volume:100,flow:5,duration:30}};
 const s={language,mode,workflow:copy(workflow),draft:copy(workflow),runWorkflow:copy(workflow),runId:'shot-1',modal:null,busy:false,connection:{connected:true,machineConnected:true,stale:false,scaleStale:false},snapshot:{machine:{state:{state:'idle'},groupTemperature:92,steamTemperature:154},scale:{weight:56}},trace:[{time:34,weight:56}],lastShot:{id:'shot-1'},stopWeight:56};
 let ui,beansOptions;const panels=[];
 const currentMachine=()=>s.snapshot.machine.state.state;
 const annotations=new Map();
 const client={async get(path){calls.push(['get',path]);return path==='/workflow'?copy(s.workflow):path==='/machine/info'?copy(s.machineInfo??null):copy(storage.get(path)??null);},
  async post(path,payload){calls.push(['post',path,copy(payload)]);storage.set(path,copy(payload));},
  async put(path,payload){calls.push(['put',path,copy(payload)]);annotations.set(path,copy(payload.annotations));},
  async shot(id){return {annotations:copy(annotations.get('/shots/'+id)??{})};},
  async saveWorkflow(request,expected){calls.push(['saveWorkflow',copy(request),copy(expected)]);return {...copy(expected),...copy(request)};},
  async command(action){calls.push(['command',action]);}};
 const api={state:s,client,explainError:errorExplainer(s),render:()=>ui?.render(),notice:(...args)=>notices.push(args),running:()=>['steam','hotwater','espresso','hotwater_rinse'].includes(currentMachine()),editable:()=>currentMachine()==='idle'&&!s.busy,canStart:()=>canStart,machineState:currentMachine,
  viewOf:w=>({name:w?.profile?.title,dose:w?.context?.targetDoseWeight,target:w?.context?.targetYield,temperature:w?.profile?.steps?.[0]?.temperature}),shotYield:()=>56,
  openDialog:id=>{s.modal=id;api.render();},closeDialog:()=>{ui.beforeClose(s.modal);s.modal=null;api.render();},
  setWorkflow:read=>{s.workflow=copy(read);s.draft=copy(read);},updateAux:read=>{s.workflow=copy(read);api.render();},
  openProfiles:()=>calls.push(['openProfiles']),command:action=>client.command(action)};
 const panel=kind=>{const handle={kind,closed:false,close(){handle.closed=true;},dismiss(){handle.closed=true;}};panels.push(handle);return handle;};
 const context=vm.createContext({stageLabel,beanSnapshot,mountSteamPitcher:()=>({render(){}}),document:d.document,structuredClone,guardDismissClick(){},location:{search:"?api=fixture"},sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},paintGauge(){},setGroupHeadHint(){},mountBeans:(_host,options)=>{beansOptions=options;return panel('beans');},mountProfileEditor:()=>panel('editor')});
 vm.runInContext(ceramicSource.replace(/^import .*;\n/gm,'').replace('export function mountCeramic','function mountCeramic'),context);ui=context.mountCeramic(api);
 return {...d,s,ui,api,client,calls,storage,notices,panels,setMachine(value){s.snapshot.machine.state.state=value;},get beansOptions(){return beansOptions;}};
}

function machineDispatch(f){
 const context=vm.createContext({runTelemetryMetadata:null,runTelemetryBean:null,telemetryFinishedMarker:null,runTelemetryShotId:null,cupEnvironmentMetadata:()=>({machineInfo:copy(f.s.machineInfo)}),machineIdentity:async info=>({machine_id:info?.serialNumber??null,identity_status:info?.serialNumber?'known':'unknown'}),beanSnapshot,cupReporter:null,s:f.s,$:f.get,isPreparation,isProfileSample,document:f.document,window:{ceramicUI:f.ui},client:f.client,clone:copy,
  num:value=>Number.isFinite(value)?value:null,machineState:f.api.machineState,render:f.api.render,scheduleRender:f.api.render,persistRunDraft(){},requestAnimationFrame(){},setTimeout(){},
  displayManager:{machineChanged(){}},commandConfirmed(){},sampleOf:()=>({time:0,weight:0}),loadFinishedShot(){},refreshHistory(){}});
 const start=appSource.indexOf('const activeStates = '),end=appSource.indexOf('const running = ',start);assert(start>=0&&end>start);
 vm.runInContext(appSource.slice(start,end)+'\n'+['openDialog','closeDialog','alignedScale','onSnapshot'].map(productionFunction).join('\n'),context);
 const dispatch=state=>context.onSnapshot({machine:{state:{state},timestamp:'2026-10-31T06:00:00.000Z'},shotState:{state:state==='espresso'?'pouring':'idle',shotId:'shot-new'},scale:{weight:0}});dispatch.snapshot=value=>context.onSnapshot(value);dispatch.context=context;return dispatch;
}

for(const language of ['zh','en'])test(`non-coffee machine operations never render as a brewing shot (${language})`,()=>{
 const f=fixture({language,mode:'finished'});
 f.api.running=()=>f.s.snapshot.machine.state.state!=='idle';
 const cases=[['cleaning','正在清洁','Cleaning','cleaning.jpg'],['descaling','正在除垢','Descaling','descaling.jpg'],['fwupgrade','固件更新中','Updating firmware','firmware_upgrade.jpg'],['hotwater','热水中','Dispensing hot water',null],['hotwater_rinse','冲洗中','Flushing',null]];
 for(const [state,cn,en,image] of cases){
  f.setMachine(state);f.s.snapshot.machine.profileFrame=0;f.get('phaseName').textContent='previous coffee stage';f.ui.render();
  assert.equal(f.document.body.dataset.ceramicScreen,'operation');
  assert.equal(f.get('stageTitle').textContent,language==='zh'?cn:en);
  assert.equal(f.get('connectionText').textContent,language==='zh'?cn:en);
  assert.equal(f.get('phaseName').textContent,'');
  assert.equal(f.get('ceramicStateArt').hidden,false);
  const art=f.get('ceramicStateArt').querySelector('img');assert.equal(art.hidden,!image);
  if(image)assert.equal(art.src,'assets/classic/'+image);
 }
 f.setMachine('espresso');f.ui.render();assert.equal(f.document.body.dataset.ceramicScreen,'brew');assert.equal(f.get('ceramicStateArt').hidden,true);
 f.setMachine('idle');f.ui.render();assert.equal(f.document.body.dataset.ceramicScreen,'taste');
 assert.equal(f.calls.some(c=>['command','saveWorkflow','post','put'].includes(c[0])),false);
});

test('ratio shows two useful decimals without rounding a 16 g / 60 g recipe to 1:3.8',()=>{
 const f=fixture();f.s.draft.context.targetYield=60;f.ui.render();
 assert.equal(f.get('ceramicAdjustRatio').textContent,'Ratio  1:3.75');
 assert.match(f.get('ceramicRecipeSummary').textContent,/1:3\.75$/);
});

for(const canStart of [false,true])test(`steam navigation and unsaved edits do not issue commands (screen start ${canStart})`,async()=>{
 const f=fixture({canStart});f.document.querySelector('[data-command="steam"]').onclick();
 assert.equal(f.s.modal,'ceramicSteamDialog');assert.equal(f.get('ceramicSteamTemperature').textContent,'155');
 f.steps[0].onclick();assert.equal(f.get('ceramicSteamTemperature').textContent,'156');assert.equal(f.get('ceramicSteamApply').disabled,false);
 f.api.closeDialog();f.document.querySelector('[data-command="steam"]').onclick();
 await flush();assert.equal(f.get('ceramicSteamTemperature').textContent,'155');
 assert.deepEqual(f.calls,[['get','/machine/settings'],['get','/machine/settings']]);
});

test('steam Apply writes only settings; running steam keeps an explicit Stop action',async()=>{
 const f=fixture();f.document.querySelector('[data-command="steam"]').onclick();f.steps[1].onclick();
 await f.get('ceramicSteamApply').onclick();
 assert.deepEqual(f.calls.map(call=>call[0]),['get','saveWorkflow']);assert.deepEqual(f.calls[0],['get','/machine/settings']);
 const request=f.calls[1][1];assert.deepEqual(Object.keys(request),['steamSettings']);assert.equal(request.steamSettings.flow,1.1);
 f.setMachine('steam');f.ui.render();
 assert.equal(f.s.modal,'ceramicSteamDialog');assert.equal(f.get('ceramicSteamStop').hidden,false);assert.equal(f.get('ceramicSteamApply').hidden,true);assert.equal(f.get('ceramicSteamStart').hidden,true);
 assert(f.steps.every(button=>button.disabled));await f.get('ceramicSteamStop').onclick();assert.deepEqual(f.calls.at(-1),['command','stop']);
});

test('English steam errors do not show untranslated driver messages',async()=>{
 const f=fixture();f.document.querySelector('[data-command="steam"]').onclick();f.steps[0].onclick();
 f.client.saveWorkflow=async()=>{throw Object.assign(new Error('机器正在运行，停止后才能更改'),{code:'apiMachineRunning'});};
 await f.get('ceramicSteamApply').onclick();
 const dialog=f.document.querySelector('.ceramic-message').children[0];
 assert.equal(dialog.children[0].textContent,'Action not completed');
 assert.doesNotMatch(dialog.children[1].textContent,/[\u3400-\u9fff]/u,'The English error body must be localized as well as its heading');
});

test('unknown Chinese steam errors get an English fallback, while Chinese mode retains the detail',async()=>{
 for(const language of ['en','zh']){
  const f=fixture({language});f.document.querySelector('[data-command="steam"]').onclick();f.steps[0].onclick();
  f.client.saveWorkflow=async()=>{throw new Error('未知的设备错误详情');};
  await f.get('ceramicSteamApply').onclick();
  const body=f.document.querySelector('.ceramic-message').children[0].children[1].textContent;
  if(language==='en'){assert(body.trim());assert.doesNotMatch(body,/[\u3400-\u9fff]/u);}else assert.equal(body,'未知的设备错误详情');
 }
});

test('changing the tasting bean during an in-flight save cannot silently mark an unsaved bean as saved',async()=>{
 const f=fixture({mode:'finished'});await flush();f.ui.render();f.likes[0].onclick();
 const gate=deferred(),originalPost=f.client.post;
 f.client.post=async(...args)=>{await originalPost(...args);await gate.promise;};
 const saving=f.get('ceramicSaveTaste').onclick();await flush();
 if(!f.get('ceramicBeans').disabled){f.get('ceramicBeans').onclick();await f.beansOptions.onSelect({id:'new-bean',name:'New bean'});}
 gate.resolve();assert.equal(await saving,true);
 const persisted=f.storage.get('/store/thiscup/tasting-shot-1');
 assert(f.get('ceramicBeanName').textContent===persisted.bean?.name||!f.get('ceramicSaveTaste').disabled,'UI bean differs from saved data, so Save must remain available');
});

test('a previous shot save completing late retains the new shot feedback and the next edit saves to its own shot',async()=>{
 const f=fixture({mode:'finished'});await flush();f.likes[0].onclick();
 const gate=deferred(),originalPost=f.client.post;f.client.post=async(...args)=>{await originalPost(...args);await gate.promise;};
 const saving=f.get('ceramicSaveTaste').onclick();await flush();
 f.storage.set('/store/thiscup/tasting-shot-2',{shotId:'shot-2',note:'Second cup saved note',like:'neutral',acid:null,sweet:null,bitter:null,flavors:[],bean:null});
 f.s.runId='shot-2';f.s.lastShot={id:'shot-2'};f.ui.render();await flush();
 const note=f.get('ceramicNote');
 assert.equal(note.value,'Second cup saved note');assert.equal(note.disabled,false); // The old cup's request must not lock the new cup.
 gate.resolve();await saving;assert.equal(note.value,'Second cup saved note');assert.equal(note.disabled,false);
 assert(f.calls.filter(call=>['post','put'].includes(call[0])).every(call=>call[1].endsWith('shot-1')));
 note.value='New cup notes';note.oninput({target:note});
 assert.equal(f.get('ceramicSaveTaste').disabled,false);
 await f.get('ceramicSaveTaste').onclick();
 assert.equal(f.storage.get('/store/thiscup/tasting-shot-2').note,'New cup notes');
 assert.equal(f.storage.get('/store/thiscup/tasting-shot-1').note,'');
});

test('Repeat this cup restores the shot recipe without starting or replacing unrelated auxiliary settings',async()=>{
 const f=fixture({mode:'finished'});await flush();
 f.s.workflow.profile.title='Current different profile';f.s.draft=copy(f.s.workflow);
 f.get('ceramicRepeat').onclick();await flush();
 assert.deepEqual(f.calls.filter(call=>call[0]!=='get').map(call=>call[0]),['saveWorkflow']);
 const write=f.calls.find(call=>call[0]==='saveWorkflow');
 assert.deepEqual(Object.keys(write[1]).sort(),['context','profile']);
 assert.equal(write[1].profile.title,'Recipe');assert.equal(f.s.workflow.profile.title,'Recipe');
 assert.equal(f.s.workflow.steamSettings.targetTemperature,155);assert.equal(f.s.mode,'ready');
});

function appFixture(names){
 const d=dom(),calls=[],timers=[];
 const s={modal:null,language:'en',workflow:{profile:{title:'Recipe'},hotWaterData:{targetTemperature:80,volume:100}},draft:{profile:{title:'Recipe'},hotWaterData:{targetTemperature:80,volume:100}},settings:{},connection:{scaleConnected:false},snapshot:{machine:{state:{state:'idle'}}},busy:false};
 const context=vm.createContext({cupReporter:null,document:d.document,$:d.get,s,window:{},clone:copy,t:key=>key,fmt:v=>String(v),num:v=>typeof v==='number'?v:null,explainError:error=>error.message,
  client:{async get(path){calls.push(['get',path]);return {};},async command(action){calls.push(['command',action]);}},
  running:()=>false,editable:()=>true,connected:()=>false,machineState:()=>s.snapshot.machine.state.state,canStartFromScreen:()=>false,
  render(){},renderHotWater(){},renderKeypad(){},requestAnimationFrame(){},setTimeout:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},clearTimeout:timer=>{if(timer)timer.cleared=true;},
  status:(...args)=>calls.push(['status',...args]),toast:(...args)=>calls.push(['toast',...args]),setGroupHeadHint(){},hotWaterUnit:()=> 'mL',hotWaterUsesWeight:()=>false,
  hotWaterDirty:()=>!!s.hotWaterDraft&&JSON.stringify(s.hotWaterDraft)!==JSON.stringify(s.workflow.hotWaterData),parameterSpec:()=>({min:0,max:2000})});
 vm.runInContext(names.map(productionFunction).join('\n'),context);
 return {...d,s,calls,timers,context};
}

test('hot-water entry and draft edits remain read-only, and closing discards the draft',async()=>{
 const f=appFixture(['openDialog','closeDialog','openHotWater','setHotWaterParam']);
 await f.context.openHotWater();f.context.setHotWaterParam('hotWaterData.volume',180);
 assert.equal(f.s.hotWaterDraft.volume,180);f.context.closeDialog();
 assert.equal(f.s.hotWaterDraft,null);assert.equal(f.s.workflow.hotWaterData.volume,100);assert.deepEqual(f.calls,[['get','/settings']]);
});

test('Stop bypasses pending configuration and stale/disconnected UI guards',async()=>{
 const f=appFixture(['sendCommand']);f.s.busy=true;f.s.awaiting={action:'steam'};
 await f.context.sendCommand('stop');assert.deepEqual(f.calls.filter(call=>call[0]==='command'),[['command','stop']]);
 await f.context.sendCommand('stop');assert.equal(f.calls.filter(call=>call[0]==='command').length,1,'Pending Stop must not duplicate commands');
});

test('firmware updates never receive a generic idle/stop command',async()=>{
 const f=appFixture(['sendCommand']);f.s.snapshot.machine.state.state='fwupgrade';
 await f.context.sendCommand('stop');
 assert.equal(f.calls.filter(call=>call[0]==='command').length,0);
 assert.equal(Boolean(f.s.stopPending),false);
 f.s.snapshot.machine.state.state='steam';await f.context.sendCommand('stop');
 assert.deepEqual(f.calls.filter(call=>call[0]==='command'),[['command','stop']]);
});

test('Stop remains pending until a connected idle snapshot, then clears its waiting message',async()=>{
 const f=appFixture(['sendCommand','commandConfirmed']);f.s.awaiting={action:'steam'};
 f.s.snapshot.machine.state.state='espresso';await f.context.sendCommand('stop');
 assert.equal(f.s.awaiting,null);assert.equal(f.s.stopAwaiting,true);
 assert.equal(f.calls.at(-1)[1],'acceptedStop');
 f.s.snapshot.machine.state.state='idle';f.context.commandConfirmed();
 assert.equal(f.s.stopAwaiting,true,'A stale idle value cannot confirm Stop');
 f.context.connected=()=>true;f.context.commandConfirmed();
 assert.equal(f.s.stopAwaiting,false);assert.equal(f.calls.at(-1)[1],'stopped');
});

test('display sliders remain a draft when settings closes without Save',()=>{
 const f=appFixture(['closeDialog']),preferences={activeBrightness:80,sleepBrightness:40,rotationMinutes:20};
 f.s.displaySettings={ready:true,preferences:copy(preferences)};f.s.displayDraft=copy(preferences);f.s.modal='settingsDialog';
 f.context.DEFAULT_DISPLAY_PREFERENCES=preferences;f.context.displayManager={save(){f.calls.push(['saveDisplay']);}};f.context.renderDisplaySettings=()=>{};
 const start=appSource.indexOf('for (const id of ["activeBrightness","sleepBrightness","rotationMinutes"])');
 const end=appSource.indexOf('$("galleryButton").onclick',start);assert(start>=0&&end>start);
 vm.runInContext(appSource.slice(start,end),f.context);
 f.get('sleepBrightness').value='55';f.get('sleepBrightness').oninput();f.context.closeDialog();
 assert.equal(f.s.displayDraft.sleepBrightness,55);assert.equal(f.s.displaySettings.preferences.sleepBrightness,40);assert.deepEqual(f.calls,[]);
});

test('sleep art rotates at the configured interval, restores on wake, and keeps a running grinder stop reachable',()=>{
 const f=appFixture(['renderDevicesAndAmbient','scheduleAmbientRotation']);
 f.context.store={get:(_key,fallback)=>fallback};f.context.renderScaleTimer=()=>{};
 f.context.client.grinder={cachedState:{connected:true,state:'idle',observation:'ready'}};
 let protection=0;f.context.window.thisCupGrinderPanel={closeProtection(){},openProtection(){protection++;}};
 f.s.ambientAssets={sleep:['classic/a.jpg','classic/b.jpg'],waterNeeded:'classic/water.jpg'};
 f.s.displaySettings={preferences:{rotationMinutes:20}};f.get('ambientScreen').hidden=true;
 f.s.snapshot.machine.state.state='sleeping';f.context.renderDevicesAndAmbient();
 const ambient=f.get('ambientScreen');assert.equal(ambient.hidden,false);assert.equal(f.get('ambientImage').src,'assets/classic/a.jpg');
 for(const selector of ['.ambient-shade','.ambient-top','.ambient-content'])assert.equal(ambient.querySelector(selector).hidden,true);
 assert.equal(f.timers.at(-1).delay,1200000);f.timers.at(-1).fn();assert.equal(f.get('ambientImage').src,'assets/classic/b.jpg');
 f.s.snapshot.machine.state.state='idle';f.context.renderDevicesAndAmbient();assert.equal(ambient.hidden,true);
 f.s.snapshot.machine.state.state='needswater';f.context.renderDevicesAndAmbient();assert.equal(ambient.hidden,false);assert.equal(f.get('ambientImage').src,'assets/classic/water.jpg');assert.equal(ambient.querySelector('.ambient-content').hidden,false);
 f.s.snapshot.machine.state.state='sleeping';f.context.client.grinder.cachedState.state='grinding';f.context.renderDevicesAndAmbient();assert.equal(ambient.hidden,true);assert.equal(protection,1);
 assert.deepEqual(f.calls,[]);
});

for(const state of ['espresso','hotwater','hotwater_rinse'])for(const modal of ['ceramicAdjustDialog','ceramicSteamDialog'])test(`physical ${state} start leaves ${modal} so Stop is reachable`,()=>{
 const f=fixture();f.s.modal=modal;machineDispatch(f)(state);
 if(state==='espresso')assert.equal(f.s.mode,'running');
 assert.equal(f.s.modal,null,'Full-screen editor must not cover live controls after a physical start');assert.deepEqual(f.calls,state==='espresso'?[['get','/machine/info']]:[]);
});

test('physical steam start retains its own page and Stop, while a keypad cannot jump back over a new operation',()=>{
 const f=fixture();f.document.querySelector('[data-command="steam"]').onclick();machineDispatch(f)('steam');
 assert.equal(f.s.modal,'ceramicSteamDialog');assert.equal(f.get('ceramicSteamStop').hidden,false);
 const g=fixture();g.s.modal='keypadDialog';g.s.keyReturn='ceramicAdjustDialog';g.s.customNumber=()=>assert.fail('Unconfirmed keypad must not apply');
 machineDispatch(g)('hotwater');assert.equal(g.s.modal,null);assert.equal(g.s.keyReturn,null);assert.equal(g.s.customNumber,null);assert.deepEqual(g.calls,[]);
});

test('a physical start restores unconfirmed tweak data and closes standalone bean/profile panels',async()=>{
 for(const kind of ['beans','editor']){
  const f=fixture({mode:'finished'});await flush();
  f.s.workflow.profile.title='Current recipe';f.s.draft=copy(f.s.workflow);const baseline=copy(f.s.draft);
  f.get('ceramicTweak').onclick();assert.equal(f.s.draft.profile.title,'Recipe');
  if(kind==='beans')f.get('ceramicBeans').onclick();else f.get('profileDetails').onclick();
  assert.equal(f.panels[0].closed,false);machineDispatch(f)('espresso');
  assert.deepEqual(f.s.draft,baseline);assert.equal(f.s.mode,'running');assert.equal(f.panels[0].closed,true);assert.equal(f.s.modal,null);
  assert(f.calls.every(call=>call[0]==='get'),'Navigation and physical-state observations must not issue writes or starts');
 }
});

test('a tasting Save-and-adjust continuation cannot reopen an editor over a physical extraction',async()=>{
 const f=fixture({mode:'finished'});await flush();f.likes[0].onclick();f.get('ceramicTweak').onclick();
 const confirmation=f.document.querySelector('.ceramic-message');assert(confirmation);
 const gate=deferred(),post=f.client.post;f.client.post=async(...args)=>{await post(...args);await gate.promise;};
 const confirming=confirmation.onclick({target:{dataset:{choice:'save'}}});await flush();
 machineDispatch(f)('espresso');gate.resolve();await confirming;await flush();
 assert.equal(f.s.mode,'running');assert.equal(f.s.modal,null,'A stale Save-and-adjust action must not reopen an editor over Stop');
});

test('busy bean operations can yield the screen, without a late error rebuilding their overlay',async()=>{
 const declarations=[...beansSource.matchAll(/^ (?:async )?function (\w+)\(/gm)];
 const source=names=>names.map(name=>{const i=declarations.findIndex(match=>match[1]===name);assert(i>=0,name);return beansSource.slice(declarations[i].index,declarations[i+1]?.index??beansSource.length);}).join('\n');
 const events=[],gate=deferred(),context=vm.createContext({clearInterval(){},scaleTimer:0,document:{removeEventListener(){}},escapeKey(){},busy:false,disposed:false,error:'',root:{remove(){events.push('remove');}},onClose(){events.push('close');},onError(){events.push('error');},errorText:e=>e.message,render(){events.push('render');}});
 vm.runInContext(source(['dismiss','close','report','task']),context);
 const pending=context.task(()=>gate.promise);context.close();assert.equal(context.disposed,false);
 context.dismiss();assert.equal(context.disposed,true);gate.reject(new Error('late device response'));await pending;
 assert.deepEqual(events,['render','remove','close']);
});

test('closing adjustment after an explicit remote reset does not revive the old draft (F43)',async()=>{
 const f=fixture();f.s.workflowRevision=1;f.get('ceramicAdjust').onclick();f.s.draft.context.targetDoseWeight=16.1;
 f.s.workflow.context.targetDoseWeight=18;f.s.draft=copy(f.s.workflow);f.s.workflowRevision=2;
 f.api.closeDialog();assert.equal(f.s.draft.context.targetDoseWeight,18);assert.equal(f.s.ceramicDraftActive,false);
});
test('tasting adjustment explicitly holds its draft even before a value changes (F23)',async()=>{
 const f=fixture({mode:'finished'});await flush();f.get('ceramicTweak').onclick();assert.equal(f.s.ceramicDraftActive,true);f.api.closeDialog();assert.equal(f.s.ceramicDraftActive,false);
});
test('tasting does not overwrite a remotely changed note when only acidity was edited (F39)',async()=>{
 const f=fixture({mode:'finished'});await flush();f.get('ceramicNote').oninput({target:{value:'Old note'}});await f.get('ceramicSaveTaste').onclick();
 await f.client.put('/shots/shot-1',{annotations:{espressoNotes:'New remote note',enjoyment:10}});
 f.get('ceramicAcid').oninput({target:{value:'4'}});assert.equal(await f.get('ceramicSaveTaste').onclick(),true);
 const shot=await f.client.shot('shot-1');assert.equal(shot.annotations.espressoNotes,'New remote note');assert.equal(shot.annotations.enjoyment,10);
});
test('tasting refuses same-field note conflicts before any writes (F39)',async()=>{
 const f=fixture({mode:'finished'});await flush();f.get('ceramicNote').oninput({target:{value:'Local note'}});
 await f.client.put('/shots/shot-1',{annotations:{espressoNotes:'Remote note'}});const count=f.calls.length;
 assert.equal(await f.get('ceramicSaveTaste').onclick(),false);assert.equal(f.calls.slice(count).filter(x=>['put','post'].includes(x[0])).length,0);
 assert.equal((await f.client.shot('shot-1')).annotations.espressoNotes,'Remote note');
});

test('brew refresh translates known stage names without changing the profile',()=>{const f=fixture({language:'en'});f.s.workflow.profile.steps[0].name='建立压力';f.setMachine('espresso');f.s.snapshot.machine.profileFrame=0;f.ui.render();assert.match(f.get('phaseName').textContent,/Build pressure/);assert.equal(f.s.workflow.profile.steps[0].name,'建立压力');});

test('热水中央随秤读数变化，冲洗中央计时、右侧显示液重',()=>{
 const f=fixture({language:'zh'});
 f.s.connection.scaleConnected=true;f.s.snapshot.scale.weight=37.5;
 for(const state of ['hotwater','hotwater_rinse','flush','rinse','hotwater']){
  f.setMachine(state);f.s.connection.scaleStale=false;f.ui.render();
  const water=state==='hotwater';
  assert.equal(f.get('ceramicWaterCenterUnit').textContent,water?'g':'s');
  assert.equal(f.get('ceramicWaterElapsed').textContent,water?'37.5':'0');
  assert.equal(f.get('ceramicWaterAmount').textContent,water?'100':'37.5');
  f.s.connection.scaleStale=true;f.ui.render();
  if(water)assert.equal(f.get('ceramicWaterElapsed').textContent,'—');
  else{
   assert(Number.isFinite(Number(f.get('ceramicWaterElapsed').textContent)));
   assert.equal(f.get('ceramicWaterAmount').textContent,'—');
  }
 }
 assert.deepEqual(f.calls,[]);
});


test('skin installation blocks new machine commands while Stop remains available',async()=>{
 const f=appFixture(['sendCommand']);f.s.skinUpdating=true;await f.context.sendCommand('espresso');
 assert.equal(f.calls.some(c=>c[0]==='command'),false);assert(f.calls.some(c=>c[0]==='toast'&&c[1]==='updateInstalling'));
 f.s.snapshot.machine.state.state='steam';await f.context.sendCommand('stop');assert.deepEqual(f.calls.filter(c=>c[0]==='command'),[['command','stop']]);
});

test('automatic skin installation context preserves drafts, dialogs, grinder work and tasting edits',()=>{
 const f=appFixture(['skinUpdateContext']);f.context.location={href:'http://localhost:25123/'};f.context.dirty=()=>false;f.context.hotWaterDirty=()=>false;f.context.window.ceramicUI={canAutoUpdate:()=>true};
 assert.equal(f.context.skinUpdateContext().canInstall,true);
 for(const key of ['skinUpdating','displayDirty','favoriteBusy','scaleBusy','scaleTimerBusy','workflowConflict','stopPending','stopAwaiting']){f.s[key]=true;assert.equal(f.context.skinUpdateContext().canInstall,false,key);f.s[key]=false;}
 f.s.inventorySync={status:'pending'};assert.equal(f.context.skinUpdateContext().canInstall,false);f.s.inventorySync=null;
 f.context.dirty=()=>true;assert.equal(f.context.skinUpdateContext().canInstall,false);f.context.dirty=()=>false;
 f.context.hotWaterDirty=()=>true;assert.equal(f.context.skinUpdateContext().canInstall,false);f.context.hotWaterDirty=()=>false;
 f.context.window.ceramicUI.canAutoUpdate=()=>false;assert.equal(f.context.skinUpdateContext().canInstall,false);f.context.window.ceramicUI.canAutoUpdate=()=>true;
 f.context.client.grinder={cachedState:{available:true,connected:true,state:'grinding',busy:true}};assert.equal(f.context.skinUpdateContext().canInstall,false);f.context.client.grinder.cachedState={available:false};
 f.context.document.querySelectorAll=()=>[{getClientRects:()=>[{}]}];f.context.getComputedStyle=()=>({visibility:'visible'});assert.equal(f.context.skinUpdateContext().canInstall,false);
});

test('a new shot ID refreezes telemetry machine and beans even when the idle frame was missed',async()=>{
 const f=fixture(),dispatch=machineDispatch(f),recorded=[];
 dispatch.context.cupReporter={remember:(id,options)=>{recorded.push({id,metadata:copy(options.metadata),bean:copy(options.bean)});return true},flush:async()=>{}};
 const frame=(state,id,phase,second)=>({machine:{state:{state},timestamp:'2026-10-31T06:00:'+String(second).padStart(2,'0')+'.000Z'},shotState:{state:phase,shotId:id},scale:{weight:0}});
 f.s.workflow.context.extras={thisCupBeanId:'bean-A'};f.s.ceramicBean={id:'bean-A',name:'Coffee A'};f.s.machineInfo={model:'DE1Pro',serialNumber:'machine-A'};
 dispatch.snapshot(frame('espresso','cup-A','pouring',0));await flush();assert.equal(dispatch.context.runTelemetryMetadata.machine.machine_id,'machine-A');assert.equal(dispatch.context.runTelemetryBean.name,'Coffee A');
 f.s.workflow.context.extras={thisCupBeanId:'bean-B'};f.s.ceramicBean={id:'bean-B',name:'Coffee B'};f.s.machineInfo={model:'DE1XL',serialNumber:'machine-B'};
 dispatch.snapshot(frame('espresso','cup-B','pouring',1));await flush();assert.equal(dispatch.context.runTelemetryMetadata.machine.machine_id,'machine-B');
 dispatch.snapshot(frame('idle','cup-B','stopping',2));await flush();assert.equal(recorded.length,0);
 dispatch.snapshot(frame('idle','cup-B','finished',3));await flush();assert.equal(recorded.length,1);assert.equal(recorded[0].id,'cup-B');assert.equal(recorded[0].metadata.machine.machine_id,'machine-B');assert.equal(recorded[0].bean.name,'Coffee B');
});

test('new cup identity reads machine info instead of reusing a stale cached serial',async()=>{
 const f=fixture(),dispatch=machineDispatch(f);f.s.machineInfo={model:'Old model',serialNumber:'old-machine'};
 f.client.get=async path=>path==='/machine/info'?{model:'New model',serialNumber:'new-machine',version:'1358'}:null;
 dispatch.snapshot({machine:{state:{state:'espresso'},timestamp:'2026-10-31T06:00:00.000Z'},shotState:{state:'pouring',shotId:'fresh-cup'},scale:{weight:0}});await flush();
 assert.equal(dispatch.context.runTelemetryMetadata.machine.machine_id,'new-machine');assert.equal(dispatch.context.runTelemetryMetadata.machineInfo.model,'New model');
});

for(const order of ['shot-first','machine-first','shot-reset-before-machine'])test(`cup completion persists independently of machine/UI finish ordering (${order})`,async()=>{
 const f=fixture(),dispatch=machineDispatch(f),recorded=[];
 dispatch.context.cupReporter={remember:(id,options)=>{recorded.push({id,metadata:copy(options.metadata)});return true},flush:async()=>{}};
 const machine=(state,second)=>({machine:{state:{state},timestamp:`2026-10-31T06:00:0${second}.000Z`}});
 dispatch.snapshot({...machine('espresso',0),shotState:{state:'pouring',shotId:'cup-A'}});await flush();
 if(order==='machine-first')dispatch.snapshot(machine('idle',1));
 dispatch.snapshot({shotState:{state:'finished',shotId:'cup-A'}});
 // The finished stream is authoritative even while the machine stream still
 // says espresso. It may reset to idle before that stream catches up.
 assert.equal(recorded.length,1);assert.equal(recorded[0].id,'cup-A');
 if(order==='shot-reset-before-machine')dispatch.snapshot({shotState:{state:'idle',shotId:null}});
 dispatch.snapshot(machine('idle',2));
 dispatch.snapshot({shotState:{state:'finished',shotId:'cup-A'}});
 assert.equal(recorded.length,1);
});

test('a preceding cup finish cannot be attached to a new run after runId is cleared',async()=>{
 const f=fixture(),dispatch=machineDispatch(f),recorded=[];
 dispatch.context.cupReporter={remember:id=>{recorded.push(id);return true},flush:async()=>{}};
 const machine=(state,second)=>({machine:{state:{state},timestamp:`2026-10-31T06:00:0${second}.000Z`}});
 dispatch.snapshot({...machine('espresso',0),shotState:{state:'pouring',shotId:'cup-A'}});
 dispatch.snapshot({shotState:{state:'finished',shotId:'cup-A'}});
 dispatch.snapshot(machine('idle',1));
 f.s.runId=null;
 dispatch.snapshot(machine('espresso',2));assert.equal(f.s.runId,null);
 dispatch.snapshot({shotState:{state:'finished',shotId:'cup-A'}});assert.deepEqual(recorded,['cup-A']);
 dispatch.snapshot({shotState:{state:'pouring',shotId:'cup-B'}});
 dispatch.snapshot({shotState:{state:'finished',shotId:'cup-A'}});assert.deepEqual(recorded,['cup-A']);
 dispatch.snapshot({shotState:{state:'finished',shotId:'cup-B'}});
 dispatch.snapshot(machine('idle',3));assert.deepEqual(recorded,['cup-A','cup-B']);
});

test('local cup persistence gates skin installation through busy while native network outbox does not',()=>{
 const f=appFixture(['skinUpdateContext']);f.context.location={href:'http://localhost:25123/'};f.context.dirty=()=>false;f.context.hotWaterDirty=()=>false;f.context.window.ceramicUI={canAutoUpdate:()=>true};
 f.context.cupReporter={hasPendingLocal:true};assert.equal(f.context.skinUpdateContext().busy,true);assert.equal(f.context.skinUpdateContext().canInstall,true);
 f.context.cupReporter={hasPendingLocal:false};assert.equal(f.context.skinUpdateContext().busy,false);assert.equal(f.context.skinUpdateContext().canInstall,true);
});
