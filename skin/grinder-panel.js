import {brandMarkup} from "./brand.js?v=0.2.29-rc.7";
import {guardDismissClick} from "./dismiss-guard.js?v=0.2.29-rc.7";
const GP_TEXT = {
  zh: {title:'研磨准备',profile:'当前曲线',other:'读取其他方案',saved:'已保存到当前曲线',draft:'尚未应用',matched:'已读取曲线方案',device:'使用磨豆机当前参数',gap:'刀盘间距',rpm:'刀盘转速',feed:'进豆转速',manual:'手动',timed:'定时',smart:'智能',mode:'启动模式',apply:'应用参数',save:'保存研磨方案',start:'开始研磨',stop:'停止研磨',back:'返回',read:'读取设备',connect:'连接',connecting:'正在连接',connected:'已连接',disconnected:'未连接',unavailable:'小方插件尚未安装',idle:'待机',grinding:'研磨中',unknown:'调整中',error:'设备异常',reading:'正在读取',applying:'正在应用',starting:'正在启动',stopping:'正在停止',applied:'参数已应用',failed:'操作未完成',empty:'还没有保存的方案',search:'搜索方案',borrow:'借用',borrowed:'已载入草稿',cancel:'取消',done:'完成',clear:'清空',range:'范围',invalid:'请输入范围内的整数',close:'返回冲煮',live:'设备读数',noProfile:'未选曲线',loading:'正在读取方案',note:'应用到磨豆机；保存到曲线',ready:'准备好了',finished:'研磨结束',missing:'请先读取完整参数',retry:'重试连接'},
  en: {title:'Prepare to grind',profile:'Current profile',other:'Load recipe',saved:'Saved to this profile',draft:'Not applied',matched:'Profile recipe loaded',device:'Using grinder settings',gap:'Burr gap',rpm:'Burr speed',feed:'Feed speed',manual:'Manual',timed:'Timed',smart:'Smart',mode:'Start mode',apply:'Apply settings',save:'Save grind recipe',start:'Start grinding',stop:'Stop grinder',back:'Back',read:'Read grinder',connect:'Connect',connecting:'Connecting',connected:'Connected',disconnected:'Disconnected',unavailable:'CRYSTAL plugin is not installed',idle:'Idle',grinding:'Grinding',unknown:'Adjusting',error:'Device error',reading:'Reading',applying:'Applying',starting:'Starting',stopping:'Stopping',applied:'Settings applied',failed:'Action failed',empty:'No saved recipes yet',search:'Search recipes',borrow:'Use recipe',borrowed:'Loaded as draft',cancel:'Cancel',done:'Done',clear:'Clear',range:'Range',invalid:'Enter a whole number within range',close:'Back to brewing',live:'Device readings',noProfile:'No profile selected',loading:'Loading recipe',note:'Apply to grinder · Save to profile',ready:'Ready',finished:'Grinding finished',missing:'Read the complete settings first',retry:'Reconnect'}
};
const GP_FIELDS = {grindSize:{label:'gap',unit:'μm',max:1500},motorRpm:{label:'rpm',unit:'rpm',max:1500},feedRpm:{label:'feed',unit:'rpm',max:150}};
const GP_MODES = ['smart','timed','manual'];
GP_TEXT.zh.unavailableNote='可以手动研磨；安装小方插件后即可在这里控制。';
GP_TEXT.en.unavailableNote='You can grind manually. Install the CRYSTAL plugin to control it here.';
Object.assign(GP_TEXT.zh,{previousSettings:'上次设置 · 设备待确认',needsSettings:'设备参数待确认；请填入或借用有效方案，再明确应用',deviceRead:'已读取设备参数',readKept:'设备读数已更新，当前草稿保留',connectedRead:'已连接 · 已读取设备参数',connectedRecipe:'已连接 · 已读取曲线方案',readIncomplete:'已连接，设备参数尚未读取完整',unconfirmed:'尚未确认',timedNote:'时长：在磨豆机上设置'});
Object.assign(GP_TEXT.en,{previousSettings:'Previous settings · Device not confirmed',needsSettings:'Device settings are unconfirmed. Enter or borrow a valid recipe, then apply it.',deviceRead:'Grinder settings loaded',readKept:'Device readings updated; your draft is unchanged',connectedRead:'Connected · Grinder settings loaded',connectedRecipe:'Connected · Profile recipe loaded',readIncomplete:'Connected; waiting for complete device readings',unconfirmed:'Not yet confirmed',timedNote:'Duration is set on the grinder'});
Object.assign(GP_TEXT.zh,{savedTo:'已保存到',savedAfterChange:'当前曲线已更换，请返回后重新打开小方。',saveNeedsProfile:'重试保存研磨方案',legacyRecipe:'旧方案 · 未关联',profileChanged:'曲线已更换或发生冲突，请返回后重新打开小方。草稿未应用。'});
Object.assign(GP_TEXT.en,{savedTo:'Saved to',savedAfterChange:'The current profile changed. Go back and reopen the grinder.',saveNeedsProfile:'Retry saving recipe',legacyRecipe:'Legacy · Unlinked',profileChanged:'The profile changed or has a conflict. Go back and reopen the grinder. Your draft has not been applied.'});
Object.assign(GP_TEXT.zh,{chooseDevice:'选择磨豆机',deviceName:'磨豆机名称',rename:'改名',saveName:'保存名称',scan:'扫描设备',noDevices:'未发现磨豆机',choose:'使用这台',emptyGuide:'在研磨页保存方案后，可在这里借用。',selectedDevice:'当前选择',unknownDevice:'选择磨豆机',deviceChanged:'设备已切换，正在读取对应方案',nameRequired:'请输入名称（最多24个字）',deviceConflict:'设备已切换，请确认当前磨豆机后再操作'});
Object.assign(GP_TEXT.en,{chooseDevice:'Choose a grinder',deviceName:'Grinder name',rename:'Rename',saveName:'Save name',scan:'Scan',noDevices:'No grinders found',choose:'Use this grinder',emptyGuide:'Save a grind recipe to a profile to reuse it here.',selectedDevice:'Selected',unknownDevice:'Choose a grinder',deviceChanged:'Grinder changed. Loading its recipe…',nameRequired:'Enter a name (up to 24 characters)',deviceConflict:'The selected grinder changed. Check the device before continuing.'});
const GP_ERRORS = {
  gap_too_small: ['刀距过近，拒绝启动。', 'Burr gap too small. Start refused.'],
  invalid_config: ['请检查刀盘间距、转速和研磨模式，数值须为允许范围内的整数。', 'Check the burr gap, speeds and grinding mode. Enter whole numbers within the allowed ranges.'],
  missing_profile: ['请先选择咖啡方案。', 'Choose a coffee profile first.'],
  device_rejected: ['磨豆机未完成操作，请读取状态后再试。', 'The grinder could not complete this action. Read its status before trying again.'],
  timeout: ['磨豆机尚未确认结果，请先读取状态；命令不会自动重发。', 'The grinder did not confirm the result. Read its status before trying again; the command will not be resent automatically.'],
  cancelled: ['操作已取消。', 'The operation was cancelled.'],
  invalid_state: ['磨豆机状态尚未确认，请重新读取。', 'The grinder status is unconfirmed. Read its status again.'],
  not_installed: ['尚未安装「这一杯·小方」插件；仍可正常冲煮。', 'The This Cup CRYSTAL plugin is not installed. You can still brew coffee.'],
  not_found: ['未发现小方，请通电并关闭其他连接小方的应用。', 'No CRYSTAL grinder was found. Turn it on and disconnect it from other apps.'],
  selected_device_offline: ['选定磨豆机不在线，请开机后重试；不会连接另一台。', 'The selected grinder is offline. Turn it on and try again. Another grinder will not be connected automatically.'],
  ambiguous_device: ['发现多台磨豆机，请先选择要使用的一台。', 'More than one grinder was found. Choose the grinder you want to use.'],
  missing_device: ['请先选择磨豆机。', 'Choose a grinder first.'],
  device_changed: ['磨豆机已切换，请确认设备后再操作。', 'The selected grinder changed. Check the device before continuing.'],
  invalid_name: ['请输入有效的设备名称。', 'Enter a valid grinder name.'],
  duplicate_name: ['这个名称已被另一台磨豆机使用。', 'Another grinder already uses this name.'],
  invalid_device: ['设备不可用，请重新扫描。', 'This grinder is unavailable. Scan for devices again.'],
  preferences_loading: ['正在读取默认设备，请稍后重试。', 'Loading the preferred grinder. Please try again shortly.'],
  incompatible_driver: ['请更新配套磨豆机插件后再连接。', 'Update the companion grinder plugin before connecting.'],
  not_connected: ['磨豆机连接已中断，请重新连接；操作不会自动重试。', 'The grinder is disconnected. Reconnect it; the action will not be retried automatically.'],
  workflow_unconfirmed: ['当前曲线尚未确认，请重载配套小方插件并等待状态同步。', 'The current coffee profile is unconfirmed. Reload the companion grinder plugin and wait for it to sync.'],
  busy: ['磨豆机正在运行、调距或读取参数，请等待完成。', 'The grinder is running, adjusting or reading settings. Wait for it to finish.'],
  missing_receipt: ['磨豆机未返回操作凭据，请先读取状态。', 'The grinder did not acknowledge the action. Read its status before trying again.'],
  missing_fence: ['请先读取磨豆机状态，再应用或开始；如仍失败，请更新配套插件。', 'Read the grinder status before applying settings or starting. Update the companion plugin if this persists.'],
  missing_profile_identity: ['无法唯一匹配当前曲线，请在方案库中确认后保存。研磨参数已保留。', 'The current profile could not be uniquely identified. Select it in the library, then save. Your grind settings are unchanged.'],
  settings_unconfirmed: ['设备读回与请求参数不一致，请重新读取；未确认应用成功。', 'Grinder readings do not match the requested settings. Read its status again; application is unconfirmed.'],
  recipe_unconfirmed: ['研磨方案保存后读回不一致，请重新读取。', 'The saved grind recipe could not be verified. Load it again before using it.'],
  grinder_error: ['研磨操作未完成，请读取磨豆机状态后再试。', 'The grinder action could not be completed. Read its status before trying again.']
};
export function grinderErrorMessage(error, language='zh') {
  const english=String(language).toLowerCase().startsWith('en');
  const message=typeof error?.message==='string'?error.message.trim():'';
  // Keep specific field/device details in Chinese; driver codes localize the
  // same failures in English without exposing untranslated backend messages.
  if(!english&&message&&/[\u3400-\u9fff]/u.test(message))return message;
  if(Object.hasOwn(GP_ERRORS,error?.code))return GP_ERRORS[error.code][english?1:0];
  const http=/^http_(\d{3})$/.exec(error?.code||'');
  if(http)return english?`The grinder service returned HTTP ${http[1]}. Check the connection and read its status again.`:`磨豆机接口返回 HTTP ${http[1]}，请检查连接并重新读取状态。`;
  if(message&&!/[\u3400-\u9fff\uf900-\ufaff]/u.test(message))return message;
  return GP_ERRORS.grinder_error[english?1:0];
}
const gpEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gpCopy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const gpCanonical = value => Array.isArray(value)?value.map(gpCanonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,gpCanonical(value[key])])):value;
const gpProfileSnapshot = workflow => JSON.stringify(gpCanonical(workflow?.profile ?? workflow ?? null));

