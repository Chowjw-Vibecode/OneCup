// Use our Decaid driver; the skin never owns a Bluetooth connection.
const PLUGIN = 'thiscup-crystal.reaplugin';
const ENDPOINT = `/plugins/${PLUGIN}/ui`;
const MODES = { manual: 1, timed: 2, smart: 3 };
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

export class GrinderError extends Error {
  constructor(message, code = 'grinder_error') { super(message); this.name = 'GrinderError'; this.code = code; }
}

export function validateGrinderConfig(input) {
  if (!input || typeof input !== 'object') throw new GrinderError('请先读取小方参数', 'invalid_config');
  const out = {};
  for (const [key, max, label] of [['grindSize',1500,'间距'],['motorRpm',1500,'刀盘转速'],['feedRpm',150,'进豆转速']]) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > max) {
      throw new GrinderError(`${label}须为 1–${max} 的整数`, 'invalid_config');
    }
    out[key] = value;
  }
  if (!Object.hasOwn(MODES, input.bootMode)) throw new GrinderError('请选择研磨模式', 'invalid_config');
  out.bootMode = input.bootMode;
  return out;
}

function profileIdentity(value) {
  // This is an explicit ProfileRecord identity supplied by the host UI, never
  // workflow.id or a name. Names are metadata and are not unique in Decaid.
  const profileId = value?.profileId;
  if (typeof profileId !== 'string' || !profileId.trim()) return null;
  const profile = value?.profile || value;
  if (!profile || typeof profile.title !== 'string' || !profile.title.trim()) throw new GrinderError('请先选择咖啡方案', 'missing_profile');
  return { key: JSON.stringify(['decaid-profile', profileId]), profileId, title:profile.title };
}

