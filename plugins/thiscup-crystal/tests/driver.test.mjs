import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const SERVICE='7fa2d10c-12f3-4b9e-9d77-1a9b65432100';
const KEYS={motorRpm:'01',feedRpm:'02',bootSign:'03',sysState:'04',servoAngle:'05',targetAngle:'06'};
const UUID=Object.fromEntries(Object.entries(KEYS).map(([key,suffix])=>[key,SERVICE.slice(0,-2)+suffix]));
const fieldFor=uuid=>Object.keys(UUID).find(key=>UUID[key]===String(uuid).toLowerCase());
const encode=n=>Buffer.from([n>>8,n&255]).toString('base64');
const WORKFLOW={id:'workflow:A',profile:{title:'Curve A',steps:[{temperature:92}]}};
const CONFIG={grindSize:220,motorRpm:1100,feedRpm:50,bootMode:'smart'};

class FakeClock{
  now=0;next=1;timers=new Map();cancelled=new Set();
  setTimeout=(fn,ms=0,...args)=>{const id=this.next++;this.timers.set(id,{at:this.now+Math.max(0,Number(ms)||0),fn:()=>fn(...args)});return id;};
  clearTimeout=id=>{this.cancelled.add(id);this.timers.delete(id);};
  setInterval=(fn,ms=0)=>{const id=this.next++;const repeat=()=>{fn();if(!this.cancelled.has(id))this.timers.set(id,{at:this.now+Math.max(1,Number(ms)||0),fn:repeat});};this.timers.set(id,{at:this.now+Math.max(1,Number(ms)||0),fn:repeat});return id;};
  clearInterval=this.clearTimeout;
  async flush(){for(let i=0;i<40;i++)await Promise.resolve();}
  async tick(ms){const target=this.now+ms;await this.flush();for(let n=0;n<100000;n++){const due=[...this.timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){this.now=target;await this.flush();return;}this.now=due[1].at;this.timers.delete(due[0]);due[1].fn();await this.flush();}throw new Error('Fake timer loop exceeded bound');}
  async until(predicate,timeout=65000){const until=this.now+timeout;while(this.now<=until){await this.flush();if(await predicate())return;await this.tick(25);}throw new Error('Condition did not settle before fake deadline');}
  async settle(promise,timeout=65000){let done=false,value,error;Promise.resolve(promise).then(x=>{done=true;value=x},e=>{done=true;error=e});await this.until(()=>done,timeout);if(error)throw error;return value;}
  Date(){const clock=this;return class extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}};}
}

class MockGatt{
  constructor(clock,{move=true,latency=2}={}){this.clock=clock;this.move=move;this.latency=latency;this.values={motorRpm:0,feedRpm:0,bootSign:0,sysState:0,servoAngle:0,targetAngle:0};this.raw={};this.subscribers={};this.calls=[];this.writes=[];this.snapshots=[];this.inflight=0;this.maxInflight=0;this.disconnected=false;this.onDrop=null;}
  notify(key,value){this.values[key]=value;for(const fn of this.subscribers[key]||[])fn(encode(value));}
  async io(kind,key,fn){this.inflight++;this.maxInflight=Math.max(this.maxInflight,this.inflight);this.calls.push({kind,key,at:this.clock.now});try{await new Promise(r=>this.clock.setTimeout(r,this.latency));if(this.disconnected)throw new Error('Link disconnected');return fn();}finally{this.inflight--;}}
  read=(service,uuid)=>{assert.equal(service,SERVICE);const key=fieldFor(uuid);assert(key,`Unexpected read ${uuid}`);return this.io('read',key,()=>this.raw[key]??encode(this.values[key]));};
  writeWithResponse=(service,uuid,data)=>{assert.equal(service,SERVICE);const key=fieldFor(uuid);assert(['motorRpm','feedRpm','bootSign','targetAngle'].includes(key),`Unexpected write ${uuid}`);const bytes=Buffer.from(data,'base64');assert.equal(bytes.length,2,'Writes must have exactly 2 bytes');const value=bytes.readUInt16BE();return this.io('write',key,()=>{this.writes.push({key,value,at:this.clock.now});this.notify(key,value);if(key==='bootSign'&&value===5&&this.move){this.notify('sysState',1);this.clock.setTimeout(()=>{this.notify('servoAngle',this.values.targetAngle);this.notify('sysState',0);},250);}if(key==='bootSign'&&[1,2,3].includes(value))this.notify('sysState',1);if(key==='bootSign'&&value===4)this.notify('sysState',0);});};
  subscribe=async(service,uuid,callback)=>{assert.equal(service,SERVICE);const key=fieldFor(uuid);assert(key,`Unexpected subscribe ${uuid}`);(this.subscribers[key]??=[]).push(callback);return()=>{this.subscribers[key]=this.subscribers[key].filter(fn=>fn!==callback);};};
  discoverServices=async()=>[SERVICE];
  onDisconnect=fn=>{this.onDrop=fn;return()=>{if(this.onDrop===fn)this.onDrop=null;};};
  drop(){this.disconnected=true;this.onDrop?.();}
  starts(){return this.writes.filter(w=>w.key==='bootSign'&&[1,2,3].includes(w.value));}
}

