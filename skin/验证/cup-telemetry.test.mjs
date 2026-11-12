import test from 'node:test';
import assert from 'node:assert/strict';
import {canAutoInstall} from '../update.js';
import {webcrypto} from 'node:crypto';
import {createCupReporter,machineIdentity,cupPayload} from '../cup-telemetry.js';
const copy=structuredClone;
const shot={id:'cup-1',timestamp:'2026-11-12T01:02:03Z',stopReason:'targetWeight',workflow:{profile:{title:'Test',steps:[{pressure:6}]},context:{targetDoseWeight:18,targetYield:36,coffeeName:'Bean A',extras:{thisCupBeanId:'bean-1'}}},measurements:[{machine:{timestamp:'2026-11-12T01:02:03Z',pressure:4},scale:{weight:0}},{machine:{timestamp:'2026-11-12T01:02:33Z',pressure:6},scale:{weight:36}}],annotations:{actualDoseWeight:18}};
function fixture(options={}){
 const values=options.values??new Map(),pending=options.pending??new Map(),calls=[],errors=[];let time=1000000,context={pageUrl:'http://localhost:25123/',apiUrl:'http://localhost:8080',host:{app:'decent.app',platform:'android'},settings:{simulatedDevices:[]},connection:{connected:true,machineConnected:true,stale:false},machineState:'idle',busy:false};
 const client={async get(p){if(p.endsWith('?full=1')){const prefix=p.slice(0,-7)+'/';return Object.fromEntries([...values].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k.slice(prefix.length),copy(v)]))}return copy(values.get(p)??null)},async post(p,v){if(options.failStore?.(p))throw Error('store unavailable');values.set(p,copy(v))},async delete(p){values.delete(p)},async shot(id){return {...copy(shot),id}}};
 const reporter=createCupReporter({getContext:()=>context,getClient:()=>client,getInstallationId:()=>options.identity===false?null:'a'.repeat(32),getMetadata:()=>({machineInfo:{serialNumber:'test-123',model:'DE1Pro',version:'1358'},info:{fullVersion:'0.9.1+3000',localIp:'192.168.1.1'},host:{platform:'android'},onecupVersion:'0.2.40'}),cryptoImpl:webcrypto,fetchImpl:async(u,init)=>{calls.push({u,init,event:JSON.parse(init.body)});if(options.fetch)return options.fetch(u,init);return {ok:true,json:async()=>({accepted:true,event_id:JSON.parse(init.body).event_id})}},now:()=>time,setTimer:()=>1,clearTimer:()=>{},events:null,wait:async()=>{},pendingStorage:{getItem:k=>pending.get(k)??null,setItem:(k,v)=>pending.set(k,v)},onError:(e,d)=>errors.push({e,d})});
 return {reporter,client,values,pending,calls,errors,get context(){return context},set context(v){context=v},advance:n=>time+=n};
}
const queued=f=>[...f.values].filter(([k])=>k.startsWith('/store/onecup-cup-outbox/'));
test('stable physical machine identity ignores installation/model/firmware and never includes raw serial',async()=>{
 const a=await machineIdentity({serialNumber:'test-123',model:'A',version:'1'},webcrypto),b=await machineIdentity({serialNumber:'test-123',model:'B',version:'2'},webcrypto);
 assert.deepEqual(a,b);assert.match(a.machine_id,/^[a-f0-9]{64}$/);assert.deepEqual(await machineIdentity({},webcrypto),{machine_id:null,identity_status:'unknown'});
});
test('completed cup preserves profile, measurements and bean/taste fields; credentials and raw device identity excluded',async()=>{
 const f=fixture();await f.reporter.enqueue({...shot,measurements:[...shot.measurements,{deviceId:'secret',authorization:'secret',machine:{serialNumber:'secret',flow:2}}]},{bean:{id:'bean-1',name:'Bean A',roast:'light',weight:900},metadata:{machineInfo:{serialNumber:'test-123',model:'DE1Pro',version:'1358'},info:{fullVersion:'0.9.1+3000',localIp:'192.168.1.1'},onecupVersion:'0.2.40'}});
 assert.equal(queued(f).length,1);const body=queued(f)[0][1].event;assert.equal(body.payload.profile.title,'Test');assert.equal(body.payload.result.actualYield,null);assert.equal(body.payload.result.last_recorded_scale_weight,36);assert.equal(body.payload.versions.firmware,'1358');assert.equal(body.payload.versions.system,null);assert.equal(body.payload.bean.roast,'light');assert(!JSON.stringify(body).includes('test-123'));assert(!JSON.stringify(body).includes('secret'));assert(!JSON.stringify(body).includes('192.168'));assert.equal(body.payload.measurements.length,3);
 f.reporter.start();await f.reporter.flush();assert.equal(f.calls.length,1);assert.equal(queued(f).length,0);assert.equal(f.calls[0].init.credentials,'omit');await f.reporter.enqueue(shot);await f.reporter.flush();assert.equal(f.calls.length,1);f.reporter.dispose();
});
test('network failure remains durable across reporter restart; retry interval is persisted',async()=>{
 const f=fixture({fetch:()=>Promise.reject(Error('offline'))});await f.reporter.enqueue(shot);f.reporter.start();await f.reporter.flush();assert.equal(queued(f).length,1);assert.equal(queued(f)[0][1].last_error,'retry');f.reporter.dispose();
 const g=fixture({values:f.values,pending:f.pending});g.reporter.start();await g.reporter.flush();assert.equal(g.calls.length,0);g.advance(900001);await g.reporter.flush();assert.equal(g.calls.length,1);assert.equal(queued(g).length,0);g.reporter.dispose();
});
test('every confirmed assessment A to B to A has its own immutable revision',async()=>{
 const f=fixture();for(const acid of [1,5,1])await f.reporter.enqueue(shot,{type:'assessment_saved',feedback:{acid,note:'saved',flavors:['berry']}});
 assert.equal(queued(f).length,3);assert.equal(new Set(queued(f).map(([,v])=>v.event.event_id)).size,3);assert.deepEqual(queued(f).map(([,v])=>v.event.payload.taste.acid),[1,5,1]);
});
test('413 and mismatched acknowledgements never remove queued data',async()=>{
 for(const response of [{ok:false,status:413},{ok:true,json:async()=>({accepted:true,event_id:'wrong'})}]){
  const f=fixture({fetch:async()=>response});await f.reporter.enqueue(shot);f.reporter.start();await f.reporter.flush();assert.equal(queued(f).length,1);assert.equal(f.errors.length,1);f.reporter.dispose();
 }
});
test('preview/simulation cannot enqueue; busy machine defers the transport',async()=>{
 const f=fixture();f.context.settings.simulatedDevices=['sim'];assert.equal(await f.reporter.enqueue(shot),false);assert.equal(f.values.size,0);assert.equal(f.pending.size,0);
 f.context.settings.simulatedDevices=[];f.context.busy=true;await f.reporter.enqueue(shot);f.reporter.start();await f.reporter.flush();assert.equal(f.calls.length,0);f.context.busy=false;await f.reporter.flush();assert.equal(f.calls.length,1);f.reporter.dispose();
});
test('native persistence failure leaves a recoverable local marker and reports local failure',async()=>{
 const f=fixture({failStore:p=>p.includes('outbox')});await assert.rejects(f.reporter.enqueue(shot));assert(f.errors.some(x=>x.d.persisted===false));assert([...f.pending.values()].some(v=>v.includes('cup-1')));
 const g=fixture({values:f.values,pending:f.pending});g.reporter.start();await g.reporter.flush();assert.equal(g.calls.length,1);assert.equal(queued(g).length,0);g.reporter.dispose();
});
test('assessment on a historical cup without frozen original device keeps device unknown',()=>{
 const p=cupPayload(shot,{onecupVersion:'0.2.40'});assert.equal(p.device.machine_id,null);assert.equal(p.device.model,null);assert.equal(p.versions.firmware,null);
});

