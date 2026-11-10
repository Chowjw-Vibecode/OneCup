export const DEFAULT_DISPLAY_PREFERENCES = Object.freeze({activeBrightness:80,sleepBrightness:40,rotationMinutes:20});
const PATH='/store/thiscup/display';
const copy=value=>JSON.parse(JSON.stringify(value));
const failure=code=>Object.assign(new Error(code),{displayCode:code});
const same=(a,b)=>Object.keys(DEFAULT_DISPLAY_PREFERENCES).every(key=>a?.[key]===b?.[key]);

export function displayPreferences(value) {
  if(value===null)return {...DEFAULT_DISPLAY_PREFERENCES};
  if(!value||Array.isArray(value)||![value.activeBrightness,value.sleepBrightness].every(v=>Number.isInteger(v)&&v>=0&&v<=100)||![10,20].includes(value.rotationMinutes))throw failure('displayReadFailed');
  return Object.fromEntries(Object.keys(DEFAULT_DISPLAY_PREFERENCES).map(key=>[key,value[key]]));
}
function checkedDisplay(value) {
  if(!value||typeof value.platformSupported?.brightness!=='boolean'||![value.brightness,value.requestedBrightness].every(v=>Number.isInteger(v)&&v>=0&&v<=100)||typeof value.lowBatteryBrightnessActive!=='boolean')throw failure('displayBrightnessUnconfirmed');
  return value;
}
function brightnessFor(preferences,state) {
  state=typeof state==='string'?state.toLowerCase():'';
  if(state==='sleeping')return preferences.sleepBrightness;
  if(['booting','busy','idle','schedidle','heating','preheating','espresso','hotwater','flush','steam','steamrinse','skipstep','cleaning','descaling','calibration','selftest','airpurge','needswater','error','fwupgrade'].includes(state))return preferences.activeBrightness;
  return null;
}

// Only the embedded tablet owns automatic brightness. Browser saves are explicit
// one-off actions. Shared preferences have no native change stream or CAS.
export function createDisplayManager({client,isController=()=>false,getMachineState=()=>null,onChange=()=>{},now=()=>Date.now()}={}) {
  let preferences={...DEFAULT_DISPLAY_PREFERENCES},ready=false,display=null,error='',message='',busy=false,closed=false;
  let queue=Promise.resolve(),refreshing=null,refreshAgain=false,lastSync=-Infinity,lastMachine=null,machineRevision=0;
  const snapshot=()=>({preferences:copy(preferences),ready,display:display?copy(display):null,error,message,busy});
  const notify=()=>{if(!closed)onChange(snapshot());};
  const enqueue=fn=>{const result=queue.then(()=>closed?null:fn());queue=result.catch(()=>{});return result;};
  async function readPreferences(){
    const raw=await client.get(PATH),result=displayPreferences(raw);
    if(closed)return;
    preferences=result;ready=true;
    return raw;
  }
  async function applyBrightness(readMachine,shouldApply) {
    display=checkedDisplay(await client.get('/display'));
    if(closed)return false;
    if(!display.platformSupported.brightness){message='displayUnsupported';return false;}
    const target=brightnessFor(preferences,readMachine());
    if(!shouldApply()||target===null)return false;
    if(display.requestedBrightness!==target){
      if(closed)return false;
      await client.put('/display/brightness',{brightness:target});
      display=checkedDisplay(await client.get('/display'));
    }
    if(display.requestedBrightness!==target||display.brightness!==(display.lowBatteryBrightnessActive?Math.min(target,20):target))throw failure('displayBrightnessUnconfirmed');
    return true;
  }
  function refresh() {
    if(closed)return Promise.resolve(null);
    if(refreshing){refreshAgain=true;return refreshing;}
    refreshing=enqueue(async()=>{
      do {
        refreshAgain=false;lastSync=now();error='';
        try{await readPreferences();if(closed)return;await applyBrightness(getMachineState,isController);}
        catch(e){error=e.displayCode||'displayReadFailed';}
        notify();
      }while(refreshAgain&&!closed);
      return snapshot();
    }).finally(()=>{refreshing=null;});
    return refreshing;
  }
  async function save(input) {
    if(!ready)throw failure('displayReadFailed');
    const requested=displayPreferences(input);
    if(closed)return null;
    busy=true;error='';message='';notify();
    return enqueue(async()=>{
      let persisted=false;
      try {
        await client.post(PATH,{schemaVersion:1,...requested});
        const readback=await readPreferences();
        if(closed)return null;
        if(readback===null||!same(preferences,requested))throw failure('displaySaveMismatch');
        persisted=true;message='displaySaved';
        const revision=machineRevision,machine=await client.get('/machine/state');
        const applied=await applyBrightness(()=>revision===machineRevision?machine?.state?.state:getMachineState(),()=>true);
        if(applied)message='displaySavedApplied';
        else if(message!=='displayUnsupported')message='displaySavedPending';
        return {saved:true,applied};
      }catch(e){error=persisted?'displaySavedUnconfirmed':e.displayCode||'displaySaveFailed';return {saved:persisted,applied:false};}
      finally{busy=false;lastSync=now();notify();}
    });
  }
  return {
    refresh,save,get state(){return snapshot();},
    machineChanged(){const state=getMachineState();if(state!==lastMachine){lastMachine=state;machineRevision++;if(isController())refresh();}},
    tick({settingsOpen=false}={}){if(!closed&&!refreshing&&!busy&&(isController()||settingsOpen)&&now()-lastSync>=10000)return refresh();},
    stop(){closed=true;refreshAgain=false;},
  };
}