async function fixture(options={}){
  const clock=new FakeClock(),gatt=new MockGatt(clock,options),storeWrites=[];let factory;
  const host={emit(){},storage(request){if(request.type==='write')storeWrites.push(request);},devices:{bindDriver(id,value){assert.equal(id,'crystal');factory=value;}}};
  // Match Decaid's limited runtime: no browser atob/btoa/Buffer supplied here.
  const context=vm.createContext({console,Date:clock.Date(),setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,setInterval:clock.setInterval,clearInterval:clock.clearInterval});
  vm.runInContext(readFileSync(new URL('../plugin.js',import.meta.url),'utf8'),context);
  const plugin=context.createPlugin(host);await plugin.onLoad();if(!options.deferPreferences)plugin.onEvent({name:'storageRead',payload:{key:'devicePreferences',value:options.preferences?JSON.stringify(options.preferences):null}});if(options.workflow!==false)plugin.onEvent({name:'workflowUpdated',payload:WORKFLOW});assert(factory?.create,'Driver factory must be registered');
  const driver=factory.create({id:'plugin:thiscup-crystal.reaplugin:crystal:test-grinder',name:'CRYSTAL-TEST'});
  if(!options.preferences&&!options.deferPreferences)plugin.handleHttpRequest({endpoint:'ui',method:'POST',body:{commandId:'selectDevice',params:{deviceId:'plugin:thiscup-crystal.reaplugin:crystal:test-grinder',name:'CRYSTAL-TEST'}}});
  const session={gatt,publish:snapshot=>{gatt.snapshots.push(JSON.parse(JSON.stringify(snapshot)));}};
  const http=(command,params={})=>{if(command&&!Object.hasOwn(params,'deviceId'))params={...params,deviceId:'plugin:thiscup-crystal.reaplugin:crystal:test-grinder'};if(['apply','start'].includes(command)&&!Object.hasOwn(params,'expectedWorkflow'))params={...params,expectedWorkflow:WORKFLOW};if(['apply','start'].includes(command)&&!Object.hasOwn(params,'commandFence'))params={...params,commandFence:JSON.parse(plugin.handleHttpRequest({endpoint:'ui',method:'GET'}).body).commandFence};const reply=plugin.handleHttpRequest(command?{endpoint:'ui',method:'POST',body:{commandId:command,params}}:{endpoint:'ui',method:'GET',query:{state:'1'}});return {status:reply.status,...JSON.parse(reply.body)};};
  const state=()=>http();
  const submit=(kind,params={})=>{const reply=http(kind,params);assert.equal(reply.ok,true,JSON.stringify(reply));assert.equal(reply.result.status,'accepted');return reply.result.operationId;};
  const completion=async id=>{await clock.until(()=>state().operations.some(x=>x.id===id&&x.status!=='running'));return state().operations.find(x=>x.id===id);};
  if(options.initialValues)Object.assign(gatt.values,options.initialValues);
  if(options.raw)Object.assign(gatt.raw,options.raw);
  const connect=()=>clock.settle(driver.connect(session));
  const configure=(config=CONFIG)=>{const reply=http('setConfig',config);assert.equal(reply.ok,true);return reply.result;};
  return {clock,gatt,plugin,driver,factory,session,http,state,submit,completion,connect,configure,storeWrites};
}

test('connect is read-only; power-on zeroes never replace the saved recipe',async()=>{
  const f=await fixture();f.configure();await f.connect();assert.equal(f.gatt.writes.length,0);assert.equal(f.state().initialized,true);assert.deepEqual(f.state().config,CONFIG);assert.equal(f.state().setting,null);assert.equal(f.gatt.snapshots.at(-1).setting,undefined);assert.equal(f.state().values.servoAngle,0);assert.equal(f.gatt.maxInflight,1);
});

test('grinder values use exact big-endian two-byte encoding and one-byte SYS_STATE is accepted',async()=>{
  const f=await fixture({initialValues:{motorRpm:499,servoAngle:499},raw:{sysState:Buffer.from([0]).toString('base64')}});await f.connect();assert.equal(f.state().values.motorRpm,499);assert.equal(f.state().values.servoAngle,499);assert.equal(f.state().setting,null);assert.equal(f.state().parametersConfirmed,false);
});

for(const [label,key,raw] of [['short motor','motorRpm',Buffer.from([1]).toString('base64')],['long servo','servoAngle',Buffer.from([0,1,2]).toString('base64')],['overrange motor','motorRpm',encode(1501)],['overrange feed','feedRpm',encode(151)],['overrange state','sysState',encode(2)],['invalid base64','motorRpm','%%%']]){
  test(`connect rejects ${label} without writing or remaining connected`,async()=>{const f=await fixture({raw:{[key]:raw}});await assert.rejects(f.connect());assert.equal(f.state().connected,false);assert.equal(f.gatt.writes.length,0);});
}

for(const raw of ['AAA','AAA===','AA=A','AB==','AAB=',' AA=','',{},[0,0]]){
  test(`bridge decoder rejects malformed/noncanonical input ${JSON.stringify(raw)}`,async()=>{
    const f=await fixture({raw:{motorRpm:raw}});await assert.rejects(f.connect());
    assert.equal(f.state().connected,false);assert.equal(f.gatt.writes.length,0);
  });
}

