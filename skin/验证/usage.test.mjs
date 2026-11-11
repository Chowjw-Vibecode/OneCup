// Development checks with fake time, storage and transport. No network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUsageReporter, createUsageCookieStorage, isUsageEnvironment, USAGE_ENDPOINT, USAGE_STORAGE_KEY, USAGE_COOKIE_NAME} from '../usage.js';

const DAY = 86_400_000, WEEK = 7 * DAY;
const flush = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };
function clock() {
  let time = 1_000_000, sequence = 0;
  const tasks = new Map();
  return {
    now:() => time,
    setTimer(fn, delay) { const id=++sequence; tasks.set(id,{fn,at:time+delay}); return id; },
    clearTimer:id => tasks.delete(id),
    get pending() { return tasks.size; },
    async advance(ms) {
      const end=time+ms; let count=0;
      for (;;) {
        const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if (!next) break;
        if (++count>1000) throw Error('Unexpected timer loop');
        time=next[1].at; tasks.delete(next[0]); next[1].fn(); await flush();
      }
      time=end; await flush();
    },
  };
}
function eventTarget() {
  const listeners=new Map();
  return {
    addEventListener(name,fn) { if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn); },
    removeEventListener(name,fn) { listeners.get(name)?.delete(fn); },
    emit(name,event={}) { for(const fn of listeners.get(name)??[]) fn(event); },
  };
}
function realContext() {
  return {
    pageUrl:'http://localhost:25123/?_=1794327200000', apiUrl:'http://localhost:8080',
    host:{app:'decent.app',platform:'android'}, settings:{simulatedDevices:[]},
    connection:{connected:true,machineConnected:true,stale:false}, machineState:'idle', busy:false,
  };
}
function fixture(options={}) {
  const time=options.time??clock(), values=options.values??new Map(), events=eventTarget();
  const state=options.context??realContext(), calls=[];
  const storage=options.storage??{
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,value),
  };
  let generated=0;
  const crypto=options.crypto===undefined?{getRandomValues(bytes){generated++;bytes.set(Array.from({length:16},(_,i)=>i+generated));return bytes;}}:options.crypto;
  const reporter=createUsageReporter({
    getContext:options.getContext??(()=>state), currentVersion:options.version, storage, events,
    now:time.now,setTimer:time.setTimer,clearTimer:time.clearTimer,cryptoImpl:crypto,
    fetchImpl:(url,init)=>{
      calls.push({url,init,at:time.now()});
      assert.equal(JSON.parse(storage.getItem(USAGE_STORAGE_KEY)).install_id,JSON.parse(init.body).install_id,'ID must already be stored');
      return options.fetch ? options.fetch(url,init) : Promise.resolve({ok:true,json:async()=>({accepted:true,next_check_in_after_s:604800})});
    },
  });
  return {reporter,time,values,events,state,calls,get generated(){return generated;},stored:()=>JSON.parse(storage.getItem(USAGE_STORAGE_KEY))};
}

test('real embedded skin permits its assigned localhost page port and separate API port',()=>{
  assert.equal(isUsageEnvironment(realContext()),true);
  assert.equal(isUsageEnvironment({...realContext(),apiUrl:'http://127.0.0.1:8080'}),true);
  assert.equal(isUsageEnvironment({...realContext(),pageUrl:'http://[::1]:25123/',apiUrl:'http://[::1]:8080'}),false);
  assert.equal(isUsageEnvironment({...realContext(),host:{app:'decent.app',platform:'macos'}}),true);
});

test('ordinary browsers, scene/mock URLs, verification paths and remote API origins never qualify',()=>{
  const cases=[
    {host:undefined},{host:{app:'other',platform:'android'}},
    {pageUrl:'http://preview.invalid/'},{pageUrl:'file:///skin/index.html'},
    {pageUrl:'http://127.0.0.1:25123/'},
    {pageUrl:'http://localhost:25123/?scene=ready'},{pageUrl:'http://localhost:25123/?mock=1'},
    {pageUrl:'http://localhost:25123/?preview=true'},{pageUrl:'http://localhost:25123/?demo=1'},
    {pageUrl:'http://localhost:25123/验证/风味轮原型/index.html'},
    {pageUrl:'http://localhost:25123/%E9%AA%8C%E8%AF%81/ready.html'},
    {pageUrl:'http://localhost:25123/test/mock.html'},{pageUrl:'http://localhost:25123/preview.html'},
    {apiUrl:'http://preview.invalid'},{apiUrl:'http://192.168.31.46:8080'},
    {apiUrl:'http://localhost.evil.invalid:8080'},{apiUrl:'http://user:pass@localhost:8080'},
  ];
  for(const patch of cases)assert.equal(isUsageEnvironment({...realContext(),...patch}),false,JSON.stringify(patch));
});