test('confirmed finished marker rereads changing early history until stable; never uses a cached partial shot',async()=>{
 const f=fixture();let reads=0;f.client.shot=async()=>{reads++;return reads===1?{...copy(shot),measurements:shot.measurements.slice(0,1)}:copy(shot)};
 f.reporter.remember(shot.id,{metadata:{machineInfo:{model:'DE1Pro',version:'1358'}}});
 f.reporter.start();await f.reporter.flush();assert.equal(reads,3);assert.equal(f.calls.length,1);assert.equal(f.calls[0].event.payload.measurements.length,2);f.reporter.dispose();
});

test('timezone provenance and host-local shot timestamps are retained without inventing UTC',()=>{
 const p=cupPayload({...shot,timestamp:'2026-11-12T09:02:03'},{timezone:{iana:'Asia/Shanghai',utc_offset_minutes:480}});
 assert.equal(p.result.timestamp,'2026-11-12T09:02:03');assert.deepEqual(p.result.timezone,{iana:'Asia/Shanghai',utc_offset_minutes:480});assert.equal(p.result.measurement_span_seconds,30);assert.equal(p.result.duration,null);
});
test('unknown serial sentinels cannot create an apparently known machine',async()=>{
 for(const serialNumber of [null,undefined,'','unknown','0',0,Infinity,{},'null'])assert.equal((await machineIdentity({serialNumber},webcrypto)).machine_id,null);
});
test('later assessment retains the original cup machine and firmware even after switching machines',async()=>{
 const f=fixture();await f.reporter.enqueue(shot,{metadata:{machineInfo:{serialNumber:'machine-A',model:'DE1Pro',version:'1358'},onecupVersion:'0.2.40'}});
 const original=queued(f)[0][1].event.payload.device.machine_id;
 await f.reporter.enqueue(shot,{type:'assessment_saved',feedback:{like:'like',acid:3},metadata:{machineInfo:{serialNumber:'machine-B',model:'DE1XL',version:'9999'},onecupVersion:'0.2.41'}});
 const assessment=queued(f).find(([,v])=>v.event.event_type==='assessment_saved')[1].event;
 assert.equal(assessment.payload.device.machine_id,original);assert.equal(assessment.payload.device.model,'DE1Pro');assert.equal(assessment.payload.versions.firmware,'1358');
});
test('corrupt local marker storage is preserved while the native outbox can still send',async()=>{
 const f=fixture();f.pending.set('onecup.cup.pending.v1:http://localhost:8080','not-json');
 await f.reporter.enqueue(shot);f.reporter.start();await f.reporter.flush();assert.equal(f.calls.length,1);assert.equal(queued(f).length,0);assert.equal(f.pending.get('onecup.cup.pending.v1:http://localhost:8080'),'not-json');assert(f.errors.some(x=>x.d.persisted===false));f.reporter.dispose();
});
test('history which is still changing is retained as pending rather than uploading an arbitrary partial record',async()=>{
 const f=fixture();let reads=0;f.client.shot=async()=>({...copy(shot),measurements:Array(++reads).fill(shot.measurements[0])});
 f.reporter.remember(shot.id);f.reporter.start();await f.reporter.flush();assert.equal(f.calls.length,0);assert.equal(reads,4);assert([...f.pending.values()].some(v=>v.includes('cup-1')));f.reporter.dispose();
});
test('a new finished marker arriving during async recovery survives both success and failure of the older cup',async()=>{
 for(const fail of [false,true]){
  const f=fixture();let unblock,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>unblock=r);let first=true;
  f.client.shot=async id=>{if(first&&id==='cup-1'){first=false;started();await gate;if(fail)throw Error('history not ready')}return {...copy(shot),id}};
  f.reporter.remember('cup-1');f.reporter.start();const task=f.reporter.flush();await ready;f.reporter.remember('cup-2');unblock();await task;
  assert([...f.pending.values()].some(v=>v.includes('cup-2')));await f.reporter.flush();assert(f.calls.some(v=>v.event.shot_id==='cup-2'));f.reporter.dispose();
 }
});
test('all saved workflow parameters and custom extras survive projection while credential keys are removed',()=>{
 const input={...copy(shot),workflow:{...copy(shot.workflow),customLimit:{pressure:4},context:{...copy(shot.workflow.context),extras:{hyperex:{pulseCount:9},apiKey:'private'}}}};
 const p=cupPayload(input);assert.equal(p.workflow.customLimit.pressure,4);assert.equal(p.workflow.context.extras.hyperex.pulseCount,9);assert(!JSON.stringify(p).includes('private'));
});