test('partial local configuration does not touch GATT and invalid writes do not persist',async()=>{
  const f=await fixture();assert.equal(f.state().config.grindSize,null);assert.equal(f.http('setConfig',{motorRpm:999}).ok,true);assert.equal(f.gatt.calls.length,0);assert.equal(f.http('setConfig',{feedRpm:151}).ok,false);assert.equal(f.http('setConfig',{motorRpm:'1000'}).ok,false);assert.equal(f.http('setConfig',{bootMode:'turbo'}).ok,false);assert.equal(f.state().config.motorRpm,999);assert.equal(f.state().config.feedRpm,20);
});

test('saved partial configuration survives reload while grind size is unset',async()=>{
  const f=await fixture();f.http('setConfig',{motorRpm:999});const saved=f.storeWrites.at(-1).data;
  const fresh=await fixture({preferences:JSON.parse(saved)});assert.equal(fresh.state().config.motorRpm,999);assert.equal(fresh.state().config.grindSize,null);
});

test('apply waits for observed busy-to-idle and 1500ms stability without starting',async()=>{
  const f=await fixture();await f.connect();const id=f.submit('apply',{config:CONFIG});const result=await f.completion(id);assert.equal(result.status,'done',result.error);assert.equal(f.gatt.starts().length,0);const adjust=f.gatt.writes.find(x=>x.key==='bootSign'&&x.value===5);assert(result.finishedAt>=adjust.at+250+1500);assert.deepEqual(f.state().config,CONFIG);assert.equal(f.state().values.servoAngle,220);assert.equal(f.gatt.maxInflight,1);
});

test('matching position without a busy transition never authorizes start',async()=>{
  const f=await fixture({move:false,initialValues:{servoAngle:220}});await f.connect();const id=f.submit('start',{config:CONFIG});const result=await f.completion(id);assert.equal(result.status,'error');assert.match(result.error,/调距/);assert.equal(f.gatt.starts().length,0);
});

test('position tolerance is strictly less than 3um',async()=>{
  for(const offset of [2,3]){const f=await fixture({move:false});await f.connect();const id=f.submit('start',{config:CONFIG});await f.clock.until(()=>f.gatt.writes.some(x=>x.key==='bootSign'&&x.value===5));f.gatt.notify('sysState',1);await f.clock.tick(250);f.gatt.notify('servoAngle',CONFIG.grindSize+offset);f.gatt.notify('sysState',0);const result=await f.completion(id);assert.equal(result.status,offset===2?'done':'error',`offset=${offset}, ${result.error}`);assert.equal(f.gatt.starts().length,offset===2?1:0);}
});

test('a one-micron movement inside tolerance restarts the full 1500ms quiet window',async()=>{
  const f=await fixture();await f.connect();const id=f.submit('start',{config:CONFIG});await f.clock.until(()=>f.gatt.values.sysState===1&&f.gatt.writes.some(x=>x.key==='bootSign'&&x.value===5));await f.clock.until(()=>f.gatt.values.sysState===0);await f.clock.tick(600);const changedAt=f.clock.now;f.gatt.notify('servoAngle',221);await f.clock.tick(1400);assert.equal(f.gatt.starts().length,0);const result=await f.completion(id);assert.equal(result.status,'done',result.error);assert.equal(f.gatt.starts().length,1);assert(f.gatt.starts()[0].at>=changedAt+1500);assert.equal(f.gatt.maxInflight,1);
});

test('a second action is rejected while the first is pending',async()=>{
  const f=await fixture();await f.connect();const id=f.submit('apply',{config:CONFIG});const second=f.http('start',{config:CONFIG});assert.equal(second.ok,false);await f.completion(id);assert.equal(f.gatt.starts().length,0);
});

test('Stop cancels an armed start during the stable wait and remains the final command',async()=>{
  const f=await fixture();await f.connect();const startId=f.submit('start',{config:CONFIG});await f.clock.until(()=>f.gatt.values.sysState===1);await f.clock.until(()=>f.gatt.values.sysState===0);await f.clock.tick(400);const stopId=f.submit('stop');const stopped=await f.completion(stopId);await f.clock.tick(3000);assert.equal(stopped.status,'done',stopped.error);assert.equal(f.state().operations.find(x=>x.id===startId).status,'cancelled');assert.equal(f.gatt.starts().length,0);assert.equal(f.gatt.writes.at(-1).value,4);assert.equal(f.gatt.maxInflight,1);
});

test('Stop waits behind the actual in-flight GATT promise, with no concurrent GATT or late start',async()=>{
  const f=await fixture();await f.connect();f.gatt.latency=700;const startId=f.submit('start',{config:CONFIG});await f.clock.flush();assert.equal(f.gatt.inflight,1);const stopId=f.submit('stop');await f.clock.tick(100);assert.equal(f.gatt.writes.length,0);const stopped=await f.completion(stopId);await f.clock.tick(3000);assert.equal(stopped.status,'done',stopped.error);assert.equal(f.state().operations.find(x=>x.id===startId).status,'cancelled');assert.equal(f.gatt.starts().length,0);assert.equal(f.gatt.maxInflight,1);
});