test('first check-in waits 60 seconds, persists a cryptographic ID, sends only two fields, then waits 7 days',async()=>{
  const f=fixture();f.reporter.start();
  await f.time.advance(59_999);assert.equal(f.calls.length,0);assert.equal(f.values.size,0);
  await f.time.advance(1);assert.equal(f.calls.length,1);
  const {url,init}=f.calls[0],body=JSON.parse(init.body);
  assert.equal(url,USAGE_ENDPOINT);assert.equal(init.method,'POST');
  assert.deepEqual(Object.keys(body).sort(),['install_id','product']);
  assert.match(body.install_id,/^[0-9a-f]{32}$/);assert.equal(body.product,'this_cup');
  assert.equal(init.credentials,'omit');assert.equal(init.referrerPolicy,'no-referrer');assert.equal(init.redirect,'error');
  assert.equal(f.stored().next_at,f.time.now()+WEEK);assert.equal(f.generated,1);
  await f.time.advance(WEEK-1);assert.equal(f.calls.length,1);
  await f.time.advance(1);assert.equal(f.calls.length,2);assert.equal(f.generated,1);
  assert.equal(JSON.parse(f.calls[1].init.body).install_id,body.install_id);
  f.reporter.dispose();assert.equal(f.time.pending,0);
});

test('a due check-in waits for fresh real idle/sleeping state; activity and simulations do not send',async()=>{
  const f=fixture();f.state.machineState='espresso';f.reporter.start();
  await f.time.advance(60_000);assert.equal(f.calls.length,0);
  for(const state of ['steam','hotwater','heating','preheating','needswater','error','']) {
    f.state.machineState=state;await f.time.advance(30_000);assert.equal(f.calls.length,0,state);
  }
  f.state.machineState='idle';f.state.connection.stale=true;
  await f.time.advance(30_000);assert.equal(f.calls.length,0);
  f.state.connection.stale=false;f.state.connection.machineConnected=false;
  await f.time.advance(30_000);assert.equal(f.calls.length,0);
  f.state.connection.machineConnected=true;f.state.settings={simulatedDevices:['de1']};
  await f.time.advance(30_000);assert.equal(f.calls.length,0);
  f.state.settings=undefined;await f.time.advance(30_000);assert.equal(f.calls.length,0);
  f.state.settings={simulatedDevices:[]};f.state.busy=true;
  await f.time.advance(30_000);assert.equal(f.calls.length,0);
  f.state.busy=false;f.state.machineState='sleeping';
  await f.time.advance(30_000);assert.equal(f.calls.length,1);f.reporter.dispose();
});

for(const [name,fetch] of [
  ['network rejection',()=>Promise.reject(Error('offline'))],
  ['HTTP failure',async()=>({ok:false})],
  ['invalid JSON',async()=>({ok:true,json:async()=>{throw Error('bad json');}})],
  ['negative acknowledgement',async()=>({ok:true,json:async()=>({accepted:false})})],
]) test(`${name} is silent and retries after one day, not each page load`,async()=>{
  const f=fixture({fetch});f.reporter.start();await f.time.advance(60_000);
  assert.equal(f.calls.length,1);assert.equal(f.stored().next_at,f.time.now()+DAY);
  f.reporter.dispose();
  const g=fixture({fetch,time:f.time,values:f.values});g.reporter.start();
  await g.time.advance(DAY-1);assert.equal(g.calls.length,0);
  await g.time.advance(1);assert.equal(g.calls.length,1);assert.equal(g.generated,0);g.reporter.dispose();
});

test('storage errors, failed read-back and missing cryptographic randomness never send an ephemeral ID',async()=>{
  const blocked=[
    {getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},
    {getItem(){return null;},setItem(){throw Error('quota');}},
    {getItem(){return null;},setItem(){}},
  ];
  for(const storage of blocked){const f=fixture({storage});f.reporter.start();await f.time.advance(60_000);assert.equal(f.calls.length,0);f.reporter.dispose();}
  const f=fixture({crypto:null});f.reporter.start();await f.time.advance(60_000);assert.equal(f.calls.length,0);f.reporter.dispose();
  const g=fixture({crypto:{getRandomValues(){throw Error('unavailable');}}});g.reporter.start();await g.time.advance(60_000);assert.equal(g.calls.length,0);g.reporter.dispose();
});