export function createGrinderClient({ baseUrl, fetchImpl = globalThis.fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  const rawBase = baseUrl || `${globalThis.location?.protocol || 'http:'}//${globalThis.location?.hostname || 'localhost'}:8080`;
  const base = rawBase.replace(/\/$/, '').replace(/\/api\/v1$/, '') + '/api/v1';
  let generation = 0, operation = null, cached = null, inflightRead = null;
  let readRevision=0, observer=null, seenDevice=false;
  let connectionTask=null, selectionTask=null;
  const listeners = new Set();
  const publish = value => { cached = clone(value); for (const fn of listeners) { try { fn(clone(cached)); } catch {} } return clone(cached); };
  async function request(path, method = 'GET', body, timeoutMs = 75000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(base + path, { method, headers: { Accept:'application/json', ...(body !== undefined ? {'Content-Type':'application/json'} : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal:controller.signal, cache:'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new GrinderError(data?.error || `小方接口返回 ${response.status}`, data?.code || `http_${response.status}`);
      if (data?.ok === false) throw new GrinderError(data.error || '小方未完成操作', data.code || 'device_rejected');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new GrinderError('小方操作未确认，请读取状态后再试', 'timeout');
      throw error;
    } finally { clearTimeout(timer); }
  }
  const command = async (commandId, params = {}) => {
    const data = await request(ENDPOINT, 'POST', { commandId, params });
    return data?.result;
  };
  function check(token) { if (token !== generation) throw new GrinderError('操作已停止', 'cancelled'); }
  function invalidate(observation,reason) {
    readRevision++;
    return publish({...cached,state:'unknown',observation,observationReason:reason,
      busy:Boolean(operation)||cached?.busy===true,operation:operation||cached?.operation||null});
  }
  function closeSocket(owner) {
    owner.clearTimer(owner.retryTimer);owner.retryTimer=null;
    const socket=owner.socket;owner.socket=null;owner.open=false;
    if(socket){socket.onopen=socket.onmessage=socket.onerror=socket.onclose=null;try{socket.close();}catch{}}
  }
  function lostObservation(owner,reason) {
    if(observer!==owner||owner.suspended)return;
    closeSocket(owner);
    if(!seenDevice&&cached?.observation==='unavailable'&&cached?.observationReason==='no_device'){owner.suspended=true;return;}
    invalidate('unknown',reason);
    // Retry the notification connection only during an outage, never poll BLE
    // or HTTP in the background. Every restored socket gets a complete GET.
    owner.retryTimer=owner.setTimer(()=>{owner.retryTimer=null;openSocket(owner);},Math.min(1000*2**owner.retries++,15000));
  }
  function openSocket(owner) {
    if(observer!==owner||owner.socket||owner.suspended)return;
    if(typeof owner.WebSocketImpl!=='function'){invalidate('unknown','socket_unsupported');return;}
    let socket;
    try {socket=new owner.WebSocketImpl(base.replace(/^http/,'ws').replace(/\/api\/v1$/,'/ws/v1')+`/plugins/${PLUGIN}/changed`);}
    catch {lostObservation(owner,'socket_error');return;}
    owner.socket=socket;
    socket.onopen=()=>{
      if(observer!==owner||owner.socket!==socket)return;
      owner.open=true;invalidate('checking','socket_open');
      getState().catch(()=>{});
    };
    socket.onmessage=()=>{
      if(observer!==owner||owner.socket!==socket||!owner.open)return;
      invalidate('checking','changed');getState().catch(()=>{});
    };
    socket.onerror=()=>{if(owner.socket===socket)lostObservation(owner,'socket_error');};
    socket.onclose=()=>{if(owner.socket===socket)lostObservation(owner,'socket_closed');};
  }
  async function getState() {
    if (inflightRead) return inflightRead;
    inflightRead = (async () => {
      while(true) {
        const revision=readRevision,owner=observer;
        try {
          const raw = await request(`${ENDPOINT}?state=1`, 'GET', undefined, 8000);
          // A changed event, reconnect or page restore invalidates a response
          // already in transit. Do not publish its old idle; fetch once more.
          if(revision!==readRevision){if(owner&&!observer)return clone(cached);continue;}
          if(!raw||typeof raw.connected!=='boolean'||typeof raw.busy!=='boolean'||!['idle','grinding','unknown','error'].includes(raw.state))throw new GrinderError('小方状态尚未确认', 'invalid_state');
          seenDevice ||= raw.connected||raw.busy||raw.state==='grinding';
          const noDevice=!raw.connected&&!seenDevice;
          if(owner&&raw.connected&&owner.suspended){owner.suspended=false;openSocket(owner);}
          const incompatible=raw.multiDevice!==true;
          const observation=incompatible?'unknown':raw.preferencesReady===false?'checking':noDevice?'unavailable':!raw.connected?'unknown':owner&&!owner.open?'checking':['unknown','error'].includes(raw.state)?'unknown':'ready';
          if(owner&&observation==='ready')owner.retries=0;
          return publish({ ...raw, available:true, connected:raw.connected, deviceBusy:raw.busy, busy:Boolean(operation)||raw.busy||raw.state==='grinding', operation:operation||raw.operation, config:raw.config ? clone(raw.config) : null, values:raw.values || {}, observedAt:now(),observation,observationReason:incompatible?'incompatible_driver':noDevice?'no_device':!raw.connected?'device_disconnected':owner&&!owner.open?'socket_pending':null });
        } catch (error) {
          if(revision!==readRevision){if(owner&&!observer)return clone(cached);continue;}
          if (error.code === 'invalid_state') {
            // A malformed response is not proof that the plugin is absent or old.
            // Retain the last verified identity, block apply/start, and retry observation.
            if(owner)lostObservation(owner,'invalid_state');
            else invalidate('unknown','invalid_state');
            throw error;
          }
          if (error.code === 'http_404') {
            if(owner){owner.suspended=true;closeSocket(owner);}
            return publish({ available:false, connected:false, state:'unavailable', busy:Boolean(operation)||cached?.busy===true, operation:operation||cached?.operation||null, config:null, values:{}, observedAt:now(),observation:seenDevice?'unknown':'unavailable',observationReason:'plugin_missing' });
          }
          if(owner)lostObservation(owner,'read_failed');
          else invalidate('unknown','read_failed');
          throw error;
        }
      }
    })().finally(() => { inflightRead = null; });
    return inflightRead;
  }
  function observe({WebSocketImpl=globalThis.WebSocket,setTimer=(...args)=>globalThis.setTimeout(...args),clearTimer=(...args)=>globalThis.clearTimeout(...args)}={}) {
    if(observer)return observer.stop;
    const owner={WebSocketImpl,setTimer,clearTimer,socket:null,open:false,retries:0,retryTimer:null,suspended:false};
    observer=owner;
    owner.stop=()=>{if(observer!==owner)return;observer=null;closeSocket(owner);invalidate('unknown','observation_stopped');};
    refreshObservation();return owner.stop;
  }
  async function refreshObservation() {
    if(!observer){observe();return getState().catch(()=>clone(cached));}
    const owner=observer;owner.suspended=false;owner.clearTimer(owner.retryTimer);owner.retryTimer=null;
    invalidate('checking','refresh');
    try {
      const state=await getState();
      if(observer===owner&&!owner.suspended)openSocket(owner);
      return state;
    } catch {return clone(cached);}
  }
  const candidates = list => (Array.isArray(list) ? list : list?.devices || []).filter(d => String(d.id || '').startsWith(`plugin:${PLUGIN}:crystal:`));
  async function listDevices({scan=false}={}) {
    if(scan)await request('/devices/scan?connect=false');
    const [native,current]=await Promise.all([request('/devices'),getState()]);
    const all=new Map((current.devices||[]).map(d=>[d.id,{...d,available:false}]));
    for(const d of candidates(native))all.set(d.id,{...all.get(d.id),...d,alias:all.get(d.id)?.alias||'',available:d.available!==false});
    if(current.deviceId&&!all.has(current.deviceId))all.set(current.deviceId,{id:current.deviceId,name:current.deviceName,alias:current.deviceAlias,available:false,state:'disconnected'});
    return [...all.values()].map(d=>({...d,selected:d.id===current.deviceId}));
  }
  function selectDevice(id) {
    if(connectionTask||selectionTask)return Promise.reject(new GrinderError('请等待当前连接或切换完成','busy'));
    selectionTask=selectDeviceOnce(id).finally(()=>{selectionTask=null;});
    return selectionTask;
  }
  async function selectDeviceOnce(id) {
    if(operation)throw new GrinderError('请等待当前操作完成','busy');
    // Known devices are already in the fresh driver snapshot. Native discovery
    // is needed only for a newly scanned device, not every picker selection.
    const current=await getState();
    if(current?.multiDevice!==true)throw new GrinderError('请先更新磨豆机插件','incompatible_driver');
    const device=(current.devices||[]).find(d=>d.id===id)||(await listDevices()).find(d=>d.id===id);
    if(!device)throw new GrinderError('未发现该磨豆机，请重新扫描','not_found');
    if(current.deviceId===id)return current;
    await command('selectDevice',{deviceId:id,name:device.name});
    invalidate('checking','device_selected');
    const state=await getState();
    if(state.deviceId!==id)throw new GrinderError('磨豆机选择已改变，请重新选择','device_changed');
    return state;
  }
  async function renameDevice(id,name) {
    const alias=String(name??'').trim();
    if(!alias||alias.length>24)throw new GrinderError('名称须为1–24个字符','invalid_name');
    if(!(await listDevices()).some(d=>d.id===id))throw new GrinderError('未发现该磨豆机','not_found');
    await command('renameDevice',{deviceId:id,name:alias});
    invalidate('checking','device_renamed');await getState();return listDevices();
  }
  function selectedId() {
    if(!cached?.deviceId)throw new GrinderError('请先选择磨豆机','missing_device');
    return cached.deviceId;
  }
  function sameDevice(state,id) {if(state.deviceId!==id)throw new GrinderError('磨豆机选择已改变，请重新读取后操作','device_changed');}
  function connect() {
    // Share one connection attempt across callers. A timeout is uncertain and
    // must not trigger a second native connection that tears down another link.
    if(connectionTask)return connectionTask;
    if(operation||selectionTask)return Promise.reject(new GrinderError('请等待当前操作完成','busy'));
    connectionTask=connectOnce().finally(()=>{connectionTask=null;});
    return connectionTask;
  }
  async function connectOnce() {
    const current = await getState();
    if (!current.available) throw new GrinderError('尚未安装「这一杯·小方」插件；仍可正常冲煮', 'not_installed');
    if(current.preferencesReady===false)throw new GrinderError('设备偏好正在读取，请稍后重试','preferences_loading');
    if(current.multiDevice!==true)throw new GrinderError('请先更新磨豆机插件','incompatible_driver');
    if (current.connected) return current;
    // The native inventory already includes discovered devices. Scan only if
    // the selected identity is unavailable; never select a substitute.
    let matches=candidates(await request('/devices')),id=current.deviceId;
    if(!id||!matches.some(d=>d.available!==false&&d.id===id)){
      const scanned=await request('/devices/scan?connect=false');
      matches=candidates(Array.isArray(scanned)?scanned:await request('/devices'));
    }
    if(!id){
      const available=matches.filter(d=>d.available!==false);
      if(!available.length)throw new GrinderError('未发现磨豆机，请通电并关闭其他连接应用','not_found');
      if(available.length>1)throw new GrinderError('发现多台磨豆机，请选择一台','ambiguous_device');
      id=available[0].id;await selectDeviceOnce(id);
    }
    if(!matches.some(d=>d.id===id&&d.available!==false))throw new GrinderError('选定磨豆机不在线，请开机后重试；不会连接另一台','selected_device_offline');
    const latest=await getState();sameDevice(latest,id);
    const result = await request('/devices/connect', 'PUT', { deviceId:id });
    invalidate('checking','device_connected');const state = await getState();sameDevice(state,id);
    if (!state.connected) throw new GrinderError(result?.error || '磨豆机尚未连接，请稍后重试', 'not_connected');
    return state;
  }
  async function ensureReady(deviceId) {
    const state = await getState();sameDevice(state,deviceId);
    if(state.multiDevice!==true)throw new GrinderError('请先更新磨豆机插件','incompatible_driver');
    if(state.preferencesReady!==true)throw new GrinderError('设备偏好正在读取，请稍后重试','preferences_loading');
    if (!state.available) throw new GrinderError('尚未安装「这一杯·小方」插件', 'not_installed');
    if (!state.connected) throw new GrinderError('小方未连接', 'not_connected');
    if (state.workflowReady !== true) throw new GrinderError('当前曲线尚未确认，请重载配套小方插件并等待状态同步', 'workflow_unconfirmed');
    if (state.initialized === false || state.deviceBusy || state.state !== 'idle') throw new GrinderError('小方正在运行、调距或读取参数，请等待完成', 'busy');
  }
  async function run(kind, fn) {
    if (operation||connectionTask||selectionTask) throw new GrinderError('请等待当前操作完成', 'busy');
    const token = ++generation; operation = kind;publish({...cached,busy:true,operation:kind});
    try { return await fn(token); }
    finally { if (generation === token) operation = null; await getState().catch(() => {}); }
  }
  async function waitForOperation(receipt, token, deviceId) {
    if (!receipt?.operationId) throw new GrinderError('小方未返回操作凭据，请先读取状态', 'missing_receipt');
    const deadline=now()+80000;
    while (true) {
      check(token); const state=await getState(); check(token);sameDevice(state,deviceId);
      if (!state.available||!state.connected) throw new GrinderError('小方连接已中断；操作不会自动重试', 'not_connected');
      const record=state.operations?.find(item=>item.id===receipt.operationId);
      if (record?.status==='done') return state;
      if (record?.status==='error') throw new GrinderError(record.error||'小方未完成操作', record.code||'device_rejected');
      if (record?.status==='cancelled') throw new GrinderError(record.error||'操作已停止', 'cancelled');
      if (now()>=deadline) throw new GrinderError('小方操作未确认，请读取状态；不会重复发送', 'timeout');
      await sleep(200);
    }
  }
  function observedFence() {
    const fence=cached?.commandFence;
    if(typeof fence?.instanceId!=='string'||!Number.isSafeInteger(fence.revision)) throw new GrinderError('请先读取小方状态，再明确应用或开始；插件需支持停止保护', 'missing_fence');
    return clone(fence);
  }
  async function atomicCommand(kind,config,token,commandFence,beforeSend,expectedWorkflow,deviceId) {
    await ensureReady(deviceId);check(token);beforeSend?.();
    const receipt=await command(kind,{deviceId,config,commandFence,expectedWorkflow});check(token);
    const result=await waitForOperation(receipt,token,deviceId);
    if(kind==='apply'){
      const v=result.values;
      if(result.parametersConfirmed===false||!v||v.targetAngle!==config.grindSize||v.motorRpm!==config.motorRpm||v.feedRpm!==config.feedRpm)
        throw new GrinderError('设备读回与请求参数不一致，请重新读取；未确认应用成功', 'settings_unconfirmed');
    }
    return result;
  }
  async function apply(input,{beforeSend,expectedWorkflow}={}) {
    const config = validateGrinderConfig(input), commandFence=observedFence(),deviceId=selectedId();
    return run('applying', token => atomicCommand('apply',config,token,commandFence,beforeSend,clone(expectedWorkflow),deviceId));
  }
  async function start(input,{beforeSend,expectedWorkflow}={}) {
    if (Number.isInteger(input?.grindSize) && input.grindSize < 10)
      throw new GrinderError('刀距过近，拒绝启动。', 'gap_too_small');
    const config = validateGrinderConfig(input), commandFence=observedFence(),deviceId=selectedId();
    if (config.motorRpm <= 0) throw new GrinderError('启动前请设置刀盘转速', 'invalid_config');
    return run('starting', token => atomicCommand('start',config,token,commandFence,beforeSend,clone(expectedWorkflow),deviceId));
  }
  async function stop() {
    // Stop must not wait behind adjustment or a pending start sequence.
    if(!cached?.deviceId)await getState();
    const deviceId=selectedId(),token=++generation; operation = 'stopping';publish({...cached,busy:true,operation:'stopping'});
    try { const receipt=await command('stop',{deviceId}); return await waitForOperation(receipt,token,deviceId); }
    finally { if(token===generation)operation=null; await getState().catch(() => {}); }
  }
  async function readAll() { if(!cached?.deviceId)await getState();const deviceId=selectedId();return run('reading',async token=>waitForOperation(await command('readAll',{deviceId}),token,deviceId)); }
  // One record per profile prevents a stale client from replacing another
  // profile's recipe. The old collection remains read-only, without migration.
  const legacyRecipePath = '/store/thiscup/crystalRecipes';
  const recipeNamespace = '/store/thiscup-crystal-recipes-v2';
  const previousRecipeNamespace = '/store/thiscup-crystal-recipes';
  const unavailableRecipeSources = new Set();
  const recordKey = profileId => 'p-'+Array.from(profileId,c=>c.codePointAt(0).toString(16)).join('-');
  const deviceRecordKey=(deviceId,profileId)=>'d-'+Array.from(deviceId,c=>c.codePointAt(0).toString(16)).join('-')+'--'+recordKey(profileId);
  const recordPath = (identity,deviceId,namespace=recipeNamespace) => `${namespace}/${deviceRecordKey(deviceId,identity.profileId)}`;
  async function readPreviousRecipes(path) {
    const source = path.startsWith(legacyRecipePath) ? legacyRecipePath : path.includes('?full=1') ? `${previousRecipeNamespace}:list` : `${previousRecipeNamespace}:item`;
    try { const value = await request(path); unavailableRecipeSources.delete(source); if(source===`${previousRecipeNamespace}:list`)unavailableRecipeSources.delete(`${previousRecipeNamespace}:item`); return value; }
    catch (error) { if (error.code !== 'http_500') throw error; unavailableRecipeSources.add(source); return null; }
  }
  const isMap = value => value && typeof value==='object' && !Array.isArray(value);
  const linkedRecord = (record,identity,version) => record?.schemaVersion===version && record.profileId===identity.profileId;
  async function legacyRecipeMap() {
    const result = await readPreviousRecipes(legacyRecipePath);
    return isMap(result) ? result : {};
  }
  async function getRecipe(profile) {
    const identity = profileIdentity(profile);
    if (!identity) return null;
    if(!cached)await getState();
    if(!cached?.deviceId)return null;
    const deviceId=selectedId();
    let record=await request(recordPath(identity,deviceId));
    if (!record) record=await readPreviousRecipes(recordPath(identity,deviceId,previousRecipeNamespace));
    sameDevice(await getState(),deviceId);
    return linkedRecord(record,identity,4)&&record.deviceId===deviceId?clone(record.config||null):null;
  }
  async function listRecipes() {
    if(!cached)await getState();
    const deviceId=cached?.deviceId;
    const [legacy,previous,current]=await Promise.all([legacyRecipeMap(),readPreviousRecipes(`${previousRecipeNamespace}?full=1`),request(`${recipeNamespace}?full=1`)]);
    const recipes=new Map(Object.entries(legacy).filter(([,v])=>v?.config&&v?.title).map(([key,v])=>[key,{...clone(v),key,legacy:true}]));
    for(const [storageKey,record] of Object.entries({...isMap(previous)?previous:{},...isMap(current)?current:{}})) {
      if(typeof record?.profileId!=='string'||!record.config||!record.title)continue;
      if(record.schemaVersion===3&&storageKey===recordKey(record.profileId))recipes.set(storageKey,{...clone(record),key:storageKey,legacy:true});
      if(record.schemaVersion===4&&record.deviceId===deviceId&&storageKey===deviceRecordKey(deviceId,record.profileId))recipes.set(storageKey,{...clone(record),key:storageKey,legacy:false});
    }
    if(deviceId)sameDevice(await getState(),deviceId);
    return [...recipes.values()];
  }
  async function saveRecipe(profile, input, {beforeSend}={}) {
    const identity = profileIdentity(profile);
    if (!identity) throw new GrinderError('请先从方案库选择曲线，再保存研磨方案', 'missing_profile_identity');
    if(!cached)await getState();
    const deviceId=selectedId(),{profileId,title}=identity,config=validateGrinderConfig(input);
    const record={schemaVersion:4,deviceId,profileId,title,config,updatedAt:new Date(now()).toISOString()};
    sameDevice(await getState(),deviceId);beforeSend?.();
    await request(recordPath(identity,deviceId), 'POST', record);
    const saved = await request(recordPath(identity,deviceId));
    if (!linkedRecord(saved,identity,4)||saved.deviceId!==deviceId||saved.title!==title||Object.keys(config).some(field=>saved.config?.[field]!==config[field]))throw new GrinderError('研磨方案保存后读回不一致，请重新读取','recipe_unconfirmed');
    sameDevice(await getState(),deviceId);
    return clone(saved);
  }
  return { getState, observe, refreshObservation, listDevices, selectDevice, renameDevice, connect, readAll, apply, start, stop, getRecipe, listRecipes, saveRecipe,
    subscribe(fn) { listeners.add(fn); if (cached) fn(clone(cached)); return () => listeners.delete(fn); },
    get previousRecipesUnavailable() { return unavailableRecipeSources.size > 0; },
    get cachedState() { return clone(cached); }
  };
}