test('disconnect cancels pending start and reconnect is read-only',async()=>{
  const f=await fixture();await f.connect();const id=f.submit('start',{config:CONFIG});await f.clock.until(()=>f.gatt.writes.some(x=>x.key==='bootSign'&&x.value===5));f.gatt.drop();await f.clock.tick(2500);assert.equal(f.gatt.starts().length,0);assert.equal(f.state().connected,false);const writes=f.gatt.writes.length;f.gatt.disconnected=false;f.gatt.subscribers={};await f.connect();await f.clock.tick(3000);assert.equal(f.gatt.writes.length,writes);assert.equal(f.gatt.starts().length,0);assert.equal(f.state().operations.find(x=>x.id===id).status,'cancelled');
});

test('readAll is an acknowledged asynchronous receipt and does not write',async()=>{
  const f=await fixture();await f.connect();const before=f.gatt.writes.length;const id=f.submit('readAll');const result=await f.completion(id);assert.equal(result.status,'done');assert.equal(f.gatt.writes.length,before);
});

test('malformed notification during adjustment cancels the pending start',async()=>{
  const f=await fixture();await f.connect();const id=f.submit('start',{config:CONFIG});await f.clock.until(()=>f.gatt.writes.some(x=>x.key==='bootSign'&&x.value===5));
  for(const callback of f.gatt.subscribers.servoAngle)callback(Buffer.from([1]).toString('base64'));
  await f.clock.tick(5000);assert.equal(f.gatt.starts().length,0);assert.equal(f.state().initialized,false);assert.equal(f.state().operations.find(x=>x.id===id).status,'error');
  const restore=f.submit('readAll');assert.equal((await f.completion(restore)).status,'done');assert.equal(f.state().initialized,true);assert.equal(f.gatt.starts().length,0);
});

test('a timed-out GATT request stays serialized until its real response arrives',async()=>{
  const f=await fixture();await f.connect();f.gatt.latency=5000;const id=f.submit('start',{config:CONFIG});await f.clock.tick(3600);assert.equal(f.state().operations.find(x=>x.id===id).status,'error');assert.equal(f.gatt.inflight,1);const stop=f.submit('stop');await f.clock.tick(12000);assert.equal(f.gatt.maxInflight,1);assert.equal(f.gatt.starts().length,0);assert.equal(f.state().operations.find(x=>x.id===stop).status,'error');assert(f.gatt.writes.some(x=>x.key==='bootSign'&&x.value===4));
});

test('stopping an adjustment never reports that grinding has started',async()=>{
  const f=await fixture();await f.connect();f.submit('start',{config:CONFIG});await f.clock.until(()=>f.gatt.writes.some(x=>x.key==='bootSign'&&x.value===5)&&f.gatt.values.sysState===1);const stop=f.submit('stop');assert.notEqual(f.state().state,'grinding');assert.equal((await f.completion(stop)).status,'done');assert.equal(f.gatt.starts().length,0);
});

test('native grinder setters, start and stop share acknowledged operation records',async()=>{
  const f=await fixture();await f.connect();f.configure();let result=f.driver.setRpm(900);assert.equal((await f.completion(result.operationId)).status,'done');assert.equal(f.gatt.values.motorRpm,900);result=f.driver.setGrindSetting('200');assert.equal((await f.completion(result.operationId)).status,'done');assert.equal(f.gatt.values.servoAngle,200);assert.equal(f.gatt.starts().length,0);result=f.driver.start();assert.equal((await f.completion(result.operationId)).status,'done');assert.equal(f.gatt.starts().length,1);result=f.driver.stop();assert.equal((await f.completion(result.operationId)).status,'done');assert.equal(f.gatt.values.sysState,0);assert.equal(f.gatt.maxInflight,1);
});

test('recreating the same device id retires the previous pending start',async()=>{
  const f=await fixture();await f.connect();f.submit('start',{config:CONFIG});await f.clock.until(()=>f.gatt.writes.some(x=>x.key==='bootSign'&&x.value===5));const replacement=f.factory.create({id:'plugin:thiscup-crystal.reaplugin:crystal:test-grinder',name:'CRYSTAL-TEST'});const next=new MockGatt(f.clock);await f.clock.settle(replacement.connect({gatt:next,publish(){}}));await f.clock.tick(4000);assert.equal(f.gatt.starts().length,0);assert.equal(next.writes.length,0);assert.equal(f.state().connected,true);assert.equal(f.state().initialized,true);
});

test('readAll overlapping the grind-status poll does not turn cancellation into a device error',async()=>{
  const f=await fixture();await f.connect();const start=f.submit('start',{config:CONFIG});assert.equal((await f.completion(start)).status,'done');f.gatt.latency=100;await f.clock.until(()=>f.gatt.inflight>0&&f.state().operation===null);const read=f.submit('readAll');assert.equal((await f.completion(read)).status,'done');assert.equal(f.state().error,null);assert.equal(f.state().state,'grinding');assert(f.state().grind);f.gatt.notify('sysState',0);await f.clock.until(()=>f.state().grind===null);assert.equal(f.state().error,null);assert.equal(f.gatt.starts().length,1);assert.equal(f.gatt.maxInflight,1);
});


test('HTTP apply/start without a current server fence fail before GATT writes',async()=>{
 const f=await fixture();await f.connect();for(const command of ['apply','start'])for(const commandFence of [null,{}, {...f.state().commandFence,revision:-1}]){const reply=f.http(command,{config:CONFIG,commandFence});assert.equal(reply.ok,false);assert.equal(reply.code,'cancelled');}assert.equal(f.gatt.writes.length,0);
});