test('default-on can be disabled before startup, survives reload, and enabling later resumes only when eligible',async()=>{
  const f=fixture();assert.equal(f.reporter.enabled,true);f.reporter.setEnabled(false);f.reporter.start();
  await f.time.advance(60_000);assert.equal(f.calls.length,0);assert.equal(f.stored().enabled,false);f.reporter.dispose();
  const g=fixture({time:f.time,values:f.values});assert.equal(g.reporter.enabled,false);g.reporter.start();
  await g.time.advance(60_000);assert.equal(g.calls.length,0);
  g.state.machineState='espresso';g.reporter.setEnabled(true);await g.time.advance(0);assert.equal(g.calls.length,0);
  g.state.machineState='idle';await g.time.advance(30_000);assert.equal(g.calls.length,1);g.reporter.dispose();
});

test('opting out aborts an in-flight POST, cancels timers, and a late acceptance cannot restore reporting',async()=>{
  let resolve;
  const f=fixture({fetch:()=>new Promise(yes=>{resolve=yes;})});f.reporter.start();await f.time.advance(60_000);
  assert.equal(f.calls.length,1);const signal=f.calls[0].init.signal;
  f.reporter.setEnabled(false);assert.equal(signal.aborted,true);assert.equal(f.time.pending,0);
  resolve({ok:true,json:async()=>({accepted:true})});await flush();
  await f.time.advance(WEEK+DAY);assert.equal(f.calls.length,1);assert.equal(f.stored().enabled,false);f.reporter.dispose();
});

test('closing remains effective in this page when preference persistence fails',async()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const f=fixture({values,storage});f.reporter.start();await f.time.advance(60_000);
  storage.setItem=()=>{throw Error('quota');};f.reporter.setEnabled(false);f.reporter.refresh();
  assert.equal(f.reporter.enabled,false);await f.time.advance(WEEK+DAY);assert.equal(f.calls.length,1);f.reporter.dispose();
});

test('pagehide cancels pending work; persisted pageshow rearms the 60-second startup delay',async()=>{
  const f=fixture();f.reporter.start();await f.time.advance(30_000);f.events.emit('pagehide');
  assert.equal(f.time.pending,0);await f.time.advance(90_000);assert.equal(f.calls.length,0);
  f.events.emit('pageshow',{persisted:false});await f.time.advance(60_000);assert.equal(f.calls.length,0);
  f.events.emit('pageshow',{persisted:true});await f.time.advance(59_999);assert.equal(f.calls.length,0);
  await f.time.advance(1);assert.equal(f.calls.length,1);f.reporter.dispose();
});

test('pagehide aborts a request without keepalive or background delivery',async()=>{
  const f=fixture({fetch:()=>new Promise(()=>{})});f.reporter.start();await f.time.advance(60_000);
  f.events.emit('pagehide');await flush();assert.equal(f.calls[0].init.signal.aborted,true);
  assert.equal(f.calls[0].init.keepalive,undefined);assert.equal(f.time.pending,0);f.reporter.dispose();
});

test('four-second timeout also handles a transport that never settles after abort',async()=>{
  const f=fixture({fetch:()=>new Promise(()=>{})});f.reporter.start();await f.time.advance(60_000);
  await f.time.advance(3_999);assert.equal(f.calls[0].init.signal.aborted,false);
  await f.time.advance(1);assert.equal(f.calls[0].init.signal.aborted,true);assert.equal(f.stored().next_at,f.time.now()+DAY);
  await f.time.advance(DAY-1);assert.equal(f.calls.length,1);
  await f.time.advance(1);assert.equal(f.calls.length,2);f.reporter.dispose();
});

test('an opt-out from shared storage cancels this page too',async()=>{
  const f=fixture({fetch:()=>new Promise(()=>{})});f.reporter.start();await f.time.advance(60_000);
  f.values.set(USAGE_STORAGE_KEY,JSON.stringify({...f.stored(),enabled:false}));
  f.events.emit('storage',{key:USAGE_STORAGE_KEY});await flush();
  assert.equal(f.reporter.enabled,false);assert.equal(f.calls[0].init.signal.aborted,true);assert.equal(f.time.pending,0);f.reporter.dispose();
});

