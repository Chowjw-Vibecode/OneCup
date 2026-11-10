// The machine owns the steam lifecycle; dismissing this prompt never stops it.
export function pitcherLifecycle(){
 let shown=false,visible=false,stopping=false,returnRequested=false;
 return {
  update(state,substate,fresh=true){
   if(!fresh)return {visible,stopping};
   if(state!=='steam'){const returnAfterStop=returnRequested&&state==='idle';shown=false;visible=false;stopping=false;returnRequested=false;return {visible,stopping,returnAfterStop};}
   if(substate==='puffing'&&!shown){shown=true;visible=true;}
   if(substate!=='puffing'&&!stopping)visible=false;
   return {visible,stopping};
  },
  dismiss(){visible=false;},
  stop(){if(stopping)return false;stopping=true;returnRequested=true;return true;},
  reconnect(){stopping=false;},
  failed(){stopping=false;returnRequested=false;}
 };
}
export function mountSteamPitcher(api){
 let lifecycle=pitcherLifecycle(),owner=api.client,ownerBase=api.client?.base||api.client?.baseUrl;
 const overlay=document.createElement('div');overlay.className='steam-pitcher-overlay';overlay.hidden=true;
 overlay.innerHTML='<section class="steam-pitcher-panel" role="dialog" aria-modal="true" aria-labelledby="steamPitcherTitle"><img src="./assets/ceramic/steam-pitcher-approved.png" alt=""><div class="steam-pitcher-actions"><button class="steam-pitcher-back" type="button"></button><button class="steam-pitcher-stop" type="button"></button></div><h2 id="steamPitcherTitle"></h2></section>';
 document.body.append(overlay);
 const back=overlay.querySelector('.steam-pitcher-back'),stop=overlay.querySelector('.steam-pitcher-stop'),title=overlay.querySelector('h2');
 let stopping=false,fresh=false;
 function syncOwner(){
  const base=api.client?.base||api.client?.baseUrl;
  if(owner!==api.client||ownerBase!==base){
   // Reconnecting the same host preserves the once-per-cycle dismissal.
   // A new session still invalidates its in-flight stop acknowledgement.
   if(ownerBase!==base)lifecycle=pitcherLifecycle();
   else lifecycle.reconnect();
   // Same-host reconnect preserves the intent to return once fresh idle arrives.
   owner=api.client;ownerBase=base;stopping=false;overlay.hidden=true;
  }
 }
 const isFresh=()=>Boolean(api.state.connection.connected&&api.state.connection.machineConnected&&!api.state.connection.stale);

 back.onclick=()=>{lifecycle.dismiss();overlay.hidden=true;};
 stop.onclick=async()=>{
  syncOwner();
  if(!isFresh()||api.machineState()!=='steam'||!lifecycle.stop())return;
  const requestLifecycle=lifecycle,requestOwner=owner,requestBase=ownerBase;
  const current=()=>requestLifecycle===lifecycle&&requestOwner===api.client&&requestBase===(api.client?.base||api.client?.baseUrl);
  stopping=true;stop.disabled=true;back.disabled=true;
  try{await api.command('stop');if(current()&&!api.state.stopAwaiting&&!api.state.stopPending&&api.machineState()!=='idle')lifecycle.failed();}
  catch{if(current())lifecycle.failed();}
 };
 return {render(){
  syncOwner();
  const s=api.state,zh=s.language==='zh';fresh=isFresh();
  const phase=s.snapshot.machine?.state?.substate;
  // A rejected stop is reported by the existing command layer. Allow retry.
  if(fresh&&stopping&&!s.stopPending&&!s.stopAwaiting&&api.machineState()!=='idle')lifecycle.failed();
  const view=lifecycle.update(api.machineState(),phase,fresh);stopping=view.stopping;
  overlay.hidden=!view.visible;
  back.textContent=zh?'‹ 返回':'‹ Back';stop.textContent=stopping?(zh?'正在停止…':'Stopping…'):(zh?'■ 停止蒸汽':'■ Stop steam');
  title.textContent=zh?'可移走奶缸':'You can remove the pitcher';title.lang=zh?'zh':'en';
  stop.disabled=!fresh||stopping;back.disabled=stopping;
  if(view.returnAfterStop&&s.modal==='ceramicSteamDialog')api.closeDialog();
 }};
}