test('a stop in another client invalidates pre-existing fences; a fresh explicit start remains usable',async()=>{
 const f=await fixture();await f.connect();const commandFence=f.state().commandFence;const stop=f.submit('stop');assert.equal((await f.completion(stop)).status,'done');
 const delayed=f.http('start',{config:CONFIG,commandFence});assert.equal(delayed.ok,false);assert.equal(delayed.code,'cancelled');await f.clock.tick(4000);assert.equal(f.gatt.starts().length,0);
 const fresh=f.submit('start',{config:CONFIG});assert.equal((await f.completion(fresh)).status,'done');assert.equal(f.gatt.starts().length,1);
});

test('native stop, reconnect and driver replacement invalidate old HTTP fences',async()=>{
 for(const action of ['nativeStop','reconnect','replacement']){
  const f=await fixture();await f.connect();const commandFence=f.state().commandFence;
  if(action==='nativeStop')await f.completion(f.driver.stop().operationId);
  else if(action==='reconnect'){f.driver.disconnect();await f.connect();}
  else {const replacement=f.factory.create({id:'plugin:thiscup-crystal.reaplugin:crystal:test-grinder',name:'replacement'});await f.clock.settle(replacement.connect({gatt:new MockGatt(f.clock),publish(){}}));}
  const reply=f.http('start',{config:CONFIG,commandFence});assert.equal(reply.ok,false,action);assert.equal(reply.code,'cancelled');assert.equal(f.gatt.starts().length,0);
 }
});

test('independent reproduction fixed: stop delivered before delayed real-client start never starts GATT',async()=>{
 const {createGrinderClient}=await import('../../../skin/grinder.js');const f=await fixture();await f.connect();let releaseStart,reached,lateReply;const queued=new Promise(r=>reached=r),hold=new Promise(r=>releaseStart=r);
 const response=reply=>({ok:reply.ok!==false,status:reply.status,json:async()=>reply});
 const fetchImpl=async(url,opts)=>{if(opts.method==='GET')return response(f.http());const body=JSON.parse(opts.body);if(body.commandId==='start'){reached();await hold;lateReply=f.http('start',body.params);return response(lateReply);}return response(f.http(body.commandId,body.params));};
 const client=createGrinderClient({baseUrl:'http://fixture.invalid',fetchImpl,now:()=>f.clock.now,sleep:ms=>new Promise(r=>f.clock.setTimeout(r,ms))});await client.getState();
 const pending=client.start(CONFIG,{expectedWorkflow:WORKFLOW}).then(()=>({ok:true}),error=>({code:error.code}));await f.clock.settle(queued);await f.clock.settle(client.stop());assert.equal(f.state().state,'idle');releaseStart();assert.equal((await f.clock.settle(pending)).code,'cancelled');assert.equal(lateReply.ok,false);assert.equal(lateReply.code,'cancelled');await f.clock.tick(4000);assert.equal(f.gatt.starts().length,0);assert.equal(f.state().state,'idle');
 // The next explicit action captures the new fence and is accepted once.
 await f.clock.settle(client.start(CONFIG,{expectedWorkflow:WORKFLOW}));assert.equal(f.gatt.starts().length,1);
});

test('pre-start state read cannot silently refresh a user intent after another client stops',async()=>{
 const {createGrinderClient}=await import('../../../skin/grinder.js');const f=await fixture();await f.connect();let holdRead=false,releaseRead,reached;const queued=new Promise(r=>reached=r);
 const response=reply=>({ok:reply.ok!==false,status:reply.status,json:async()=>reply});
 const fetchImpl=async(url,opts)=>{if(opts.method==='GET'){if(holdRead){reached();await new Promise(r=>releaseRead=r);holdRead=false;}return response(f.http());}const b=JSON.parse(opts.body);return response(f.http(b.commandId,b.params));};
 const client=createGrinderClient({baseUrl:'http://fixture.invalid',fetchImpl,now:()=>f.clock.now,sleep:ms=>new Promise(r=>f.clock.setTimeout(r,ms))});await client.getState();holdRead=true;
 const pending=client.start(CONFIG,{expectedWorkflow:WORKFLOW}).then(()=>({ok:true}),e=>({code:e.code}));await f.clock.settle(queued);await f.completion(f.submit('stop'));releaseRead();assert.equal((await f.clock.settle(pending)).code,'cancelled');assert.equal(f.gatt.starts().length,0);
});


test('reboot placeholder target/rpm zero with retained servo is unconfirmed and cannot be applied',async()=>{
 const f=await fixture({initialValues:{servoAngle:220}});f.configure();await f.connect();const before=f.state();assert.equal(before.parametersConfirmed,false);assert.equal(before.configSource,'saved');assert.deepEqual(before.config,CONFIG);assert.equal(before.setting,null);assert.equal(f.gatt.writes.length,0);
 const zero={grindSize:0,motorRpm:0,feedRpm:0,bootMode:'smart'};const reply=f.http('apply',{config:zero});assert.equal(reply.ok,false);assert.equal(f.gatt.writes.length,0);
 const id=f.submit('apply',{config:CONFIG});assert.equal((await f.completion(id)).status,'done');assert.equal(f.state().parametersConfirmed,true);assert.equal(f.gatt.starts().length,0);assert(f.gatt.writes.filter(w=>w.key!=='bootSign').every(w=>w.value>0));
});