test('preview contexts never schedule a request or create storage; context exceptions stay isolated',async()=>{
  for(const options of [{context:{...realContext(),pageUrl:'http://localhost:8893/?scene=taste'}},{getContext:()=>{throw Error('not ready');}}]) {
    const f=fixture(options);f.reporter.start();await f.time.advance(WEEK);assert.equal(f.calls.length,0);assert.equal(f.values.size,0);assert.equal(f.time.pending,0);f.reporter.dispose();
  }
});

test('successful check-in never accepts a shorter server-suggested interval',async()=>{
  const f=fixture({fetch:async()=>({ok:true,json:async()=>({accepted:true,next_check_in_after_s:1})})});
  f.reporter.start();await f.time.advance(60_000);assert.equal(f.stored().next_at,f.time.now()+WEEK);f.reporter.dispose();
});

function cookieJar() {
  let raw='';
  const jar={readable:true,writable:true,writes:[],clear(){raw='';},corrupt(){raw=USAGE_COOKIE_NAME+'=%broken';}};
  jar.document={
    get cookie(){if(!jar.readable)throw Error('Cookie access denied');return raw;},
    set cookie(value){jar.writes.push(value);if(jar.writable)raw=value.split(';')[0];},
  };
  jar.storage=(port=25123,legacy=new Map())=>createUsageCookieStorage({
    document:jar.document,location:new URL(`http://localhost:${port}/`),
    legacyStorage:{getItem:key=>legacy.get(key)??null,removeItem:key=>legacy.delete(key)},
  });
  return jar;
}

test('cookie identity and seven-day schedule survive a different native skin port',async()=>{
  const jar=cookieJar(),f=fixture({storage:jar.storage()});
  f.reporter.start();await f.time.advance(60_000);const first=f.stored();f.reporter.dispose();
  assert.equal(jar.writes.length,2);
  assert(jar.writes.every(raw=>raw.includes('; Path=/; SameSite=Lax; Max-Age=31536000')&&!raw.includes('Domain=')));
  const context={...realContext(),pageUrl:'http://localhost:26888/'};
  const g=fixture({time:f.time,context,storage:jar.storage(26888)});g.reporter.start();
  await g.time.advance(WEEK-1);assert.equal(g.calls.length,0);assert.equal(g.generated,0);
  await g.time.advance(1);assert.equal(g.calls.length,1);assert.equal(g.generated,0);
  assert.equal(g.stored().install_id,first.install_id);g.reporter.dispose();
});

test('cookie opt-out survives another port and overrides stale enabled localStorage',async()=>{
  const jar=cookieJar(),f=fixture({storage:jar.storage()});f.reporter.setEnabled(false);f.reporter.dispose();
  const stale=new Map([[USAGE_STORAGE_KEY,JSON.stringify({enabled:true,install_id:'a'.repeat(32),next_at:0})]]);
  const g=fixture({storage:jar.storage(26888,stale)});
  assert.equal(g.reporter.enabled,false);g.reporter.start();await g.time.advance(WEEK);
  assert.equal(g.calls.length,0);assert.equal(g.generated,0);assert.equal(g.stored().enabled,false);g.reporter.dispose();
});

test('a valid legacy state migrates once, preserving the ID, due time and disabled preference',async()=>{
  const prior={enabled:false,install_id:'a'.repeat(32),next_at:9_000_000};
  const legacy=new Map([[USAGE_STORAGE_KEY,JSON.stringify(prior)]]),jar=cookieJar();
  const storage=jar.storage(25123,legacy);
  assert.deepEqual(JSON.parse(storage.getItem(USAGE_STORAGE_KEY)),prior);
  assert.equal(legacy.has(USAGE_STORAGE_KEY),false);assert.equal(jar.writes.length,1);
  legacy.set(USAGE_STORAGE_KEY,JSON.stringify({...prior,enabled:true,install_id:'b'.repeat(32),next_at:0}));
  assert.deepEqual(JSON.parse(storage.getItem(USAGE_STORAGE_KEY)),prior);
  const f=fixture({storage:jar.storage(26777,legacy)});assert.equal(f.reporter.enabled,false);
  f.reporter.start();await f.time.advance(WEEK);assert.equal(f.calls.length,0);assert.equal(jar.writes.length,1);f.reporter.dispose();
});

