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