test('plugin fails closed until an authoritative initial workflow event arrives',async()=>{
 const f=await fixture({workflow:false});await f.connect();for(const command of ['apply','start']){const reply=f.http(command,{config:CONFIG,expectedWorkflow:WORKFLOW});assert.equal(reply.ok,false);assert.equal(reply.code,'workflow_changed');}assert.equal(f.gatt.writes.length,0);assert.equal(f.state().workflowReady,false);
 f.plugin.onEvent({name:'workflowUpdated',payload:WORKFLOW});assert.equal(f.state().workflowReady,true);const id=f.submit('apply',{config:CONFIG});assert.equal((await f.completion(id)).status,'done');
});

for(const command of ['apply','start'])test(`server rejects stale workflow ${command} even if client obtains a fresh fence`,async()=>{
 const f=await fixture();await f.connect();f.plugin.onEvent({name:'workflowUpdated',payload:{...WORKFLOW,id:'workflow:B',profile:{title:'B'}}});const reply=f.http(command,{config:CONFIG,expectedWorkflow:WORKFLOW});assert.equal(reply.ok,false);assert.equal(reply.code,'workflow_changed');assert.equal(f.gatt.writes.length,0);
});

test('delayed real-client start arriving after external workflow switch has no GATT writes',async()=>{
 const {createGrinderClient}=await import('../../../skin/grinder.js');const f=await fixture();await f.connect();let release,reached;const held=new Promise(r=>reached=r),gate=new Promise(r=>release=r);
 const response=data=>({ok:data.ok!==false,status:data.status,json:async()=>data});const fetchImpl=async(url,options)=>{if(options.method==='GET')return response(f.http());const req=JSON.parse(options.body);if(req.commandId==='start'){reached();await gate;}return response(f.http(req.commandId,req.params));};
 const client=createGrinderClient({baseUrl:'http://fixture.invalid',fetchImpl,now:()=>f.clock.now,sleep:ms=>new Promise(r=>f.clock.setTimeout(r,ms))});await client.getState();const pending=client.start(CONFIG,{expectedWorkflow:WORKFLOW}).then(()=>({ok:true}),error=>({code:error.code}));await f.clock.settle(held);f.plugin.onEvent({name:'workflowUpdated',payload:{...WORKFLOW,id:'workflow:B'}});release();assert.equal((await f.clock.settle(pending)).code,'cancelled');assert.equal(f.gatt.writes.length,0);
});

test('workflow change during adjustment stability cancels the pending start but preserves stop',async()=>{
 const f=await fixture();await f.connect();const id=f.submit('start',{config:CONFIG});await f.clock.until(()=>f.gatt.writes.some(w=>w.key==='bootSign'&&w.value===5)&&f.gatt.values.sysState===0);f.plugin.onEvent({name:'workflowUpdated',payload:{...WORKFLOW,id:'workflow:B'}});assert.equal((await f.completion(id)).status,'cancelled');await f.clock.tick(3000);assert.equal(f.gatt.starts().length,0);assert.equal((await f.completion(f.submit('stop'))).status,'done');
});


test('workflow switch cannot cancel a queued Stop or its physical stop write',async()=>{
 const f=await fixture();await f.connect();await f.completion(f.submit('start',{config:CONFIG}));assert.equal(f.gatt.values.sysState,1);const before=f.gatt.writes.length;
 const stop=f.submit('stop');f.plugin.onEvent({name:'workflowUpdated',payload:{...WORKFLOW,id:'workflow:B'}});assert.equal((await f.completion(stop)).status,'done');assert.equal(f.gatt.values.sysState,0);assert.equal(f.gatt.writes.slice(before).filter(w=>w.key==='bootSign'&&w.value===4).length,1);assert.equal(f.state().phase,null);
});

test('workflow change leaves in-progress connection and readAll read-only work usable',async()=>{
 const f=await fixture();const connecting=f.connect();f.plugin.onEvent({name:'workflowUpdated',payload:{...WORKFLOW,id:'workflow:B'}});await connecting;const read=f.submit('readAll');f.plugin.onEvent({name:'workflowUpdated',payload:{...WORKFLOW,id:'workflow:C'}});assert.equal((await f.completion(read)).status,'done');assert.equal(f.state().connected,true);assert.equal(f.gatt.writes.length,0);
});


test('native control declared minimum matches zero rejection before GATT writes',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));assert.equal(manifest.drivers[0].controls.grindSetting.min,1);assert.equal(manifest.drivers[0].controls.rpmControl.min,1);
 for(const [method,value] of [['setRpm',0],['setGrindSetting','0']]){const f=await fixture();await f.connect();const result=f.driver[method](value);assert.equal((await f.completion(result.operationId)).status,'error');assert.equal(f.gatt.writes.length,0);}
});


