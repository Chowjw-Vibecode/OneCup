import {mirrorReleasesUrl,trustedMirrorAsset,normalizeMirrorReleases,confirmedMirrorDownloadFailure} from './china-mirror.js?v=0.2.37';
// Skin-only updates via Decaid's documented installer. No machine command or data reset.
// Native installer behavior: decentespresso/decaid lib/src/services/webserver/webui_handler.dart
// and lib/src/webui_support/webui_storage.dart (installFromUrl / _installFromDirectory).
import {isUsageEnvironment} from './usage.js?v=0.2.37';
export const UPDATE_STORAGE_KEY='thiscup.autoUpdate.v1';
export const CHINA_MIRROR_STORAGE_KEY='onecup.chinaMirror.v1';
export const CHINA_MIRROR_REPOSITORY='chowjw/OneCup';
export const RELEASES_URL='https://api.github.com/repos/Chowjw-Vibecode/OneCup/releases?per_page=100';
const HOUR=3_600_000, CHECK_INTERVAL=HOUR, START_DELAY=60_000, RECHECK=30_000;
const versionPattern=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/;
function version(value){const m=typeof value==='string'&&value.match(versionPattern);return m?{value:value.replace(/^v/,''),base:m.slice(1,4).map(Number),channel:m[4]??null,sequence:Number(m[5]??0)}:null;}
function compare(a,b){for(let i=0;i<3;i++)if(a.base[i]!==b.base[i])return a.base[i]-b.base[i];if(a.channel===b.channel)return a.sequence-b.sequence;if(!a.channel)return 1;if(!b.channel)return -1;return ['alpha','beta','rc'].indexOf(a.channel)-['alpha','beta','rc'].indexOf(b.channel);}
function trustedAsset(url,tag,asset,legacy=false){if(trustedMirrorAsset(url,tag,asset,CHINA_MIRROR_REPOSITORY))return true;try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&(u.pathname===`/Chowjw-Vibecode/OneCup/releases/download/${tag}/${asset}`||(legacy&&u.pathname===`/Chowjw-Vibecode/This-Cup/releases/download/${tag}/${asset}`));}catch{return false;}}
export function selectSkinUpdate(releases,currentVersion){
 const current=version(currentVersion);if(!current||!Array.isArray(releases))return null;
 const options=[];
 for(const release of releases){
  const next=version(release?.tag_name);if(!next||release.tag_name!=='v'+next.value||release.draft!==false||release.prerelease!==Boolean(next.channel)||compare(next,current)<=0)continue;
  // Prerelease installs follow their channel across newer versions and may move to stable.
  // A stable install never moves to prereleases.
  if(current.channel){if(next.channel&&next.channel!==current.channel)continue;}
  else if(next.channel)continue;
  const name=`onecup-${next.value}.zip`;
  const asset=release.assets?.find(a=>a?.name===name&&a.state==='uploaded'&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=150*1024*1024&&trustedAsset(a.browser_download_url,release.tag_name,name));
  if(asset)options.push({version:next.value,url:asset.browser_download_url,parsed:next});
 }
 options.sort((a,b)=>compare(b.parsed,a.parsed));
 return options.length?{version:options[0].version,url:options[0].url}:null;
}
function origin(context){try{return new URL(context.apiUrl).origin;}catch{return '';}}
export function canAutoInstall(context){
 return isUsageEnvironment(context)&&context.canInstall===true&&!context.busy&&
  context.connection?.connected===true&&context.connection.machineConnected===true&&context.connection.stale===false&&
  Array.isArray(context.settings?.simulatedDevices)&&context.settings.simulatedDevices.length===0&&
  ['idle','schedidle','sleeping'].includes(context.machineState);
}
function decode(raw){
 const v=JSON.parse(raw);if(!v||typeof v.enabled!=='boolean'||!Number.isFinite(v.nextCheck)||v.nextCheck<0||Object.keys(v).sort().join(',')!=='enabled,nextCheck,pending')throw Error('invalid preference');
 if(v.pending!==null){const p=v.pending;if(!p||Object.keys(p).sort().join(',')!=='apiOrigin,url,version'||!version(p.version)||![`onecup-${p.version}.zip`,`this-cup-${p.version}.zip`].some(name=>trustedAsset(p.url,'v'+p.version,name,true)))throw Error('invalid pending update');const u=new URL(p.apiOrigin);if(u.origin!==p.apiOrigin||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!['http:','https:'].includes(u.protocol))throw Error('invalid pending origin');}
 return v;
}
export function createSkinUpdater({getContext=()=>({}),getClient=()=>null,currentVersion,
 storage,fetchImpl=globalThis.fetch?.bind(globalThis),
 now=()=>Date.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),
 reload=()=>globalThis.location.reload(),onStatus=()=>{},events=globalThis.window}={}){
 let saved={enabled:false,nextCheck:0,pending:null},preferenceSaved=true,storageBlocked=false,active=false,disposed=false,timer=null,readyAt=0,working=false,installedVersion=null,availableTarget=null;
 let state={phase:'disabled',version:null};
 let chinaMirror=true,mirrorPreferenceSaved=true,checkSource=null,fallbackUsed=false;
 try{if(storage===undefined)storage=globalThis.localStorage;}catch{storageBlocked=true;preferenceSaved=false;}
 const context=()=>{try{return getContext()??{}}catch{return {}}};
 function emit(phase,detail={}){state={phase,version:installedVersion??saved.pending?.version??null,source:checkSource,fallback:fallbackUsed,...detail};try{onStatus({...state,enabled:saved.enabled,preferenceSaved,chinaMirror,mirrorPreferenceSaved});}catch{}}
 function read(){if(storageBlocked)return false;try{const raw=storage.getItem(UPDATE_STORAGE_KEY);if(raw!==null)saved=decode(raw);return true;}catch{storageBlocked=true;preferenceSaved=false;return false;}}
 function persist(){if(storageBlocked){preferenceSaved=false;return false;}try{const raw=JSON.stringify(saved);storage.setItem(UPDATE_STORAGE_KEY,raw);if(storage.getItem(UPDATE_STORAGE_KEY)!==raw)throw Error('readback failed');preferenceSaved=true;return true;}catch{storageBlocked=true;preferenceSaved=false;return false;}}
 function readMirror(){try{const raw=storage.getItem(CHINA_MIRROR_STORAGE_KEY);if(raw!==null&&raw!=='true'&&raw!=='false')throw Error('invalid mirror preference');chinaMirror=raw!=='false';mirrorPreferenceSaved=true;return true;}catch{mirrorPreferenceSaved=false;return false;}}
 function setChinaMirrorEnabled(value){
  chinaMirror=value===true;
  try{const raw=String(chinaMirror);storage.setItem(CHINA_MIRROR_STORAGE_KEY,raw);if(storage.getItem(CHINA_MIRROR_STORAGE_KEY)!==raw)throw Error('readback failed');mirrorPreferenceSaved=true;}catch{mirrorPreferenceSaved=false;}
  if(!working&&!saved.pending&&!installedVersion&&mirrorPreferenceSaved&&read()){availableTarget=null;saved.nextCheck=0;persist();emit(saved.enabled?'waiting':'disabled');refresh();}
  else emit(state.phase,state);
  return chinaMirror;
 }
 async function lookup(){
  const init=()=>({headers:{Accept:'application/json'},credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15_000)});
  fallbackUsed=false;
  if(chinaMirror){
   checkSource='china';emit('checking');
   try{const response=await fetchImpl(mirrorReleasesUrl(CHINA_MIRROR_REPOSITORY),init());if(!response.ok)throw Error('mirror unavailable');return selectSkinUpdate(normalizeMirrorReleases(await response.json(),CHINA_MIRROR_REPOSITORY),currentVersion);}catch{fallbackUsed=true;}
  }
  checkSource='github';emit('checking');
  const response=await fetchImpl(RELEASES_URL,init());if(!response.ok)throw Error('release check failed');return selectSkinUpdate(await response.json(),currentVersion);
 }
 function cancel(){if(timer!==null)clearTimer(timer);timer=null;}
 function schedule(delay){cancel();if(active&&!disposed&&(saved.enabled||saved.pending))timer=setTimer(()=>{timer=null;void tick();},Math.max(0,delay));}
 function finishInstalled(target){
  // Preserve an opt-out or a newer in-flight update saved by another page.
  if(!read()||!preferenceSaved){installedVersion=target.version;emit('storage_error');return;}
  if(saved.pending&&compare(version(saved.pending.version),version(target.version))>0){emit('awaiting_confirmation');schedule(60_000);return;}
  installedVersion=target.version;saved.pending=null;
  if(!persist()){emit('storage_error');return;}
  emit('reload_pending');
  if(active&&saved.enabled&&canAutoInstall(context())){try{reload();}catch{emit('reload_pending');}return;}
  schedule(RECHECK);
 }
 async function verify(owner,target){
  // Read-only resolution remains allowed after opt-out or a machine operation starts.
  if(!isUsageEnvironment(context())||origin(context())!==target.apiOrigin||getClient()!==owner){emit('awaiting_confirmation');schedule(60_000);return;}
  try{const skin=await owner.get('/webui/skins/this-cup');const installed=skin?.id==='this-cup'?version(skin.version):null;if(installed&&compare(installed,version(target.version))>=0){finishInstalled({version:installed.value});return;}}catch{}
  emit('awaiting_confirmation');schedule(60_000);
 }
 async function install(owner,target){
  // Recheck the live machine state immediately before submitting the installer.
  const skin=await owner.get('/webui/skins/this-cup');
  const installed=skin?.id==='this-cup'?version(skin.version):null;
  if(!installed)throw Error('installed skin version is unknown');
  const machineRead=await owner.get('/machine/state');
  // Another page can opt out or submit an update while these reads are in flight.
  if(!read()||!preferenceSaved){emit('storage_error');return;}
  if(saved.pending){await verify(owner,saved.pending);return;}
  if(!saved.enabled){emit('disabled');return;}
  if(!readMirror()){emit('storage_error');return;}
  if(!chinaMirror&&trustedMirrorAsset(target.url,'v'+target.version,`onecup-${target.version}.zip`,CHINA_MIRROR_REPOSITORY)){availableTarget=null;saved.nextCheck=0;if(!persist()){emit('storage_error');return;}emit('waiting');schedule(RECHECK);return;}
  if(!active||disposed||!['idle','schedidle','sleeping'].includes(machineRead?.state?.state)||getClient()!==owner||!canAutoInstall(context())){emit('waiting');schedule(RECHECK);return;}
  if(compare(installed,version(target.version))>=0){finishInstalled({version:installed.value});return;}
  saved.pending={...target,apiOrigin:origin(context())};
  if(!persist()){emit('storage_error');return;}
  emit('installing');
  try{
   if(typeof owner.request==='function')await owner.request('POST','/webui/skins/install/url',{url:target.url},120_000);
   else await owner.post('/webui/skins/install/url',{url:target.url});
  }catch(error){
   // Only a fully received, audited download-phase error can release this reservation.
   // Timeouts, unknown builds and copy failures continue through read-only verification.
   if(trustedMirrorAsset(target.url,'v'+target.version,`onecup-${target.version}.zip`,CHINA_MIRROR_REPOSITORY)&&confirmedMirrorDownloadFailure(error,context().nativeCommit)){
    if(read()&&saved.pending?.url===target.url&&saved.pending.version===target.version&&saved.pending.apiOrigin===origin(context())&&getClient()===owner){
     saved.pending=null;availableTarget=null;if(!persist()){emit('storage_error');return;}
     if(!saved.enabled){emit('disabled');return;}
     try{
      const response=await fetchImpl(RELEASES_URL,{headers:{Accept:'application/json'},credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15_000)});
      if(!response.ok)throw Error('fallback unavailable');
      const releases=await response.json();if(!Array.isArray(releases))throw Error('invalid releases');
      const fallback=selectSkinUpdate(releases.filter(r=>r.tag_name==='v'+target.version),currentVersion);
      if(!fallback||new URL(fallback.url).hostname!=='github.com')throw Error('same-version package unavailable');
      if(!active||disposed||!read()||!saved.enabled||getClient()!==owner)return;
      if(saved.pending){await verify(owner,saved.pending);return;}
      checkSource='github';fallbackUsed=true;availableTarget=fallback;emit('available',{version:fallback.version});schedule(RECHECK);
     }catch{emit('error');schedule(CHECK_INTERVAL);}
     return;
    }
   }
   // These responses reject the route before an installer can run. Other failures remain uncertain.
   if([401,403,404,405].includes(error?.status)){
    if(read()&&saved.pending?.version===target.version){saved.pending=null;persist();emit('unsupported');schedule(CHECK_INTERVAL);return;}
   }
   // A submitted POST may still finish natively. Read back; never replay it.
  }
  await verify(owner,saved.pending??{...target,apiOrigin:origin(context())});
 }
 async function tick(manual=false){
  if(!active||disposed||working)return;
  if(!saved.pending&&!saved.enabled&&!manual)return;
  working=true;
  try{
   if(installedVersion){emit('reload_pending');if(saved.enabled&&canAutoInstall(context())){try{reload();}catch{}}else schedule(RECHECK);return;}
   const owner=getClient();
   if(saved.pending){if(owner?.get)await verify(owner,saved.pending);else{emit('awaiting_confirmation');schedule(60_000);}return;}
   if(!read()||!preferenceSaved||!readMirror()){emit('storage_error');return;}
   if(!saved.enabled&&!manual){emit('disabled');return;}
   if(manual&&!isUsageEnvironment(context())){emit('unsupported');return;}
   if(!manual&&now()<readyAt){schedule(readyAt-now());return;}
   if(!manual&&(!canAutoInstall(context())||!owner?.get||!owner?.post)){emit(availableTarget?'available':'waiting',availableTarget?{version:availableTarget.version}:{});schedule(RECHECK);return;}
   if(!manual&&availableTarget){const target=availableTarget;if(typeof owner.exclusive==='function')await owner.exclusive(()=>install(owner,target));else await install(owner,target);return;}
   if(!manual&&now()<saved.nextCheck){emit('current');schedule(saved.nextCheck-now());return;}
   saved.nextCheck=now()+CHECK_INTERVAL;if(!persist()){emit('storage_error');return;}
   const requestedMirror=chinaMirror;
   const target=await lookup();
   if(!active||disposed)return;
   if(!read()||!preferenceSaved||!readMirror()){emit('storage_error');return;}
   if(chinaMirror!==requestedMirror){availableTarget=null;saved.nextCheck=0;persist();emit(saved.enabled?'waiting':'disabled');schedule(RECHECK);return;}
   availableTarget=target;
   if(!saved.enabled){emit(manual?(target?'available':'current'):'disabled',{version:target?.version??null});return;}
   if(!target){emit('current');schedule(CHECK_INTERVAL);return;}
   if(getClient()!==owner||!canAutoInstall(context())){emit('available',{version:target.version});schedule(RECHECK);return;}
   if(typeof owner.exclusive==='function')await owner.exclusive(()=>install(owner,target));else await install(owner,target);
  }catch{emit(saved.pending?'awaiting_confirmation':'error');schedule(saved.pending?60_000:CHECK_INTERVAL);}
  finally{working=false;}
 }
 function start(){if(disposed||active)return;active=true;readyAt=now()+START_DELAY;read();
  // Shorten a previous six-hour reservation once, without extending it on reopen.
  if(preferenceSaved&&saved.enabled&&!saved.pending&&saved.nextCheck>now()+CHECK_INTERVAL){saved.nextCheck=now()+CHECK_INTERVAL;persist();}
  if(!preferenceSaved)emit('storage_error');else{emit(saved.pending?'awaiting_confirmation':saved.enabled?'waiting':'disabled');schedule(START_DELAY);}}
 function stop(){active=false;cancel();}
 function refresh(){if(!active||disposed||working)return;if(saved.pending){schedule(0);return;}if(!saved.enabled)return;schedule(Math.max(0,readyAt-now()));}
 function setEnabled(value){saved.enabled=value===true;if(saved.enabled&&!saved.pending)saved.nextCheck=Math.min(saved.nextCheck,now()+CHECK_INTERVAL);persist();cancel();if(saved.pending){emit('awaiting_confirmation');schedule(0);}else if(!preferenceSaved)emit('storage_error');else{emit(saved.enabled?'waiting':'disabled');if(saved.enabled)refresh();}return saved.enabled;}
 const pageShow=event=>{if(event.persisted)start();};
 read();readMirror();events?.addEventListener('pagehide',stop);events?.addEventListener('pageshow',pageShow);
 return{get enabled(){return saved.enabled;},get preferenceSaved(){return preferenceSaved;},get status(){return {...state,enabled:saved.enabled,preferenceSaved,chinaMirror,mirrorPreferenceSaved};},get chinaMirrorEnabled(){return chinaMirror;},get mirrorPreferenceSaved(){return mirrorPreferenceSaved;},start,stop,refresh,setEnabled,setChinaMirrorEnabled,checkNow:()=>tick(true),
  dispose(){stop();disposed=true;events?.removeEventListener('pagehide',stop);events?.removeEventListener('pageshow',pageShow);}};
}
