import {isUsageEnvironment} from './usage.js?v=0.2.41';
export const CUP_ENDPOINT='https://home.zhouchenxing.com/usage-stats/api/v1/cup-events';
const ROOT='/store/onecup-cup-outbox',RECEIPTS='/store/onecup-cup-receipts';
const RETRY=15*60*1000;
const forbidden=key=>{
 const normalized=String(key).toLowerCase().replace(/[^a-z0-9]/g,'');
 return ['token','password','secret','accesskey','apikey','authorization','credential','serialnumber','macaddress','deviceid'].some(part=>normalized.includes(part))||
  ['serial','serialno','ip','ipaddress','localip','baseurl','hostname','url','address'].includes(normalized);
};
export function cleanSnapshot(value,depth=0){
 if(depth>40)throw Error('Telemetry snapshot is too deep');
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(Array.isArray(value))return value.map(v=>cleanSnapshot(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k,v])=>!forbidden(k)&&v!==undefined).map(([k,v])=>[k,cleanSnapshot(v,depth+1)]));
 return null;
}
const pick=(value,keys)=>Object.fromEntries(keys.map(k=>[k,value?.[k]??null]));
export const beanSnapshot=bean=>bean?cleanSnapshot(pick(bean,['id','name','roast','process','date','origin','variety','roaster','openedAt'])):null;
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]))):value;
const stable=value=>JSON.stringify(canonical(value));
export async function digest(value,cryptoImpl=globalThis.crypto){
 const bytes=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));
 return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function machineIdentity(machineInfo,cryptoImpl=globalThis.crypto){
 const raw=machineInfo?.serialNumber;
 if(!['string','number'].includes(typeof raw)||(typeof raw==='number'&&(!Number.isSafeInteger(raw)||raw<=0))||/^(unknown|null|none|undefined|0)$/i.test(String(raw).trim())||!String(raw).trim()||String(raw).length>128||/[\u0000-\u001f]/.test(String(raw)))return {machine_id:null,identity_status:'unknown'};
 return {machine_id:await digest(['onecup-decent-machine-v1',String(raw).trim()],cryptoImpl),identity_status:'known'};
}
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function cupPayload(shot,{feedback=null,bean=null,info=null,machineInfo=null,machine=null,host=null,timezone=null,onecupVersion=null}={}){
 const context=shot.workflow?.context??{},a=shot.annotations??{},points=shot.measurements??[];
 const last=points.at(-1),first=points[0];
 const lastWeight=[...points].reverse().find(p=>finite(p.scale?.weight)!==null)?.scale?.weight;
 const machinePoints=points.filter(p=>p.machine?.timestamp);
 const elapsed=machinePoints.length?(Date.parse(machinePoints.at(-1).machine.timestamp)-Date.parse(machinePoints[0].machine.timestamp))/1000:null;
 const usedBeanId=context.extras?.thisCupBeanId;
 const savedBean=context.extras?.thisCupBeanSnapshot;
 const selectedBean=feedback&&Object.hasOwn(feedback,'bean')?feedback.bean:usedBeanId&&savedBean?.id===usedBeanId?savedBean:usedBeanId&&bean?.id===usedBeanId?bean:null;
 const taste=feedback?pick(feedback,['like','acid','sweet','bitter','note','flavors']):{like:null,acid:null,sweet:null,bitter:null,note:a.espressoNotes??null,flavors:null};
 if(feedback&&Object.hasOwn(feedback,'like'))taste.enjoyment=feedback.like===null?null:({like:10,neutral:5,dislike:0}[feedback.like]??null);
 else if(a.enjoyment!==undefined)taste.enjoyment=a.enjoyment;
 return cleanSnapshot({
  profile:shot.workflow?.profile??null,
  workflow:shot.workflow??null,
  measurements:points,
  result:{timestamp:shot.timestamp??null,stopReason:shot.stopReason??null,annotations:a,actualDoseWeight:finite(a.actualDoseWeight),actualYield:finite(a.actualYield),actual_yield_source:finite(a.actualYield)!==null?'shot.annotations.actualYield':null,last_recorded_scale_weight:finite(lastWeight),last_recorded_scale_weight_source:'shot.measurements.scale.weight',duration:finite(shot.duration),measurement_span_seconds:finite(elapsed),timezone},
  bean:feedback&&Object.hasOwn(feedback,'bean')&&feedback.bean===null?null:beanSnapshot(selectedBean)??{id:context.extras?.thisCupBeanId??null,name:context.coffeeName??null,roaster:context.coffeeRoaster??null},
  taste,
  device:{model:machineInfo?.model??null,platform:host?.platform??null,...(machine??{machine_id:null,identity_status:'unknown'})},
  versions:{onecup:onecupVersion,decaid:info?.fullVersion??info?.version??null,decaid_build:info?.buildNumber??null,firmware:machineInfo?.version??null,system:host?.osVersion??host?.systemVersion??info?.osVersion??info?.systemVersion??null,system_source:host?.osVersion?'host.osVersion':host?.systemVersion?'host.systemVersion':info?.osVersion?'info.osVersion':info?.systemVersion?'info.systemVersion':null}
 });
}
async function optional(client,path){try{return await client.get(path)}catch(e){if(e.status===404)return null;throw e}}
export function createCupReporter({getContext,getClient,getInstallationId,getMetadata=()=>({}),fetchImpl=globalThis.fetch?.bind(globalThis),cryptoImpl=globalThis.crypto,now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),events=globalThis.window,pendingStorage,onError=()=>{}}){
 let timer=null,active=false,busy=false,disposed=false;
 const volatileStores=new Map(),identities=new Map();
 const memory=(key=pendingKey())=>{if(!volatileStores.has(key))volatileStores.set(key,new Map());return volatileStores.get(key)};
 const context=()=>{try{return getContext()}catch{return {}}};
 const allowed=()=>{const c=context();return isUsageEnvironment(c)&&Array.isArray(c.settings?.simulatedDevices)&&c.settings.simulatedDevices.length===0};
 const idle=()=>{const c=context();return allowed()&&c.connection?.connected===true&&c.connection.machineConnected===true&&c.connection.stale===false&&!c.busy&&['idle','schedidle','sleeping','needswater'].includes(c.machineState)};
 function schedule(delay=30000){if(timer!==null)clearTimer(timer);timer=null;if(active&&!disposed)timer=setTimer(()=>{timer=null;void flush()},delay)}
 async function queueEvent(shot,{type='shot_completed',feedback=null,bean=null,metadata=null,revision=null,occurred_at=null,client=getClient()}={}){
  if(!allowed()||!client||client!==getClient()||!shot?.id||!['shot_completed','assessment_saved'].includes(type))return false;
  const id=getInstallationId();if(!id)throw Error('Persistent installation identity is unavailable');
  const contextKey=await digest(['onecup-cup-context-v1',shot.id],cryptoImpl);
  let m=metadata??getMetadata();
  const savedContext=await optional(client,`/store/onecup-cup-context/${contextKey}`);
  if(type==='assessment_saved')m=savedContext??{onecupVersion:m.onecupVersion};
  const identity=m.machine??await machineIdentity(m.machineInfo,cryptoImpl);
  if(type==='shot_completed'&&!savedContext){
   const frozen={machineInfo:pick(m.machineInfo,['model','version']),machine:identity,info:pick(m.info,['version','fullVersion','buildNumber']),host:pick(m.host,['platform','osVersion','systemVersion']),onecupVersion:m.onecupVersion??null,timezone:m.timezone??null};
   await client.post(`/store/onecup-cup-context/${contextKey}`,frozen);
  }
  const payload=cupPayload(shot,{...m,machine:identity,feedback,bean});
  const eventId=await digest({install_id:id,shot_id:shot.id,event_type:type,...(type==='assessment_saved'?{payload,revision}:{})},cryptoImpl);
  const receipt=await optional(client,`${RECEIPTS}/${eventId}`);if(receipt?.event_id===eventId)return true;
  const path=`${ROOT}/${eventId}`;let entry=await optional(client,path);
  if(!entry){
   const occurred=occurred_at??new Date(now()).toISOString();
   entry={event:{schema:1,event_id:eventId,install_id:id,product:'this_cup',shot_id:shot.id,event_type:type,occurred_at:occurred??new Date(now()).toISOString(),payload},next_at:0,attempts:0,last_error:null};
   await client.post(path,entry);
   const saved=await client.get(path);if(stable(saved)!==stable(entry))throw Error('Cup outbox was not confirmed');
  }
  void flush();return true;
 }
 const markerStorage=()=>pendingStorage??globalThis.localStorage;
 const pendingKey=()=> 'onecup.cup.pending.v1:'+String(context().apiUrl??'');
 function pending(storageKey=pendingKey()){
  const rows=JSON.parse(markerStorage().getItem(storageKey)||'{}');
  if(!rows||typeof rows!=='object'||Array.isArray(rows)||Object.values(rows).some(v=>!v||typeof v.shot_id!=='string'||!['shot_completed','assessment_saved'].includes(v.type)))throw Error('Pending cup markers are unreadable');
  return rows;
 }
 function savePending(rows,storageKey=pendingKey()){markerStorage().setItem(storageKey,JSON.stringify(rows));if(markerStorage().getItem(storageKey)!==JSON.stringify(rows))throw Error('Pending cup marker was not saved')}
 function remember(shotId,options={}){
  if(!allowed()||!shotId)return false;
  const key=(options.type??'shot_completed')+':'+shotId+(options.revision?':'+options.revision:'');
  const metadata=cleanSnapshot(options.metadata??getMetadata());
  const marker={shot_id:shotId,type:options.type??'shot_completed',feedback:cleanSnapshot(options.feedback??null),bean:beanSnapshot(options.bean),metadata,revision:options.revision??null,occurred_at:options.occurred_at??new Date(now()).toISOString(),next_at:0};
  const storageKey=pendingKey();memory(storageKey).set(key,marker);
  const rows=pending(storageKey);rows[key]=marker;savePending(rows,storageKey);
  if(options.identityPromise){
   const identityKey=JSON.stringify([storageKey,key]),tracking={pending:true};identities.set(identityKey,tracking);
   void Promise.resolve(options.identityPromise).then(()=>{
    if(disposed)return;
    const latest=pending(storageKey),current=latest[key]??memory(storageKey).get(key);
    if(current&&identities.get(identityKey)===tracking){
     const updated={...current,metadata:cleanSnapshot(options.metadata??{})};
     latest[key]=updated;memory(storageKey).set(key,updated);savePending(latest,storageKey);
    }
   }).catch(error=>onError(error,{persisted:false})).finally(()=>{
    tracking.pending=false;if(storageKey===pendingKey())void flush();
   });
  }
  return true;
 }
 function forget(shotId,type,revision,storageKey=pendingKey()){const key=type+':'+shotId+(revision?':'+revision:'');memory(storageKey).delete(key);const rows=pending(storageKey);delete rows[key];savePending(rows,storageKey)}
 async function enqueue(shot,options={}){
  if(!allowed()||options.client&&options.client!==getClient())return false;
  const storageKey=pendingKey();
  if(options.type==='assessment_saved'&&!options.revision){
   const bytes=new Uint8Array(16);cryptoImpl.getRandomValues(bytes);
   options={...options,revision:[...bytes].map(v=>v.toString(16).padStart(2,'0')).join(''),occurred_at:new Date(now()).toISOString()};
  }
  try{remember(shot?.id,options)}catch(error){onError(error,{persisted:false})}
  try{const result=await queueEvent(shot,options);if(result)try{forget(shot.id,options.type??'shot_completed',options.revision,storageKey)}catch{}return result}
  catch(error){onError(error,{persisted:false});throw error}
 }
 function settleMarker(key,expected,next,storageKey=pendingKey()){
  const current=memory(storageKey).get(key);
  if(current&&stable(current)===expected){if(next)memory(storageKey).set(key,next);else memory(storageKey).delete(key)}
  const latest=pending(storageKey);
  if(stable(latest[key])!==expected)return;
  if(next)latest[key]=next;else delete latest[key];
  savePending(latest,storageKey);
 }
 async function clearDelivered(client,key,path){
  const receipt=await optional(client,`${RECEIPTS}/${key}`);
  if(receipt?.event_id!==key)return false;
  await client.delete(path);return true;
 }
 async function flush({force=false}={}){
  if(!active||disposed||busy||!idle()){schedule();return}
  const client=getClient(),storageKey=pendingKey();if(!client){schedule();return}busy=true;
  try{
   let markers={},markerStoreReadable=true;try{markers=pending(storageKey)}catch(error){markerStoreReadable=false;onError(error,{persisted:false})}
   markers={...markers,...Object.fromEntries(memory(storageKey))};
   for(const [key,marker] of Object.entries(markers)){
    if(!idle()||client!==getClient())break;
    if(marker.next_at>now()&&!force||identities.get(JSON.stringify([storageKey,key]))?.pending)continue;
    const expected=stable(marker);
    try{
     let shot,previous;
     for(let attempt=0;attempt<4;attempt++){
      if(!idle()||client!==getClient())throw Error('Machine became busy');
      if(marker.type==='shot_completed')await wait(500);
      shot=await client.shot(marker.shot_id);if(shot?.id!==marker.shot_id)throw Error('Pending cup history mismatch');
      const fingerprint=stable([shot.workflow,shot.measurements,shot.stopReason]);
      if(marker.type!=='shot_completed'||previous===fingerprint)break;
      previous=fingerprint;
      if(attempt===3)throw Error('Finished cup is still changing');
     }
     if(await queueEvent(shot,{type:marker.type,feedback:marker.feedback,bean:marker.bean,metadata:marker.metadata,revision:marker.revision,occurred_at:marker.occurred_at,client})){if(markerStoreReadable)settleMarker(key,expected,null,storageKey);else if(stable(memory(storageKey).get(key))===expected)memory(storageKey).delete(key)}
    }catch{const next={...marker,next_at:now()+RETRY};if(markerStoreReadable)settleMarker(key,expected,next,storageKey);else if(stable(memory(storageKey).get(key))===expected)memory(storageKey).set(key,next)}
   }
   const rows=await optional(client,ROOT+'?full=1')??{};
   for(const [key,entry]of Object.entries(rows)){
    if(client!==getClient()||!idle())break;
    if(!entry?.event||entry.event.event_id!==key)continue;
    const path=`${ROOT}/${key}`;
    // A receipt remains authoritative even if an older page resurrected a
    // queue row or its reservation would otherwise delay the next attempt.
    if(await clearDelivered(client,key,path))continue;
    if(client!==getClient()||storageKey!==pendingKey()||!idle())break;
    if(entry.next_at>now()&&!force)continue;
    if(entry.last_error==='too_large'||entry.last_error==='conflict'||entry.last_error==='invalid')continue;
    const previousAttempt={attempts:entry.attempts??0,next_at:entry.next_at??0};
    entry.attempts=previousAttempt.attempts+1;entry.next_at=now()+RETRY;
    await client.post(path,entry);
    if(await clearDelivered(client,key,path))continue;
    // Reserving the retry interval is asynchronous: recheck the machine and
    // source immediately before transport, and undo an unused reservation.
    if(!active||disposed||client!==getClient()||storageKey!==pendingKey()||!idle()){
     const reserved=await optional(client,path);
     if(reserved&&stable(reserved)===stable(entry))await client.post(path,{...reserved,...previousAttempt});
     await clearDelivered(client,key,path);
     break;
    }
    try{
     const response=await fetchImpl(CUP_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry.event),credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
     if(!response.ok){const error=Error('Cup upload failed');error.status=response.status;throw error}
     const ack=await response.json();if(ack.accepted!==true||ack.event_id!==key)throw Error('Cup acknowledgement mismatch');
     await client.post(`${RECEIPTS}/${key}`,{event_id:key,acknowledged_at:new Date(now()).toISOString()});
     if((await client.get(`${RECEIPTS}/${key}`))?.event_id!==key)throw Error('Cup receipt was not confirmed');
     await client.delete(path);
    }catch(error){
     entry.last_error=error.status===413?'too_large':error.status===409?'conflict':error.status>=400&&error.status<500&&![408,429].includes(error.status)?'invalid':'retry';
     await client.post(path,entry);
     if(!await clearDelivered(client,key,path))onError(error,{event_id:key,persisted:true,permanent:entry.last_error!=='retry'});
    }
   }
  }catch(error){onError(error,{persisted:false})}finally{busy=false;schedule()}
 }
 function hasPendingLocal(){
  try{
   if([...volatileStores.values()].some(rows=>rows.size>0))return true;
   const sourceKeys=new Set([pendingKey(),...volatileStores.keys()]),storage=markerStorage();
   if(typeof storage.key==='function'&&Number.isInteger(storage.length)){
    for(let index=0;index<storage.length;index++){
     const key=storage.key(index);if(typeof key==='string'&&key.startsWith('onecup.cup.pending.v1:'))sourceKeys.add(key);
    }
   }
   return [...sourceKeys].some(key=>Object.keys(pending(key)).length>0);
  }catch{return true}
 }
 const online=()=>void flush({force:true});
 return {get hasPendingLocal(){return hasPendingLocal()},enqueue,remember,flush,start(){if(disposed||active)return;active=true;events?.addEventListener('online',online);schedule(0)},stop(){active=false;if(timer!==null)clearTimer(timer);timer=null},dispose(){this.stop();disposed=true;events?.removeEventListener('online',online)}};
}
