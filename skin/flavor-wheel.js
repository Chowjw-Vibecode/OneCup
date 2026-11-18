// Isolated flavor selection screen; confirmation updates a draft, never a device.
export function openFlavorWheel({values=[],locale='zh',onConfirm=()=>{},onClose=()=>{}}={}) {
 const previous=document.activeElement;
 const box=document.createElement('div');box.className='flavor-wheel-overlay';
 box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',locale==='zh'?'选择风味':'Choose flavors');
 box.style.cssText='position:fixed;inset:0;z-index:20000;background:#faf9f6';
 const frame=document.createElement('iframe');frame.title=locale==='zh'?'风味轮':'Flavor wheel';frame.style.cssText='display:block;border:0;width:100%;height:100%';
 const indicators=[];
 let closed=false;
 function close(){if(closed)return;closed=true;window.removeEventListener('message',receive);for(const indicator of indicators)indicator.remove();box.remove();if(previous?.isConnected)previous.focus({preventScroll:true});onClose();}
 function receive(event){
  if(closed||event.source!==frame.contentWindow||event.origin!==location.origin)return;
  if(event.data?.type==='thiscup-flavor-ready'){
   for(const id of ['flavorWaterTop','flavorWaterZoom']){
    const slot=frame.contentDocument?.getElementById(id);
    if(slot && !slot.firstElementChild){
     const indicator=document.createElement('onecup-water');
     slot.append(indicator);
     indicators.push(indicator);
    }
   }
   frame.contentWindow.postMessage({type:'thiscup-flavor-init',values:[...values]},location.origin);
  }
  else if(event.data?.type==='thiscup-flavor-cancel')close();
  else if(event.data?.type==='thiscup-flavor-confirm'&&Array.isArray(event.data.values)&&event.data.values.every(v=>typeof v==='string')){const chosen=[...event.data.values];close();onConfirm(chosen);}
 }
 window.addEventListener('message',receive);
 frame.src=new URL(`./flavor-wheel/index.html?lang=${locale==='en'?'en':'zh'}&v=0.2.42&rev=water-20261118`,import.meta.url).href;
 box.append(frame);document.body.append(box);frame.focus();
 return {close};
}