test('nested plugin credential variants are excluded without deleting ordinary skip/control parameters',()=>{
 const input={...copy(shot),workflow:{profile:{...copy(shot.workflow.profile),extras:{bridgeToken:'secret1',apiKey:'secret2',passwordHash:'secret3',plugin:{oauth_access_token:'secret4',skip:true,pulseCount:8}},skip:true}}};
 const p=cupPayload(input);assert(!JSON.stringify(p).includes('secret'));assert.equal(p.workflow.profile.extras.plugin.skip,true);assert.equal(p.workflow.profile.extras.plugin.pulseCount,8);assert.equal(p.workflow.profile.skip,true);
});

test('unverified scale weights stay raw and cannot become actual yield or actual dose',()=>{
 const p=cupPayload({...copy(shot),annotations:{},measurements:[{scale:{weight:-4,stale:true}}]});assert.equal(p.result.actualYield,null);assert.equal(p.result.actualDoseWeight,null);assert.equal(p.result.last_recorded_scale_weight,-4);assert.equal(p.workflow.context.targetDoseWeight,18);
 const q=cupPayload({...copy(shot),annotations:{actualYield:32}});assert.equal(q.result.actualYield,32);assert.equal(q.result.actual_yield_source,'shot.annotations.actualYield');
});

test('permanent client rejections retain data and alert; 408/429/5xx remain retryable',async()=>{
 for(const status of [400,422,408,429,500]){
  const f=fixture({fetch:async()=>({ok:false,status})});await f.reporter.enqueue(shot);f.reporter.start();await f.reporter.flush();assert.equal(queued(f).length,1);assert.equal(f.errors[0].d.permanent,[400,422].includes(status));assert.equal(queued(f)[0][1].last_error,[400,422].includes(status)?'invalid':'retry');f.reporter.dispose();
 }
});

