/* Independently ported from our core.tcl / recipes.tcl. Decaid owns BLE links. */
function createPlugin(host) {
  const ID = 'thiscup-crystal.reaplugin';
  const SERVICE = '7fa2d10c-12f3-4b9e-9d77-1a9b65432100';
  const CHANNEL = {motorRpm:'01',feedRpm:'02',bootSign:'03',sysState:'04',servoAngle:'05',targetAngle:'06'};
  const MAX = {motorRpm:1500,feedRpm:150,bootSign:10,sysState:1,servoAngle:1500,targetAngle:1500};
  const MODE = {manual:1,timed:2,smart:3};
  const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const KEYS = Object.keys(CHANNEL);
  const devices = new Map();
  const defaults = {grindSize:null,motorRpm:850,feedRpm:20,bootMode:'manual'};
  let preferences={selectedId:null,aliases:{},names:{},configs:{}},preferencesTouched=false,preferencesReady=false,currentWorkflow=null;
  const own=(map,key)=>Object.prototype.hasOwnProperty.call(map,key);
  const configFor=id=>copy(id&&own(preferences.configs,id)?preferences.configs[id]:defaults);
  const nameFor=id=>id&&own(preferences.names,id)?preferences.names[id]:'CRYSTAL';
  const aliasFor=id=>id&&own(preferences.aliases,id)?preferences.aliases[id]:'';
  const cleanName=value=>value.trim().replace(/\s+/g,' ');
  const nameKey=value=>cleanName(value).toLowerCase();
  function persist(){preferencesTouched=true;host.storage({type:'write',namespace:ID,key:'devicePreferences',data:JSON.stringify(preferences)});emit();}
  function fail(message,code){const e=new Error(message);e.code=code;throw e;}
  function requireStartGap(gap) {
    if (!Number.isInteger(gap) || gap < 10) fail('刀距过近，拒绝启动。', 'gap_too_small');
  }
  function validDevice(id){return typeof id==='string'&&(id.startsWith('plugin:'+ID+':crystal:')||devices.has(id));}
  function assertSwitchable(){if([...devices.values()].some(d=>{const s=d.snapshot();return s.busy||s.connected&&s.state!=='idle'}))fail('磨豆机正在运行或状态待确认，请等待后再切换','busy');}
  function selectDevice(id,name){if(!preferencesReady)fail('设备偏好正在读取，请稍后重试','preferences_loading');if(!validDevice(id))fail('无效的磨豆机身份','invalid_device');if(preferences.selectedId!==id){assertSwitchable();for(const d of devices.values())d.selectionChanged();preferences.selectedId=id;}if(typeof name==='string'&&name.trim())preferences.names[id]=name.trim().slice(0,80);persist();return identity();}
  function identity(){const id=preferences.selectedId;return {deviceId:id,deviceName:id?nameFor(id):null,deviceAlias:id?aliasFor(id):null};}
  const canonical = value => Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  function workflowSnapshot(value) {
    if(typeof value?.id!=='string'||!value.id||!value.profile||typeof value.profile!=='object')return null;
    return JSON.stringify(canonical({id:value.id,profile:value.profile}));
  }
  const usableConfig = value => value && ['grindSize','motorRpm','feedRpm'].every(key=>Number.isInteger(value[key])&&value[key]>0&&value[key]<=(key==='feedRpm'?150:1500)) && Object.prototype.hasOwnProperty.call(MODE,value.bootMode);
  const copy = x => JSON.parse(JSON.stringify(x));
  const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
  const characteristic = key => SERVICE.slice(0,-2)+CHANNEL[key];
  const integer = (value,max,label) => {
    if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>max) throw new Error(label+'超出范围');
    return value;
  };
  function cleanConfig(input, partial, base=defaults) {
    if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('无效的研磨参数');
    const out = partial ? copy(base) : {};
    for(const [key,max] of [['grindSize',1500],['motorRpm',1500],['feedRpm',150]]) {
      if(partial&&!Object.prototype.hasOwnProperty.call(input,key)) continue;
      out[key]=integer(input[key],max,key);
    }
    if(!partial||Object.prototype.hasOwnProperty.call(input,'bootMode')) {
      if(!Object.prototype.hasOwnProperty.call(MODE,input.bootMode)) throw new Error('无效的启动模式');
      out.bootMode=input.bootMode;
    }
    return out;
  }
  function saveConfig(id,next) {
    if(!id)fail('请先选择磨豆机','missing_device');preferences.configs[id]=copy(next);persist();return copy(next);
  }
  function emit() { try {host.emit('changed',{what:'state'});}catch(_){} }
  function decode(key,data) {
    if(typeof data!=='string') throw new Error('设备返回了未知数据类型');
    // Decaid's QuickJS runtime does not provide browser atob. The bridge sends
    // canonical Base64; CRYSTAL uses exactly two bytes (SYS_STATE may use one).
    if(!/^[A-Za-z0-9+/]{2}(?:[A-Za-z0-9+/]=|==)$/.test(data))throw new Error('设备返回无效编码或数据长度');
    const a=BASE64.indexOf(data[0]),b=BASE64.indexOf(data[1]);
    const oneByte=data[2]==='=',c=oneByte?0:BASE64.indexOf(data[2]);
    if((oneByte&&(b&15)!==0)||(!oneByte&&(c&3)!==0))throw new Error('设备返回无效编码');
    if(oneByte&&key!=='sysState')throw new Error('设备返回了未知数据长度');
    const first=(a<<2)|(b>>4),second=((b&15)<<4)|(c>>2);
    const value=oneByte?first:(first*256+second);
    return integer(value,MAX[key],'设备 '+key);
  }
  function encode(value) {return BASE64[(value>>10)&63]+BASE64[(value>>4)&63]+BASE64[(value&15)<<2]+'=';}
  function newDriver(device) {
    if(devices.has(device.id))devices.get(device.id).retire();
    preferences.names[device.id]=device.name||nameFor(device.id);
    const instanceId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
    let link=null, epoch=0, requestRevision=0, ioTail=Promise.resolve(), active=null, nextId=0;
    let initialized=false,positionKnown=false,error=null,phase=null,busySeen=false,motionRevision=0;
    let values={},records=[],grind=null,grindTimer=null;
    const log=[];
    function note(text) {log.push({at:Date.now(),text});if(log.length>40)log.shift();emit();}
    function connected() {return !!link;}
    function advance(){requestRevision++;return ++epoch;}
    function check(token,owner) {
      if(token!==epoch) throw new Error('操作已取消');
      if(!link||link!==owner) throw new Error('小方连接已中断');
    }
    function stateName() {
      if(error)return 'error';
      if(!initialized)return 'unknown';
      if(values.sysState===1)return ['adjusting','stopping'].includes(phase)?'unknown':'grinding';
      return values.sysState===0?'idle':'unknown';
    }
    function parametersConfirmed() {return initialized&&['targetAngle','motorRpm','feedRpm'].every(key=>Number.isInteger(values[key])&&values[key]>0);}
    function nativeSnapshot() {
      const snapshot={state:stateName(),rpm:configFor(device.id).motorRpm};
      if(parametersConfirmed()&&positionKnown&&values.servoAngle!==undefined)snapshot.setting=String(values.servoAngle);
      if(values.servoAngle!==undefined)snapshot.observedSetting=String(values.servoAngle);
      if(values.motorRpm!==undefined)snapshot.observedRpm=values.motorRpm;
      return snapshot;
    }
    function publish() {
      if(!link)return;
      Promise.resolve(link.session.publish(nativeSnapshot())).catch(()=>{});
      emit();
    }
    function snapshot() {
      return {deviceId:device.id,deviceName:nameFor(device.id),deviceAlias:aliasFor(device.id),connected:connected(),initialized,state:stateName(),busy:!!active,
        commandFence:{instanceId,revision:requestRevision},
        operation:active?{id:active.id,kind:active.kind,status:active.status}:null,
        operations:copy(records),values:copy(values),config:configFor(device.id),configSource:own(preferences.configs,device.id)?'saved':'default',parametersConfirmed:parametersConfirmed(),workflowReady:currentWorkflow!==null,
        setting:parametersConfirmed()&&positionKnown?String(values.servoAngle):null,error,phase,logs:copy(log),
        grind:grind?{id:grind.id,ack:grind.ack,busy:grind.busy}:null};
    }
    function observe(key,data,owner) {
      if(link!==owner)return;
      const value=decode(key,data),previous=values[key];values[key]=value;
      if(key==='sysState'&&value===1){busySeen=true;motionRevision++;if(grind)grind.busy=true;}
      if(key==='servoAngle'&&previous!==value)motionRevision++;
      if(key==='servoAngle'&&value>0)positionKnown=true;
      publish(); return value;
    }
    function io(token,action,key,value) {
      const owner=link;check(token,owner);
      const work=ioTail.then(async()=>{
        check(token,owner);
        let result;
        if(action==='read') {result=await owner.session.gatt.read(SERVICE,characteristic(key));check(token,owner);return observe(key,result,owner);}
        if(action==='write') {
          if(!['motorRpm','feedRpm','bootSign','targetAngle'].includes(key))throw new Error('该通道不可写');
          integer(value,key==='bootSign'?5:MAX[key],key);
          if(key==='bootSign'&&value===0)throw new Error('无效启动命令');
          if (key === 'bootSign' && value >= 1 && value <= 3) {
            // Check the most recent notifications as well as the final readback.
            requireStartGap(values.targetAngle);
            requireStartGap(values.servoAngle);
          }
          await owner.session.gatt.writeWithResponse(SERVICE,characteristic(key),encode(value));
          check(token,owner);return value;
        }
        if(action==='subscribe') {
          await owner.session.gatt.subscribe(SERVICE,characteristic(key),data=>{
            if(link!==owner)return;
            try{observe(key,data,owner);}catch(e){
              advance();error=e.message;initialized=false;cancelGrind();
              if(active)finishRecord(active,'error',error);
              note(error);publish();
            }
          });check(token,owner);return;
        }
        throw new Error('未知蓝牙操作');
      });
      // The queue waits for the real GATT promise even if the caller times out.
      ioTail=work.then(()=>{},()=>{});
      let timer;
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('蓝牙回应超时；未确认结果，请查看磨豆机')),3500);});
      return Promise.race([work,timeout]).finally(()=>clearTimeout(timer));
    }
    async function pause(token,ms) {const owner=link;check(token,owner);await delay(ms);check(token,owner);}
    const read=(token,key)=>io(token,'read',key);
    const write=(token,key,value)=>io(token,'write',key,value);
    async function idle(token) {if(await read(token,'sysState')!==0)throw new Error('小方正在运行，请先停止');}
    async function verifyWrite(token,key,value) {
      await idle(token);await write(token,key,value);
      const got=await read(token,key);if(got!==value)throw new Error('参数读回不一致：目标 '+value+'，读回 '+got);
    }
    const atTarget=(actual,target)=>Math.abs(actual-target)<3;
    async function adjust(token,target) {
      await verifyWrite(token,'targetAngle',target);await idle(token);
      phase='adjusting';busySeen=false;publish();
      await write(token,'bootSign',5);await pause(token,250);
      const deadline=Date.now()+60000;
      while(true) {
        const state=await read(token,'sysState'),actual=await read(token,'servoAngle');
        if(busySeen&&state===0&&atTarget(actual,target)) {
          let quiet=Date.now(),revision=motionRevision;
          note('调距到位，等待稳定');
          while(Date.now()-quiet<1500) {
            await pause(token,100);
            const s=await read(token,'sysState'),a=await read(token,'servoAngle');
            if(s!==0||!atTarget(a,target)||revision!==motionRevision){quiet=Date.now();revision=motionRevision;}
            if(Date.now()>deadline)throw new Error('调距状态未稳定，已取消后续启动');
          }
          positionKnown=true;phase=null;publish();return;
        }
        if(Date.now()>deadline)throw new Error('调距未确认到位，已取消后续启动');
        await pause(token,250);
      }
    }
    function cancelGrind(){if(grindTimer!==null)clearTimeout(grindTimer);grindTimer=null;grind=null;}
    function pollGrind() {
      if(!grind||grindTimer!==null)return;
      const owner=grind;
      grindTimer=setTimeout(async()=>{
        grindTimer=null;if(grind!==owner||!link)return;
        if(active){pollGrind();return;}
        const token=epoch;
        try {
          const state=await read(token,'sysState');
          if(grind!==owner)return;
          if(state===0&&owner.busy){note('研磨已结束');cancelGrind();publish();return;}
          if(!owner.busy&&Date.now()-owner.started>10000){error='未确认研磨开始，请查看磨豆机';cancelGrind();publish();return;}
        }catch(e){if(grind!==owner)return;if(token!==epoch){pollGrind();return;}error=e.message;cancelGrind();publish();return;}
        pollGrind();
      },500);
    }
    function finishRecord(record,status,message) {
      record.status=status;record.finishedAt=Date.now();if(message)record.error=message;
      if(active===record)active=null;
      publish();
    }
    function begin(kind,input,fromHttp=false) {
      // HTTP writes must use the fence observed before the user's action.
      // Every accepted operation, stop and reconnect consumes that fence.
      if(fromHttp&&['apply','start'].includes(kind)) {
        const fence=input?.commandFence;
        if(fence?.instanceId!==instanceId||fence?.revision!==requestRevision) {
          const e=new Error('操作已取消或状态已变化，请读取状态后重新明确操作');e.code='cancelled';throw e;
        }
      }
      if(fromHttp&&['apply','start'].includes(kind)) {
        const expected=workflowSnapshot(input?.expectedWorkflow);
        if(!currentWorkflow||!expected||expected!==currentWorkflow){const e=new Error('当前曲线尚未确认或已更换，请返回后重新打开小方');e.code='workflow_changed';throw e;}
      }
      if(!link)throw new Error('小方未连接');
      if(kind!=='stop'&&active)throw new Error('正在执行，请等待；停止始终可用');
      if(!initialized&&!['readAll','stop'].includes(kind))throw new Error('设备参数尚未读取完整，请重新连接');
      const targetConfig=['apply','start'].includes(kind)?cleanConfig(input&&input.config?input.config:configFor(device.id),false):null;
      if(kind==='start') requireStartGap(targetConfig.grindSize);
      if(targetConfig&&!usableConfig(targetConfig))throw new Error('间距、刀盘转速和进豆转速须大于0；未确认零值不会写入设备');
      if(kind==='stop'){
        if(active)finishRecord(active,'cancelled','操作已取消');
        cancelGrind();
      }
      const token=advance(),owner=link;
      const record={id:device.id+':'+(++nextId),kind,status:'running',startedAt:Date.now()};
      records.push(record);if(records.length>24)records.shift();active=record;error=null;
      // Return an operation receipt before the host's 10 second invocation budget.
      const task=(async()=>{
        try {
          if(kind==='readAll') {for(const key of KEYS)await read(token,key);initialized=true;}
          else if(kind==='stop') {
            phase='stopping';await write(token,'bootSign',4);await pause(token,100);
            const end=Date.now()+10000;
            while(await read(token,'sysState')!==0){if(Date.now()>end)throw new Error('未确认停止，请使用实体停止键');await pause(token,100);}
          } else if(kind==='apply'||kind==='start') {
            await idle(token);saveConfig(device.id,targetConfig);
            await verifyWrite(token,'motorRpm',targetConfig.motorRpm);
            await verifyWrite(token,'feedRpm',targetConfig.feedRpm);
            await adjust(token,targetConfig.grindSize);
            if(kind==='start') {
              await idle(token);
              const target = await read(token,'targetAngle');
              const actual = await read(token,'servoAngle');
              requireStartGap(target);
              requireStartGap(actual);
              if(target !== targetConfig.grindSize || !atTarget(actual,targetConfig.grindSize))throw new Error('等待期间刀距变化，已取消启动');
              await idle(token);check(token,owner);
              grind={id:record.id,ack:false,busy:false,started:Date.now()};
              phase='starting';await write(token,'bootSign',MODE[targetConfig.bootMode]);
              grind.ack=true;phase=null;pollGrind();await pause(token,150);
              if(targetConfig.bootMode==='manual') {
                const end=Date.now()+5000;
                while(await read(token,'sysState')!==1&&!grind.busy){if(Date.now()>end)throw new Error('启动指令已发出，未确认运行状态');await pause(token,100);}
              } else await read(token,'sysState');
            }
          } else if(kind==='motor') {const value=integer(input.value,1500,'刀盘转速');if(value===0)throw new Error('刀盘转速须大于0');await verifyWrite(token,'motorRpm',value);saveConfig(device.id,{...configFor(device.id),motorRpm:value});}
          else if(kind==='setting') {const value=integer(input.value,1500,'间距');if(value===0)throw new Error('间距须大于0');await idle(token);await adjust(token,value);saveConfig(device.id,{...configFor(device.id),grindSize:value});}
          else throw new Error('未知操作');
          check(token,owner);phase=null;finishRecord(record,'done');
        } catch(e) {
          if(token!==epoch||link!==owner){if(record.status==='running')finishRecord(record,'cancelled','操作已取消');}
          else {error=e.message;phase=null;if(e.code)record.code=e.code;if(kind==='start'||kind==='stop')cancelGrind();finishRecord(record,'error',error);}
        }
      })();
      task.catch(()=>{});publish();return {operationId:record.id,status:'accepted'};
    }
    function retire(owner) {
      if(owner&&link!==owner)return;
      advance();cancelGrind();if(active)finishRecord(active,'cancelled','连接已中断');
      link=null;initialized=false;positionKnown=false;phase=null;values={};emit();
    }
    function workflowChanged() {
      // Curve changes revoke queued HTTP requests, but must never cancel Stop
      // or read-only connection work already using the execution epoch.
      requestRevision++;
      if(active&&['apply','start'].includes(active.kind)){++epoch;finishRecord(active,'cancelled','当前曲线已更换，未发出的操作已取消');if(phase!=='adjusting')phase=null;}
      if(grind)pollGrind();
      // Already dispatched GATT cannot be recalled. Continue observing any
      // running grind; workflow changes never pretend the motor has stopped.
      publish();
    }
    const control={snapshot,begin,retire,workflowChanged,selectionChanged(){requestRevision++;}};
    devices.set(device.id,control);
    return {
      vendor:'Chowjw’s Vibe Coding Lab',
      async connect(session) {
        if(link&&link.session===session&&initialized)return;
        retire();const owner={session};link=owner;ioTail=Promise.resolve();values={};error=null;
        const token=advance();
        session.gatt.onDisconnect(()=>retire(owner));
        try {
          const services=await session.gatt.discoverServices();check(token,owner);
          if(!services.map(s=>s.toLowerCase()).includes(SERVICE))throw new Error('小方服务不可用');
          for(const key of ['sysState','servoAngle','motorRpm','feedRpm','bootSign','targetAngle'])await io(token,'subscribe',key);
          for(const key of KEYS)await read(token,key);
          initialized=true;await session.publish(nativeSnapshot());check(token,owner);note(parametersConfirmed()?'已连接，参数已读取':'已连接，设备参数待确认；请明确应用有效参数');
        }catch(e){if(link===owner){error=e.message;retire(owner);}throw e;}
      },
      disconnect(){retire();},
      start(){return begin('start',{config:configFor(device.id)});},
      stop(){return begin('stop');},
      setGrindSetting(value){return begin('setting',{value:Number(value)});},
      setRpm(value){return begin('motor',{value});}
    };
  }
  function selected() {
    if(preferencesReady&&!preferences.selectedId){
      const live=[...devices.entries()].filter(([,d])=>d.snapshot().connected);
      if(live.length===1){preferences.selectedId=live[0][0];persist();}
    }
    return preferences.selectedId?devices.get(preferences.selectedId)||null:null;
  }
  function state(){
    const control=selected(),id=preferences.selectedId;
    return {...(control?control.snapshot():{connected:false,initialized:false,state:'unknown',busy:false,config:configFor(id),configSource:id&&own(preferences.configs,id)?'saved':'default',parametersConfirmed:false,workflowReady:currentWorkflow!==null,values:{},operations:[],operation:null}),...identity(),multiDevice:true,preferencesReady,devices:[...new Set([...devices.keys(),...Object.keys(preferences.names),...(id?[id]:[])])].map(deviceId=>({id:deviceId,name:nameFor(deviceId),alias:aliasFor(deviceId),selected:deviceId===id,state:devices.get(deviceId)?.snapshot().connected?'connected':'disconnected'}))};
  }
  const json=(data,status=200)=>({status,headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(data)});
  return {
    id:ID,
    onLoad(){host.storage({type:'read',namespace:ID,key:'devicePreferences'});return host.devices.bindDriver('crystal',{create:newDriver});},
    onUnload(){for(const control of devices.values())control.retire();},
    onEvent(event){
      if(event?.name==='workflowUpdated') {
        const next=workflowSnapshot(event.payload);
        if(next!==currentWorkflow){currentWorkflow=next;for(const control of devices.values())control.workflowChanged();}
      }
      if(event?.name==='storageRead'&&event.payload?.key==='devicePreferences'&&!preferencesTouched){
        preferencesReady=true;
        try{
          const saved=JSON.parse(event.payload.value);
          if(saved&&typeof saved==='object'){
            const next={selectedId:validDevice(saved.selectedId)?saved.selectedId:null,aliases:{},names:{},configs:{}};
            for(const field of ['aliases','names'])for(const [id,value] of Object.entries(saved[field]||{}))if(validDevice(id)&&typeof value==='string')next[field][id]=value.trim().slice(0,field==='aliases'?24:80);
            for(const [id,value] of Object.entries(saved.configs||{}))if(validDevice(id)){try{const v=cleanConfig({...value,grindSize:value.grindSize??0},false);if(value.grindSize===null)v.grindSize=null;next.configs[id]=v;}catch{}}
            preferences=next;emit();
          }
        }catch(_){}
        emit();
      }
      if(event&&event.name==='shutdown')for(const control of devices.values())control.retire();
    },
    handleHttpRequest(request){
      try {
        if(request.endpoint!=='ui')return json({ok:false,error:'Unknown endpoint'},404);
        if(request.method==='GET')return json(state());
        if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
        const body=request.body||{},params=body.params||{};
        if(body.commandId==='selectDevice')return json({ok:true,result:selectDevice(params.deviceId,params.name)});
        if(body.commandId==='renameDevice'){
          if(!preferencesReady)fail('设备偏好正在读取，请稍后重试','preferences_loading');
          if(!validDevice(params.deviceId))fail('无效的磨豆机身份','invalid_device');
          const alias=typeof params.name==='string'?cleanName(params.name):'';
          if(!alias||alias.length>24)fail('名称须为1–24个字符','invalid_name');
          const knownIds=new Set([...devices.keys(),...Object.keys(preferences.names),...Object.keys(preferences.aliases)]);
          if([...knownIds].some(id=>id!==params.deviceId&&nameKey(aliasFor(id)||nameFor(id))===nameKey(alias)))fail('请使用不同的名称，便于区分','duplicate_name');
          preferences.aliases[params.deviceId]=alias;persist();return json({ok:true,result:{deviceId:params.deviceId,alias}});
        }
        const control=selected(),id=preferences.selectedId;
        if(!id||params.deviceId!==id)fail('磨豆机选择已改变，请重新读取后操作','device_changed');
        if(body.commandId==='setConfig')return json({ok:true,result:saveConfig(id,cleanConfig(params,true,configFor(id)))});
        if(body.commandId==='getConfig')return json({ok:true,result:configFor(id)});
        if(!control||!control.snapshot().connected)throw new Error('小方未连接');
        if(body.commandId==='getValues')return json({ok:true,result:control.snapshot().values});
        if(!['readAll','apply','start','stop'].includes(body.commandId))throw new Error('未知操作');
        return json({ok:true,result:control.begin(body.commandId,params,true)});
      }catch(e){return json({ok:false,error:e.message,...(e.code?{code:e.code}:{})},400);}
    }
  };
}