test('blocked cookies and failed migration read-back never send or regenerate IDs repeatedly',async()=>{
  for(const migrate of [false,true]){
    const jar=cookieJar();jar.writable=false;
    const legacy=migrate?new Map([[USAGE_STORAGE_KEY,JSON.stringify({enabled:false,install_id:'a'.repeat(32),next_at:0})]]):new Map();
    const f=fixture({storage:jar.storage(25123,legacy)});f.reporter.start();
    await f.time.advance(60_000+2*DAY);assert.equal(f.calls.length,0);assert(f.generated<=1);assert(jar.writes.length<=1);
    if(migrate)assert.equal(legacy.has(USAGE_STORAGE_KEY),true);
    f.reporter.dispose();
  }
});

test('a disappeared or corrupt cookie never causes a new installation in the running page',async()=>{
  for(const damage of ['clear','corrupt']){
    const jar=cookieJar(),f=fixture({storage:jar.storage()});f.reporter.start();await f.time.advance(60_000);
    assert.equal(f.calls.length,1);assert.equal(f.generated,1);jar[damage]();
    f.reporter.refresh();await f.time.advance(WEEK+2*DAY);
    assert.equal(f.calls.length,1);assert.equal(f.generated,1);f.reporter.dispose();
  }
});

test('failed cookie preference persistence stops this page and cannot restart reporting',async()=>{
  const jar=cookieJar(),f=fixture({storage:jar.storage()});f.reporter.start();await f.time.advance(60_000);
  jar.writable=false;f.reporter.setEnabled(false);f.reporter.refresh();
  assert.equal(f.reporter.enabled,false);await f.time.advance(WEEK+DAY);assert.equal(f.calls.length,1);
  f.reporter.setEnabled(true);await f.time.advance(WEEK);assert.equal(f.calls.length,1);f.reporter.dispose();
});

test('invalid legacy preferences and unreadable cookies are not replaced with a fresh identity',async()=>{
  for(const previous of ['{',JSON.stringify({enabled:false}),JSON.stringify({enabled:'false',install_id:null,next_at:0}),JSON.stringify({enabled:true,install_id:['a'.repeat(32)],next_at:0})]){
    const jar=cookieJar(),legacy=new Map([[USAGE_STORAGE_KEY,previous]]),f=fixture({storage:jar.storage(25123,legacy)});
    f.reporter.start();await f.time.advance(60_000+DAY);assert.equal(f.calls.length,0);assert.equal(f.generated,0);assert.equal(jar.writes.length,0);f.reporter.dispose();
  }
  const jar=cookieJar();jar.readable=false;const f=fixture({storage:jar.storage()});f.reporter.start();
  await f.time.advance(60_000+DAY);assert.equal(f.calls.length,0);assert.equal(f.generated,0);f.reporter.dispose();
});


test('unsaved opt-out exposes persistence failure and warns through reload boundary',()=>{
  const values=new Map([[USAGE_STORAGE_KEY,JSON.stringify({enabled:true,install_id:'a'.repeat(32),next_at:0})]]);
  let blocked=true;
  const storage={getItem:key=>{if(blocked)throw Error('blocked');return values.get(key)??null;},setItem:(key,value)=>{if(blocked)throw Error('blocked');values.set(key,value);}};
  const f=fixture({storage});
  f.reporter.setEnabled(false);
  assert.equal(f.reporter.enabled,false);assert.equal(f.reporter.preferenceSaved,false);
  blocked=false;f.reporter.refresh();assert.equal(f.reporter.enabled,false);
  const reopened=fixture({storage});assert.equal(reopened.reporter.enabled,true);
  f.reporter.setEnabled(false);assert.equal(f.reporter.preferenceSaved,true);
  const saved=fixture({storage});assert.equal(saved.reporter.enabled,false);
  for(const r of [f,reopened,saved])r.reporter.dispose();
});


test('real cookie adapter stays unavailable until page reopen and opt-out then persists',()=>{
  const jar=cookieJar(),initial=fixture({storage:jar.storage()});
  initial.reporter.setEnabled(true);initial.reporter.dispose();
  const f=fixture({storage:jar.storage()});jar.writable=false;
  f.reporter.setEnabled(false);assert.equal(f.reporter.preferenceSaved,false);
  jar.writable=true;f.reporter.setEnabled(false);
  assert.equal(f.reporter.enabled,false);assert.equal(f.reporter.preferenceSaved,false);
  const reopened=fixture({storage:jar.storage()});assert.equal(reopened.reporter.enabled,true);
  reopened.reporter.setEnabled(false);assert.equal(reopened.reporter.preferenceSaved,true);
  const saved=fixture({storage:jar.storage(26777)});assert.equal(saved.reporter.enabled,false);
  for(const r of [f,reopened,saved])r.reporter.dispose();
});


