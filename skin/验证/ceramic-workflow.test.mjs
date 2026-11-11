// Focused development checks. Runs the current UI functions in Node with DOM
// and API doubles; no browser, BLE, network or physical-device calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {DecaidClient} from '../client.js';
import {stageLabel} from '../stage-labels.js';

const ceramicSource=await readFile(new URL('../ceramic-ui.js',import.meta.url),'utf8');
const pitcherSource=await readFile(new URL('../steam-pitcher.js',import.meta.url),'utf8');
const appSource=await readFile(new URL('../app.js',import.meta.url),'utf8');
const copy=value=>structuredClone(value);
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

function domFixture(){
 const ids=new Map(),selectors=new Map();
 class Element{
  constructor(){this.children=[];this.dataset={};this.style={setProperty(name,value){this[name]=value;}};this.attributes={};this.textContent='';this.value='';this.hidden=false;this.className='';this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
  set id(value){this._id=value;ids.set(value,this);}
  get id(){return this._id;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
  before(){}after(){}focus(){}remove(){this.removed=true;}
  querySelector(selector){this.selectors??=new Map();if(!this.selectors.has(selector))this.selectors.set(selector,new Element());return this.selectors.get(selector);}
  querySelectorAll(selector){if(selector==='small')return this.small??=(Array.from({length:2},()=>new Element()));return [];}
 }
 const get=id=>{if(!ids.has(id)){const el=new Element();el.id=id;el.parentElement=new Element();ids.set(id,el);}return ids.get(id);};
 const likes=['like','neutral','dislike'].map(value=>{const el=new Element();el.dataset.ceramicLike=value;return el;});
 const clears=['acid','sweet','bitter'].map(value=>{const el=new Element();el.dataset.ceramicClear=value;selectors.set(`[data-ceramic-clear="${value}"]`,el);return el;});
 const document={body:new Element(),activeElement:new Element(),createElement:()=>new Element(),getElementById:get,
  querySelector(selector){if(selector==='.ceramic-tools')return null;if(selector==='.ceramic-message')return document.body.children.find(el=>el.className.includes('ceramic-message')&&!el.removed)||null;if(!selectors.has(selector))selectors.set(selector,new Element());return selectors.get(selector);},
  querySelectorAll(selector){if(selector==='[data-ceramic-like]')return likes;if(selector.includes('.ceramic-sensory input'))return [...likes,...clears];if(selector==='.overlay')return [...ids.values()].filter(el=>el.id.endsWith('Dialog'));return [];}};
 return {document,get,likes};
}

function ceramicFixture({language='zh',stored=null}={}){
 const dom=domFixture(),calls=[],notices=[],storage=new Map(),nativeShot={annotations:{espressoNotes:'',enjoyment:null}};
 if(stored)storage.set('/store/thiscup/tasting-shot-1',copy(stored));
 const workflow={id:'current-workflow',profile:{title:'Current profile',target_weight:40,steps:[{temperature:93}]},context:{targetDoseWeight:18,targetYield:40,coffeeName:'Current bean'},steamSettings:{duration:40}};
 const runWorkflow={profile:{title:'甜甜萃',target_weight:56,steps:[{temperature:92}]},context:{targetDoseWeight:16,targetYield:56,coffeeName:'Old shot bean'}};
 const state={language,mode:'finished',workflow:copy(workflow),draft:copy(workflow),runWorkflow:copy(runWorkflow),runId:'shot-1',modal:null,
  connection:{connected:true,stale:false,machineConnected:true,scaleStale:false,scaleConnected:true},snapshot:{machine:{groupTemperature:92},scale:{weight:56,weightFlow:1.5}},trace:[{time:34,weight:56}],lastShot:{id:'shot-1'},stopWeight:56};
 const client={
  async exclusive(fn){if(this.writeBusy)throw Error("write busy");this.writeBusy=true;try{return await fn()}finally{this.writeBusy=false}},
  async requireIdle(){if(api.machineState()!=="idle"||api.running())throw Error("not idle");return {state:{state:"idle"}}},
  async get(path){calls.push(['get',path]);return path==='/workflow'?copy(state.workflow):copy(storage.get(path)??null);},
  async post(path,payload){calls.push(['post',path,copy(payload)]);storage.set(path,copy(payload));},
  async put(path,payload){calls.push(['put',path,copy(payload)]);nativeShot.annotations={...nativeShot.annotations,...copy(payload.annotations)};},
  async shot(id){calls.push(['shot',id]);return copy(nativeShot);},
  async saveWorkflow(recipe,expected){calls.push(['saveWorkflow',copy(recipe),copy(expected)]);return {...copy(expected),...copy(recipe)};}
 };
 let ui,beansOptions,flavorOptions,flavorHandle;
 const api={state,client,running:()=>false,editable:()=>true,machineState:()=> 'idle',canStart:()=>false,
  render:()=>ui?.render(),notice:(...args)=>notices.push(args),shotYield:()=>56,
  viewOf:w=>({name:w?.profile?.title,dose:w?.context?.targetDoseWeight,target:w?.context?.targetYield,temperature:w?.profile?.steps?.[0]?.temperature}),
  setWorkflow:w=>{state.workflow=copy(w);state.draft=copy(w);},updateAux:w=>{state.workflow=copy(w);},
  openDialog:id=>{state.modal=id;api.render();},closeDialog:()=>{ui.beforeClose(state.modal);state.modal=null;api.render();},
  openProfiles:()=>calls.push(['openProfiles']),command:action=>calls.push(['command',action])};
 const context=vm.createContext({openFlavorWheel:options=>{flavorOptions=options;flavorHandle={closed:false,close(){flavorHandle.closed=true;options.onClose()}};return flavorHandle;},stageLabel,document:dom.document,structuredClone,guardDismissClick(){},location:{search:"?api=fixture"},sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},paintGauge(){},setGroupHeadHint(){},mountBeans:(_host,options)=>{beansOptions=options;},mountProfileEditor(){}});
 vm.runInContext(pitcherSource.replace(/export function /g,'function '),context);
 vm.runInContext(ceramicSource.replace(/^import .*;\n/gm,'').replace('export function mountCeramic','function mountCeramic'),context);
 ui=context.mountCeramic(api);
 return {...dom,state,api,ui,calls,notices,storage,nativeShot,get beansOptions(){return beansOptions;},get flavorOptions(){return flavorOptions;},get flavorHandle(){return flavorHandle;}};
}

test('tweak a finished shot is draft-only, and Cancel restores the old draft and screen',async()=>{
 const f=ceramicFixture();await flush();const before=copy({draft:f.state.draft,workflow:f.state.workflow,mode:f.state.mode});
 f.get('ceramicTweak').onclick();await flush();
 assert.equal(f.state.modal,'ceramicAdjustDialog');assert.equal(f.state.mode,'ready');assert.equal(f.state.draft.profile.title,'甜甜萃');
 assert.equal(f.calls.some(call=>call[0]==='saveWorkflow'||call[0]==='command'||call[1]==='/workflow'),false);
 f.state.draft.context.targetYield=60;f.state.draft.profile.steps[0].temperature=91;
 f.api.closeDialog();
 assert.deepEqual(f.state.draft,before.draft);assert.deepEqual(f.state.workflow,before.workflow);assert.equal(f.state.mode,before.mode);
 assert.equal(f.calls.some(call=>['saveWorkflow','post','put','command'].includes(call[0])),false);
});

test('a confirmed tweak is not reverted by the dialog close hook',async()=>{
 const f=ceramicFixture();await flush();f.get('ceramicTweak').onclick();await flush();
 f.state.draft.context.targetYield=60;const confirmed=copy(f.state.draft);
 // setWorkflow is the already-confirmed application callback; this check is
 // only for the ceramic page's commit-versus-cancel close behavior.
 f.api.setWorkflow(confirmed);f.ui.draftApplied();
 assert.equal(f.state.modal,null);assert.equal(f.state.mode,'ready');assert.deepEqual(f.state.draft,confirmed);
});

for(const language of ['zh','en'])test(`unlink tasting bean stays unlinked on render and reload (${language})`,async()=>{
 const f=ceramicFixture({language});await flush();f.ui.render();assert.equal(f.get('ceramicBeanName').textContent,'Old shot bean');
 f.get('ceramicBeans').onclick();await f.beansOptions.onSelect(null);
 const emptyLabel=language==='zh'?'关联咖啡豆 ＋':'Add coffee ＋';
 assert.equal(f.get('ceramicBeanName').textContent,emptyLabel);assert(f.get('ceramicBeans').classes.has('unlinked'));
 assert.equal(await f.get('ceramicSaveTaste').onclick(),true);
 const stored=f.storage.get('/store/thiscup/tasting-shot-1');assert.equal(stored.bean,null);
 assert.equal(f.calls.some(call=>call[0]==='saveWorkflow'),false);
 const reopened=ceramicFixture({language,stored});await flush();reopened.ui.render();
 assert.equal(reopened.get('ceramicBeanName').textContent,emptyLabel);
});

test('tasting choices store native 10/5/0 and clearing a choice writes explicit null',async()=>{
 const f=ceramicFixture({language:'en'});await flush();
 assert.deepEqual(f.likes.map(button=>button.textContent),['Loved it','Okay','Not for me']);
 for(const [index,value] of [[0,10],[1,5],[2,0]]){
  f.likes[index].onclick();assert.equal(await f.get('ceramicSaveTaste').onclick(),true);
  assert.equal(f.nativeShot.annotations.enjoyment,value);assert.equal(f.get('ceramicSaveTaste').disabled,true);
 }
 f.likes[2].onclick();assert.equal(await f.get('ceramicSaveTaste').onclick(),true);
 const write=f.calls.filter(call=>call[0]==='put').at(-1)[2];
 assert(Object.hasOwn(write.annotations,'enjoyment'));assert.equal(write.annotations.enjoyment,null);
 assert.equal(f.nativeShot.annotations.enjoyment,null);assert.equal(f.storage.get('/store/thiscup/tasting-shot-1').like,null);
});

test('tasting save does not claim success if native history keeps an old score',async()=>{
 const f=ceramicFixture();await flush();f.nativeShot.annotations.enjoyment=7;
 f.api.client.put=async(path,payload)=>{f.calls.push(['put',path,copy(payload)]);};
 f.likes[0].onclick();assert.equal(await f.get('ceramicSaveTaste').onclick(),false);
 assert.equal(f.notices.some(([message])=>message==='评价已保存'),false);assert.equal(f.get('ceramicSaveTaste').disabled,false);
});

test('Change profile opens the picker without applying a workflow or starting the machine',async()=>{
 const f=ceramicFixture();await flush();f.get('ceramicChangeProfile').onclick();
 assert.deepEqual(f.calls.filter(call=>!['get','shot'].includes(call[0])),[['openProfiles']]);
});

// Extract complete top-level declarations, retaining the production bodies.
function appFunction(name){
 const declarations=[...appSource.matchAll(/^(?:async )?function (\w+)\(/gm)],at=declarations.findIndex(match=>match[1]===name);
 assert(at>=0,`Missing production function ${name}`);
 return appSource.slice(declarations[at].index,declarations[at+1]?.index??appSource.length);
}
function scaleFixture(){
 const dom=domFixture(),calls=[],errors=[],reads=[],writes=[],timers=[],renders=[];
 const state={modal:null,language:'en',scalePanelSequence:0,scaleBusy:false,devices:[{id:'baseline',type:'scale',state:'connected'}],settings:{baseline:true}};
 const client=Object.assign(new DecaidClient('http://fixture.invalid',{fetch:()=>{throw Error('Unexpected network request')}}),{get(path){const task=deferred();calls.push(['get',path]);reads.push({path,...task});return task.promise;},put(path,payload){const task=deferred();calls.push(['put',path,copy(payload)]);writes.push({path,...task});return task.promise;}});
 client.scanDevices=async()=>{client.setDevices(['scale-a','old-scale'].map(disconnectedScale));return client.snapshot.devices;};
 client.requireIdle=async()=>({state:{state:'idle'}});
 const context=vm.createContext({document:dom.document,$:dom.get,s:state,client,window:{ceramicUI:{error:(...args)=>errors.push(args)}},
  render(){renders.push(['app',state.modal]);},renderScalePanel(){renders.push(['scale',state.modal]);},running:()=>false,toast:()=>{},t:key=>key,explainError:error=>error.message,
  requestAnimationFrame(){},setTimeout(fn,delay){timers.push({fn,delay});return timers.length;}});
 vm.runInContext(['openDialog','closeDialog','openScales','connectScale'].map(appFunction).join('\n'),context);
 return {...dom,state,client,context,calls,errors,reads,writes,timers,renders};
}
const connectedScale=id=>({id,type:'scale',state:'connected'});
const disconnectedScale=id=>({id,type:'scale',state:'disconnected',available:true});
function resolveOpen(f,index,devices,settings={}){f.reads[index].resolve(devices);f.reads[index+1].resolve(settings);}

test('closing the scale panel before its initial reads finish prevents auto-connect and stale updates',async()=>{
 const f=scaleFixture(),before=copy({devices:f.state.devices,settings:f.state.settings});
 const pending=f.context.openScales();assert.equal(f.reads.length,2);f.context.closeDialog();
 resolveOpen(f,0,[disconnectedScale('old-scale')],{old:true});await pending;
 assert.equal(f.state.modal,null);assert.deepEqual({devices:f.state.devices,settings:f.state.settings},before);
 assert.equal(f.writes.length,0);assert.equal(f.errors.length,0);
});

test('reopening the scale panel ignores the previous session when reads finish out of order',async()=>{
 const f=scaleFixture(),first=f.context.openScales();f.context.closeDialog();const second=f.context.openScales();
 resolveOpen(f,2,[connectedScale('new-scale')],{new:true});await second;
 resolveOpen(f,0,[disconnectedScale('old-scale')],{old:true});await first;
 assert.equal(f.state.modal,'scaleDialog');assert.deepEqual(f.state.devices,[connectedScale('new-scale')]);assert.deepEqual(f.state.settings,{new:true});assert.equal(f.writes.length,0);
});

test('changing the client invalidates pending scale reads',async()=>{
 const f=scaleFixture(),before=copy(f.state.devices),pending=f.context.openScales();
 f.context.client={get:()=>{throw Error('Replacement client must not be called');}};
 resolveOpen(f,0,[disconnectedScale('old-scale')]);await pending;
 assert.deepEqual(f.state.devices,before);assert.equal(f.writes.length,0);assert.equal(f.errors.length,0);
});

test('an initial scale-read failure after closing does not reopen an error prompt',async()=>{
 const f=scaleFixture(),pending=f.context.openScales();f.context.closeDialog();
 f.reads[0].reject(Error('late failure'));f.reads[1].resolve({});await pending;
 assert.equal(f.errors.length,0);assert.equal(f.get('scalePanelMessage').textContent,'');
});

test('连接前实时列表已移除目标或标记不可用时保留原首选',async()=>{
 for(const latest of [[],[{...disconnectedScale('scale-a'),available:false}]]){
  const f=scaleFixture();
  f.client.requireIdle=async()=>{f.client.setDevices(latest);return {state:{state:'idle'}}};
  f.context.openDialog('scaleDialog');
  await f.context.connectScale('scale-a',false);
  assert.equal(f.writes.length,0);
  assert.match(f.get('scalePanelMessage').textContent,/Scale not found/);
 }
});
test('closing while a scale connect command is pending suppresses follow-up reads and prompts',async()=>{
 const f=scaleFixture();f.context.openDialog('scaleDialog');const pending=f.context.connectScale('scale-a',false);await flush();
 assert.equal(f.writes.length,1);f.context.closeDialog();f.writes[0].resolve({});await pending;
 assert.equal(f.reads.length,0);assert.equal(f.errors.length,0);assert.equal(f.state.scaleBusy,false);
 assert.deepEqual(f.state.devices,[connectedScale('baseline')]);
});

test('a scale connect read finishing after a reopen cannot overwrite the new session',async()=>{
 const f=scaleFixture();f.context.openDialog('scaleDialog');const connecting=f.context.connectScale('old-scale',false);await flush();
 f.writes[0].resolve({});await flush();assert.equal(f.reads.length,1);
 f.context.closeDialog();const reopened=f.context.openScales();
 resolveOpen(f,1,[connectedScale('new-scale')],{new:true});await reopened;
 f.reads[0].resolve([connectedScale('old-scale')]);await connecting;
 assert.deepEqual(f.state.devices,[connectedScale('new-scale')]);assert.deepEqual(f.state.settings,{new:true});assert.equal(f.errors.length,0);
});

test('closing during the scale connection wait cancels further polling',async()=>{
 const f=scaleFixture();f.context.openDialog('scaleDialog');const pending=f.context.connectScale('scale-a',false);await flush();
 f.writes[0].resolve({});await flush();f.reads[0].resolve([disconnectedScale('scale-a')]);await flush();
 const wait=f.timers.find(timer=>timer.delay===500);assert(wait);f.context.closeDialog();wait.fn();await pending;
 assert.equal(f.reads.length,1);assert.equal(f.errors.length,0);assert.equal(f.state.scaleBusy,false);
});

test('打开面板时只有另一台秤，或首选秤已被主动断开，均不自动连接',async()=>{
 for(const id of ['original','bookoo']){
  const f=scaleFixture();
  if(id==='original')f.client.manuallyDisconnectedScale=id;
  const opening=f.context.openScales();
  resolveOpen(f,0,[disconnectedScale(id)],{preferredScaleId:'original'});
  await opening;assert.equal(f.writes.length,0);
 }
});
test('an active scale panel still auto-connects its only scale and confirms the result',async()=>{
 const f=scaleFixture(),pending=f.context.openScales();resolveOpen(f,0,[disconnectedScale('scale-a')]);await flush();
 assert.deepEqual(f.calls.filter(call=>call[0]==='put'),[['put','/devices/connect',{deviceId:'scale-a'}]]);
 f.writes[0].resolve({});await flush();f.reads[2].resolve([connectedScale('scale-a')]);await pending;
 assert.equal(f.get('scalePanelMessage').textContent,'connected');assert.equal(f.state.scaleBusy,false);assert.equal(f.errors.length,0);
});

test('steam two-press setting reads native state and saves only its own key',async()=>{
 const f=ceramicFixture();f.storage.set('/machine/settings',{steamPurgeMode:0,steamFlow:.8});
 f.get('ceramicTasteSteam').onclick();await flush();
 const control=f.get('ceramicSteamPurge');assert.equal(control.checked,false);assert.equal(control.disabled,false);
 control.checked=true;await control.onchange();
 assert.equal(control.checked,true);assert.equal(control.disabled,false);
 assert.deepEqual(f.calls.filter(c=>c[0]==='post'),[['post','/machine/settings',{steamPurgeMode:1}]]);
 assert.equal(f.calls.some(c=>c[0]==='command'),false);
});
test('steam switch locks while running and when readback is unknown',async()=>{
 const f=ceramicFixture();f.storage.set('/machine/settings',{steamPurgeMode:0});
 f.get('ceramicTasteSteam').onclick();await flush();
 f.api.running=()=>true;f.ui.render();assert.equal(f.get('ceramicSteamPurge').disabled,true);
 f.api.running=()=>false;f.api.client.post=async()=>{throw Error('timeout')};
 f.get('ceramicSteamPurge').checked=true;await f.get('ceramicSteamPurge').onchange();
 assert.equal(f.get('ceramicSteamPurge').disabled,true);
});

test('steam switch rejects disconnected and unknown state even after successful load',async()=>{
 const f=ceramicFixture();f.storage.set('/machine/settings',{steamPurgeMode:0});
 f.get('ceramicTasteSteam').onclick();await flush();
 f.state.connection.stale=true;f.state.connection.machineConnected=false;f.api.machineState=()=> 'unknown';f.ui.render();
 const x=f.get('ceramicSteamPurge');assert.equal(x.disabled,true);x.checked=true;await x.onchange();
 assert.equal(f.calls.some(c=>c[0]==='post'),false);
});
test('steam save readback stays on originating client and never reports success on new host',async()=>{
 const f=ceramicFixture(),pending=deferred(),calls=[];
 const A={get:async p=>{if(p==='/machine/settings')calls.push('A-get');return {steamPurgeMode:0}},post:async()=>{calls.push('A-post');await pending.promise}},B={get:async()=>{calls.push('B-get');return {steamPurgeMode:1}}};
 Object.assign(A,{exclusive:f.api.client.exclusive,requireIdle:f.api.client.requireIdle});f.api.client=A;f.get('ceramicTasteSteam').onclick();await flush();
 const x=f.get('ceramicSteamPurge');x.checked=true;const saving=x.onchange();await flush();f.api.client=B;pending.resolve();await saving;
 await flush();assert.equal(calls[calls.indexOf('A-post')+1],'A-get');assert.equal(x.checked,true);assert.equal(x.disabled,false);
 assert.equal(f.notices.some(([m])=>/已保存|saved/.test(m)),false);
});

test('steam switch reloads after disconnect and reconnect',async()=>{
 const f=ceramicFixture();f.storage.set('/machine/settings',{steamPurgeMode:0});
 f.get('ceramicTasteSteam').onclick();await flush();
 f.state.connection.stale=true;f.ui.render();assert.equal(f.get('ceramicSteamPurge').disabled,true);
 f.storage.set('/machine/settings',{steamPurgeMode:1});f.state.connection.stale=false;f.ui.render();await flush();
 assert.equal(f.get('ceramicSteamPurge').checked,true);assert.equal(f.get('ceramicSteamPurge').disabled,false);
});
test('old host failure does not report error on new host, which is loaded automatically',async()=>{
 const f=ceramicFixture(),pending=deferred();
 const A={get:async()=>({steamPurgeMode:0}),post:async()=>pending.promise},B={get:async()=>({steamPurgeMode:1})};
 Object.assign(A,{exclusive:f.api.client.exclusive,requireIdle:f.api.client.requireIdle});f.api.client=A;f.get('ceramicTasteSteam').onclick();await flush();f.get('ceramicSteamPurge').checked=true;
 const save=f.get('ceramicSteamPurge').onchange();await flush();f.api.client=B;f.get('ceramicTasteSteam').onclick();pending.reject(Error('old host failure'));await save;await flush();
 assert.equal(f.get('ceramicSteamPurge').checked,true);assert.equal(f.get('ceramicSteamPurge').disabled,false);
 assert.equal(f.notices.some(([m])=>String(m).includes('old host')),false);
});

 test('steam reconnect during a pending save refreshes the same host after completion',async()=>{
 const f=ceramicFixture(),pending=deferred();let value=0;
 f.api.client={...f.api.client,get:async()=>({steamPurgeMode:value}),post:async()=>pending.promise};
 f.get('ceramicTasteSteam').onclick();await flush();const x=f.get('ceramicSteamPurge');x.checked=true;
 const save=x.onchange();await flush();f.state.connection.stale=true;f.ui.render();
 f.state.connection.stale=false;f.ui.render();value=1;pending.resolve();await save;await flush();
 assert.equal(x.disabled,false);assert.equal(x.checked,true);
 assert.equal(f.notices.some(([m])=>/已保存|saved/.test(m)),false);
});

test('steam switch locks immediately on socket disconnect before snapshot expires',async()=>{
 const f=ceramicFixture();f.storage.set('/machine/settings',{steamPurgeMode:0});
 f.get('ceramicTasteSteam').onclick();await flush();f.state.connection.connected=false;f.ui.render();
 const x=f.get('ceramicSteamPurge');assert.equal(x.disabled,true);x.checked=true;await x.onchange();
 assert.equal(f.calls.some(c=>c[0]==='post'),false);
});

test('steam open deduplicates reads and does not read while disconnected or steaming',async()=>{
 const f=ceramicFixture();f.storage.set('/machine/settings',{steamPurgeMode:0});f.get('ceramicTasteSteam').onclick();await flush();
 assert.equal(f.calls.filter(c=>c[1]==='/machine/settings').length,1);
 for(const state of ['disconnected','steam']){f.api.closeDialog();f.calls.length=0;f.state.connection.connected=state!=='disconnected';f.api.machineState=()=>state==='steam'?'steam':'idle';f.get('ceramicTasteSteam').onclick();await flush();assert.equal(f.calls.filter(c=>c[1]==='/machine/settings').length,0)}
});
test('steam pending selection stays visible; failure is unknown and retry is read only',async()=>{
 const f=ceramicFixture(),pending=deferred();f.storage.set('/machine/settings',{steamPurgeMode:0});f.get('ceramicTasteSteam').onclick();await flush();
 f.api.client.post=()=>pending.promise;const x=f.get('ceramicSteamPurge');x.checked=true;const save=x.onchange();await flush();
 assert.equal(x.checked,true);assert.equal(x.disabled,true);pending.reject(Error('timeout'));await save;
 assert.equal(x.indeterminate,true);assert.equal(f.get('ceramicSteamPurgeRetry').hidden,false);
 f.storage.set('/machine/settings',{steamPurgeMode:1});await f.get('ceramicSteamPurgeRetry').onclick();assert.equal(x.checked,true);assert.equal(x.disabled,false);
 assert.equal(f.notices.some(([m])=>/已保存|saved/.test(m)),false);
});
test('steam null response produces controlled error and can recover',async()=>{
 const f=ceramicFixture();f.get('ceramicTasteSteam').onclick();await flush();
 assert.equal(f.get('ceramicSteamPurge').indeterminate,true);assert.equal(f.notices.some(([m])=>/Cannot read|TypeError/.test(m)),false);
 f.storage.set('/machine/settings',{steamPurgeMode:0});await f.get('ceramicSteamPurgeRetry').onclick();assert.equal(f.get('ceramicSteamPurge').disabled,false);
});
test('steam save respects shared lock and fresh native idle check',async()=>{
 for(const mode of ['busy','running','switch']){
 const f=ceramicFixture();f.storage.set('/machine/settings',{steamPurgeMode:0});f.get('ceramicTasteSteam').onclick();await flush();
 if(mode==='busy')f.api.client.writeBusy=true;
 if(mode==='running')f.api.client.requireIdle=async()=>{throw Error('machine running')};
 if(mode==='switch')f.api.client.requireIdle=async()=>{f.state.connection.connected=false};
 f.get('ceramicSteamPurge').checked=true;await f.get('ceramicSteamPurge').onchange();assert.equal(f.calls.some(c=>c[0]==='post'),false);
 }
});
test('steam readback mismatch never claims saved',async()=>{
 const f=ceramicFixture();f.storage.set('/machine/settings',{steamPurgeMode:0});f.get('ceramicTasteSteam').onclick();await flush();f.api.client.post=async()=>{};
 f.get('ceramicSteamPurge').checked=true;await f.get('ceramicSteamPurge').onchange();assert.equal(f.get('ceramicSteamPurge').indeterminate,true);assert.equal(f.notices.some(([m])=>/已保存|saved/.test(m)),false);
});

test('steam reopen ignores stale read from previous dialog session',async()=>{
 const f=ceramicFixture(),old=deferred();let count=0;
 f.api.client.get=async()=>++count===1?old.promise:{steamPurgeMode:1};f.get('ceramicTasteSteam').onclick();await flush();f.api.closeDialog();f.get('ceramicTasteSteam').onclick();await flush();old.resolve({steamPurgeMode:0});await flush();
 assert.equal(f.get('ceramicSteamPurge').checked,true);assert.equal(f.get('ceramicSteamPurge').disabled,false);
});

 test('steam setting rejects native inactive states other than idle',async()=>{
 for(const mode of ['sleeping','heating','preheating','needswater','schedidle']){const f=ceramicFixture();f.storage.set('/machine/settings',{steamPurgeMode:0});f.get('ceramicTasteSteam').onclick();await flush();f.api.client.requireIdle=async()=>({state:{state:mode}});f.get('ceramicSteamPurge').checked=true;await f.get('ceramicSteamPurge').onchange();assert.equal(f.calls.some(c=>c[0]==='post'),false)}
});


test('flavor wheel confirms only into the current tasting draft; explicit save preserves other feedback',async()=>{
 const f=ceramicFixture({stored:{shotId:'shot-1',flavors:['Stone fruit','Chocolate'],acid:4,sweet:2,bitter:1,note:'',like:null}});await flush();
 f.get('ceramicFlavors').onclick();assert.deepEqual([...f.flavorOptions.values],['Stone fruit','Chocolate']);
 f.flavorOptions.onConfirm(['Stone fruit','sca:fruit:0:0','sca:other:0:4']);
 assert.equal(f.calls.some(c=>['post','put','command'].includes(c[0])),false);
 await f.get('ceramicSaveTaste').onclick();await flush();
 const saved=f.storage.get('/store/thiscup/tasting-shot-1');assert.deepEqual([...saved.flavors],['Stone fruit','sca:fruit:0:0','sca:other:0:4']);assert.equal(saved.acid,4);assert.equal(saved.sweet,2);assert.equal(saved.bitter,1);
 assert.equal(f.calls.some(c=>c[0]==='command'||c[0]==='saveWorkflow'),false);
});

test('cancel and stale flavor confirmation cannot change another shot or an active operation',async()=>{
 const f=ceramicFixture();await flush();f.get('ceramicFlavors').onclick();const first=f.flavorOptions;
 f.flavorHandle.close();assert.equal(f.get('ceramicSaveTaste').disabled,true);
 f.get('ceramicFlavors').onclick();const stale=f.flavorOptions;f.state.runId='shot-2';f.state.lastShot={id:'shot-2'};f.ui.render();await flush();
 stale.onConfirm(['sca:fruit:0:0']);f.get('ceramicFlavors').onclick();assert.deepEqual([...f.flavorOptions.values],[]);
 const operation=f.flavorOptions;f.ui.operationStarted();assert.equal(f.flavorHandle.closed,true);operation.onConfirm(['sca:fruit:0:0']);
 assert.equal(f.calls.some(c=>['post','put','command'].includes(c[0])),false);assert.equal(f.get('ceramicSaveTaste').disabled,true);
});


test('flavor picker waits for the current shot feedback load so old flavors cannot be overwritten by a stale empty seed',async()=>{
 const f=ceramicFixture();await flush();const pending=deferred();f.api.client.get=async()=>pending.promise;
 f.state.runId='shot-2';f.state.lastShot={id:'shot-2'};f.ui.render();
 assert.equal(f.get('ceramicFlavors').disabled,true);f.get('ceramicFlavors').onclick();assert.equal(f.flavorOptions,undefined);
 pending.resolve({shotId:'shot-2',flavors:['Stone fruit','Chocolate']});await flush();
 assert.equal(f.get('ceramicFlavors').disabled,false);f.get('ceramicFlavors').onclick();assert.deepEqual([...f.flavorOptions.values],['Stone fruit','Chocolate']);
 assert.equal(f.calls.some(c=>['post','put','command'].includes(c[0])),false);
});
