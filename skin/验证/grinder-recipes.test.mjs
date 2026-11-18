import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGrinderClient} from '../grinder.js';

const previous='/api/v1/store/thiscup-crystal-recipes';
const current='/api/v1/store/thiscup-crystal-recipes-v2';
const deviceId='device',profileId='p';
const config={grindSize:640,motorRpm:1000,feedRpm:30,bootMode:'smart'};
const recipe={schemaVersion:4,deviceId,profileId,config,title:'Saved recipe'};
const recordKey='d-64-65-76-69-63-65--p-70';
const profile={profileId,profile:{title:'Saved recipe'}};
function fixture({ failCurrent=false, includeCurrent=true }={}){
  const reads=[];
  const client=createGrinderClient({baseUrl:'http://fixture.invalid',fetchImpl:async(url,options)=>{
    const path=new URL(url).pathname;
    assert.equal(options.method,'GET');
    reads.push(path);
    if(path.includes('/plugins/'))return Response.json({deviceId,state:'idle',connected:true,busy:false,multiDevice:true});
    if(path.startsWith(previous) && !path.startsWith(current))throw new TypeError('Failed to fetch');
    if(path.startsWith(current) && failCurrent)throw new TypeError('Failed to fetch from the active store');
    if(path===current)return Response.json(includeCurrent ? {[recordKey]:recipe} : {});
    return Response.json(null);
  }});
  return {client,reads};
}

test('An opaque legacy-store failure leaves new grind recipes available',async()=>{
  const {client,reads}=fixture();
  assert.deepEqual(await client.listRecipes(),[{...recipe,key:recordKey,legacy:false}]);
  assert.equal(client.previousRecipesUnavailable,true);
  assert(reads.includes(previous));
});

test('The legacy item read falls back without blocking the grinder panel',async()=>{
  const {client}=fixture();
  assert.equal(await client.getRecipe(profile),null);
  assert.equal(client.previousRecipesUnavailable,true);
});

test('An empty active store stays available, and a broken active store still reports an error',async()=>{
  assert.deepEqual(await fixture({includeCurrent:false}).client.listRecipes(),[]);
  await assert.rejects(()=>fixture({failCurrent:true}).client.listRecipes(),/active store/);
});