test('version upgrade reports the same installation once before the previous weekly interval',async()=>{
  const f=fixture({version:'0.2.31'});f.reporter.start();await f.time.advance(60_000);
  const prior=f.stored();assert.equal(JSON.parse(f.calls[0].init.body).version,'0.2.31');f.reporter.dispose();
  const g=fixture({version:'0.2.32',time:f.time,values:f.values});g.reporter.start();
  await g.time.advance(59_999);assert.equal(g.calls.length,0);await g.time.advance(1);
  assert.equal(g.calls.length,1);assert.equal(g.stored().install_id,prior.install_id);assert.equal(g.generated,0);
  assert.deepEqual(Object.keys(JSON.parse(g.calls[0].init.body)).sort(),['install_id','product','version']);
  g.reporter.dispose();const h=fixture({version:'0.2.32',time:g.time,values:g.values});h.reporter.start();
  await h.time.advance(60_000);assert.equal(h.calls.length,0);h.reporter.dispose();
});
test('legacy weekly schedule receives one version report; failed version report retains daily backoff across reload',async()=>{
  const values=new Map([[USAGE_STORAGE_KEY,JSON.stringify({enabled:true,install_id:'a'.repeat(32),next_at:99_000_000})]]);
  const f=fixture({version:'0.2.32',values,fetch:()=>Promise.reject(Error('offline'))});f.reporter.start();await f.time.advance(60_000);
  assert.equal(f.calls.length,1);assert.equal(f.generated,0);assert.equal(f.stored().attempt_version,'0.2.32');f.reporter.dispose();
  const g=fixture({version:'0.2.32',values,time:f.time});g.reporter.start();await g.time.advance(DAY-1);assert.equal(g.calls.length,0);
  await g.time.advance(1);assert.equal(g.calls.length,1);g.reporter.dispose();
});
test('version migration preserves cookie identity and disabled preference',async()=>{
  const jar=cookieJar(),legacy=new Map([[USAGE_STORAGE_KEY,JSON.stringify({enabled:false,install_id:'a'.repeat(32),next_at:9_000_000})]]);
  const f=fixture({version:'0.2.32',storage:jar.storage(25123,legacy)});f.reporter.start();await f.time.advance(WEEK);
  assert.equal(f.calls.length,0);assert.equal(f.stored().install_id,'a'.repeat(32));assert.equal(f.reporter.enabled,false);f.reporter.dispose();
});


test('failed version report reserves one shared retry interval across older and newer pages',async()=>{
  const values=new Map([[USAGE_STORAGE_KEY,JSON.stringify({enabled:true,install_id:'a'.repeat(32),next_at:90000000,attempt_version:'0.2.30'})]]);
  const time=clock(),newer=fixture({version:'0.2.31',values,time,fetch:()=>Promise.reject(Error('offline'))});
  newer.reporter.start();await time.advance(60_000);assert.equal(newer.calls.length,1);
  const older=fixture({version:'0.2.30',values,time});older.reporter.start();await time.advance(60_000);
  assert.equal(older.calls.length,0);assert.equal(newer.calls.length,1);
  const newest=fixture({version:'0.2.32',values,time});newest.reporter.start();await time.advance(DAY-60_001);
  assert.equal(older.calls.length,0);assert.equal(newest.calls.length,0);assert.equal(newer.calls.length,1);
  assert.equal(newer.stored().install_id,'a'.repeat(32));
  for(const f of [older,newer,newest])f.reporter.dispose();
});
test('in-flight version report cannot be duplicated by another version; opt-out wins across versions',async()=>{
  const values=new Map(),time=clock(),first=fixture({version:'0.2.30',values,time,fetch:()=>new Promise(()=>{})});
  first.reporter.start();await time.advance(60_000);
  const second=fixture({version:'0.2.31',values,time});second.reporter.start();await time.advance(60_000);
  assert.equal(first.calls.length,1);assert.equal(second.calls.length,0);
  second.reporter.setEnabled(false);first.reporter.refresh();await time.advance(DAY);
  assert.equal(first.calls.length,1);assert.equal(second.calls.length,0);assert.equal(first.reporter.enabled,false);
  first.reporter.dispose();second.reporter.dispose();
});