test('workflow switch during actual adjustment does not relabel that motion as grinding',async()=>{
 const f=await fixture();await f.connect();const id=f.submit('start',{config:CONFIG});await f.clock.until(()=>f.gatt.writes.some(w=>w.key==='bootSign'&&w.value===5)&&f.gatt.values.sysState===1);f.plugin.onEvent({name:'workflowUpdated',payload:{...WORKFLOW,id:'workflow:B'}});assert.equal(f.state().state,'unknown');assert.equal((await f.completion(id)).status,'cancelled');await f.clock.tick(3000);assert.equal(f.gatt.starts().length,0);assert.equal(f.state().state,'idle');
});

const A='plugin:thiscup-crystal.reaplugin:crystal:test-grinder', B='plugin:thiscup-crystal.reaplugin:crystal:second';
async function addSecond(f){
 const gatt=new MockGatt(f.clock),driver=f.factory.create({id:B,name:'CRYSTAL-SECOND'});
 await f.clock.settle(driver.connect({gatt,publish(){}}));return {gatt,driver};
}
test('two connected grinders preserve selected identity and apply only to the explicit selected device',async()=>{
 const f=await fixture();await f.connect();const b=await addSecond(f);
 assert.equal(f.state().deviceId,A);assert.equal(f.state().devices.length,2);
 assert.equal(f.http('apply',{deviceId:B,config:CONFIG}).code,'device_changed');
 const id=f.submit('apply',{config:CONFIG});assert.equal((await f.completion(id)).status,'done');
 assert(f.gatt.writes.length>0);assert.equal(b.gatt.writes.length,0);
 const count=f.gatt.writes.length;assert.equal(f.http('selectDevice',{deviceId:B}).ok,true);
 assert.equal(f.state().deviceId,B);assert.equal(f.state().config.grindSize,null);assert.equal(f.state().parametersConfirmed,false);
 assert.equal(f.gatt.writes.length,count);assert.equal(b.gatt.writes.length,0);
 const apply=f.http('apply',{deviceId:B,config:{...CONFIG,grindSize:80}});assert.equal(apply.ok,true);
 assert.equal((await f.completion(apply.result.operationId)).status,'done');assert.equal(f.gatt.writes.length,count);assert(b.gatt.writes.length>0);
});
test('default selection and Unicode aliases survive reload, offline saved target never falls back',async()=>{
 const f=await fixture();await f.connect();await addSecond(f);
 assert.equal(f.http('renameDevice',{deviceId:B,name:'Crystal · 大刀盤 ☕'}).ok,true);
 assert.equal(f.http('selectDevice',{deviceId:B}).ok,true);
 const preferences=JSON.parse(f.storeWrites.at(-1).data),fresh=await fixture({preferences});await fresh.connect();
 assert.equal(fresh.state().deviceId,B);assert.equal(fresh.state().deviceAlias,'Crystal · 大刀盤 ☕');assert.equal(fresh.state().connected,false);
 assert.equal(fresh.gatt.writes.length,0);assert.equal(fresh.http('start',{config:CONFIG}).code,'device_changed');
});
test('selection change invalidates old fences even if user selects the first device again',async()=>{
 const f=await fixture();await f.connect();await addSecond(f);const commandFence=f.state().commandFence;
 assert.equal(f.http('selectDevice',{deviceId:B}).ok,true);assert.equal(f.http('selectDevice',{deviceId:A}).ok,true);
 assert.equal(f.http('apply',{config:CONFIG,commandFence}).code,'cancelled');assert.equal(f.gatt.writes.length,0);
});
test('cannot switch target while adjusting, and stop still binds original device',async()=>{
 const f=await fixture({move:false});await f.connect();const b=await addSecond(f);
 f.submit('start',{config:CONFIG});await f.clock.until(()=>f.gatt.writes.some(x=>x.key==='bootSign'&&x.value===5));
 assert.equal(f.http('selectDevice',{deviceId:B}).code,'busy');assert.equal(f.state().deviceId,A);
 const stop=f.submit('stop');assert.equal((await f.completion(stop)).status,'done');assert.equal(b.gatt.writes.length,0);
});
test('device-local configurations cannot inherit from another device and renaming is read-only',async()=>{
 const f=await fixture();f.configure(CONFIG);const b=await addSecond(f);
 assert.equal(f.http('selectDevice',{deviceId:B}).ok,true);assert.equal(f.state().config.grindSize,null);
 assert.equal(f.http('setConfig',{deviceId:B,motorRpm:777}).ok,true);assert.equal(f.state().config.motorRpm,777);
 assert.equal(f.http('renameDevice',{deviceId:A,name:'小方'}).ok,true);
 assert.equal(f.http('renameDevice',{deviceId:B,name:'小方'}).code,'duplicate_name');
 assert.equal(f.http('selectDevice',{deviceId:A}).ok,true);assert.deepEqual(f.state().config,CONFIG);
 assert.equal(f.gatt.writes.length,0);assert.equal(b.gatt.writes.length,0);
});
test('unbound install chooses a unique connected device but never chooses between two live devices',async()=>{
 const f=await fixture({preferences:{selectedId:null,aliases:{},names:{},configs:{}}});await f.connect();assert.equal(f.state().deviceId,A);
 const g=await fixture({preferences:{selectedId:null,aliases:{},names:{},configs:{}}});await g.connect();await addSecond(g);
 assert.equal(g.state().deviceId,null);assert.equal(g.state().connected,false);assert.equal(g.gatt.writes.length,0);
});
test('delayed preference read cannot be overwritten by early auto-selection or rename',async()=>{
 const f=await fixture({deferPreferences:true});await f.connect();assert.equal(f.state().preferencesReady,false);assert.equal(f.state().deviceId,null);
 assert.equal(f.http('selectDevice',{deviceId:A}).code,'preferences_loading');assert.equal(f.http('renameDevice',{deviceId:A,name:'新名字'}).code,'preferences_loading');assert.equal(f.storeWrites.length,0);
 f.plugin.onEvent({name:'storageRead',payload:{key:'devicePreferences',value:JSON.stringify({selectedId:B,aliases:{[B]:'原默认'},names:{[B]:'CRYSTAL-B'},configs:{}})}});
 assert.equal(f.state().preferencesReady,true);assert.equal(f.state().deviceId,B);assert.equal(f.state().connected,false);assert.equal(f.state().deviceAlias,'原默认');
});