test('finished intent persists before a slow identity promise and enrichment remains scoped to its original API',async()=>{
 const f=fixture();let resolve;const identity=new Promise(r=>resolve=r),metadata={machineInfo:null,machine:{machine_id:null,identity_status:'unknown'}};
 f.reporter.remember('cup-1',{metadata,identityPromise:identity});assert([...f.pending.values()].some(v=>v.includes('cup-1')));
 f.reporter.start();await f.reporter.flush();assert.equal(f.calls.length,0);
 f.context.apiUrl='http://localhost:8081';metadata.machineInfo={model:'DE1Pro',version:'1358'};metadata.machine={machine_id:'b'.repeat(64),identity_status:'known'};resolve();for(let i=0;i<20;i++)await Promise.resolve();
 await f.reporter.flush();assert.equal(f.calls.length,0);assert(f.pending.get('onecup.cup.pending.v1:http://localhost:8080').includes('b'.repeat(64)));assert.equal(f.pending.get('onecup.cup.pending.v1:http://localhost:8081'),undefined);
 f.context.apiUrl='http://localhost:8080';await f.reporter.flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].event.payload.device.machine_id,'b'.repeat(64));f.reporter.dispose();
});
test('a restart with no live identity promise still recovers the observed cup with unknown identity',async()=>{
 const f=fixture();f.reporter.remember('cup-1',{metadata:{machineInfo:null,machine:{machine_id:null,identity_status:'unknown'}},identityPromise:new Promise(()=>{})});f.reporter.dispose();
 const g=fixture({values:f.values,pending:f.pending});g.reporter.start();await g.reporter.flush();assert.equal(g.calls.length,1);assert.equal(g.calls[0].event.payload.device.machine_id,null);g.reporter.dispose();
});
test('a cached bean for another saved bean ID cannot be backfilled into the cup',()=>{
 const p=cupPayload(shot,{bean:{id:'different-bean',name:'Wrong bean',roast:'dark'}});assert.equal(p.bean.name,'Bean A');assert.equal(p.bean.roast,undefined);
 const q=cupPayload(shot,{feedback:{bean:null,like:'like'}});assert.equal(q.bean,null);
});

test('a stale saved bean snapshot for another bean ID remains raw evidence but is not the associated bean',()=>{
 const input=copy(shot);input.workflow.context.extras.thisCupBeanSnapshot={id:'old-bean',name:'Old bean'};
 const p=cupPayload(input);assert.equal(p.bean.name,'Bean A');assert.equal(p.bean.id,'bean-1');assert.equal(p.workflow.context.extras.thisCupBeanSnapshot.name,'Old bean');
});

