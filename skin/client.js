// Decaid 0.9 REST/WS adapter. Commands are never replayed after a timeout.
import {createGrinderClient} from './grinder.js?v=0.2.32';
// Shared by the library preview and the actual selection write.
export function selectedProfileContext(entry,currentContext={}) {
  const profile=entry?.profile||entry||{},context={...currentContext};
  if(Number.isFinite(profile.target_weight))context.targetYield=profile.target_weight;
  const stored=entry?.metadata?.thisCupContext;
  if(Number.isFinite(stored?.targetDoseWeight))context.targetDoseWeight=stored.targetDoseWeight;
  if(Number.isFinite(stored?.targetYield))context.targetYield=stored.targetYield;
  return context;
}
export class ApiError extends Error {
  constructor(message, status = 0, details = null, code = null) { super(message); this.status = status; this.details = details; this.code = code; }
}
const ACTIVE = new Set(['espresso','steam','hotwater','flush','steamrinse','cleaning','descaling','calibration','fwupgrade','airpurge','busy','selftest','skipstep']);
const INACTIVE = new Set(['idle','schedidle','sleeping','heating','preheating','needswater']);
const clone = value => JSON.parse(JSON.stringify(value));
// Same execution fields used by Decaid's ProfileRecord hash. Compare native
// JSON values instead of recreating Dart's number serialization/hash here.
const PROFILE_EXECUTION_FIELDS = ['version','beverage_type','steps','tank_temperature','target_weight','target_volume','target_volume_count_start'];
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// Native workflow PUT deep-merges objects and replaces arrays. Send only changed
// fields so unrelated edits made between our final GET and PUT are not overwritten.
// The native API exposes no client revision/If-Match: same-field races remain possible.
function workflowPatch(requested,expected) {
  const patch={};
  for(const [key,value] of Object.entries(requested)) {
    if(same(value,expected?.[key]))continue;
    patch[key]=object(value)&&object(expected?.[key]) ? workflowPatch(value,expected[key]) : clone(value);
  }
  return patch;
}
function containsRequested(read,requested) {
  if(Array.isArray(requested))return Array.isArray(read) && read.length===requested.length && requested.every((value,i)=>containsRequested(read[i],value));
  if(object(requested))return object(read) && Object.entries(requested).every(([key,value])=>containsRequested(read[key],value));
  return same(read,requested);
}
function containsShape(read,expected) {
  if(Array.isArray(expected)) return Array.isArray(read) && read.length===expected.length && expected.every((v,i)=>containsShape(read[i],v));
  if(object(expected)) return object(read) && Object.entries(expected).every(([k,v])=>Object.hasOwn(read,k)&&containsShape(read[k],v));
  return read !== undefined;
}
export function rebaseWorkflowDraft(expected,draft,read) {
  const merge=(base,patch)=>Object.fromEntries(Object.entries({...base,...patch}).map(([key,value])=>
    [key,object(patch[key])&&object(base?.[key]) ? merge(base[key],patch[key]) : value]));
  return merge(clone(read),workflowPatch(draft,expected));
}
export function profileExecutionKey(profile) {
  if(!profile || !Array.isArray(profile.steps) || !profile.steps.length) return null;
  return JSON.stringify(canonical(Object.fromEntries(PROFILE_EXECUTION_FIELDS.map(key=>[key,profile[key] ?? null]))));
}
export function resolveProfileIdentity(profile,entries) {
  const key=profileExecutionKey(profile);
  if(!key)return null;
  const matches=(entries||[]).filter(entry=>typeof entry.id==='string' && entry.profile && profileExecutionKey(entry.profile)===key);
  return matches.length===1 ? matches[0].id : null;
}
export class DecaidClient {
  constructor(baseUrl = `http://${globalThis.location?.hostname || '127.0.0.1'}:8080`, options = {}) {
    this.baseUrl = baseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
    this.base = this.baseUrl;
    this.fetcher = options.fetch || globalThis.fetch.bind(globalThis);
    this.grinder = createGrinderClient({baseUrl:this.baseUrl,fetchImpl:this.fetcher});
    this.Socket = options.WebSocket || globalThis.WebSocket;
    this.snapshot = {machine:null, scale:null, shotState:null, water:null, devices:[]};
    this.connection = {connected:false,machineConnected:false,scaleConnected:false,stale:true,error:null};
    this.sockets = new Map(); this.reconnectTimers = new Set(); this.closed = true;
    this.lastPrimaryScaleId = null;
    this.lastScaleTimestamp = null;
    // Host sampling-clock watermark survives transport reconnects/subscriptions.
    // A new client (explicit connection) establishes a new host-clock epoch.
    this.lastMachineTimestamp = null;
    this.devicesRevision = 0; this.devicesRequest = 0;
    this.lastMachineAt = 0; this.lastScaleAt = 0; this.writeBusy = false;
    this.streamDiagnostics = {}; this.loopDelayMs = 0;
  }
  async request(method,path,data,timeout=12000) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),timeout);
    try {
      const response = await this.fetcher(`${this.baseUrl}/api/v1${path}`, {
        method, signal:controller.signal, cache:'no-store',
        headers:data===undefined ? {} : {'Content-Type':'application/json'},
        ...(data===undefined ? {} : {body:JSON.stringify(data)})
      });
      const raw = await response.text();
      let result = null;
      if(raw) { try { result=JSON.parse(raw); } catch { if(response.ok) throw new ApiError('设备返回了无法读取的数据',response.status,null,'apiInvalidResponse'); } }
      if(!response.ok) {
        const type=result?.type;
        const provided=[result?.error,result?.details,result?.message].find(value=>typeof value==='string'&&value);
        const workflowConflict=path==='/workflow'&&method==='PUT'&&response.status===409;
        const code=workflowConflict ? result?.error==='Workflow update was superseded' ? 'apiWorkflowSuperseded' : 'apiWorkflowConflict'
          : type==='block_no_scale' ? 'apiNoScale' : type==='block_tare_during_shot' ? 'apiTareDuringShot' : 'apiRequestFailed';
        const message=type==='block_no_scale' ? '未连接秤；Decaid 当前设置要求先连接秤' : type==='block_tare_during_shot' ? '萃取中不可清零' : provided || `设备请求失败（${response.status}）`;
        throw new ApiError(message,response.status,result,code);
      }
      return result;
    } catch(error) {
      if(error.name==='AbortError') throw new ApiError(method==='GET' ? '读取设备超时，请检查连接' : '设备响应超时，操作结果待核实；请勿重复点击',0,null,method==='GET'?'apiReadTimeout':'apiWriteTimeout');
      throw error;
    } finally {clearTimeout(timer);}
  }
  get(path){return this.request('GET',path);}
  put(path,data){return this.request('PUT',path,data);}
  post(path,data){return this.request('POST',path,data);}
  delete(path){return this.request('DELETE',path);}
  scanDevices() {
    // quick=true acknowledges the scan before the new advertisements arrive.
    if (!this.scanTask) {
      this.scanTask = this.request('GET','/devices/scan?connect=false',undefined,30000)
        .then(() => this.refreshDevices())
        .finally(() => { this.scanTask = null; });
    }
    return this.scanTask;
  }
  recoverPreferredScale(error, eligible) {
    const preferredId = error?.deviceId;
    if (error?.kind !== 'scaleConnectFailed' || !preferredId ||
        this.closed || this.scanTask || this.scaleRecoveryBusy || !eligible()) return;
    const time = Date.parse(error.timestamp);
    const now = Date.now();
    if (!Number.isFinite(time) || Math.abs(now-time)>15000 || this.lastScaleError===error.timestamp ||
        now < (this.nextScaleRecovery || 0)) return;
    this.lastScaleError = error.timestamp;
    this.scaleRecoveryBusy = true;
    // Let the host connect its preferred scale from a fresh foreground scan.
    // Re-read the preference: it can be changed by the native device picker.
    return this.get('/settings').then(async settings => {
      if (this.closed || settings?.preferredScaleId!==preferredId || !eligible()) return;
      const machine = await this.get('/machine/state');
      if (this.closed || machine?.state?.state!=='idle' || !eligible()) return;
      this.nextScaleRecovery = Date.now()+30000;
      return this.scanDevices();
    }).catch(() => {}).finally(() => { this.scaleRecoveryBusy = false; });
  }
  async refreshDevices() {
    const revision=this.devicesRevision, request=++this.devicesRequest;
    const devices=await this.get('/devices');
    // HTTP is a bootstrap/readback only. Any intervening live state or newer
    // read supersedes it, including a disconnect on the independent scale stream.
    if(revision===this.devicesRevision && request===this.devicesRequest){
      this.setDevices(devices);
      if(!this.closed)this.emit?.();
    }
    return this.snapshot.devices;
  }
  async loadContext() {
    const [workflow,profiles,,info,settings,machineInfo]=await Promise.all([
      this.get('/workflow'),this.get('/profiles?visibility=visible'),this.refreshDevices(),this.get('/info'),this.get('/settings'),this.get('/machine/info').catch(()=>null)
    ]);
    this.machineInfo=machineInfo;
    this.connection.connected=true;
    return {workflow,profiles,devices:this.snapshot.devices,info,settings,machineInfo};
  }
  async requireIdle(){
    const s=await this.get('/machine/state');
    const state=typeof s?.state?.state==='string' ? s.state.state.toLowerCase() : '';
    if(ACTIVE.has(state)) throw new ApiError('机器正在运行，停止后才能更改',0,null,'apiMachineRunning');
    if(!INACTIVE.has(state)) throw new ApiError('尚未确认机器状态，请重新读取后再操作',0,null,'apiUnknownState');
    return s;
  }
  async exclusive(fn) {
    if(this.writeBusy) throw new ApiError('上一项操作仍在处理',0,null,'apiWriteBusy');
    this.writeBusy=true;
    try{return await fn();}finally{this.writeBusy=false;}
  }
  async saveWorkflow(workflow,expectedWorkflow){
    return this.exclusive(async()=>{
      await this.requireIdle();
      if(expectedWorkflow){
        const current=await this.get('/workflow');
        if(!same(current,expectedWorkflow))throw new ApiError('其他页面已修改配方，请重新读取后再应用',409,{readback:current},'workflowConflictNotice');
      }
      const payload=clone(workflow); delete payload.machine;
      const patch=expectedWorkflow ? workflowPatch(payload,expectedWorkflow) : payload;
      if(Object.keys(patch).length){ await this.requireIdle(); await this.put('/workflow',patch); }
      const read=await this.get('/workflow');
      try { await this.requireIdle(); } catch(error) {
        throw new ApiError('运行状态已变化，已发送的设置需核对',0,{readback:read},'apiWriteDuringRun');
      }
      if(!read?.profile || (!containsRequested(read,patch) || !containsShape(read,payload)))throw new ApiError('读回值与请求不同，草稿已保留，请重新读取后再调整',0,{readback:read},'partialReadback');
      return read;
    });
  }
  async selectProfile(entry,expectedWorkflow){
    const profile=entry.profile || entry;
    if(!profile.title || !Array.isArray(profile.steps) || !profile.steps.length) throw new ApiError('该方案缺少可执行步骤',0,null,'apiInvalidProfile');
    const current=expectedWorkflow || await this.get('/workflow');
    const context=selectedProfileContext(entry,current.context);
    return this.saveWorkflow({profile:clone(profile),context},current);
  }
  saveProfile(entry){
    const payload=entry.profile ? entry : {profile:entry};
    return this.post('/profiles',payload);
  }
  history(offset=0,limit=50){return this.get(`/shots?limit=${limit}&offset=${offset}&orderBy=timestamp&order=desc`).then(r=>Array.isArray(r)?r:Array.isArray(r?.items)?r.items:[]);}
  shot(id){return this.get(`/shots/${encodeURIComponent(id)}`);}
  async tare(){await this.requireIdle();return this.put('/scale/tare');}
  async command(action){
    const map={espresso:'espresso',stop:'idle',wake:'idle',sleep:'sleeping',flush:'flush',steam:'steam',hotwater:'hotWater'};
    const target=map[action]; if(!target)throw new ApiError('未知操作',0,null,'apiUnknownAction');
    // Stop always bypasses configuration locks and does not depend on a fresh snapshot.
    if(action==='stop') return this.put('/machine/state/idle');
    return this.exclusive(async()=>{
      if(['espresso','flush','steam','hotwater'].includes(action)) {
        const info=await this.get('/machine/info');
        if(info.GHC!==false) throw new ApiError(info.GHC ? '这台机器需按冲煮头实体按键启动' : '尚未确认机器的启动能力',0,null,info.GHC?'apiPhysicalStart':'apiUnknownCapability');
      }
      await this.requireIdle();
      await this.put(`/machine/state/${target}`);
      // A 200 only acknowledges the request, not that the machine started.
      const deadline=Date.now()+5000;
      do {
        const current=await this.get('/machine/state');
        if(current?.state?.state===target || (action==='wake' && ['heating','preheating','idle'].includes(current?.state?.state))) return current;
        await new Promise(r=>setTimeout(r,250));
      } while(Date.now()<deadline);
      throw new ApiError('已发送请求，但机器尚未进入目标状态；请检查冲煮头按键和设备状态',0,null,'apiStateUnconfirmed');
    });
  }
  setDevices(devices){
    if(!Array.isArray(devices))return;
    this.devicesRevision++;
    this.snapshot.devices=devices;
    this.connection.machineConnected=devices.some(d=>d.type==='machine'&&d.state==='connected');
    const primary=devices.find(d=>d.type==='scale'&&d.state==='connected'&&d.connectionRole!=='auxiliary');
    const primaryId=primary?.id ?? null;
    this.connection.scaleConnected=Boolean(primary);
    if(!primary || primaryId!==this.lastPrimaryScaleId){
      this.snapshot.scale=null;
      this.lastScaleAt=0;
    }
    if(primaryId!==null){
      // A queued frame on the old socket has no device ID. A fresh native
      // subscription receives status and future weight broadcasts, without replay.
      if(this.lastPrimaryScaleId!==null && primaryId!==this.lastPrimaryScaleId){
        this.sockets.get('/scale/snapshot')?.replaceForHandoff();
      }
      this.lastPrimaryScaleId=primaryId;
    }
  }
  setScaleStatus(status){
    this.devicesRevision++;
    this.connection.scaleConnected=status==='connected';
    if(status!=='connected'){this.snapshot.scale=null;this.lastScaleAt=0;}
    if(status==='disconnected'){
      // This native status describes the primary scale. Update the same
      // device snapshot used by the panel; auxiliary scales are independent.
      this.snapshot.devices=this.snapshot.devices.map(device=>
        device.type==='scale' && device.connectionRole!=='auxiliary' && device.state==='connected'
          ? {...device,state:'disconnected'} : device);
    }
  }
  subscribe(onSnapshot,onConnection=()=>{}){
    this.close();this.closed=false;this.onSnapshot=onSnapshot;this.onConnection=onConnection;
    this.streamDiagnostics={};
    let lastTick=Date.now(), graceUntil=lastTick+10000, nextRecoveryAt=0;
    const reportCallbackError=(error)=>{
      this.connection.error='界面数据处理失败';
      this.connection.errorKind='callback';
      this.callbackError=String(error?.message||error);
    };
    const emit=()=>{
      this.connection.stale=!this.connection.machineConnected || Date.now()-this.lastMachineAt>5000;
      this.connection.scaleStale=this.connection.scaleConnected && Date.now()-this.lastScaleAt>5000;
      // Consumer/render failures are not malformed JSON and must not prevent
      // the connection callback from receiving the actual transport state.
      let callbackFailed=false;
      try{onSnapshot(this.snapshot);}catch(error){callbackFailed=true;reportCallbackError(error);}
      if(!callbackFailed&&this.connection.errorKind==='callback'){this.connection.error=null;this.connection.errorKind=null;}
      try{onConnection({...this.connection});}catch(error){reportCallbackError(error);}
    };
    this.emit=emit;
    const attach=(path,handler)=>{
      if(this.closed)return;
      const socket=new this.Socket(`${this.baseUrl.replace(/^http/,'ws')}/ws/v1${path}`);
      const diagnostic=this.streamDiagnostics[path]??={messages:0,validMessages:0,rejectedMessages:0,parseErrors:0,reconnects:0,lastReceivedAt:0,lastValidAt:0};
      diagnostic.openedAt=Date.now();
      this.sockets.set(path,socket);
      socket.onopen=()=>{if(this.closed||this.sockets.get(path)!==socket)return;diagnostic.openedAt=Date.now();if(path==='/machine/snapshot')this.connection.connected=true;emit();};
      socket.onmessage=event=>{
        if(this.closed||this.sockets.get(path)!==socket)return;
        diagnostic.messages++;diagnostic.lastReceivedAt=Date.now();
        let parsed;
        try{parsed=JSON.parse(event.data);}catch{
          diagnostic.parseErrors++;this.connection.error='实时数据解析失败';this.connection.errorKind='parse';emit();return;
        }
        try{
          const accepted=parsed && typeof parsed==='object' && handler(parsed)!==false;
          if(accepted){diagnostic.validMessages++;diagnostic.lastValidAt=Date.now();}
          else diagnostic.rejectedMessages++;
          if(accepted&&this.connection.errorKind==='parse'){this.connection.error=null;this.connection.errorKind=null;}
        }catch(error){diagnostic.rejectedMessages++;reportCallbackError(error);}
        emit();
      };
      socket.onerror=()=>{};
      const disconnected=()=>{
        if(this.closed||this.sockets.get(path)!==socket)return;
        this.sockets.delete(path);
        if(path==='/machine/snapshot')this.connection.connected=false;
        if(path==='/scale/snapshot'){this.devicesRevision++;this.connection.scaleConnected=false;this.snapshot.scale=null;this.lastScaleAt=0;}
        emit();
        const timer=setTimeout(()=>{this.reconnectTimers.delete(timer);diagnostic.reconnects++;attach(path,handler);},2000);
        this.reconnectTimers.add(timer);
      };
      if(path==='/scale/snapshot'){
        socket.replaceForHandoff=()=>{
          this.sockets.delete(path);
          socket.onclose=null;
          try{socket.close();}catch{}
          attach(path,handler);
        };
      }
      socket.onclose=disconnected;
      socket.recoverStaleStream=()=>{socket.onclose=null;disconnected();try{socket.close();}catch{}};
    };
    this.checkStreamHealth=()=>{
      if(this.closed)return;
      const now=Date.now();this.loopDelayMs=Math.max(0,now-lastTick-1000);lastTick=now;
      // A suspended/backgrounded or blocked event loop must first drain queued
      // messages. Do not turn one delayed timer into a reconnect storm.
      if(this.loopDelayMs>2000){graceUntil=now+10000;return;}
      const path='/machine/snapshot',socket=this.sockets.get(path),d=this.streamDiagnostics[path];
      if(now<graceUntil||now<nextRecoveryAt||!socket||socket.readyState!==1||!d)return;
      if(now-Math.max(d.openedAt,d.lastValidAt)<15000)return;
      nextRecoveryAt=now+30000;
      socket.recoverStaleStream();
    };
    attach('/machine/snapshot',s=>{
      const timestamp=typeof s.timestamp==='string'?Date.parse(s.timestamp):NaN;
      const diagnostic=this.streamDiagnostics['/machine/snapshot'];
      if(!Number.isFinite(timestamp)||typeof s.state?.state!=='string'){
        diagnostic.lastRejectedReason='invalid_machine_frame';return false;
      }
      // Compare host timestamps to host timestamps, never to the browser clock.
      // An open/reconnected socket replaying its cached frame is not new data.
      if(this.lastMachineTimestamp!==null&&timestamp<=this.lastMachineTimestamp){
        diagnostic.lastRejectedReason=timestamp===this.lastMachineTimestamp?'duplicate_timestamp':'out_of_order_timestamp';return false;
      }
      this.lastMachineTimestamp=timestamp;diagnostic.lastRejectedReason=null;
      this.snapshot.machine=s;this.lastMachineAt=Date.now();return true;
    });
    attach('/scale/snapshot',s=>{
      if(s.status){this.setScaleStatus(s.status);return true;}
      else {
        if (!this.connection.scaleConnected) return false;
        const timestamp = typeof s.timestamp === 'string' ? Date.parse(s.timestamp) : NaN;
        const accepted = this.lastScaleTimestamp;
        const received=Date.now();
        const machineTime=Date.parse(this.snapshot.machine?.timestamp);
        const hasHostTime=Number.isFinite(machineTime);
        // Both streams use Decaid timestamps. Compare them in that clock,
        // not against a LAN browser's potentially different wall clock/timezone.
        // Machine frames are slower than scale frames; allow up to 1 second
        // of inter-stream delivery skew, never learn the clock from scale data.
        const hostNow=hasHostTime ? machineTime+Math.max(0,received-this.lastMachineAt) : received;
        if (!Number.isFinite(timestamp) ||
            (hasHostTime && received-this.lastMachineAt>5000) ||
            timestamp > hostNow+(hasHostTime ? 1000 : 0) ||
            (accepted !== null && (timestamp < accepted ||
              (timestamp === accepted && !this.snapshot.scale)))) return false;
        this.lastScaleTimestamp=timestamp;
        this.snapshot.scale=s;
        this.lastScaleAt=received-Math.max(0,hostNow-timestamp);return true;
      }
    });
    attach('/machine/shotState',s=>{if(!s.state)return false;this.snapshot.shotState=s;return true;});
    attach('/machine/waterLevels',s=>{if(s.currentLevel===undefined)return false;this.snapshot.water=s;return true;});
    attach('/devices',s=>{if(!Array.isArray(s.devices))return false;this.setDevices(s.devices);this.snapshot.scanning=s.scanning;this.snapshot.deviceError=s.connectionStatus?.error ?? null;return true;});
    this.refreshDevices().then(()=>{if(!this.closed)emit();}).catch(()=>{});
    this.staleTimer=setInterval(()=>{this.checkStreamHealth();emit();},1000);
    return ()=>this.close();
  }
  close(){
    this.closed=true;
    this.devicesRevision++;this.devicesRequest++;
    clearInterval(this.staleTimer);
    for(const t of this.reconnectTimers)clearTimeout(t);this.reconnectTimers.clear();
    for(const s of this.sockets.values()){s.onclose=null;s.close();}this.sockets.clear();
  }
}
