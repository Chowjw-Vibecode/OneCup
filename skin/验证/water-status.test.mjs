import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DecaidClient} from '../client.js';
import {waterView} from '../water-status.js';

const live = {connected:true, machineConnected:true, stale:false};
const sample = {
  water:{currentLevel:32.5, refillLevel:7},
  waterMachine:{model:'DE1Pro', refillKit:false},
  machine:{state:{state:'idle', substate:'idle'}},
};
test('Uses classic DE1 table, preserving valid zero and the full-tank cap', () => {
  for (const [currentLevel, ml] of [[0, 0], [7, 179], [32.5, 872], [70, 2058]]) {
    const reading = waterView({...sample, water:{...sample.water,currentLevel}}, live, 'zh');
    assert.equal(reading.ml, ml);
  }
  for (const currentLevel of [null, -0.1, '20', undefined]) {
    const reading = waterView({...sample, water:{currentLevel}}, live, 'zh');
    assert.equal(reading.ml, null);
    assert.equal(reading.tone, 'unknown');
  }
  assert.equal(waterView({...sample, waterMachine:{model:'Bengle'}}, live, 'zh').ml, null);
});

test('Threshold uses the native height, while a confirmed kit only warns when refill stops', () => {
  const water = {currentLevel:7, refillLevel:7};
  const manual = waterView({...sample, water}, live, 'zh');
  assert.deepEqual([manual.tone, manual.label, manual.ml, manual.refillKit], ['warning','水位低',179,false]);
  const waterMachine = {model:'DE1XL',refillKit:true};
  const automatic = waterView({...sample, water, waterMachine}, live, 'en');
  assert.deepEqual([automatic.tone, automatic.label, automatic.ml, automatic.refillKit], ['normal','Water',179,true]);
  const disabled = waterView({...sample, water, waterMachine:{...waterMachine,refillDisabled:true}}, live, 'zh');
  assert.deepEqual([disabled.tone, disabled.label, disabled.ml, disabled.refillKit], ['warning','水位低',179,true]);
  const machine = {state:{state:'needsWater',substate:'refillStopped'}};
  const stopped = waterView({...sample, water, waterMachine, machine}, live, 'en');
  assert.deepEqual([stopped.tone, stopped.label, stopped.ml, stopped.refillKit], ['warning','Refill stopped',179,true]);
  const stale = waterView({...sample, water, waterMachine, machine}, {...live, stale:true}, 'zh');
  assert.deepEqual([stale.tone, stale.label, stale.ml, stale.refillKit], ['unknown','水位',null,false]);
});

test('Water reconnect clears both prior readings and kit detection; stale REST data cannot return', async () => {
  const requests = [];
  const client = new DecaidClient('http://preview.invalid');
  client.closed = false;
  client.snapshot.machine=sample.machine;
  client.get = path => new Promise(resolve => requests.push({path,resolve}));
  const device = id => [{type:'machine', state:'connected', id}];
  client.setDevices(device('old'));
  assert.deepEqual(requests.map(request => request.path), ['/machine/info','/machine/waterLevels']);
  requests.shift().resolve({model:'DE1PRO', extra:{refillKit:true}});
  requests.shift().resolve({currentLevel:30,refillLevel:7});
  await Promise.resolve();
  assert.equal(client.snapshot.water.currentLevel, 30);
  assert.equal(client.snapshot.waterMachine.refillKit, true);
  const priorSettings = requests.shift();
  assert.equal(priorSettings.path, '/machine/settings/advanced');

  const overdue = client.readWaterLevels();
  client.setDevices([]);
  assert.equal(client.snapshot.water, null);
  assert.equal(client.snapshot.waterMachine, null);
  client.setDevices(device('new'));
  requests.shift().resolve({currentLevel:50,refillLevel:7});
  requests.shift().resolve({model:'DE1XL', extra:{refillKit:false}});
  requests.shift().resolve({currentLevel:7,refillLevel:7});
  priorSettings.resolve({refillKitSetting:0});
  await overdue;
  assert.equal(client.snapshot.water.currentLevel, 7);
  assert.equal(client.snapshot.waterMachine.refillKit, false);
});

test('Recovers the water badge after the initial machine info request fails', async t => {
  t.mock.timers.enable({apis:['setInterval']});
  t.mock.method(Date, 'now', () => now);
  let now=1000, infoReads=0;
  const sockets=new Map();
  class Socket {
    constructor(url) { sockets.set(new URL(url).pathname.slice(6),this); }
    close() {}
  }
  const client=new DecaidClient('http://preview.invalid',{WebSocket:Socket});
  client.get=async path=>{
    if(path==='/devices')return [{id:'de1',type:'machine',state:'connected'}];
    if(path==='/machine/info'){
      if(++infoReads===1) throw new Error('Temporary machine info failure');
      return {model:'DE1Pro',extra:{refillKit:true}};
    }
    if(path==='/machine/settings/advanced')return {refillKitSetting:2};
    throw new Error('No REST water route');
  };
  const off=client.subscribe(()=>{});
  const send=(path,body)=>sockets.get(path).onmessage({data:JSON.stringify(body)});
  const tickMachine=()=>send('/machine/snapshot',{...sample.machine,timestamp:new Date(now).toISOString()});
  try {
    await Promise.resolve();
    await Promise.resolve();
    sockets.get('/machine/snapshot').onopen();
    tickMachine();
    send('/machine/waterLevels',{currentLevel:22.6,refillLevel:40});
    assert.equal(infoReads,1);
    assert.equal(waterView(client.snapshot,client.connection,'zh').ml,null);

    now+=1000;
    t.mock.timers.tick(1000);
    assert.equal(infoReads,1);

    now+=10000;
    tickMachine();
    t.mock.timers.tick(1000);
    await Promise.resolve();
    await Promise.resolve();
    const water=waterView(client.snapshot,client.connection,'zh');
    assert.deepEqual([infoReads,water.ml,water.refillKit],[2,592,true]);
  } finally { off(); }
});

test('Refreshes the override without reconnecting or overlapping slow reads', async t => {
  t.mock.method(Date, 'now', () => time);
  let time=0, requests=0, complete;
  const client=new DecaidClient('http://preview.invalid');
  client.closed=false;
  client.snapshot.machine=structuredClone(sample.machine);
  client.snapshot.waterMachine={model:'DE1Pro',refillKit:true};
  client.snapshot.water={currentLevel:32,refillLevel:7};
  client.get=path=>{
    assert.equal(path,'/machine/settings/advanced');
    requests++;
    return new Promise(resolve=>{complete=resolve;});
  };
  const initial=client.refreshRefillSetting();
  complete({refillKitSetting:2});
  await initial;

  time=1500;
  await client.refreshRefillSetting();
  assert.equal(requests,1);
  client.snapshot.water.currentLevel=7;
  const low=client.refreshRefillSetting();
  time=4000;
  await client.refreshRefillSetting();
  assert.equal(requests,2);
  complete({refillKitSetting:0});
  await low;
  assert.equal(waterView(client.snapshot,live,'zh').tone,'warning');

  await client.refreshRefillSetting();
  assert.equal(requests,2);
  client.snapshot.machine.state.state='espresso';
  await client.refreshRefillSetting(true);
  assert.equal(requests,2);
  client.snapshot.machine.state.state='idle';
  const enabled=client.refreshRefillSetting();
  complete({refillKitSetting:2});
  await enabled;
  assert.equal(waterView(client.snapshot,live,'zh').tone,'normal');
  assert.equal(requests,3);
});
