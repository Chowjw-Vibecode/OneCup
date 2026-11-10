import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DecaidClient} from '../client.js';

function fixture() {
  const client = new DecaidClient('http://preview.invalid');
  client.closed = false;
  const calls = [];
  client.request = async (method,path) => {
    calls.push([method,path]);
    if (path==='/machine/state') return {state:{state:'idle'}};
    if (path==='/settings') return {preferredScaleId:'bookoo'};
    if (path==='/devices') return [{type:'scale',id:'bookoo',state:'connected'}];
  };
  return {client,calls,error:{kind:'scaleConnectFailed',deviceId:'bookoo',timestamp:new Date().toISOString()}};
}
test('后台发现首选秤但连接失败，只补一次扫描；点连接共享同一轮扫描',async()=>{
  const {client,calls,error}=fixture();
  await Promise.all([client.recoverPreferredScale(error,()=>true),client.recoverPreferredScale(error,()=>true)]);
  await client.recoverPreferredScale(error,()=>true);
  assert.deepEqual(calls.map(c=>c[1]),['/settings','/machine/state','/devices/scan?connect=false','/devices']);
  calls.length=0;
  const [a,b]=await Promise.all([client.scanDevices(),client.scanDevices()]);
  assert.deepEqual(calls.map(c=>c[1]),['/devices/scan?connect=false','/devices']);
  assert.equal(a,b);assert.equal(a[0].id,'bookoo');
});
test('旧故障、其他设备、手动断开和运行中的机器不触发补扫',async()=>{
  const {client,calls,error}=fixture();
  await client.recoverPreferredScale({...error,timestamp:'2000-01-01T00:00:00Z'},()=>true);
  await client.recoverPreferredScale(error,()=>false);
  await client.recoverPreferredScale({...error,deviceId:'other'},()=>true);
  assert.deepEqual(calls.map(c=>c[1]),['/settings']);
});

test('页面仍显示空闲时以机器实时状态为准',async()=>{
  const {client,error}=fixture();
  client.get=async path => path==='/settings' ? {preferredScaleId:'bookoo'} : {state:{state:'espresso'}};
  let scans=0;client.scanDevices=async()=>{scans++};
  await client.recoverPreferredScale(error,()=>true);
  assert.equal(scans,0);
});

test('主秤直接由 A 切到 B 后等待新帧，同秤或辅助秤刷新保留当前读数', () => {
  class Socket { close() {} }
  const client = new DecaidClient('http://preview.invalid', {WebSocket: Socket});
  client.get = async () => [];
  try {
    client.subscribe(() => {});
    const send = (path, value) => client.sockets.get(path).onmessage({data: JSON.stringify(value)});
    const a = {id:'A', type:'scale', state:'connected'};
    const b = {id:'B', type:'scale', state:'connected', connectionRole:'primary'};
    const aux = {id:'aux', type:'scale', state:'connected', connectionRole:'auxiliary'};
    const first = Date.now() - 100;
    const weight = (offset, grams) => send('/scale/snapshot', {
      timestamp:new Date(first + offset).toISOString(), weight:grams
    });
    send('/devices', {devices:[a, {...b, state:'disconnected'}]});
    weight(0, 11.1);
    const socketA=client.sockets.get('/scale/snapshot');
    assert.equal(client.snapshot.scale.weight, 11.1);
    send('/devices', {devices:[aux, {...a, name:'renamed'}]});
    assert.equal(client.snapshot.scale.weight, 11.1);

    send('/devices', {devices:[aux, {...a, state:'disconnected'}, b]});
    assert.equal(client.connection.scaleConnected, true);
    assert.equal(client.snapshot.scale, null);
    assert.equal(client.lastScaleAt, 0);
    assert.equal(client.connection.scaleStale, true);
    // A produced this after its last accepted reading, before the handoff.
    // Its transport delivers the queued frame and status only after B connects.
    socketA.onmessage({data:JSON.stringify({timestamp:new Date(first+1).toISOString(),weight:11.2})});
    assert.equal(client.snapshot.scale, null);
    socketA.onmessage({data:JSON.stringify({status:'disconnected'})});
    assert.equal(client.connection.scaleConnected, true);
    assert.equal(client.connection.scaleStale, true);
    weight(0, 11.1);
    assert.equal(client.snapshot.scale, null);
    weight(1, 0);
    assert.equal(client.snapshot.scale.weight, 0);
    assert.equal(client.connection.scaleStale, false);
    send('/devices', {devices:[b]});
    assert.equal(client.snapshot.scale.weight, 0);
    weight(2, 22.2);
    assert.equal(client.snapshot.scale.weight, 22.2);
  } finally {
    client.close();
  }
});