/** Mounts an isolated grinder dialog. Opening/typing never applies a recipe. */
export function mountGrinderUI(container,{client,getWorkflow,getProfileIdentity=()=>null,refreshProfileLibrary=null,onNotice=()=>{},onClose=()=>{},observationOnly=false,machineControl=null}={}) {
  if (!container || !client?.grinder) throw new Error('Grinder container and client.grinder are required');
  const api=client.grinder, lang=document.documentElement.lang?.toLowerCase().startsWith('en')?'en':'zh', t=key=>GP_TEXT[lang][key]||key;
  const capturedWorkflow=gpCopy(getWorkflow?.() ?? null);
  const expectedWorkflow={id:capturedWorkflow?.id,profile:capturedWorkflow?.profile};
  const profile=gpCopy(capturedWorkflow?.profile ?? capturedWorkflow);
  let profileId=getProfileIdentity();
  const recipeProfile={profileId,profile};
  const profileSnapshot=gpProfileSnapshot(profile);
  const priorFocus=document.activeElement;
  let disposed=false, busy=false, polling=false, state=api.cachedState||null, draft={}, dirty=false, note=t('loading'), failure='', recipes=[], view='main', editKey=null, editValue='', editFresh=true;
  let recipeLoaded=false,draftOwned=false,readbackSeeded=false,previousSettings=false;
  let connectionFailed=false, initializing=true;
  let confirmedBadge=null, badgeDeadline=0, badgeTimer=null;
  let devices=[], deviceCandidate=null, renameId=null, renameValue='', activeDeviceId=null, deviceRevision=0, switchingDevice=false;
  const deviceDrafts=new Map();
  const devicePending=()=>initializing||switchingDevice||(state?.deviceId||null)!==activeDeviceId;
  const deviceCaption=()=>devicePending()?t('loading'):`${activeDeviceId?activeDeviceId.split(':').slice(-2).join(':').toUpperCase():''} · ${t(connected()?'connected':'disconnected')}`;
  const deviceLabel=()=>devicePending()?(lang==='en'?'Switching grinder…':'正在切换磨豆机…'):state?.deviceAlias||state?.deviceName||devices.find(d=>d.id===activeDeviceId)?.alias||devices.find(d=>d.id===activeDeviceId)?.name||t('unknownDevice');
  const deviceBlocked=()=>devicePending()||busy||Boolean(state?.busy)||running()||Boolean(machineControl?.active());
  function rememberDraft(){if(activeDeviceId&&Object.keys(draft).length)deviceDrafts.set(activeDeviceId,{draft:gpCopy(draft),dirty,recipeLoaded,draftOwned,readbackSeeded,previousSettings});}
  async function loadDeviceState(initial){
    if((initial?.deviceId||null)!==activeDeviceId){recipes=[];if(view==='recipes')view='main';}
    const revision=++deviceRevision;rememberDraft();state=initial;activeDeviceId=initial?.deviceId||null;
    const kept=activeDeviceId&&deviceDrafts.get(activeDeviceId);
    draft={};dirty=false;recipeLoaded=false;draftOwned=false;readbackSeeded=false;previousSettings=false;
    if(kept){({draft,dirty,recipeLoaded,draftOwned,readbackSeeded,previousSettings}=gpCopy(kept));note=dirty?t('draft'):connectionNote();return;}
    const recipe=profileId?await api.getRecipe(recipeProfile):null;
    if(disposed||revision!==deviceRevision||activeDeviceId!==(initial?.deviceId||null))return;
    recipeLoaded=Boolean(usableConfig(recipe));previousSettings=!recipeLoaded&&initial?.configSource==='saved'&&Boolean(usableConfig(initial.config));
    draft=gpCopy(recipeLoaded?recipe:previousSettings?initial.config:{bootMode:GP_MODES.includes(initial?.config?.bootMode)?initial.config.bootMode:'manual'});
    seedReadback(initial);note=initial?.available===false?t('unavailableNote'):connectionNote();
  }
  async function showDevices(scan=false){devices=await api.listDevices({scan});deviceCandidate=activeDeviceId||devices.find(d=>d.selected)?.id||null;view='devices';}

  let startRequested=false, sawGrinding=false, startInFlight=false, idleAfterGrinding=false, unsubscribe=null, timer=null;
  const root=document.createElement('div'); root.className='gp-overlay'; root.tabIndex=-1; root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.setAttribute('aria-label',t('title'));
  container.appendChild(root);
  const connected=()=>Boolean(state?.connected);
  const compatible=()=>state?.available!==false&&typeof state?.busy==='boolean'&&['idle','grinding','unknown','error'].includes(state?.state);
  const uncertain=()=>['checking','unknown'].includes(state?.observation)||state?.state==='unknown';
  const canStop=()=>connected()||uncertain()||state?.state==='grinding';
  const running=()=>state?.state==='grinding';
  const blocked=()=>devicePending()||!compatible()||busy||Boolean(state?.busy)||running()||uncertain();
  const usableConfig=value=>value&&Object.entries(GP_FIELDS).every(([key,{max}])=>Number.isInteger(value[key])&&value[key]>0&&value[key]<=max)&&GP_MODES.includes(value.bootMode);
  const configComplete=()=>Boolean(usableConfig(draft));
  const notify=(message)=>{note=message; failure=''; onNotice(message);};
  const cleanConfig=()=>({grindSize:Number(draft.grindSize),motorRpm:Number(draft.motorRpm),feedRpm:Number(draft.feedRpm),bootMode:draft.bootMode});
  const validReadback=next=>next?.parametersConfirmed!==false&&['targetAngle','motorRpm','feedRpm'].every(key=>Number.isInteger(next?.values?.[key])&&next.values[key]>0);
  function seedReadback(next,{explicit=false}={}){
    if(recipeLoaded||draftOwned||(!explicit&&readbackSeeded)||!next?.connected||next.initialized===false||!validReadback(next))return false;
    const values=next.values||{},valid=(value,max)=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=max;
    // Target is the requested setting; servoAngle is the measured position and
    // may differ by 1–2 μm. A power-on all-zero position is still unknown.
    let gap=valid(values.targetAngle,1500)?values.targetAngle:values.servoAngle;
    if(gap===0&&values.servoAngle===0&&next.setting==null)gap=null;
    if(!valid(gap,1500)||!valid(values.motorRpm,1500)||!valid(values.feedRpm,150))return false;
    // 1/2/3 are start modes. 4 is Stop and 5 is Adjust, never mode selections.
    const mode=({1:'manual',2:'timed',3:'smart'})[values.bootSign]
      ||(GP_MODES.includes(draft.bootMode)?draft.bootMode:GP_MODES.includes(next.config?.bootMode)?next.config.bootMode:'manual');
    draft={grindSize:gap,motorRpm:values.motorRpm,feedRpm:values.feedRpm,bootMode:mode};
    readbackSeeded=true;previousSettings=false;dirty=false;return true;
  }
  function connectionNote(){return !connected()?t('disconnected'):recipeLoaded?t('connectedRecipe'):previousSettings?t('previousSettings'):readbackSeeded&&validReadback(state)?t('connectedRead'):t('needsSettings');}
  function finishClose(){
    if(disposed)return; disposed=true; clearInterval(timer); clearTimeout(badgeTimer); unsubscribe?.(); root.removeEventListener('click',click); root.removeEventListener('input',input); root.removeEventListener('keydown',keydown); root.remove(); onClose(); if(priorFocus?.isConnected)priorFocus.focus();
  }
  function acceptState(next){
    if(disposed||!next)return;
    // Initial/switch recipe lookup owns draft initialization. Cached/live updates
    // must not seed a draft that the pending recipe result will then overwrite.
    if(initializing||switchingDevice){
      state=next;
      // Keep safety/readback visible while the one recipe lookup owns the draft.
      // Passive rendering never starts another lookup or seeds draft values.
      render(true);return;
    }
    if(api.listDevices&&!switchingDevice&&(next.deviceId||null)!==activeDeviceId){
      switchingDevice=true;note=t('deviceChanged');loadDeviceState(next).then(()=>{if(!disposed){failure='';render();}}).catch(e=>{failure=grinderErrorMessage(e,lang);}).finally(()=>{switchingDevice=false;if(!disposed)render();});render();return;
    }
    state=next;
    if(readbackSeeded&&!validReadback(next)){readbackSeeded=false;previousSettings=true;if(!draftOwned&&!recipeLoaded&&!busy)note=connectionNote();}
    const seeded=seedReadback(next);if(seeded&&!busy)note=connectionNote();
    if(startRequested&&next.connected){
      if(next.state==='grinding'){sawGrinding=true;note=t('grinding');}
      if(sawGrinding&&next.state==='idle'&&!next.busy){
        idleAfterGrinding=true;
        if(!startInFlight){notify(t('finished'));finishClose();return;}
      }
    }
    render(!seeded);
  }
  async function refresh(){
    if(disposed||polling)return; polling=true;
    try{acceptState(await api.getState());}catch(error){if(!disposed){failure=grinderErrorMessage(error,lang);render();}}
    finally{polling=false;}
  }
  async function action(label,fn,{refreshAfter=true}={}){
    if(busy||disposed)return; busy=true; failure='';note=t(label);render();
    let succeeded=false;
    try{await fn();succeeded=true;}catch(error){if(!disposed){failure=grinderErrorMessage(error,lang);onNotice(failure);}}
    finally{busy=false;if(!disposed){if(refreshAfter||!succeeded)await refresh();render();}}
  }
  function statusLabel(){if(uncertain())return t('unconfirmed');if(state?.available===false)return t('unavailable');if(!connected())return t('disconnected');return t(state?.state||'idle');}
  function badgePresentation(){
    const current={deviceId:state?.deviceId,label:statusLabel(),status:connected()?(running()?'running':'online'):'offline'};
    // Only bridge brief notification-to-GET gaps. Safety controls still consume
    // the immediate unconfirmed state; an outage or device change is never held.
    const transient=state?.observation==='checking'&&state?.observationReason==='changed'&&connected()&&confirmedBadge?.deviceId===state?.deviceId;
    if(transient){
      if(!badgeDeadline){badgeDeadline=Date.now()+300;badgeTimer=setTimeout(()=>{badgeTimer=null;if(!disposed)render(true);},300);}
      if(Date.now()<badgeDeadline)return confirmedBadge;
    }else{
      clearTimeout(badgeTimer);badgeTimer=null;badgeDeadline=0;
      confirmedBadge=state?.observation==='ready'?current:null;
    }
    return current;
  }
  function updateMachine(){
    if(disposed)return;
    const active=Boolean(machineControl?.active());
    root.classList.toggle('gp-machine-active',active);
    const stop=root.querySelector('[data-gp="machine-stop"]');
    if(stop)stop.hidden=!active||machineControl?.canStop?.()===false;
  }
  function activeLayer(){
    return connectionFailed?root.querySelector('.gp-error-modal'):view==='keypad'?root.querySelector('.gp-keypad-layer'):['recipes','devices','rename'].includes(view)?root.querySelector('.gp-subview'):null;
  }
  function syncLayerAccess(){
    const layer=activeLayer();
    // A visual shadow does not block hit testing. Inert also removes the
    // background from keyboard navigation; the handler below is the final gate.
    for(const child of root.querySelector('.gp-dialog')?.children||[])child.inert=Boolean(layer&&child!==layer);
  }
  function render(passive=false){
    if(disposed)return;
    updateMachine();
    const cardDisabled=blocked()?'disabled':'';
    const deviceValues=state?.values||{};
    const actualGap=deviceValues.servoAngle??deviceValues.observedSetting??state?.observedSetting;
    const actualRpm=deviceValues.motorRpm??deviceValues.observedRpm??state?.observedRpm;
    const actualFeed=deviceValues.feedRpm;
    const coldReadback=connected()&&!validReadback(state);
    const gapReading=devicePending()||!connected()?'— μm':coldReadback?t('unconfirmed'):actualGap!=null?`${actualGap} μm`:'— μm';
    const rpmReading=devicePending()||!connected()?'— rpm':coldReadback?'':actualRpm!=null?`${actualRpm} rpm`:'— rpm';
    const feedReading=devicePending()||!connected()?'— rpm':coldReadback?'':actualFeed!=null?`${actualFeed} rpm`:'— rpm';
    // Connection copy describes current state; action receipts remain historical.
    const connectionCopy=['connectedRecipe','connectedRead','previousSettings','needsSettings','disconnected'].some(key=>note===t(key));
    const currentNote=connectionCopy?connectionNote():note;
    const feedbackText=failure||(running()?t('grinding'):currentNote||(uncertain()?t('unconfirmed'):''));
    const badgeView=badgePresentation(),status=badgeView.status;
    const deviceButton=root.querySelector('[data-gp=devices]');if(deviceButton){deviceButton.disabled=deviceBlocked();deviceButton.querySelector('strong').textContent=deviceLabel();deviceButton.querySelector('small').textContent=deviceCaption();}

    if(passive){
      root.querySelector('.gp-dialog')?.classList.toggle('is-running',running());
      root.querySelectorAll('.gp-run-actions>[data-gp="stop"]').forEach(el=>{el.hidden=!running()&&!busy&&!uncertain();});
      const badge=root.querySelector('.gp-state');if(badge){if(badge.className!==`gp-state ${status}`)badge.className=`gp-state ${status}`;if(badge.textContent!==badgeView.label)badge.replaceChildren(document.createElement('i'),document.createTextNode(badgeView.label));}
      const live=root.querySelectorAll('.gp-live strong');if(live[0])live[0].textContent=gapReading;if(live[1])live[1].textContent=rpmReading;if(live[2])live[2].textContent=feedReading;
      const heading=root.querySelector('.gp-header h2');if(heading)heading.textContent=running()?t('grinding'):t('title');
      root.querySelectorAll('[data-gp="stop"]').forEach(el=>{el.disabled=!canStop();});
      if(view==='main'){
        root.querySelectorAll('[data-gp="edit"],[data-gp="increment"],[data-gp="mode"],[data-gp="recipes"]').forEach(el=>{el.disabled=blocked()||(el.dataset.gp==='increment'&&!Number.isFinite(draft[el.dataset.field]));});
        root.querySelectorAll('[data-gp="apply"],[data-gp="start"]').forEach(el=>{el.disabled=!connected()||blocked()||!configComplete();});
        const save=root.querySelector('[data-gp="save"]');if(save)save.disabled=devicePending()||busy||running()||!profile||(!profileId&&!refreshProfileLibrary)||!configComplete();
        const read=root.querySelector('[data-gp="read"]');if(read)read.disabled=!connected()||blocked();
        const feedback=root.querySelector('.gp-feedback');if(feedback){feedback.textContent=feedbackText;feedback.classList.toggle('error',Boolean(failure));}
        // A connection transition changes Connect into Start, but stable polling
        // must not replace buttons or steal focus from an in-progress touch.
        if(Boolean(root.querySelector('[data-gp="connect"]'))===connected()){render();}
      }
      syncLayerAccess();
      return;
    }
    const profileTitle=gpEscape(profile?.title||profile?.name||t('noProfile'));
    root.innerHTML=`<section class="gp-dialog ${running()?'is-running':''}">
      <header class="gp-header"><div class="gp-brand">${brandMarkup()}</div><h2>${running()?t('grinding'):t('title')}</h2><span class="gp-state ${status}"><i></i>${gpEscape(badgeView.label)}</span></header>
      <div class="gp-profile ${String(profile?.title||profile?.name||'').length>14?'gp-long-profile':''}"><span>${t('profile')}</span><strong>${profileTitle}</strong></div>
      ${api.listDevices?`<button type="button" class="gp-device-select" data-gp="devices" ${deviceBlocked()?'disabled':''}><span><strong>${gpEscape(deviceLabel())}</strong><small>${gpEscape(deviceCaption())}</small></span><b>⌄</b></button>`:''}
      <img class="gp-burr-art" src="${new URL('./assets/ceramic/slices/grinder-art.png?v=0.2.29-rc.7',import.meta.url).href}" alt="" aria-hidden="true"/>
      <div class="gp-main">
        <div class="gp-toolbar"><div class="gp-mode" aria-label="${t('mode')}">${GP_MODES.map(mode=>`<button type="button" class="${draft.bootMode===mode?'selected':''}" data-gp="mode" data-mode="${mode}" aria-pressed="${draft.bootMode===mode}" ${cardDisabled}>${t(mode)}</button>`).join('')}</div><button type="button" class="gp-link" data-gp="recipes" ${blocked()?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 3h9v12H3V6Zm0 3V3h7l2 3h8v3"/></svg>${t('other')} ›</button></div>
        <div class="gp-parameters"><p class="gp-feedback ${failure?'error':''}" role="status">${gpEscape(feedbackText)}</p>${Object.entries(GP_FIELDS).map(([key,field])=>`<div class="gp-parameter-row"><label>${t(field.label)}</label><button class="gp-round" type="button" data-gp="increment" data-field="${key}" data-delta="-1" aria-label="${lang==='zh'?'减少':'Decrease '}${t(field.label)}" ${blocked()||!Number.isFinite(draft[key])?'disabled':''}>−</button><button type="button" class="gp-parameter ${dirty?'is-draft':''}" data-gp="edit" data-field="${key}" ${cardDisabled}><strong>${draft[key]!=null?gpEscape(draft[key]):'—'}</strong><small>${field.unit}</small><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L21 7l-4-4L4 16Zm11-11 4 4"/></svg></button><button class="gp-round" type="button" data-gp="increment" data-field="${key}" data-delta="1" aria-label="${lang==='zh'?'增加':'Increase '}${t(field.label)}" ${blocked()||!Number.isFinite(draft[key])?'disabled':''}>+</button></div>`).join('')}</div>
        ${draft.bootMode==='timed'?`<p class="gp-timed-note">${t('timedNote')}</p>`:''}<div class="gp-save-actions"><button type="button" class="gp-button" data-gp="apply" ${!connected()||blocked()||!configComplete()?'disabled':''}>${t('apply')}</button><button type="button" class="gp-link gp-save" data-gp="save" ${devicePending()||busy||running()||!profile||(!profileId&&!refreshProfileLibrary)||!configComplete()?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v19l-7-5-7 5V3Z"/></svg><span>${t(profileId?'save':'saveNeedsProfile')}<small>${profileTitle}${activeDeviceId?' · '+gpEscape(deviceLabel()):''}</small></span></button></div>
      </div>
      <div class="gp-live"><span>${t('live')}</span><div><small>${t('gap')}</small><strong>${gpEscape(gapReading)}</strong></div><div><small>${t('rpm')}</small><strong>${gpEscape(rpmReading)}</strong></div><div><small>${t('feed')}</small><strong>${gpEscape(feedReading)}</strong></div><button type="button" class="gp-link" data-gp="read" ${!connected()||blocked()?'disabled':''}>${t('read')} ↻</button></div>
      <footer class="gp-footer"><button type="button" class="gp-back" data-gp="close">‹　${t('back')}</button><div class="gp-run-actions">${!connected()?`<button type="button" class="gp-button gp-primary" data-gp="connect" ${busy||state?.available===false?'disabled':''}>${t('connect')}</button>`:`<button type="button" class="gp-button gp-primary" data-gp="start" ${blocked()||!configComplete()?'disabled':''}>▷　${t('start')}</button>`}<button type="button" class="gp-button gp-stop" data-gp="stop" ${!running()&&!busy&&!uncertain()?'hidden':''} ${!canStop()?'disabled':''}>■ ${t('stop')}</button></div></footer>
      ${view==='recipes'?recipeHTML():''}${view==='devices'?devicesHTML():''}${view==='rename'?renameHTML():''}${view==='keypad'?keypadHTML():''}${connectionFailed?`<div class="gp-error-modal" role="alertdialog" aria-label="${t('failed')}"><div><h3>${lang==='zh'?'无法连接磨豆机':'Could not connect to the grinder'}</h3><p>${gpEscape(failure||t('disconnected'))}</p><footer>${stopHTML()}<button class="gp-button" data-gp="dismiss-error">${t('cancel')}</button><button class="gp-button gp-primary" data-gp="connect">${t('retry')}</button></footer></div></div>`:''}</section>`;
    if(machineControl){
      const stop=document.createElement('button');stop.type='button';stop.className='gp-machine-stop';stop.dataset.gp='machine-stop';
      stop.textContent=lang==='zh'?'■ 停止咖啡机':'■ Stop coffee machine';root.appendChild(stop);
    }
    updateMachine();
    syncLayerAccess();
    if(connectionFailed)root.querySelector('.gp-error-modal [data-gp="dismiss-error"]')?.focus({preventScroll:true});
    else if(view==='keypad')root.focus({preventScroll:true});
  }
  function stopHTML(){return `<button type="button" class="gp-button gp-stop" data-gp="stop" ${!canStop()?'disabled':''}>■ ${t('stop')}</button>`;}
  const profileIsCurrent=()=>getProfileIdentity()===profileId && gpProfileSnapshot(getWorkflow?.())===profileSnapshot;
  async function ensureProfileBinding() {
    if (disposed || gpProfileSnapshot(getWorkflow?.()) !== profileSnapshot) throw new Error(t('profileChanged'));
    if (!profileId && refreshProfileLibrary) await refreshProfileLibrary();
    if (disposed || gpProfileSnapshot(getWorkflow?.()) !== profileSnapshot) throw new Error(t('profileChanged'));
    const currentId = getProfileIdentity();
    if (profileId && currentId !== profileId) throw new Error(t('profileChanged'));
    if (!currentId) throw Object.assign(new Error('Profile identity unavailable'), {code:'missing_profile_identity'});
    profileId = currentId;
    recipeProfile.profileId = currentId;
  }

  function beforeSend(){
    if(api.listDevices&&(!activeDeviceId||api.cachedState?.deviceId!==activeDeviceId||switchingDevice))throw new Error(t('deviceConflict'));
    if(disposed||!profileIsCurrent())throw new Error(t('profileChanged'));
  }
  function requireCurrentProfile(){
    if(profileIsCurrent())return true;
    failure=t('profileChanged');note='';render();onNotice(failure);return false;
  }
  function devicesHTML(){return `<section class="gp-subview gp-devices"><header class="gp-subheader"><h3>${t('chooseDevice')}</h3><button class="gp-button" data-gp="scan-devices" ${busy?'disabled':''}>${t('scan')}</button><button class="gp-back" data-gp="main">← ${t('back')}</button></header><div class="gp-device-list">${devices.length?devices.map(d=>`<article class="gp-device-card ${d.id===deviceCandidate?'selected':''}"><button data-gp="device-candidate" data-id="${gpEscape(d.id)}" ${busy?'disabled':''}><strong>${gpEscape(d.alias||d.name)}</strong><small>${gpEscape(d.name)} · ${gpEscape(d.id.split(':').slice(-2).join(':').toUpperCase())}</small><span>${t(d.state==='connected'?'connected':'disconnected')}${d.id===activeDeviceId?' · '+t('selectedDevice'):''}</span></button><button class="gp-link" data-gp="rename-device" data-id="${gpEscape(d.id)}" ${busy?'disabled':''}>✎ ${t('rename')}</button></article>`).join(''):`<div class="gp-empty"><strong>${t('noDevices')}</strong><p>${lang==='zh'?'打开磨豆机，然后扫描设备。':'Turn on your grinder, then scan for devices.'}</p></div>`}</div><p class="gp-feedback error">${gpEscape(failure)}</p><footer>${stopHTML()}<button class="gp-button gp-primary" data-gp="select-device" ${!deviceCandidate||deviceBlocked()?'disabled':''}>${t('choose')}</button></footer></section>`;}
  function renameHTML(){return `<section class="gp-subview gp-rename"><header class="gp-subheader"><h3>${t('deviceName')}</h3><button class="gp-back" data-gp="devices">← ${t('back')}</button></header><input data-device-alias maxlength="24" value="${gpEscape(renameValue)}" aria-label="${t('deviceName')}" autocomplete="off"><p class="gp-feedback error">${gpEscape(failure)}</p><footer>${stopHTML()}<button class="gp-button gp-primary" data-gp="save-device-name" ${busy?'disabled':''}>${t('saveName')}</button></footer></section>`;}
  function recipeHTML(){return `<section class="gp-subview gp-recipe-view"><header class="gp-subheader"><h3>${t('other')}</h3>${stopHTML()}<button type="button" class="gp-back" data-gp="main">← ${t('back')}</button></header>${recipes.length?`<input class="gp-search" data-gp-search type="search" placeholder="${t('search')}" aria-label="${t('search')}">`:""}<div class="gp-recipes">${api.previousRecipesUnavailable ? `<p role="status">${lang==='zh'?'旧研磨方案暂时无法读取，新保存的方案可正常使用。':'Previous grind recipes are unavailable. Newly saved recipes remain available.'}</p>` : ''}${recipes.length?recipes.map((r,i)=>`<button type="button" class="gp-recipe" data-gp="borrow" data-index="${i}"><strong>${gpEscape(r.title||r.key)}</strong><small>${r.legacy?`${t('legacyRecipe')} · `:''}${gpEscape(r.config?.grindSize??'—')} μm · ${gpEscape(r.config?.motorRpm??'—')} rpm · ${gpEscape(t(r.config?.bootMode||'manual'))}</small><span>↗</span></button>`).join(''):`<div class="gp-empty"><strong>${t('empty')}</strong><p>${t('emptyGuide')}</p></div>`}</div></section>`;}
  function keypadHTML(){const field=GP_FIELDS[editKey];return `<div class="gp-keypad-layer"><section class="gp-keypad" role="dialog" aria-modal="true" aria-label="${t(field.label)}"><header class="gp-subheader"><h3>${t(field.label)}</h3></header><div class="gp-keypad-body"><div class="gp-keypad-reading"><strong>${gpEscape(editValue||'0')}</strong><span>${field.unit}</span><span class="gp-key-range">${t('range')} 1–${field.max} ${field.unit}</span><p data-gp-key-error role="alert"></p></div><div class="gp-keys">${['7','8','9','4','5','6','1','2','3','clear','0','delete'].map(k=>`<button type="button" data-gp="key" data-key="${k}" aria-label="${k==='delete'?(lang==='zh'?'退格':'Backspace'):k==='clear'?t('clear'):k}">${k==='clear'?'C':k==='delete'?'⌫':k}</button>`).join('')}</div></div><footer class="gp-keypad-footer">${stopHTML()}<button type="button" class="gp-button" data-gp="main">${t('cancel')}</button><button type="button" class="gp-button gp-primary" data-gp="key-done">${t('done')}</button></footer></section></div>`;}
  function keypadKey(key){if(key==='clear'){editValue='';editFresh=false;}else if(key==='delete'){editValue=editValue.slice(0,-1);editFresh=false;}else if(/^[\d.\-]$/.test(key)){editValue=(editFresh?'':editValue)+key;editFresh=false;editValue=editValue.replace(/^0+(?=\d)/,'').slice(0,5);}render();}
  async function click(event){
    const button=event.target.closest('[data-gp]');if(!button||button.disabled)return;const command=button.dataset.gp;
    if(command==='machine-stop'){if(machineControl?.canStop?.()!==false)await machineControl?.stop();return;}
    const layer=activeLayer();
    // Reject background events even if dispatched programmatically, or queued
    // before a modal opened. Stop must remain usable during every modal.
    if(layer&&command!=='stop'&&(!layer.contains(button)||['start','apply','save'].includes(command)))return;
    if(['apply','start'].includes(command)&&(!requireCurrentProfile()||switchingDevice))return;
    if(command==='close'){guardDismissClick(event);finishClose();return;}
    if(command==='devices'){if(deviceBlocked())return;await action('loading',()=>showDevices());return;}
    if(command==='scan-devices'){await action('loading',()=>showDevices(true));return;}
    if(command==='device-candidate'){if(busy)return;deviceCandidate=button.dataset.id;render();return;}
    if(command==='rename-device'){renameId=button.dataset.id;const d=devices.find(d=>d.id===renameId);renameValue=d?.alias||d?.name||'';failure='';view='rename';render();root.querySelector('[data-device-alias]')?.focus();return;}
    if(command==='save-device-name'){if(!renameValue.trim()||[...renameValue.trim()].length>24){failure=t('nameRequired');render();return;}await action('loading',async()=>{await api.renameDevice(renameId,renameValue.trim());await showDevices();});return;}
    if(command==='select-device'){if(deviceBlocked())return;await action('loading',async()=>{switchingDevice=true;try{const selected=await api.selectDevice(deviceCandidate);await loadDeviceState(selected||await api.getState());view='main';connectionFailed=false;}finally{switchingDevice=false;}},{refreshAfter:false});return;}
    if(command==='main'){guardDismissClick(event);view='main';render();return;}
    if(command==='dismiss-error'){guardDismissClick(event);connectionFailed=false;render();return;}
    if(command==='increment'){if(blocked())return;const k=button.dataset.field;const n=Number(draft[k]);if(!Number.isFinite(n))return;const step=k==='motorRpm'?10:1;draft[k]=Math.min(GP_FIELDS[k].max,Math.max(1,n+Number(button.dataset.delta)*step));dirty=true;draftOwned=true;note=t('draft');render();return;}
    if(command==='edit'){editKey=button.dataset.field;editValue=String(draft[editKey]??'');editFresh=true;view='keypad';render();return;}
    if(command==='key'){keypadKey(button.dataset.key);return;}
    if(command==='key-done'){const value=Number(editValue);if(editValue===''||!Number.isInteger(value)||value<=0||value>GP_FIELDS[editKey].max){root.querySelector('[data-gp-key-error]').textContent=t('invalid');return;}draft[editKey]=value;dirty=true;draftOwned=true;note=t('draft');guardDismissClick(event);view='main';render();return;}
    if(command==='mode'){draft.bootMode=button.dataset.mode;dirty=true;draftOwned=true;note=t('draft');render();return;}
    if(command==='recipes'){if(deviceBlocked())return;const device=activeDeviceId,revision=deviceRevision;await action('loading',async()=>{const result=await api.listRecipes()||[];if(disposed||revision!==deviceRevision||device!==activeDeviceId||device!==api.cachedState?.deviceId)return;recipes=result;view='recipes';});return;}
    if(command==='borrow'){if(devicePending()||activeDeviceId!==api.cachedState?.deviceId){recipes=[];view='main';failure=t('deviceConflict');render();return;}const recipe=recipes[Number(button.dataset.index)];if(recipe?.config){draft=gpCopy(recipe.config);dirty=true;draftOwned=true;view='main';note=t('borrowed');failure='';render();}return;}
    if(command==='connect'){connectionFailed=false;await action('connecting',async()=>{try{const next=await api.connect();if(disposed)return;if(api.listDevices&&next.deviceId!==activeDeviceId)await loadDeviceState(next);else state=next;if(!state?.connected)throw new Error(t('disconnected'));seedReadback(state,{explicit:true});notify(connectionNote());}catch(error){connectionFailed=true;throw error;}});return;}
    if(command==='read'){await action('reading',async()=>{state=await api.readAll();const seeded=seedReadback(state,{explicit:true});notify(t(seeded?'deviceRead':recipeLoaded||draftOwned?'readKept':previousSettings?'previousSettings':'needsSettings'));});return;}
    if(command==='save'){if(devicePending()||busy||running())return;await action('loading',async()=>{await ensureProfileBinding();await api.saveRecipe(recipeProfile,cleanConfig(),{beforeSend});recipeLoaded=true;draftOwned=true;notify(`${t('savedTo')}「${profile?.title||t('noProfile')}」${profileIsCurrent()?'':` · ${t('savedAfterChange')}`}`);});return;}
    if(command==='apply'){draftOwned=true;await action('applying',async()=>{await api.apply(cleanConfig(),{beforeSend,expectedWorkflow});dirty=false;notify(t('applied'));});return;}
    if(command==='start'){
      draftOwned=true;await action('starting',async()=>{startRequested=true;sawGrinding=false;idleAfterGrinding=false;startInFlight=true;try{await api.start(cleanConfig(),{beforeSend,expectedWorkflow});dirty=false;}catch(error){startRequested=false;sawGrinding=false;throw error;}finally{startInFlight=false;}if(idleAfterGrinding&&sawGrinding){notify(t('finished'));finishClose();}});return;
    }
    if(command==='stop'){
      // Stop stays available while a start/apply command is awaiting its result.
      try{note=t('stopping');render();await api.stop();await refresh();}catch(error){failure=grinderErrorMessage(error,lang);render();}return;
    }
  }
  function input(event){if(event.target.matches('[data-device-alias]')){renameValue=event.target.value;return;}if(event.target.matches('[data-gp-search]')){const q=event.target.value.trim().toLocaleLowerCase();root.querySelectorAll('.gp-recipe').forEach(el=>{el.hidden=!el.textContent.toLocaleLowerCase().includes(q);});}}
  function keydown(event){
    if(event.key==='Escape'){event.preventDefault();if(connectionFailed){connectionFailed=false;render();return;}if(view!=='main'){view='main';render();}else finishClose();return;}
    if(view==='keypad'&&!connectionFailed){if(/^[\d.\-]$/.test(event.key)||event.key==='Backspace'){event.preventDefault();keypadKey(event.key==='Backspace'?'delete':event.key);}if(event.key==='Enter'&&!event.target.closest('button')){event.preventDefault();root.querySelector('[data-gp="key-done"]').click();}}
    if(event.key==='Tab'){
      const layer=activeLayer(),scope=layer||root;
      const candidates=[...scope.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
      if(layer)candidates.push(...root.querySelectorAll('[data-gp="machine-stop"]:not(:disabled)'));
      const focusable=candidates.filter(el=>!el.hidden&&!el.closest('[inert]')&&el.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1),outside=!focusable.includes(document.activeElement);
      if(outside||(event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){
        event.preventDefault();(event.shiftKey?last:first)?.focus();
      }
    }
  }
  try {
    root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('keydown',keydown);render();root.querySelector('.gp-back').focus();
    if(typeof api.subscribe==='function')unsubscribe=api.subscribe(acceptState);
  } catch(error) { finishClose(); throw error; }
  (async()=>{
    busy=true;
    try{
      // Resolve newly imported profiles before reading their saved grind recipe.
      // A failed catalog read leaves device controls available and Save retryable.
      let bindingError = null;
      if (!profileId && refreshProfileLibrary) {
        try { await ensureProfileBinding(); } catch (error) { bindingError = error; }
      }
      if(disposed)return;
      const initial=await api.getState();if(disposed)return;
      await loadDeviceState(initial);
      if (bindingError) failure=grinderErrorMessage(bindingError,lang);if(disposed)return;initializing=false;render();
      if(!observationOnly&&initial?.available!==false&&!initial?.connected){
        note=t('connecting');render();const connectedState=await api.connect();if(disposed)return;
        if(api.listDevices&&connectedState.deviceId!==activeDeviceId)await loadDeviceState(connectedState);else state=connectedState;
        if(!state?.connected)throw new Error(t('disconnected'));
        seedReadback(state);note=connectionNote();
      }
      if(disposed)return;
      if(!observationOnly)timer=setInterval(refresh,1500);
    }catch(error){if(!disposed){failure=grinderErrorMessage(error,lang);connectionFailed=!connected()&&!observationOnly;if(error.code==='ambiguous_device'&&api.listDevices){connectionFailed=false;await showDevices();}if(!observationOnly)timer=setInterval(refresh,1500);}}
    finally{initializing=false;busy=false;if(!disposed)render();}
  })();
  return {close:finishClose,destroy:finishClose,refresh,updateMachine};
}

export function grinderEntryState(api,state,language='zh') {
  const en=language.startsWith('en');
  const missing=state?.observationReason==='plugin_missing';
  const ready=state?.available===true&&state?.observation==='ready';
  return {disabled:!api||missing,connected:ready&&Boolean(state?.connected),
    title:!api?(en?'Grinder controls are not ready yet.':'磨豆机控制尚未就绪。')
      :missing?(en?'The grinder plugin is not installed.':'磨豆机插件尚未安装。')
      :state?.observationReason==='incompatible_driver'?(en?'Update the companion grinder plugin.':'请更新配套磨豆机插件。')
      :!ready?(en?'Status is unconfirmed. Tap to read again.':'状态尚未确认，点击重新读取。')
      :state.connected?(en?'Connected':'已连接'):(en?'Connect grinder':'连接磨豆机')};
}

function attachGrinderEntry(){
  const button=document.querySelector('#grinderButton'),host=document.querySelector('#grinderHost');
  if(!button||!host||button.dataset.gpAttached)return;
  button.dataset.gpAttached='true';
  const cssUrl=new URL('./grinder.css?v=0.2.29-rc.7',import.meta.url).href;
  if(![...document.querySelectorAll('link[rel="stylesheet"]')].some(link=>link.href===cssUrl)){
    const link=document.createElement('link');link.rel='stylesheet';link.href=cssUrl;document.head.appendChild(link);
  }
  let activeMount=null,opening=false,openRetryAfter=0,protection=false,observedApi=null,unsubscribeEntry=null;
  function paintEntry(state){
    const lang=document.documentElement.lang?.toLowerCase().startsWith('en')?'en':'zh';
    const entry=grinderEntryState(observedApi,state,lang);
    button.disabled=entry.disabled;
    button.classList.toggle('connected',entry.connected);
    button.setAttribute('aria-disabled',String(entry.disabled));
    button.title=entry.title;
  }
  function updateEntry(){
    const currentApi=window.thisCup?.client?.grinder??null;
    if(currentApi!==observedApi){
      unsubscribeEntry?.();unsubscribeEntry=null;observedApi=currentApi;
      if(typeof currentApi?.subscribe==='function')unsubscribeEntry=currentApi.subscribe(paintEntry);
    }
    paintEntry(currentApi?.cachedState);
    activeMount?.updateMachine();
  }
  function open(observationOnly=false){
    if(activeMount||opening||(observationOnly&&Date.now()<openRetryAfter))return;
    const app=window.thisCup;
    if(!app?.client?.grinder){app?.notice?.(document.documentElement.lang?.startsWith('en')?'Grinder controls are not ready yet.':'磨豆机控制尚未就绪。');return;}
    if(!observationOnly&&app.client.grinder.cachedState?.observationReason==='plugin_missing'){updateEntry();return;}
    // State refresh publishes synchronously and may request this panel again.
    // Claim the opening operation before refresh or mount can notify listeners.
    opening=true;
    try {
    protection=observationOnly;
    activeMount=mountGrinderUI(host,{client:app.client,getWorkflow:()=>app.getWorkflow(),getProfileIdentity:()=>app.getProfileIdentity?.()??null,refreshProfileLibrary:()=>app.refreshProfileLibrary(),onNotice:message=>app.notice?.(message),onClose:()=>{activeMount=null;protection=false;},observationOnly,machineControl:{active:()=>app.isRunning(),canStop:()=>String(app.state?.snapshot?.machine?.state?.state??'').toLowerCase()!=='fwupgrade',stop:()=>app.stop()}});
    openRetryAfter=0;
    if(app.client.grinder.cachedState?.observation!=='ready'){
      try { Promise.resolve(app.client.grinder.refreshObservation?.()).catch(()=>{}); } catch {}
    }
    } catch(error) {
      protection=false;
      openRetryAfter=Date.now()+5000;
      app.notice?.(document.documentElement.lang?.startsWith('en')?'Unable to open grinder controls. Please try again.':'无法打开研磨页面，请重试。');
    } finally { opening=false; }
  }
  button.addEventListener('click',()=>open(false));
  window.thisCupGrinderPanel={updateEntry,openProtection:()=>open(true),closeProtection:()=>{if(protection)activeMount?.close();}};
  // The main app can replace its client after reconnecting. Rebind the entry's
  // observer on its render hook, without opening a second device connection.
  const previousDevicesRender=window.thisCupDevicesRender;
  window.thisCupDevicesRender=(...args)=>{previousDevicesRender?.(...args);updateEntry();};
  updateEntry();window.thisCup?.render?.();
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attachGrinderEntry,{once:true});
  else attachGrinderEntry();
}
