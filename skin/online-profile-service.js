import {profileExecutionKey} from './client.js?v=0.2.38';
export const CATALOG_BASE='https://raw.githubusercontent.com/decentespresso/decaid/main/assets/defaultProfiles/';
export class OnlineProfileError extends Error {constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new OnlineProfileError(code);};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function numeric(value,optional=false){if(optional&&(value===null||value===undefined||value===''))return null;if((typeof value!=='number'&&typeof value!=='string')||String(value).trim()===''||!Number.isFinite(Number(value)))fail('invalidProfile');return Number(value);}
// Match native Profile.toJson; do not execute downloaded Tcl or script files.
export function normalizeOnlineProfile(raw){
 if(!obj(raw)||typeof raw.title!=='string'||!raw.title.trim()||!Array.isArray(raw.steps)||!raw.steps.length||raw.steps.length>100)fail('invalidProfile');
 const beverage=raw.beverage_type||'espresso';if(beverage!=='espresso')fail('notEspresso');
 const profile={version:raw.version==null?null:String(raw.version),title:raw.title.trim(),author:typeof raw.author==='string'?raw.author:'',notes:typeof raw.notes==='string'?raw.notes:'',beverage_type:beverage,
  tank_temperature:numeric(raw.tank_temperature),target_volume_count_start:numeric(raw.target_volume_count_start),target_weight:numeric(raw.target_weight,true),target_volume:numeric(raw.target_volume,true)};
 if(!Number.isInteger(profile.target_volume_count_start))fail('invalidProfile');
 profile.steps=raw.steps.map(s=>{
  if(!obj(s)||!['pressure','flow'].includes(s.pump)||!['fast','smooth'].includes(s.transition)||!['coffee','water'].includes(s.sensor)||typeof s.name!=='string')fail('invalidProfile');
  const v={name:s.name,pump:s.pump,transition:s.transition,volume:numeric(s.volume),seconds:numeric(s.seconds),weight:numeric(s.weight,true),temperature:numeric(s.temperature),sensor:s.sensor,[s.pump]:numeric(s[s.pump]),limiter:null,exit:null};
  if(v.seconds<0)fail('invalidProfile');
  if(s.limiter!=null){if(!obj(s.limiter))fail('invalidProfile');v.limiter={value:numeric(s.limiter.value),range:numeric(s.limiter.range)};}
  if(s.exit!=null){if(!obj(s.exit)||!['pressure','flow'].includes(s.exit.type)||!['over','under'].includes(s.exit.condition))fail('invalidProfile');v.exit={type:s.exit.type,condition:s.exit.condition,value:numeric(s.exit.value)};}
  return v;
 });return profile;
}
export function onlineExecutionKey(p){try{return profileExecutionKey(normalizeOnlineProfile(p));}catch{return null;}}
export function publicProfileURL(input){let url;try{url=new URL(input);}catch{fail('invalidURL');}if(url.protocol!=='https:'||url.username||url.password)fail('invalidURL');url.hash='';return url.href;}
export async function fetchPublicJSON(input,{fetcher=globalThis.fetch,signal,maxBytes=262144}={}){
 const url=publicProfileURL(input),controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)throw new DOMException('Aborted','AbortError');signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,12000);
 try{
  const response=await fetcher(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(response.status===429)fail('rateLimited');if(!response.ok)fail('sourceFailed');
  if(Number(response.headers?.get?.('content-length'))>maxBytes)fail('fileTooLarge');
  let text='';if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder();let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();fail('fileTooLarge');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}else{text=await response.text();if(new TextEncoder().encode(text).length>maxBytes)fail('fileTooLarge');}
  try{return JSON.parse(text);}catch{fail('notJSON');}
 }catch(e){if(e.name==='AbortError'){if(signal?.aborted)throw e;fail('sourceTimeout');}if(e instanceof TypeError)fail('sourceUnavailable');throw e;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export const COMMUNITY_BASE='https://visualizer.coffee/api/';
const shotIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Only public shot/profile URLs are translated. No account credentials are used.
export function onlineProfileFileURL(input){
 const url=new URL(publicProfileURL(input));
 if(url.hostname==='visualizer.coffee'){
  const match=url.pathname.match(/^\/(?:api\/)?shots\/([0-9a-f-]+)(?:\/profile)?\/?$/i);
  if(match&&shotIdPattern.test(match[1]))return `${COMMUNITY_BASE}shots/${match[1]}/profile?format=json`;
 }
 return url.href;
}
export async function readOnlineRecord(input,options={}){
 const url=onlineProfileFileURL(input),raw=await fetchPublicJSON(url,options),profile=normalizeOnlineProfile(raw);
 const parsed=new URL(url),shot=parsed.hostname==='visualizer.coffee'?parsed.pathname.match(/^\/api\/shots\/([0-9a-f-]+)\/profile$/i):null;
 return {url,filename:decodeURIComponent(parsed.pathname.split('/').pop()||'profile.json'),profile,source:shot?'community':url.startsWith(CATALOG_BASE)?'official':'link',...(shot?{shotId:shot[1],shotURL:`https://visualizer.coffee/shots/${shot[1]}`}:{})};
}
export async function readCommunityPage({query='',page=1,...options}={}){
 if(typeof query!=='string'||query.length>200||!Number.isInteger(page)||page<1||page>1000)fail('invalidCatalog');
 const url=new URL('shots',COMMUNITY_BASE);url.search=new URLSearchParams({community:'1',full:'1',items:'50',page:String(page),...(query.trim()?{profile_title:query.trim()}:{})});
 const data=await fetchPublicJSON(url.href,options);
 if(!obj(data)||!Array.isArray(data.data)||data.data.length>100||!obj(data.paging)||data.paging.page!==page)fail('invalidCatalog');
 const seen=new Set(),records=[];
 for(const shot of data.data){
  if(!obj(shot)||typeof shot.id!=='string'||!shotIdPattern.test(shot.id)||seen.has(shot.id)||typeof shot.profile_title!=='string'||!shot.profile_title.trim()||!shot.profile_url)continue;
  seen.add(shot.id);
  records.push({source:'community',shotId:shot.id,shotURL:`https://visualizer.coffee/shots/${shot.id}`,url:`${COMMUNITY_BASE}shots/${shot.id}/profile?format=json`,filename:'visualizer-'+shot.id+'.json',title:shot.profile_title,sharedBy:typeof shot.user_name==='string'?shot.user_name:'',sharedAt:typeof shot.start_time==='string'?shot.start_time:null,profile:null});
 }
 // Public results do not expose a total. Keep paging, rather than claiming a library size.
 return {records,page,hasMore:data.data.length>=50};
}
export async function readOfficialCatalog(options={}){
 const manifest=await fetchPublicJSON(CATALOG_BASE+'manifest.json',options);if(!Array.isArray(manifest.profiles)||manifest.profiles.length>200)fail('invalidCatalog');
 const files=[...new Set(manifest.profiles.filter(x=>typeof x==='string'&&/^[\w.\-]+\.json$/.test(x)))];let index=0,failed=0;const records=[];
 await Promise.all(Array.from({length:4},async()=>{while(index<files.length){if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');try{records.push(await readOnlineRecord(CATALOG_BASE+files[index++],options));}catch(e){if(e.name==='AbortError')throw e;if(e.code!=='notEspresso')failed++;}}}));
 if(!records.length)fail('emptyCatalog');return {records:records.sort((a,b)=>a.profile.title.localeCompare(b.profile.title)),failed};
}
export function findDownloaded(entries,record){const key=onlineExecutionKey(record.profile);return key?(entries||[]).find(e=>e.visibility!=='hidden'&&e.visibility!=='deleted'&&onlineExecutionKey(e.profile)===key)||null:null;}
// Only the profile-library API is used here. Never writes workflow or machine state.
export async function saveOnlineRecord(api,record,{isCurrent=()=>true,restore=null}={}){
 const profile=normalizeOnlineProfile(record.profile);
 const key=onlineExecutionKey(profile);
 async function readLibrary(){
  const rows=await api.get('/profiles?includeHidden=true');
  if(!Array.isArray(rows))fail('libraryFailed');
  return {
   entries:rows.filter(e=>e.visibility!=='hidden'&&e.visibility!=='deleted'),
   archived:rows.find(e=>typeof e.id==='string'&&e.id&&['hidden','deleted'].includes(e.visibility)&&onlineExecutionKey(e.profile)===key)
  };
 }
 const before=await readLibrary();
 const existing=findDownloaded(before.entries,record);
 if(existing)return {record:existing,entries:before.entries,already:true};
 if(!isCurrent())fail('cancelled');
 if(before.archived && (restore?.id!==before.archived.id||restore.visibility!==before.archived.visibility)){
  return {needsRestore:before.archived};
 }
 if(restore&&!before.archived)fail('libraryChanged');

 let writeError;
 try{
  if(restore){
   await api.put('/profiles/'+encodeURIComponent(before.archived.id)+'/visibility',{visibility:'visible'});
  }else{
   await api.saveProfile({profile,metadata:{thisCupSource:{url:publicProfileURL(record.url),filename:record.filename,...(record.source==='community'?{provider:'visualizer',shotURL:record.shotURL,sharedBy:record.sharedBy}:{}),downloadedAt:new Date().toISOString()}}});
  }
 }catch(error){writeError=error;}
 // A write may succeed even if its response is lost. Never repeat it here.
 const after=await readLibrary();
 const stored=restore?after.entries.find(e=>e.id===restore.id&&onlineExecutionKey(e.profile)===key):findDownloaded(after.entries,record);
 if(stored)return {record:stored,entries:after.entries,already:false,restored:!!restore};
 // Native create can return an archived record if a concurrent write won.
 if(!restore&&after.archived)return {needsRestore:after.archived};
 throw writeError||new OnlineProfileError('saveUnconfirmed');
}