test('rename rejects another grinder original name, including case and whitespace variants',async()=>{
 const f=await fixture();await f.connect();const b=await addSecond(f);const before=f.storeWrites.length;
 for(const name of ['CRYSTAL-SECOND','crystal-second','  CrYsTaL-SeCoNd\t']){
  const result=f.http('renameDevice',{deviceId:A,name});assert.equal(result.status,400);assert.equal(result.code,'duplicate_name');
 }
 assert.equal(f.state().deviceAlias,'');assert.equal(f.storeWrites.length,before);assert.equal(f.gatt.writes.length,0);assert.equal(b.gatt.writes.length,0);
});
test('rename compares alias before original name, normalizes spaces, and permits own original name',async()=>{
 const f=await fixture();await addSecond(f);
 assert.equal(f.http('renameDevice',{deviceId:A,name:'  CRYSTAL-TEST  '}).ok,true);assert.equal(f.state().deviceAlias,'CRYSTAL-TEST');
 assert.equal(f.http('renameDevice',{deviceId:B,name:'  我的\t Crystal   ☕  '}).ok,true);
 assert.equal(f.http('renameDevice',{deviceId:A,name:'我的  CRYSTAL\n☕'}).code,'duplicate_name');
 assert.equal(f.http('renameDevice',{deviceId:A,name:'CRYSTAL-SECOND'}).ok,true,'the other original name is not its current display name after aliasing');
 assert.equal(f.http('renameDevice',{deviceId:B,name:'crystal-second'}).code,'duplicate_name','own original cannot collide with another current alias');
 assert.equal(f.state().devices.find(d=>d.id===B).alias,'我的 Crystal ☕');
 assert.equal(f.http('renameDevice',{deviceId:A,name:'crystal-second'}).ok,true,'keeping own display name is valid');
});
test('remembered offline original names and aliases still prevent duplicate display names',async()=>{
 const f=await fixture({preferences:{selectedId:A,names:{[A]:'CRYSTAL-TEST',[B]:'CRYSTAL B'},aliases:{},configs:{}}});
 assert.equal(f.http('renameDevice',{deviceId:A,name:' crystal\t b '}).code,'duplicate_name');
 assert.equal(f.http('renameDevice',{deviceId:B,name:'副机 Crystal'}).ok,true);
 const fresh=await fixture({preferences:JSON.parse(f.storeWrites.at(-1).data)});
 assert.equal(fresh.http('renameDevice',{deviceId:A,name:'副机  CRYSTAL'}).code,'duplicate_name');assert.equal(fresh.gatt.calls.length,0);
});

test('all start modes and native starts enforce 10 µm before any writes', async () => {
  for (const bootMode of ['smart', 'manual', 'timed']) {
    for (const grindSize of [0, 9, 10, 11]) {
      const f = await fixture();
      await f.connect();
      const config = {...CONFIG, grindSize, bootMode};
      f.configure(config);
      if (grindSize < 10) {
        assert.equal(f.http('start', {config}).code, 'gap_too_small');
        assert.throws(() => f.driver.start(), {code: 'gap_too_small'});
        assert.equal(f.gatt.writes.length, 0);
      } else {
        const receipt = f.driver.start();
        assert.equal((await f.completion(receipt.operationId)).status, 'done');
        assert.equal(f.gatt.starts().length, 1);
      }
    }
  }
});

test('near-target tolerance cannot authorize a sub-minimum actual or target readback', async () => {
  for (const [key, gap] of [['servoAngle', 8], ['servoAngle', 9], ['targetAngle', 9]]) {
    const f = await fixture();
    await f.connect();
    const id = f.submit('start', {config: {...CONFIG, grindSize: 10}});
    await f.clock.until(() => f.gatt.values.servoAngle === 10);
    f.gatt.notify(key, gap);
    const result = await f.completion(id);
    assert.equal(result.code, 'gap_too_small');
    assert.equal(result.error, '刀距过近，拒绝启动。');
    assert.equal(f.gatt.starts().length, 0);
  }
});

test('applying a sub-minimum setting is permitted without authorizing grinding', async () => {
  const f = await fixture();
  await f.connect();
  const id = f.submit('apply', {config: {...CONFIG, grindSize: 9}});
  assert.equal((await f.completion(id)).status, 'done');
  assert.equal(f.gatt.values.targetAngle, 9);
  assert.equal(f.gatt.starts().length, 0);
});
