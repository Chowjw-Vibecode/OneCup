import {openFlavorWheel} from './flavor-wheel.js?v=0.2.33';
import {mountSteamPitcher} from './steam-pitcher.js?v=0.2.33';
import {stageLabel} from './stage-labels.js?v=0.2.33';
import {guardDismissClick} from './dismiss-guard.js?v=0.2.33';
import {mountBeans} from './beans.js?v=0.2.33';
import {paintGauge} from './instruments.js?v=0.2.33';
import {setGroupHeadHint} from './ghc-icons.js?v=0.2.33';
import {mountProfileEditor} from './profile-editor.js?v=0.2.33';
export function mountCeramic(api){
 const $=id=>document.getElementById(id),s=api.state;
 const pitcherPrompt=mountSteamPitcher(api);
 const copy=x=>structuredClone(x),n=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v),fmt=v=>n(v)===null?'—':String(Math.round(v*10)/10),ratioFmt=v=>n(v)===null?'—':String(Math.round(v*100)/100);
 const zh=()=>s.language==='zh',text=(a,b)=>zh()?a:b;
 let feedback={like:null,acid:null,sweet:null,bitter:null,note:'',flavors:[]},feedbackId=null,feedbackBaseline=null,nativeBaseline=null,pendingFeedbackStore=null,feedbackLoaded=false,feedbackDirty=false,feedbackBusy=false,feedbackClient=null,feedbackLoading=false,feedbackLoadAttempted=false,feedbackDraftOwned=false,feedbackEpoch=0,feedbackRecovering=false,steam=null,steamBase=null,steamSince=null,steamFinished=null,steamOriginKnown=false,lastReadyAt=0,adjustBefore=null,beansPanel=null,profileEditor=null,operationRevision=0;
 const words={pressureLegend:['压力 · bar','Pressure · bar'],flowLegend:['流速 · mL/s','Flow · mL/s'],temperatureLegend:['咖啡温度 · °C','Coffee temp · °C'],cupFlowLegend:['杯流 · g/s','Cup flow · g/s'],targetLegend:['目标 / 限制','Target / limit'],dose:['粉量','Dose'],actualYield:['实际出液','Yield'],totalTime:['总时间','Total time'],ratio:['粉液比','Ratio'],setDuration:['设定时长','Duration'],steamTemperature:['蒸汽温度','Steam temp'],steamFlow:['蒸汽流量','Steam flow'],steamDuration:['设定时长','Duration'],applySteam:['应用参数','Apply settings'],startSteam:['开始蒸汽','Start steam'],coffee:['咖啡豆','Coffee beans'],adjustCup:['调整这一杯','Adjust this cup'],coffeeTemperature:['咖啡温度','Coffee temperature'],cupWeight:['杯重 · g','Cup weight · g'],elapsed:['经过时间','Elapsed'],cupFeeling:['这一杯的感受','Tasting notes'],optional:['选填','Optional'],acid:['酸','Acidity'],sweet:['甜','Sweetness'],bitter:['苦','Bitterness'],oneNote:['一句笔记','Tasting note'],saveReview:['保存评价','Save notes'],finish:['结束','Done'],repeat:['照这杯再做','Repeat this cup'],tweak:['微调这杯','Adjust next cup'],changeProfile:['换个方案','Change profile'],hotWater:['热水','Hot water'],grinding:['研磨','Grind'],settings:['设置','Settings']};
 function runtimeNotice(detail){
  document.querySelector('.ceramic-runtime-notice')?.remove();const box=document.createElement('div');box.className='ceramic-runtime-notice';box.setAttribute('role','alert');box.textContent=detail;box.style.cssText='position:fixed;top:90px;left:15%;max-width:70%;padding:12px 20px;background:#fff8ef;color:#743c20;border-radius:12px;z-index:20001;pointer-events:none';document.body.append(box);setTimeout(()=>box.remove(),10000);
 }
 function presentMessage(box){if(api.running())return false;box.style.setProperty('position','fixed','important');box.style.setProperty('inset','0','important');box.style.setProperty('z-index','20000','important');document.body.append(box);}
 function message(title,detail,retry){
  if(api.running()){runtimeNotice(detail);return;}
  document.querySelector('.ceramic-message')?.remove();const box=document.createElement('div');box.className='overlay ceramic-message';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  const panel=document.createElement('section');panel.className='dialog';const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=detail;panel.append(h,p);
  const close=document.createElement('button');close.className='button secondary';close.textContent=text('取消','Cancel');close.onclick=e=>{guardDismissClick(e);box.remove()};panel.append(close);
  if(retry){const b=document.createElement('button');b.className='button primary';b.textContent=text('重试','Retry');b.onclick=()=>{box.remove();retry()};panel.append(b)}box.append(panel);presentMessage(box);close.focus();
 }
 function error(e,retry){let detail=api.explainError?.(e)||e.message||String(e);if(!zh()&&/[\u3400-\u9fff]/u.test(detail))detail='The action could not be completed. Please try again.';message(text('操作未完成','Action not completed'),detail,retry)}
 function feedbackDraftKey(id=s.runId,client=api.client){return 'thiscup.tastingDraft:'+JSON.stringify([String(client?.base||client?.baseUrl||location.search),id])}
 function feedbackEditable(){return Boolean(s.runId&&feedbackId===s.runId&&feedbackClient===api.client)}
 function changedFeedback(){feedbackDirty=true;feedbackDraftOwned=true;renderFeedback()}
 function loadFeedback(readHistory=true){
  const id=s.runId,client=api.client;
  if(feedbackId!==id||feedbackClient!==client){
   feedbackEpoch++;feedbackId=id;feedbackClient=client;feedbackBusy=false;feedbackLoaded=false;feedbackLoading=false;feedbackLoadAttempted=false;feedbackDirty=false;feedbackDraftOwned=false;feedbackBaseline=null;nativeBaseline=null;pendingFeedbackStore=null;
   feedback={like:null,acid:null,sweet:null,bitter:null,note:'',flavors:[],bean:s.runWorkflow?.context?.coffeeName?{id:s.runWorkflow.context.extras?.thisCupBeanId??null,name:s.runWorkflow.context.coffeeName}:null};
   try{const draft=id?JSON.parse(sessionStorage.getItem(feedbackDraftKey(id,client))||'null'):null;if(draft?.shotId===id&&draft?.localDraft===true){feedback={...feedback,...draft.feedback};feedbackDraftOwned=true}}catch{}
   $('ceramicNote').value=feedback.note||'';
  }
  // An aborted/preheat-only run has no history record. Its tasting controls
  // still work, but only an explicitly labelled local draft can be saved.
  if(!readHistory||!id||s.lastShot?.id!==id||feedbackLoaded||feedbackLoading||feedbackLoadAttempted)return;
  feedbackLoading=true;feedbackLoadAttempted=true;const epoch=feedbackEpoch;
  Promise.all([client.get(`/store/thiscup/tasting-${encodeURIComponent(id)}`),Promise.resolve(copy(s.lastShot))]).then(([r,shot])=>{
   if(epoch!==feedbackEpoch||feedbackId!==id||s.runId!==id||client!==api.client)return;
   feedbackBaseline=copy(r??null);nativeBaseline=copy(shot.annotations??{});
   // A delayed store response must never overwrite edits or a saved draft.
   if(!feedbackDraftOwned){if(r&&r.shotId===id)feedback={...feedback,...r};feedback.note=nativeBaseline.espressoNotes??feedback.note;feedback.like=nativeBaseline.enjoyment==null?feedback.like:nativeBaseline.enjoyment>=8?'like':nativeBaseline.enjoyment>=4?'neutral':'dislike';$('ceramicNote').value=feedback.note||'';}
   else feedbackDirty=true;
   feedbackLoaded=true;feedbackLoading=false;renderFeedback();
  }).catch(e=>{if(epoch===feedbackEpoch&&feedbackId===id&&s.runId===id&&client===api.client){feedbackLoading=false;renderFeedback();error(e,()=>{feedbackLoadAttempted=false;loadFeedback()})}});
 }
 function renderFeedback(){
  if(flavorPanel&&feedbackLoading){flavorPanel.close();flavorPanel=null;flavorContext=null;}
  const inventory=$('ceramicRetryInventory');if(inventory){inventory.hidden=!(s.inventorySync?.id===s.runId&&s.inventorySync.client===api.client&&s.inventorySync.status==='error');inventory.textContent=text('重试扣豆','Retry inventory');inventory.disabled=api.running();}

  const retry=$('ceramicRetryShot');if(retry){retry.hidden=Boolean(feedbackLoaded||!s.runId||!api.retryFinishedShot);retry.disabled=feedbackRecovering||feedbackBusy||feedbackLoading||s.loadingFinishedId===s.runId;retry.textContent=text(retry.disabled?'读取中…':'重新读取记录',retry.disabled?'Loading…':'Reload shot');}

  $('ceramicNote').disabled=feedbackBusy||!feedbackEditable();
  $('ceramicBeans').disabled=api.running()||feedbackBusy;
  document.querySelectorAll('[data-ceramic-like],[data-ceramic-clear],.ceramic-sensory input,#ceramicFlavors').forEach(el=>el.disabled=feedbackBusy||!feedbackEditable());
  if($('ceramicFlavors'))$('ceramicFlavors').disabled=feedbackBusy||feedbackLoading||feedbackRecovering||!feedbackEditable();
  if($('ceramicFlavorCount'))$('ceramicFlavorCount').textContent=feedback.flavors.length?String(feedback.flavors.length):'';
  document.querySelectorAll('[data-ceramic-like]').forEach((b,i)=>{b.classList.toggle('selected',feedback.like===b.dataset.ceramicLike);b.setAttribute('aria-pressed',String(feedback.like===b.dataset.ceramicLike));b.textContent=text(['喜欢','还好','不喜欢'][i],['Loved it','Okay','Not for me'][i])});
  for(const key of ['acid','sweet','bitter']){let el=$('ceramic'+key[0].toUpperCase()+key.slice(1));el.value=feedback[key]??3;el.classList.toggle('unset',feedback[key]===null);el.title=feedback[key]===null?text('未记录','Not rated'):String(feedback[key]);el.setAttribute('aria-valuetext',el.title);const labels={acid:['酸','Acidity'],sweet:['甜','Sweetness'],bitter:['苦','Bitterness']},label=text(...labels[key]);el.setAttribute('aria-label',label);document.querySelector(`[data-ceramic-clear="${key}"]`).setAttribute('aria-label',text('清除'+label+'记录','Clear '+label.toLowerCase()+' rating'));el.parentElement.querySelectorAll('small').forEach((e,i)=>e.textContent=text(i?'强':'弱',i?'High':'Low'));}
  $('ceramicSaveTaste').disabled=!feedbackEditable()||feedbackBusy||!feedbackDirty;
  $('ceramicSaveTaste').textContent=feedbackLoaded?text('保存评价','Save notes'):text('保存本地草稿','Save local draft');
  $('ceramicSaveTaste').title=feedbackLoaded?'':text('本杯尚无历史记录，草稿仅保存在当前浏览器标签页','No history record yet. This draft stays in this browser tab.');
 }
 async function saveFeedback(){if(!feedbackEditable()||feedbackBusy)return false;feedbackBusy=true;renderFeedback();const id=s.runId,client=api.client,original=JSON.stringify(feedback),payload={...copy(feedback),shotId:id,bean:feedback.bean??null};try{
  if(!feedbackLoaded||s.lastShot?.id!==id){
   const key=feedbackDraftKey(id,client),draft=JSON.stringify({shotId:id,localDraft:true,feedback:copy(feedback)});
   sessionStorage.setItem(key,draft);if(sessionStorage.getItem(key)!==draft)throw Error(text('本地草稿未能保存','The local draft could not be saved'));
   feedbackDirty=false;feedbackDraftOwned=true;api.notice(text('草稿已保存在本页，尚未写入历史记录','Draft saved in this tab; not saved to shot history'));return true;
  }
  const path=`/store/thiscup/tasting-${encodeURIComponent(id)}`,current=()=>feedbackId===id&&s.runId===id&&feedbackClient===client&&api.client===client;
  const [latest,shotBefore]=await Promise.all([client.get(path),client.shot(id)]);
  if(!current())return false;
  if(pendingFeedbackStore&&JSON.stringify(latest??null)===JSON.stringify(pendingFeedbackStore))feedbackBaseline=copy(latest);
  if(JSON.stringify(latest??null)!==JSON.stringify(feedbackBaseline))throw Error(text('评价已在其他页面修改，请重新打开这一杯后保存','These notes changed elsewhere. Reopen this shot before saving.'));
  const oldNote=nativeBaseline?.espressoNotes??'',oldEnjoy=nativeBaseline?.enjoyment??null;
  const originalLike=oldEnjoy==null?(feedbackBaseline?.like??null):oldEnjoy>=8?'like':oldEnjoy>=4?'neutral':'dislike';
  const noteChanged=payload.note!==oldNote,likeChanged=payload.like!==originalLike,annotations=shotBefore.annotations??{};
  const intendedEnjoy=payload.like===null?null:{like:10,neutral:5,dislike:0}[payload.like];
  if(noteChanged&&(annotations.espressoNotes??'')!==oldNote&&(annotations.espressoNotes??'')!==payload.note||likeChanged&&(annotations.enjoyment??null)!==oldEnjoy&&(annotations.enjoyment??null)!==intendedEnjoy)throw Error(text('历史评价已更新，请重新打开这一杯后保存','This shot’s notes changed elsewhere. Reopen it before saving.'));
  const patch={};if(noteChanged){if((annotations.espressoNotes??'')!==payload.note)patch.espressoNotes=payload.note;}else payload.note=annotations.espressoNotes??'';
  if(likeChanged){if((annotations.enjoyment??null)!==intendedEnjoy)patch.enjoyment=intendedEnjoy;}
  else {const v=annotations.enjoyment;payload.like=v==null?null:v>=8?'like':v>=4?'neutral':'dislike';}
  if(Object.keys(patch).length)await client.put(`/shots/${encodeURIComponent(id)}`,{annotations:patch});
  const shot=await client.shot(id);if(!current())return false;if(Object.entries(patch).some(([k,v])=>(shot.annotations?.[k]??null)!==v))throw Error(text('历史笔记未确认','History note was not confirmed'));
  // The native annotation write may succeed even if the following store write fails.
  // Advance its baseline after readback so retrying does not conflict with our own write.
  if(feedbackId===id&&api.client===client)nativeBaseline=copy(shot.annotations??{});
  pendingFeedbackStore=copy(payload);
  await client.post(path,payload);
  const read=await client.get(path);if(!current())return false;if(JSON.stringify(read)!==JSON.stringify(payload))throw Error(text('读回不一致，评价尚未确认保存','Notes could not be verified'));
  if(feedbackId===id&&api.client===client){feedbackBaseline=copy(read);nativeBaseline=copy(shot.annotations??{});pendingFeedbackStore=null;}
  if(feedbackId===id&&s.runId===id&&api.client===client&&JSON.stringify(feedback)===original){feedback=copy(payload);$('ceramicNote').value=feedback.note;feedbackDirty=false;feedbackDraftOwned=false;try{sessionStorage.removeItem(feedbackDraftKey(id,client))}catch{}api.notice(text('评价已保存','Notes saved'));}return true;
 }catch(e){if(feedbackId===id&&s.runId===id&&feedbackClient===client&&api.client===client)error(e);return false}finally{if(feedbackId===id&&feedbackClient===client&&api.client===client){feedbackBusy=false;renderFeedback()}}}
 function leave(next){if(feedbackBusy||api.running())return;const revision=operationRevision,id=s.runId,client=api.client;if(!feedbackDirty){next();return}const box=document.createElement('div');box.className='overlay ceramic-message';box.innerHTML=`<section class="dialog"><h2>${text('保存这一杯的感受？','Save your tasting notes?')}</h2><div class="dialog-footer"><button class="button secondary" data-choice="cancel">${text('返回','Back')}</button><button class="button secondary" data-choice="discard">${text('不保存','Discard')}</button><button class="button primary" data-choice="save">${text('保存','Save')}</button></div></section>`;presentMessage(box);let choosing=false;box.onclick=async e=>{const c=e.target.dataset.choice;if(!c||choosing)return;choosing=true;guardDismissClick(e);if(c==='cancel')box.remove();else if(c==='discard'){feedbackDirty=false;box.remove();next()}else if(await saveFeedback()){box.remove();if(operationRevision===revision&&s.runId===id&&api.client===client&&!api.running())next()}else choosing=false};}
 async function repeat(adjust=false){if(!api.editable())return;const revision=operationRevision,id=s.runId,client=api.client;try{if(!s.runWorkflow)throw Error(text('这杯的配方尚未读到','This shot’s recipe is unavailable'));const recipe={profile:copy(s.runWorkflow.profile),context:copy(s.runWorkflow.context)};if(adjust){openAdjust(recipe);return;}const expected=await client.get('/workflow');if(operationRevision!==revision||s.runId!==id||api.client!==client||!api.editable())return;const read=await client.saveWorkflow(recipe,expected);if(operationRevision!==revision||s.runId!==id||api.client!==client||api.running())return;api.setWorkflow(read);s.mode='ready';api.render();}catch(e){error(e)}}
 function openAdjust(recipe=null){if(!api.editable())return;adjustBefore={draft:copy(s.draft),mode:s.mode,revision:s.workflowRevision};s.ceramicDraftActive=true;if(recipe){s.draft={...copy(s.workflow),...recipe};s.mode='ready';}api.openDialog('ceramicAdjustDialog')}
 $('ceramicAdjust').onclick=()=>openAdjust();
 $('profileDetails').onclick=()=>{
  if(!api.editable()||!s.draft?.profile)return;
  const modal=s.modal; if(modal)$(modal).hidden=true;s.modal=null;
  profileEditor=mountProfileEditor(document.body,{profile:s.draft.profile,locale:s.language,onSave:profile=>{
   api.setProfileDraft(profile);
   if(profile.target_weight!==undefined)s.draft.context={...s.draft.context,targetYield:profile.target_weight};
   api.openDialog('ceramicAdjustDialog');
  },onCancel:()=>api.openDialog(modal||'ceramicAdjustDialog')});
 };

 $('ceramicEnd').onclick=()=>leave(()=>{
  // History failures belong to this cup, not to the next preparation screen.
  const status=$('actionStatus');if(/^(历史|History)[:：]/.test(status?.textContent||'')){status.textContent='';status.classList.toggle('error',false);s.error='';}
  s.mode='ready';api.render();
 });
 $('ceramicRepeat').onclick=()=>leave(()=>repeat());$('ceramicTweak').onclick=()=>leave(()=>repeat(true));
 $('ceramicChangeProfile').onclick=()=>leave(()=>api.openProfiles());
 $('ceramicSaveTaste').onclick=saveFeedback;
 if($('ceramicRetryInventory'))$('ceramicRetryInventory').onclick=()=>api.retryInventory?.();
 if($('ceramicRetryShot'))$('ceramicRetryShot').onclick=async()=>{if(feedbackRecovering||feedbackBusy||feedbackLoading||!feedbackEditable()||!api.retryFinishedShot)return;feedbackRecovering=true;renderFeedback();try{await api.retryFinishedShot();loadFeedback();}catch(e){error(e)}finally{feedbackRecovering=false;renderFeedback()}};

 document.querySelectorAll('[data-ceramic-like]').forEach(b=>b.onclick=()=>{feedback.like=feedback.like===b.dataset.ceramicLike?null:b.dataset.ceramicLike;changedFeedback()});
 for(const key of ['acid','sweet','bitter']){$('ceramic'+key[0].toUpperCase()+key.slice(1)).oninput=e=>{feedback[key]=Number(e.target.value);changedFeedback()};document.querySelector(`[data-ceramic-clear="${key}"]`).onclick=()=>{feedback[key]=null;changedFeedback()};}
 const flavorButton=document.createElement('button');flavorButton.id='ceramicFlavors';flavorButton.className='ceramic-flavors-button';
 $('ceramicNote').before(flavorButton);
 let flavorPanel=null,flavorContext=null;
 flavorButton.onclick=()=>{
  if(feedbackBusy||feedbackLoading||feedbackRecovering||!feedbackEditable()||api.running())return;
  flavorPanel?.close();
  const context={id:s.runId,client:api.client,epoch:feedbackEpoch,revision:operationRevision};flavorContext=context;
  flavorPanel=openFlavorWheel({values:feedback.flavors,locale:s.language,onClose:()=>{flavorPanel=null;flavorContext=null},onConfirm:values=>{
   if(context.id!==s.runId||context.client!==api.client||context.epoch!==feedbackEpoch||context.revision!==operationRevision||feedbackBusy||!feedbackEditable()||api.running())return;
   feedback.flavors=values;changedFeedback();render();
  }});
 };
 $('ceramicNote').oninput=e=>{feedback.note=e.target.value;changedFeedback()};
 $('ceramicBeans').onclick=()=>{if(api.running()||feedbackBusy)return;beansPanel=mountBeans(document.body,{client:api.client,locale:s.language,selectedId:s.mode==='finished'?feedback.bean?.id:s.workflow?.context?.extras?.thisCupBeanId??null,getScale:()=>({connected:s.connection.scaleConnected,stale:s.connection.scaleStale,weight:s.snapshot.scale?.weight,tare:()=>api.client.tare()}),onSelect:async b=>{
   if(feedbackBusy)throw Error(text('评价保存中，请稍候','Notes are being saved. Please wait.'));
   if(s.mode==='finished'){feedback.bean=b;changedFeedback()}
   else {const base=await api.client.get('/workflow');const read=await api.client.saveWorkflow({context:{...base.context,coffeeName:b?.name||'',coffeeRoaster:'',extras:{...base.context?.extras,thisCupBeanId:b?.id??null}}},base);s.ceramicBean=b;api.updateAux(read)}
   api.render();
  },onError:m=>api.notice(m,true)})};
 const steamKeys={temperature:'targetTemperature',flow:'flow',duration:'duration'};
 let steamPurgeValue=null,steamPurgeBusy=false,steamPurgeRevision=0,steamPurgeClient=null,steamPurgeObservedClient=null,steamPurgeObservedReady=false,steamPurgeRead=null,steamPurgePending=null;
 const steamPurgeReady=()=>s.connection.connected===true&&!s.connection.stale&&s.connection.machineConnected&&api.machineState()==='idle'&&!api.running();
 const purgeRow=document.createElement('div');
 purgeRow.className='ceramic-steam-purge';
 purgeRow.innerHTML='<label for="ceramicSteamPurge"></label><input id="ceramicSteamPurge" type="checkbox" role="switch"><small></small><button id="ceramicSteamPurgeRetry" type="button"></button>';
 $('ceramicSteamMessage').before(purgeRow);
 const purgeSwitch=$('ceramicSteamPurge'),purgeRetry=$('ceramicSteamPurgeRetry');
 function renderSteamPurge(){
  const ready=steamPurgeReady(),changed=steamPurgeObservedClient!==api.client||steamPurgeObservedReady!==ready;
  steamPurgeObservedClient=api.client;steamPurgeObservedReady=ready;
  if(changed){
   steamPurgeValue=null;steamPurgeClient=null;++steamPurgeRevision;
   if(ready&&!steamPurgeBusy&&s.modal==='ceramicSteamDialog')Promise.resolve().then(()=>readSteamPurge());
  }
  const unknown=steamPurgeValue===null;
  purgeRow.querySelector('label').textContent=text('两次按键停止','Two-press stop');
  purgeRow.querySelector('small').textContent=steamPurgeBusy?text('正在保存…','Saving…'):unknown?text('状态未确认','Status unconfirmed'):text('开启：首次间歇喷汽，再按吹扫结束','On: first press starts steam puffs; second starts the final purge.');
  purgeSwitch.checked=(steamPurgeBusy?steamPurgePending:steamPurgeValue)===1;
  purgeSwitch.indeterminate=unknown&&!steamPurgeBusy;
  purgeSwitch.disabled=steamPurgeBusy||unknown||steamPurgeClient!==api.client||!ready;
  purgeRetry.textContent=text('重新读取','Read again');
  purgeRetry.hidden=!unknown||steamPurgeBusy;
  purgeRetry.disabled=!ready||!!steamPurgeRead;
  purgeRow.setAttribute('aria-busy',String(steamPurgeBusy||!!steamPurgeRead));
 }
 async function readSteamPurge(){
  if(steamPurgeBusy||!steamPurgeReady()||s.modal!=='ceramicSteamDialog')return;
  const client=api.client;
  if(steamPurgeRead?.client===client&&steamPurgeRead.revision===steamPurgeRevision)return;
  const revision=steamPurgeRevision,token={client,revision};steamPurgeRead=token;
  steamPurgeValue=null;steamPurgeClient=null;renderSteamPurge();
  try{const settings=await client.get('/machine/settings');if(revision!==steamPurgeRevision||client!==api.client||!steamPurgeReady())return;
   if(![0,1].includes(settings?.steamPurgeMode))throw Error(text('无法读取蒸汽停止设置','Steam stop setting is unavailable'));
   steamPurgeValue=settings.steamPurgeMode;steamPurgeClient=client;
  }catch(e){if(revision===steamPurgeRevision&&client===api.client)error(e)}finally{if(steamPurgeRead===token)steamPurgeRead=null;renderSteamPurge()}
 }
 purgeRetry.onclick=()=>readSteamPurge();
 purgeSwitch.onchange=async()=>{
  if(steamPurgeBusy||steamPurgeValue===null||steamPurgeClient!==api.client||!steamPurgeReady()){renderSteamPurge();return}
  const desired=purgeSwitch.checked?1:0,client=api.client,revision=++steamPurgeRevision;steamPurgeBusy=true;steamPurgePending=desired;renderSteamPurge();
  try{await client.exclusive(async()=>{
   const live=await client.requireIdle();
   if(live?.state?.state?.toLowerCase()!=='idle')throw Error(text('请等待机器待机后再修改','Wait until the machine is idle before changing this setting'));
   if(client!==api.client||revision!==steamPurgeRevision||!steamPurgeReady())return;
   await client.post('/machine/settings',{steamPurgeMode:desired});
   const read=await client.get('/machine/settings');
   if(client!==api.client||revision!==steamPurgeRevision||!steamPurgeReady())return;
   if(read?.steamPurgeMode!==desired)throw Error(text('设置未确认，请重新读取','Setting not confirmed. Read again to check.'));
   steamPurgeValue=desired;api.notice(text('蒸汽停止方式已保存','Steam stop mode saved'));
  });
  }catch(e){if(client===api.client&&revision===steamPurgeRevision){steamPurgeValue=null;steamPurgeClient=null;error(e)}}finally{steamPurgeBusy=false;steamPurgePending=null;renderSteamPurge();if((client!==api.client||revision!==steamPurgeRevision)&&s.modal==='ceramicSteamDialog'&&steamPurgeReady())readSteamPurge()}
 };
 function openSteam(){steamBase=copy(s.workflow);steam=copy(s.workflow?.steamSettings||{});api.openDialog('ceramicSteamDialog');renderSteam();readSteamPurge()}
 function renderSteam(){if(!$('ceramicSteamDialog'))return;renderSteamPurge();const running=api.machineState()==='steam',settings=running?s.workflow?.steamSettings:steam;
  document.querySelectorAll('[data-ceramic-steam-step]').forEach(b=>{const [key,direction]=b.dataset.ceramicSteamStep.split(':');b.setAttribute('aria-label',text(Number(direction)<0?'减少':'增加',Number(direction)<0?'Decrease ':'Increase ')+text(...words['steam'+key[0].toUpperCase()+key.slice(1)]));});
  for(const [k,v]of Object.entries(steamKeys))$('ceramicSteam'+k[0].toUpperCase()+k.slice(1)).textContent=fmt(settings?.[v]);
  const elapsed=running&&steamSince!==null?Math.max(0,(Date.now()-steamSince)/1000):steamFinished;
  const fraction=steamOriginKnown&&elapsed!==null&&settings?.duration>0?Math.min(1,elapsed/settings.duration):0;
  $('ceramicSteamArc').style.strokeDasharray=`${fraction*100} 100`;
  $('ceramicSteamArc').style.visibility=fraction>0?'visible':'hidden';
  $('ceramicSteamDurationNote').innerHTML=fmt(settings?.duration)+'<small>s</small>';$('ceramicSteamElapsed').innerHTML=elapsed!==null?fmt(elapsed)+'<small>s</small>':'—';
  const elapsedLabel=$('ceramicSteamDialog').querySelector('[data-ceramic-i18n=elapsed]');if(elapsedLabel)elapsedLabel.textContent=elapsed!==null&&!steamOriginKnown?text('接入后计时','Time since connection'):text(...words.elapsed);
  $('ceramicSteamActual').textContent=text('实际 ','Actual ')+fmt(s.snapshot.machine?.steamTemperature)+' °C';
  $('ceramicSteamApply').disabled=running||s.busy||!steam||JSON.stringify(steam)===JSON.stringify(s.workflow?.steamSettings);
  $('ceramicSteamStop').hidden=!running;
  $('ceramicSteamApply').hidden=running;
  $('ceramicSteamDialog').classList.toggle('is-running',running);
  $('ceramicSteamState').hidden=!running;
  $('ceramicSteamState').textContent=text('蒸汽中','Steaming');
  $('ceramicSteamDialog').querySelector('[data-close]').disabled=running;
  $('ceramicSteamStart').hidden=!api.canStart()||running;$('ceramicSteamStart').disabled=running||JSON.stringify(steam)!==JSON.stringify(s.workflow?.steamSettings);
  document.querySelectorAll('[data-ceramic-steam-step],[data-ceramic-steam-edit]').forEach(b=>b.disabled=running);
  setGroupHeadHint($('ceramicSteamMessage'),running||api.canStart()?'':text('应用参数后，按冲煮头蒸汽键开始','Apply settings, then press the group-head steam button'),'steam');
 }
 function steamValue(k,v){const limits={temperature:[135,160],flow:[.1,3],duration:[1,300]};if(!Number.isFinite(v)||v<limits[k][0]||v>limits[k][1])throw Error(text('数值超出范围','Value is out of range'));steam[steamKeys[k]]=Math.round(v*10)/10;renderSteam()}
 document.querySelectorAll('[data-ceramic-steam-step]').forEach(b=>b.onclick=()=>{const [k,d]=b.dataset.ceramicSteamStep.split(':');try{steamValue(k,Number(steam?.[steamKeys[k]])+Number(d)*(k==='flow'?.1:1))}catch(e){error(e)}});
 document.querySelectorAll('[data-ceramic-steam-edit]').forEach(b=>b.onclick=()=>api.openCustomNumber({value:steam?.[steamKeys[b.dataset.ceramicSteamEdit]],key:'steamSettings.'+steamKeys[b.dataset.ceramicSteamEdit],onSave:v=>steamValue(b.dataset.ceramicSteamEdit,v)}));
 $('ceramicSteamApply').onclick=async()=>{try{const read=await api.client.saveWorkflow({steamSettings:copy(steam)},steamBase);steamBase=copy(read);api.updateAux(read);api.notice(text('蒸汽参数已保存','Steam settings saved'));renderSteam()}catch(e){error(e)}};
 $('ceramicSteamStart').onclick=()=>api.command('steam');$('ceramicSteamStop').onclick=()=>api.command('stop');
 document.querySelector('[data-command="steam"]').onclick=openSteam;$('ceramicTasteSteam').onclick=openSteam;
 const tools=document.querySelector('.ceramic-tools');if(tools)$('settingsDialog').querySelector('.dialog-content').append(tools);
 let waterSince=null,waterLastSeen=null,waterState=null,waterKnown=false;
 const waterPanel=document.createElement('div');waterPanel.id='ceramicWaterRunning';waterPanel.hidden=true;
 waterPanel.innerHTML=`<div class="water-clock"><svg class="water-operation-icon" viewBox="0 0 48 48" aria-hidden="true"><use href="#i-drop"/></svg><span class="water-elapsed-label"></span><strong id="ceramicWaterElapsed">—</strong><small id="ceramicWaterCenterUnit"></small></div><div class="water-readings"><div><span class="water-temp-label"></span><strong id="ceramicWaterTarget">—</strong><small>°C</small></div><div><span class="water-amount-label"></span><strong id="ceramicWaterAmount">—</strong><small id="ceramicWaterUnit">mL</small></div><div><span class="water-flow-label"></span><strong id="ceramicWaterFlow">—</strong><small>mL/s</small></div></div>`;
 $('ceramicStateArt').append(waterPanel);
 function renderWater(state,fresh){
  const flushing=['flush','rinse','hotwater_rinse'].includes(state),active=state==='hotwater'||flushing;waterPanel.hidden=!active;
  const waterIcon=waterPanel.querySelector('.water-operation-icon use');if(waterIcon)waterIcon.setAttribute('href',flushing?'#i-flush':'#i-drop');
  $('ceramicStateArt').classList.toggle('water-running',active);
  if(!active){waterSince=null;waterLastSeen=null;waterState=null;return}
  const now=Date.now();if(fresh){if(waterSince===null||waterState!==state){waterSince=now;waterKnown=lastReadyAt>0&&now-lastReadyAt<5000;}waterState=state;waterLastSeen=now;}
  const scaleReady=s.connection.scaleConnected===true&&!s.connection.scaleStale;
  const cupWeight=scaleReady?s.snapshot.scale?.weight:null;
  const elapsed=waterSince===null?null:(waterLastSeen-waterSince)/1000;
  waterPanel.querySelector('.water-elapsed-label').textContent=flushing
   ?(waterKnown?text('经过时间','Elapsed'):text('接入后计时','Time since connection'))
   :text('杯重','Cup weight');
  $('ceramicWaterCenterUnit').textContent=flushing?'s':'g';
  waterPanel.querySelector('.water-temp-label').textContent=text('设定水温','Water temperature');
  waterPanel.querySelector('.water-amount-label').textContent=flushing?text('当前液重','Liquid weight'):text('目标水量','Target amount');
  waterPanel.querySelector('.water-flow-label').textContent=text('机器流量','Machine flow');
  $('ceramicWaterElapsed').textContent=fmt(flushing?elapsed:cupWeight);
  $('ceramicWaterTarget').textContent=fmt(flushing?s.workflow?.rinseData?.targetTemperature:s.workflow?.hotWaterData?.targetTemperature);
  $('ceramicWaterAmount').textContent=fmt(flushing?cupWeight:s.workflow?.hotWaterData?.volume);
  $('ceramicWaterUnit').textContent=flushing?'g':s.settings?.stopHotWaterAtWeight===true&&s.connection.scaleConnected===true&&s.settings?.gatewayMode!=='full'?'g':'mL';
  $('ceramicWaterFlow').textContent=fmt(fresh?s.snapshot.machine?.flow:null);
 }
 const operationLabels={cleaning:['正在清洁','Cleaning'],descaling:['正在除垢','Descaling'],fwupgrade:['固件更新中','Updating firmware'],calibration:['正在校准','Calibrating'],selftest:['正在自检','Self-test'],airpurge:['正在排气','Purging air'],busy:['机器忙碌','Machine busy'],booting:['正在启动','Starting up'],error:['机器故障','Machine error'],steam:['蒸汽中','Steaming'],hotwater:['热水中','Dispensing hot water'],hotwater_rinse:['冲洗中','Flushing'],rinse:['冲洗中','Flushing'],flush:['冲洗中','Flushing'],steamrinse:['蒸汽冲洗中','Rinsing steam wand']};
 function render(){
  if(flavorContext&&(flavorContext.id!==s.runId||flavorContext.client!==api.client)){flavorPanel?.close();flavorPanel=null;flavorContext=null;}
  const state=api.machineState(),operation=operationLabels[state],screen=operation?'operation':s.mode==='finished'&&!api.running()?'taste':state==='espresso'||api.running()?'brew':'ready';document.body.dataset.ceramicScreen=screen;
  // Reset the old cup as soon as a new run starts, even before its ID arrives.
  if(screen==='brew'||screen==='taste')loadFeedback(screen==='taste');
  document.querySelectorAll('[data-ceramic-i18n]').forEach(el=>{const w=words[el.dataset.ceramicI18n];if(w)el.textContent=text(...w)});
  const brewElapsed=document.querySelector('.ceramic-time [data-ceramic-i18n=elapsed]');if(brewElapsed&&s.runOriginKnown===false)brewElapsed.textContent=text('接入后时间','Time since connection');
  const workflow=screen==='taste'?(s.runWorkflow||s.workflow):s.draft,r=api.viewOf(workflow);
  $('recipeName').textContent=r.name;
  const recipeLabel=document.querySelector('.recipe-head [data-i18n="currentRecipe"]');if(recipeLabel)recipeLabel.textContent=screen==='taste'?text('本杯方案','This shot’s profile'):text('当前方案','Current profile');
  if(screen==='taste'){$('stageTitle').textContent=text('第 3/3 步 · 品鉴','Step 3/3 · Taste');$('phaseName').textContent='';}
  if(screen==='brew'){$('stageTitle').textContent=s.preparing?text('预热中','Preheating'):text('第 2/3 步 · 萃取','Step 2/3 · Brew');if(s.preparing)$('phaseName').textContent='';}
  if(operation){$('stageTitle').textContent=text(...operation);$('phaseName').textContent='';}
  if(!s.connection.stale&&s.connection.machineConnected)$('connectionText').textContent=operation?text(...operation):screen==='taste'?text('已完成','Finished'):screen==='brew'?text('萃取中','Brewing'):state==='idle'?text('已就绪','Ready'):$('connectionText').textContent;

  $('ceramicDose').textContent=fmt(r.dose);$('ceramicYield').textContent=fmt(r.target);$('ceramicTemp').textContent=fmt(r.temperature);
  $('ceramicRecipeSummary').textContent=`${fmt(r.dose)} g → ${fmt(r.target)} g · 1:${r.dose>0?ratioFmt(r.target/r.dose):'—'}`;
  flavorButton.textContent=text('选风味','Flavors')+(feedback.flavors.length?' · '+feedback.flavors.length:'');
  $('ceramicNote').placeholder=text('记下此刻的感受…','A few words about this cup…');
  const beanName=screen==='taste'&&Object.hasOwn(feedback,'bean')?feedback.bean?.name:workflow?.context?.coffeeName;
  $('ceramicBeanName').textContent=beanName||text('关联咖啡豆 ＋','Add coffee ＋');$('ceramicBeans').classList.toggle('unlinked',!beanName);
  $('ceramicAdjust').disabled=!api.editable();$('ceramicBeans').disabled=api.running()||feedbackBusy;
  $('ceramicCupFlow').textContent=text('杯流 ','Cup flow ')+fmt(s.connection.scaleStale?null:s.snapshot.scale?.weightFlow)+' g/s';
  $('flowGauge').querySelector('.gauge-label').textContent=text('流速','Flow');
  let progress=$('ceramicWeightPercent');
  if(!progress){progress=document.createElement('span');progress.id='ceramicWeightPercent';$('weightProgress').parentElement.after(progress)}
  const actualWeight=s.connection.scaleStale?null:n(s.snapshot.scale?.weight);
  progress.textContent=actualWeight!==null&&r.target>0?Math.max(0,Math.round(actualWeight/r.target*100))+'%':'—';
  const m=s.snapshot.machine??{};paintGauge($('temperatureGauge'),{value:n(m.groupTemperature),min:80,max:100,target:n(m.targetGroupTemperature),color:'var(--red)',label:text('咖啡温度','Coffee temperature'),format:fmt});
  if(screen==='taste'){
   const actual=n(s.lastShot?.id===s.runId?api.shotYield(s.lastShot):null)??n(s.trace.at(-1)?.weight)??n(s.stopWeight),duration=n(s.trace.at(-1)?.time);
   $('ceramicFinalDose').textContent=fmt(r.dose);$('ceramicFinalYield').textContent=fmt(actual);$('ceramicFinalDuration').textContent=fmt(duration);$('ceramicFinalRatio').textContent=r.dose>0&&actual!==null?'1:'+ratioFmt(actual/r.dose):'—';
   loadFeedback();renderFeedback();
  }
  if($('ceramicAdjustName'))$('ceramicAdjustName').textContent=r.name;
  $('profileDetails').querySelector('span').textContent=text('编辑曲线','Edit profile');
  let ratio=$('ceramicAdjustRatio');if(!ratio){ratio=document.createElement('p');ratio.id='ceramicAdjustRatio';$('parameters').after(ratio)}ratio.textContent=text('粉液比　','Ratio  ')+(r.dose>0?'1:'+ratioFmt(r.target/r.dose):'—');
  const step=s.snapshot.machine?.profileFrame;
  if(screen==='brew'&&Number.isInteger(step))$('phaseName').textContent=text('第 ','Stage ')+(step+1)+' / '+(s.workflow?.profile?.steps?.length||'—')+' · '+stageLabel(s.workflow?.profile?.steps?.[step]?.name,s.language);
  $('phaseName').title=$('phaseName').textContent;
  for(const id of ['recipeName','ceramicAdjustName']){$(id).title=r.name||'';$(id).dataset.longName=String(/[\u3400-\u9fff]/.test(r.name)?String(r.name).length>5:String(r.name||'').length>9)}
  document.querySelector('[data-command=steam] span').textContent=text('蒸汽','Steam');
  const statusArt={cleaning:'cleaning.jpg',descaling:'descaling.jpg',fwupgrade:'firmware_upgrade.jpg'}[state];$('ceramicStateArt').hidden=screen!=='operation';
  $('ceramicStateArt').querySelector('img').hidden=!statusArt;
  if(statusArt)$('ceramicStateArt').querySelector('img').src='assets/classic/'+statusArt;
  if(operation)$('ceramicStateArt').querySelector('p').textContent=state==='fwupgrade'?text('固件更新中，请勿断电','Updating firmware. Keep power connected.'):text(...operation);
  const fresh=!s.connection.stale&&s.connection.machineConnected;
  renderWater(state,fresh);
  if(!fresh)lastReadyAt=0;
  if(state==='steam'&&fresh){if(steamSince===null){
   let saved;try{saved=JSON.parse(sessionStorage.getItem('thiscup.steamSession')||'null')}catch{}
   const key=String(api.client?.base||api.client?.baseUrl||location.search),now=Date.now(),valid=saved?.key===key&&Number.isFinite(saved.since)&&now>=saved.since&&now-saved.since<300000;
   steamFinished=null;steamSince=valid?saved.since:now;steamOriginKnown=valid?saved.known===true:lastReadyAt>0&&now-lastReadyAt<5000;
   try{sessionStorage.setItem('thiscup.steamSession',JSON.stringify({key,since:steamSince,known:steamOriginKnown}))}catch{}
   lastReadyAt=0;openSteam();
  }}else if(fresh){if(steamSince!==null)steamFinished=Math.max(0,(Date.now()-steamSince)/1000);steamSince=null;lastReadyAt=state==='idle'?Date.now():0;try{sessionStorage.removeItem('thiscup.steamSession')}catch{}};
  if(s.modal==='ceramicSteamDialog')renderSteam();
  pitcherPrompt.render();
 }
 function operationStarted(){
  flavorPanel?.close();flavorPanel=null;flavorContext=null;
  operationRevision++;
  profileEditor?.close();profileEditor=null;
  beansPanel?.dismiss();beansPanel=null;
  if(adjustBefore){if(adjustBefore.revision===s.workflowRevision){s.draft=adjustBefore.draft;s.mode=adjustBefore.mode;}adjustBefore=null;s.ceramicDraftActive=false;}
  document.querySelectorAll('.ceramic-message').forEach(el=>el.remove());
 }
 render();return {render,error,canAutoUpdate:()=>!feedbackDirty&&!feedbackBusy&&!feedbackLoading&&!feedbackRecovering,operationStarted,beforeClose:id=>{if(id==='ceramicSteamDialog'){++steamPurgeRevision;steamPurgeValue=null;steamPurgeClient=null;}if(id==='ceramicAdjustDialog'&&adjustBefore){if(adjustBefore.revision===s.workflowRevision){s.draft=adjustBefore.draft;s.mode=adjustBefore.mode;}adjustBefore=null;s.ceramicDraftActive=false;}},draftApplied:()=>{adjustBefore=null;s.ceramicDraftActive=false;if(s.modal==='ceramicAdjustDialog')api.closeDialog()}};
}