test('pending local cup markers block auto-install only until the complete native outbox is confirmed',async()=>{
 const f=fixture({fetch:()=>Promise.reject(Error('offline'))});assert.equal(f.reporter.hasPendingLocal,false);
 f.reporter.remember(shot.id);assert.equal(f.reporter.hasPendingLocal,true);assert.equal(canAutoInstall({...f.context,canInstall:true,busy:f.reporter.hasPendingLocal}),false);
 f.reporter.start();await f.reporter.flush();assert.equal(queued(f).length,1);assert.equal(queued(f)[0][1].last_error,'retry');assert.equal(f.reporter.hasPendingLocal,false);assert.equal(canAutoInstall({...f.context,canInstall:true,busy:f.reporter.hasPendingLocal}),true);f.reporter.dispose();
});
test('local marker guard is synchronous/read-only and safely blocks corrupt or unreadable markers',()=>{
 const f=fixture();f.pending.set('onecup.cup.pending.v1:http://localhost:8080','corrupt');const before=[...f.pending];assert.equal(f.reporter.hasPendingLocal,true);assert.deepEqual([...f.pending],before);assert.equal(f.values.size,0);assert.equal(f.calls.length,0);
 const reporter=createCupReporter({getContext:()=>f.context,getClient:()=>f.client,getInstallationId:()=>null,events:null,pendingStorage:{getItem(){throw Error('unreadable')}}});assert.equal(reporter.hasPendingLocal,true);reporter.dispose();
});
test('an old API marker still blocks an automatic port-changing update after switching APIs',()=>{
 const f=fixture();f.reporter.remember(shot.id);f.context.apiUrl='http://localhost:8081';assert.equal(f.reporter.hasPendingLocal,true);f.reporter.dispose();
});
test('a machine becoming busy during outbox reservation defers transport without consuming a retry interval',async()=>{
 const f=fixture();await f.reporter.enqueue(shot);let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r),original=f.client.post.bind(f.client);let reserved=false;
 f.client.post=async(path,value)=>{if(!reserved&&path.startsWith('/store/onecup-cup-outbox/')&&value.attempts===1){reserved=true;entered();await gate}return original(path,value)};
 f.reporter.start();const task=f.reporter.flush();await ready;f.context.busy=true;release();await task;
 assert.equal(f.calls.length,0);assert.equal(queued(f).length,1);assert.equal(queued(f)[0][1].next_at,0);assert.equal(queued(f)[0][1].attempts,0);
 f.context.busy=false;await f.reporter.flush();assert.equal(f.calls.length,1);assert.equal(queued(f).length,0);f.reporter.dispose();
});
test('switching API origins during reservation cannot send the old source cup through the current context',async()=>{
 const f=fixture();await f.reporter.enqueue(shot);let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r),original=f.client.post.bind(f.client);let reserved=false;
 f.client.post=async(path,value)=>{if(!reserved&&path.startsWith('/store/onecup-cup-outbox/')&&value.attempts===1){reserved=true;entered();await gate}return original(path,value)};
 f.reporter.start();const task=f.reporter.flush();await ready;f.context.apiUrl='http://localhost:8081';release();await task;
 assert.equal(f.calls.length,0);assert.equal(queued(f)[0][1].next_at,0);f.context.apiUrl='http://localhost:8080';await f.reporter.flush();assert.equal(f.calls.length,1);f.reporter.dispose();
});
test('receipt authority clears a row resurrected by rollback and suppresses its next transport',async()=>{
 const f=fixture();await f.reporter.enqueue(shot);let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r),original=f.client.post.bind(f.client);let held=true;
 f.client.post=async(path,value)=>{if(path.startsWith('/store/onecup-cup-outbox/')&&value.attempts===1&&held){held=false;entered();await gate}if(path.startsWith('/store/onecup-cup-outbox/')&&value.attempts===0){const id=path.split('/').at(-1);f.values.set('/store/onecup-cup-receipts/'+id,{event_id:id});f.values.delete(path)}return original(path,value)};
 f.reporter.start();const task=f.reporter.flush();await ready;f.context.busy=true;release();await task;assert.equal(f.calls.length,0);f.context.busy=false;await f.reporter.flush();assert.equal(f.calls.length,0);assert.equal(queued(f).length,0);f.reporter.dispose();
});
test('matching receipts clean acknowledged rows before retry deadlines or permanent errors can hide them',async()=>{
 const f=fixture();await f.reporter.enqueue(shot);const [path,entry]=queued(f)[0],key=entry.event.event_id;f.values.set(path,{...entry,next_at:999999999,last_error:'invalid'});f.values.set('/store/onecup-cup-receipts/'+key,{event_id:key});f.reporter.start();await f.reporter.flush();assert.equal(f.calls.length,0);assert.equal(queued(f).length,0);f.reporter.dispose();
});
test('a receipt created during the attempt reservation prevents transport even when the machine stays idle',async()=>{
 const f=fixture();await f.reporter.enqueue(shot);const original=f.client.post.bind(f.client);
 f.client.post=async(path,value)=>{await original(path,value);if(path.startsWith('/store/onecup-cup-outbox/')&&value.attempts===1){const id=path.split('/').at(-1);f.values.set('/store/onecup-cup-receipts/'+id,{event_id:id});f.values.delete(path)}};
 f.reporter.start();await f.reporter.flush();assert.equal(f.calls.length,0);assert.equal(queued(f).length,0);f.reporter.dispose();
});
