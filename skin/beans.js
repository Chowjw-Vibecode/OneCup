import {brandMarkup} from "./brand.js?v=0.2.29-rc.7";
import {guardDismissClick} from "./dismiss-guard.js?v=0.2.29-rc.7";
// Bean inventory is optional. Weighing writes only after explicit confirmation.
const STORE='/store/thiscup/beans';
const RECORDS='/store/thiscup-beans';
const USAGE='/store/thiscup-bean-usage';
const usagePath=id=>`${USAGE}/${encodeURIComponent(id)}`;
const recordPath=id=>`${RECORDS}/${encodeURIComponent(id)}`;
const readOptional=async(client,path)=>{try{return await client.get(path)}catch(e){if(e.status===404)return null;throw e}};
const copy=v=>JSON.parse(JSON.stringify(v));
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text={zh:{title:'我的咖啡豆',collection:'全部咖啡豆',add:'添加咖啡豆',edit:'编辑记录',search:'搜索咖啡豆',roast:'烘焙度',process:'处理法',date:'烘焙日期',name:'咖啡豆名称',remaining:'剩余',gross:'含包装',unknown:'重量未记录',weigh:'称重校准',bag:'包装去皮',deducted:'包装已扣除',noneed:'净重',back:'返回',unlink:'不关联咖啡豆',use:'使用这支豆',empty:'还没有咖啡豆',start:'添加第一支豆',cancel:'取消',save:'保存',loading:'正在读取',error:'操作未完成',retry:'重试',net:'直接称咖啡豆',whole:'连包装一起称',choose:'选择称重方式',calibrationOrder:'取豆前或这杯做完后再称',grossHint:'可稍后扣除空包装',grossLabel:'整袋',bagLabel:'包装',netLabel:'净重',estimated:'估算剩余',estimatedGross:'估算 · 含包装',netZero:'放上空容器，再清零',grossZero:'保持秤面空置，再清零',bagZero:'保持秤面空置，再清零',zero:'清零',manualZero:'已在外部秤清零',manual:'蓝牙秤不可用，请使用外部秤',putNet:'把咖啡豆倒入已清零的容器',putGross:'放上整袋咖啡豆',putBag:'放上同类型空包装袋',read:'读取秤重',weight:'重量',netSaved:'保存净重',grossSaved:'保存含包装重量',bagSaved:'扣除包装重量',rezero:'重新清零',readFirst:'请读取秤重，或输入外部秤读数',invalid:'请输入 0–10000 g 的有效重量',bagInvalid:'包装重量必须小于整袋重量',changed:'记录已在其他页面修改，请重新打开后操作',unconfirmed:'保存结果未确认，请重新读取记录',unavailable:'秤未连接或读数已过期',nameRequired:'请填写咖啡豆名称',dated:'烘焙于',saved:'已保存',noDate:'未记录烘焙日期',inventoryCheck:'库存待校准',zeroFailed:'清零结果未确认，请检查秤上的读数后再决定是否重试'},en:{title:'My coffee',collection:'All coffee',add:'Add coffee',edit:'Edit details',search:'Search coffee',roast:'Roast',process:'Process',date:'Roast date',name:'Coffee name',remaining:'Remaining',gross:'Including packaging',unknown:'Weight not recorded',weigh:'Update weight',bag:'Subtract packaging',deducted:'Packaging subtracted',noneed:'Net weight',back:'Back',unlink:'Continue without coffee',use:'Use this coffee',empty:'No coffees yet',start:'Add your first coffee',cancel:'Cancel',save:'Save',loading:'Loading',error:'Action failed',retry:'Retry',net:'Weigh beans only',whole:'Weigh the whole bag',choose:'How are you weighing?',calibrationOrder:'Weigh before taking beans for your next cup, or after brewing.',grossHint:'You can subtract the empty packaging later.',grossLabel:'Full bag',bagLabel:'Packaging',netLabel:'Net weight',estimated:'Estimated remaining',estimatedGross:'Est. incl. bag',netZero:'Place the empty container on the scale, then tare',grossZero:'Clear the scale, then tare',bagZero:'Clear the scale, then tare',zero:'Tare scale',manualZero:'External scale is tared',manual:'Bluetooth scale unavailable. Use an external scale.',putNet:'Add beans to the tared container',putGross:'Place the full bag on the scale',putBag:'Place an empty bag of the same type on the scale',read:'Read scale',weight:'Weight',netSaved:'Save net weight',grossSaved:'Save total weight',bagSaved:'Subtract packaging',rezero:'Tare again',readFirst:'Read the scale or enter an external scale reading',invalid:'Enter a weight from 0 to 10,000 g',bagInvalid:'Packaging must weigh less than the full bag',changed:'This record changed elsewhere. Reopen it before saving.',unconfirmed:'Save not confirmed. Reload the record.',unavailable:'Scale disconnected or reading is stale',nameRequired:'Enter a coffee name',dated:'Roasted',saved:'Saved',noDate:'Roast date not recorded',inventoryCheck:'Check remaining weight',zeroFailed:'Tare was not confirmed. Check the scale reading before trying again.'}};
export function updateBeanWeight(bean,mode,value){
 if(value===null||value===undefined||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>10000)throw new Error('invalid');
 const weight=Math.round(Number(value)*10)/10,next={...bean};
 if(mode==='net'){Object.assign(next,{weight,weightKind:'net',gross:null,packaging:null});}
 else if(mode==='gross'){Object.assign(next,{weight,weightKind:'gross',gross:weight,packaging:null});}
 else if(mode==='bag'){
  if(bean.weightKind!=='gross'||!Number.isFinite(bean.gross))throw new Error('changed');
  if(weight>=bean.gross)throw new Error('bagInvalid');
  Object.assign(next,{weight:Math.round((bean.gross-weight)*10)/10,weightKind:'net',packaging:weight});
 }else throw new Error('invalid');
 next._weightUpdate={mode,value:weight};
 return next;
}
export function normalizeBeanStore(value){
 if(value==null)return {version:1,beans:[]};
 if(value.version!==1||!Array.isArray(value.beans)||value.beans.some(b=>!b||typeof b.id!=='string'||typeof b.name!=='string'))throw new Error('Invalid bean store');
 return copy(value);
}
// Decaid emits host-local ISO timestamps without an offset. Keep that wall-clock
// domain deterministic: append Z only for arithmetic, never infer the browser's
// timezone. Explicit offsets continue to represent real instants.
const naiveTimestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value);
const timestamp=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(value))return null;
 const parsed=Date.parse(naiveTimestamp(value)?value+'Z':value);
 return Number.isFinite(parsed)?parsed:null;
};
const canonicalTimestamp=(value,delta=0)=>{
 const parsed=timestamp(value);if(parsed===null)return null;
 const iso=new Date(parsed+delta).toISOString();
 return naiveTimestamp(value)?iso.slice(0,-1):iso;
};
const validId=value=>typeof value==='string'&&value.trim().length>0&&value.length<=512&&!/[\u0000-\u001f]/.test(value);
const round=value=>Math.round(value*10)/10;
const rawBean=bean=>{if(!bean)return null;const value=copy(bean._inventory?.base??bean);delete value._inventory;delete value._weightUpdate;return value};
async function readUsage(client){
 const records=await readOptional(client,USAGE+'?full=1');
 if(records!=null&&(typeof records!=='object'||Array.isArray(records)))throw new Error('Invalid bean usage store');
 for(const [id,event] of Object.entries(records??{}))if(!event||event.version!==1||event.shotId!==id||!validId(id)||!validId(event.beanId)||typeof event.dose!=='number'||!Number.isFinite(event.dose)||event.dose<=0||event.dose>10000)throw new Error('Invalid bean usage store');
 return records??{};
}
function hostNow(client){
 const host=timestamp(client.snapshot?.machine?.timestamp),received=client.lastMachineAt,age=Date.now()-received;
 return host!==null&&typeof received==='number'&&Number.isFinite(age)&&age>=0&&age<=15000&&!client.connection?.stale?canonicalTimestamp(client.snapshot.machine.timestamp,age):null;
}
function applyUsage(bean,events){
 const base=rawBean(bean),entries=Object.values(events).filter(e=>e.beanId===base.id);
 if(!entries.length)return base;
 const included=new Set(Array.isArray(base.consumptionIncluded)?base.consumptionIncluded:[]),cutoff=timestamp(base.weightCalibratedAt);
 let total=0;const applied=[],pending=[];
 for(const event of entries){
  if(included.has(event.shotId))continue;
  const at=timestamp(event.shotTimestamp);
  if(at===null||base.weightCalibrationTimeUnknown===true){pending.push(event.shotId);continue;}
  if(cutoff!==null&&at<=cutoff)continue;
  total+=event.dose;applied.push(event.shotId);
 }
 const result=copy(base),known=typeof base.weight==='number'&&Number.isFinite(base.weight);
 if(known)result.weight=round(Math.max(0,base.weight-total));
 if(typeof base.gross==='number'&&Number.isFinite(base.gross))result.gross=round(Math.max(0,base.gross-total));
 result._inventory={base,eventIds:entries.map(e=>e.shotId).sort(),appliedIds:applied.sort(),pendingIds:pending.sort(),consumed:round(total),insufficient:known&&total>base.weight};
 return result;
}
/** Legacy inventory stays read-only; each edited bean gets its own native KV key. */
export async function loadBeanStore(client){
 const [oldValue,records,usage]=await Promise.all([readOptional(client,STORE),readOptional(client,RECORDS+'?full=1'),readUsage(client)]);
 const legacy=normalizeBeanStore(oldValue),merged=new Map(legacy.beans.map(bean=>[bean.id,bean]));
 if(records!=null&&(typeof records!=='object'||Array.isArray(records)))throw new Error('Invalid bean store');
 for(const [key,bean] of Object.entries(records??{})){
  if(!bean||typeof bean.id!=='string'||typeof bean.name!=='string'||key!==bean.id)throw new Error('Invalid bean store');
  merged.set(bean.id,copy(bean));
 }
 return {version:1,beans:[...merged.values()].map(bean=>applyUsage(bean,usage))};
}
export async function saveBeanRecord(client,expected,next){
 normalizeBeanStore({version:1,beans:[next]});
 if(expected&&expected.id!==next.id)throw new Error('changed');
 const path=recordPath(next.id),baseline=rawBean(expected);
 let current=await readOptional(client,path);
 if(current==null)current=normalizeBeanStore(await readOptional(client,STORE)).beans.find(bean=>bean.id===next.id)??null;
 if(expected?JSON.stringify(current)!==JSON.stringify(baseline):current!==null)throw new Error('changed');
 // Strip view-only balances. Editing a name must not write a deducted balance
 // as a fresh baseline and then deduct the same events again on the next read.
 const persisted={...rawBean(next),...copy(next)};delete persisted._inventory;delete persisted._weightUpdate;
 const op=next._weightUpdate;
 if(op?.mode==='net'||op?.mode==='gross'){
  const usage=await readUsage(client),at=hostNow(client);
  const ids=Object.values(usage).filter(e=>e.beanId===next.id).map(e=>e.shotId).sort();
  if(expected&&JSON.stringify(ids)!==JSON.stringify(expected._inventory?.eventIds??[]))throw new Error('changed');
  persisted.consumptionIncluded=ids;
  persisted.weightCalibratedAt=at;persisted.weightCalibrationTimeUnknown=at===null;
 }else if(op?.mode==='bag'&&baseline){
  // Packaging is not a new weighing of the remaining beans. Retain the original
  // calibration boundary and apply the bag subtraction before event deductions.
  const changed=updateBeanWeight(baseline,'bag',op.value);
  for(const key of ['weight','weightKind','gross','packaging'])persisted[key]=changed[key];
 }else if(expected?._inventory){
  for(const key of ['weight','weightKind','gross','packaging']){if(key in baseline)persisted[key]=baseline[key];else delete persisted[key];}
 }
 // Native KV has no compare-and-set. A same-bean race after this check remains
 // possible; per-bean keys prevent unrelated beans from overwriting each other.
 await client.post(path,persisted);
 const confirmed=await readOptional(client,path);
 if(JSON.stringify(confirmed)!==JSON.stringify(persisted))throw new Error('unconfirmed');
 return loadBeanStore(client);
}
/** A stable per-shot event makes duplicate completion callbacks idempotent. */
export async function recordBeanConsumption(client,{shotId,beanId,dose,shotTimestamp}={}){
 if(!validId(shotId)||!validId(beanId)||typeof dose!=='number'||!Number.isFinite(dose)||dose<=0||dose>10000)throw new Error('invalidConsumption');
 if(timestamp(shotTimestamp)===null)throw new Error('consumptionTimeMissing');
 const event={version:1,shotId,beanId,dose,shotTimestamp:canonicalTimestamp(shotTimestamp)},path=usagePath(shotId);
 const same=other=>other?.version===event.version&&other.shotId===event.shotId&&other.beanId===event.beanId&&other.dose===event.dose&&timestamp(other.shotTimestamp)===timestamp(event.shotTimestamp);
 const inventory=await loadBeanStore(client);
 if(!inventory.beans.some(b=>b.id===beanId))throw new Error('beanNotFound');
 const existing=await readOptional(client,path);
 if(existing&&!same(existing))throw new Error('consumptionConflict');
 if(!existing){
  // No CAS exists in the native store: concurrent DIFFERENT payloads for this
  // same shot still require reconciliation. Callers must use the saved shot.
  try{await client.post(path,event)}catch(error){let read;try{read=await readOptional(client,path)}catch{throw error}if(!same(read))throw error;}
 }
 const confirmed=await readOptional(client,path);if(!same(confirmed))throw new Error('unconfirmed');
 const store=await loadBeanStore(client),bean=store.beans.find(b=>b.id===beanId);
 return {event:confirmed,alreadyRecorded:Boolean(existing),bean,needsCalibration:Boolean(bean?._inventory?.pendingIds.length||bean?._inventory?.insufficient)};
}
/** getScale(): {connected, stale, weight, tare: async()=>void}. No implicit device commands. */
export function mountBeans(container,{client,getScale=()=>({connected:false}),selectedId=null,onSelect=()=>{},onClose=()=>{},onError=()=>{},locale='zh'}={}){
 if(!container||!client)throw new Error('Bean container and client required');
 const lang=String(typeof locale==='function'?locale():locale).startsWith('en')?'en':'zh',t=k=>text[lang][k]||k;
 const root=document.createElement('section');root.className='beans-overlay';root.lang=lang;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',t('title'));container.append(root);
 let store={version:1,beans:[]},selected=selectedId,query='',busy=false,disposed=false,error='',view='main',draft=null,expected=null,cal=null,loaded=false;
 const el=selector=>root.querySelector(selector);
 const selectedBean=()=>store.beans.find(b=>b.id===selected)||null;
 const btn=(label,action,cls='',disabled=false)=>`<button type="button" class="${cls}" data-bean-action="${action}" ${disabled?'disabled':''}>${label}</button>`;
 const scale=()=>getScale()||{};
 const scaleReady=()=>{const s=scale();return s.connected&&!s.stale;};
 const errorText=e=>text[lang][e.message]||e.message||t('error');
 const weight=b=>Number.isFinite(b?.weight)?`${Number(b.weight).toLocaleString(lang==='zh'?'zh-CN':'en',{maximumFractionDigits:1})}<small> g</small>`:'—';
 function dismiss(){if(disposed)return;disposed=true;clearInterval(scaleTimer);document.removeEventListener('keydown',escapeKey,true);root.remove();onClose();}
 function close(){if(busy)return;dismiss();}
 function report(e){if(disposed)return;error=errorText(e);onError(error);}
 async function task(fn){if(busy||disposed)return;busy=true;error='';render();try{await fn();}catch(e){report(e);}finally{busy=false;if(!disposed)render();}}
 async function load(){await task(async()=>{store=await loadBeanStore(client);loaded=true;if(!store.beans.some(b=>b.id===selected))selected=store.beans[0]?.id||null;});}
 function form(){return `<div class="beans-sheet"><h2>${t(expected?'edit':'add')}</h2><form id="beanForm">${['name','roast','process','date'].map(k=>`<label>${t(k)}<input name="${k}" type="${k==='date'?'date':'text'}" lang="${lang}" value="${escape(draft[k])}" ${k==='name'?'required maxlength="160"':'maxlength="100"'}></label>`).join('')}<div class="beans-dialog-actions">${btn(t('cancel'),'cancel')}${btn(t('save'),'save','beans-primary',busy)}</div></form></div>`;}
 function weightPreview(){
  const gross=expected?.gross;let net=null;
  try{net=updateBeanWeight(expected,'bag',cal.value).weight;}catch{}
  const number=v=>Number.isFinite(v)?String(Math.round(v*10)/10):'—';
  const bag=String(cal?.value??'').trim()===''?null:Number(cal.value);
  return `<span><small>${t('grossLabel')}</small><b>${number(gross)} <em>g</em></b></span><i>−</i><span><small>${t('bagLabel')}</small><b>${number(bag)} <em>g</em></b></span><i>=</i><span class="beans-net-result"><small>${t('netLabel')}</small><b>${number(net)} <em>g</em></b></span>`;
 }
 function weighing(){
 const online=scaleReady()&&(cal.stage!=='weigh'||Number.isFinite(scale().weight)),mode=cal.mode,stage=cal.stage;
 if(stage==='choose')return `<div class="beans-sheet"><h2>${t('choose')}</h2><p>${t('calibrationOrder')}</p><div class="beans-choice">${btn(t('net'),'net','beans-soft')}${btn(t('whole')+'<small>'+t('grossHint')+'</small>','gross','beans-soft')}</div><div class="beans-dialog-actions">${btn(t('cancel'),'cancel')}</div></div>`;
 if(stage==='zero')return `<div class="beans-sheet"><h2>${t(mode==='net'?'netZero':mode==='bag'?'bagZero':'grossZero')}</h2>${!online?`<p>${t('manual')}</p>`:''}<div class="beans-dialog-actions">${btn(t('cancel'),'cancel')}${btn(t(online?'zero':'manualZero'),'zero','beans-primary',busy)}</div></div>`;
 return `<div class="beans-sheet"><h2>${t(mode==='net'?'putNet':mode==='bag'?'putBag':'putGross')}</h2>${mode==='gross'?`<p>${t('grossHint')}</p>`:''}<p data-scale-note ${online?'hidden':''}>${t('manual')}</p><label class="beans-weight-entry">${t(mode==='bag'?'bagLabel':'weight')} · g<input id="beanWeight" inputmode="decimal" type="number" min="0" max="10000" step="0.1" value="${escape(cal.value)}" placeholder="0.0"></label>${mode==='bag'?`<div class="beans-weight-preview" data-weight-preview aria-live="polite">${weightPreview()}</div>`:''}<div class="beans-dialog-actions beans-reading-actions">${btn(t('rezero'),'rezero')}${btn(t('read'),'read','beans-soft',!online||busy)}</div><div class="beans-dialog-actions">${btn(t('cancel'),'cancel')}${btn(t(mode==='net'?'netSaved':mode==='gross'?'grossSaved':'bagSaved'),'saveWeight','beans-primary',busy)}</div></div>`;
 }
 function render(){
 if(disposed)return;const b=selectedBean();
 root.innerHTML=`<div class="beans-stage"><header><span class="beans-brand">${brandMarkup()}</span><h1>${t('title')}</h1>${store.beans.length?btn('＋ '+t('add'),'add','beans-soft',!loaded||busy):'<span></span>'}</header><main><article class="beans-card${b?'':' is-empty'}">${b?`${btn('✎ '+t('edit'),'edit','beans-edit',busy)}<h2 class="beans-name${b.name.length>20?' is-long':''}" title="${escape(b.name)}">${escape(b.name)}</h2><p class="beans-description">${escape([b.roast,b.process].filter(Boolean).join(' · '))}</p><p class="beans-date">${b.date?t('dated')+' '+escape(b.date):t('noDate')}</p><svg class="beans-art" viewBox="65 465 525 315" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><image href="./assets/ceramic/beans-reference.png" x="0" y="0" width="1585" height="992" preserveAspectRatio="none"/></svg><div class="beans-card-actions"><div class="beans-remaining${Number.isFinite(b.weight)?'':' is-unmeasured'}"><span>${t(b.weightKind==='gross'?(b._inventory?.appliedIds?.length?'estimatedGross':'gross'):b._inventory?.appliedIds?.length?'estimated':'remaining')}</span><strong>${weight(b)}</strong>${!Number.isFinite(b.weight)?`<small>${t('unknown')}</small>`:b._inventory?.insufficient||b._inventory?.pendingIds.length?`<small>${t('inventoryCheck')}</small>`:''}</div><div class="beans-weigh-actions">${btn('<svg class="beans-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 5h18a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4ZM11 9l-5 18h20L21 9Z"/><circle cx="16" cy="18" r="5"/><path d="m16 18 2-3"/></svg><span class="beans-action-label">'+t('weigh')+'</span>','weigh','beans-soft',busy)}${b.weightKind==='gross'?btn('<span class="beans-action-label">'+t('bag')+'</span>','bag','beans-soft',busy):Number.isFinite(b.weight)?`<span class="beans-weight-kind">✓ ${t(b.packaging!=null?'deducted':'noneed')}</span>`:''}</div></div>`:`<div class="beans-empty"><h2>${t(loaded?'empty':'loading')}</h2>${loaded?btn(t('start'),'add','beans-primary'):''}</div>`}</article><aside><h2>${t('collection')}</h2>${store.beans.length?`<input class="beans-search" aria-label="${t('search')}" placeholder="${t('search')}" value="${escape(query)}">`:''}<div class="beans-list">${store.beans.filter(b=>b.name.toLowerCase().includes(query.trim().toLowerCase())).map(item=>`<button data-bean-id="${escape(item.id)}" class="${item.id===selected?'selected':''}"><span><b title="${escape(item.name)}">${escape(item.name)}</b><small>${escape([item.roast,item.process].filter(Boolean).join(' · '))}</small></span><span class="beans-list-weight">${Number.isFinite(item.weight)?weight(item):`<small class="beans-unknown-weight">${t('unknown')}</small>`}${item.weightKind==='gross'?`<small class="beans-stock-status">${t(item._inventory?.appliedIds?.length?'estimatedGross':'gross')}</small>`:item._inventory?.appliedIds?.length?`<small class="beans-stock-status">${t('estimated')}</small>`:''}</span>${item.id===selected?'<i>✓</i>':''}</button>`).join('')}</div></aside></main><footer>${btn('‹ '+t('back'),'back')}${btn(t('unlink'),'unlink','beans-unlink')}${btn('✓ '+t('use'),'use','beans-primary',!b||busy)}</footer>${busy?`<div class="beans-busy" role="status">${t('loading')}…</div>`:''}</div>${view!=='main'?`<div class="beans-modal">${view==='form'?form():weighing()}</div>`:''}${error?`<div class="beans-error" role="alert">${escape(error)}${!loaded?btn(t('retry'),'reload'):''}</div>`:''}`;
 }
 root.addEventListener('input',e=>{
 if(e.target.matches('.beans-search')){query=e.target.value;const start=e.target.selectionStart;render();el('.beans-search').focus();el('.beans-search').setSelectionRange(start,start);}
 if(e.target.id==='beanWeight'){cal.value=e.target.value;const preview=el('[data-weight-preview]');if(preview)preview.innerHTML=weightPreview();}
 if(e.target.closest('#beanForm'))draft[e.target.name]=e.target.value;
 });
 root.addEventListener('submit',e=>{e.preventDefault();saveForm();});
 async function saveForm(){if(!draft.name?.trim()){error=t('nameRequired');render();return;}await task(async()=>{const next={...draft,name:draft.name.trim(),updatedAt:new Date().toISOString()};store=await saveBeanRecord(client,expected,next);selected=next.id;view='main';});}
 root.addEventListener('click',async e=>{
 const row=e.target.closest('[data-bean-id]');if(row&&!busy){selected=row.dataset.beanId;render();return;}
 const a=e.target.closest('[data-bean-action]')?.dataset.beanAction;if(!a||busy)return;error='';
 if(a==='back'){guardDismissClick(e);close();return;}
 if(a==='reload'){await load();return;}
 if(a==='use'||a==='unlink'){await task(async()=>{await onSelect(a==='use'?copy(selectedBean()):null);});if(!error){guardDismissClick(e);close();}return;}
 if(a==='add'||a==='edit'){expected=a==='edit'?copy(selectedBean()):null;draft=expected?copy(expected):{id:globalThis.crypto?.randomUUID?.()||`bean-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:'',roast:'',process:'',date:'',weight:null,weightKind:'unknown',gross:null,packaging:null};view='form';}
 if(a==='save'){await saveForm();return;}
 if(a==='cancel'){guardDismissClick(e);view='main';cal=null;draft=null;}
 if(a==='weigh'||a==='bag'){expected=copy(selectedBean());if(!expected||a==='bag'&&expected.weightKind!=='gross')return;cal={mode:a==='bag'?'bag':null,stage:a==='bag'?'zero':'choose',value:''};view='weigh';}
 if(a==='net'||a==='gross'){cal.mode=a;cal.stage='zero';}
 if(a==='rezero'){cal.stage='zero';cal.value='';}
 if(a==='zero'){await task(async()=>{if(scaleReady()){const s=scale();if(typeof s.tare!=='function')throw new Error('zeroFailed');try{await s.tare();}catch{throw new Error('zeroFailed');}}cal.stage='weigh';cal.value='';});return;}
 if(a==='read'){const s=scale();if(!scaleReady()||!Number.isFinite(s.weight))error=t('unavailable');else cal.value=String(s.weight);}
 if(a==='saveWeight'){await task(async()=>{const next=updateBeanWeight(expected,cal.mode,cal.value);next.updatedAt=new Date().toISOString();store=await saveBeanRecord(client,expected,next);view='main';cal=null;});return;}
 render();
 });
 function escapeKey(e){if(e.key!=='Escape'||busy||disposed)return;e.preventDefault();e.stopImmediatePropagation();if(view==='main')close();else{view='main';cal=null;draft=null;error='';render();}}
 document.addEventListener('keydown',escapeKey,true);
 // Refresh availability without replacing the user's partially entered weight or focus.
 const scaleTimer=setInterval(()=>{if(disposed||view!=='weigh'||cal?.stage!=='weigh')return;const online=scaleReady()&&Number.isFinite(scale().weight),read=el('[data-bean-action=read]'),note=el('[data-scale-note]');if(read)read.disabled=!online||busy;if(note)note.hidden=online;},250);
 render();load();return {close,dismiss,refresh:load};
}
