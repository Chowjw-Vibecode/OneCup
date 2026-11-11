import {brandMarkup} from './brand.js?v=0.2.34';
import {guardDismissClick} from './dismiss-guard.js?v=0.2.34';
// Schema: Decaid lib/src/models/data/profile.dart, native DE1 frame encoding.
// This module edits a detached draft only; it has no device or network adapter.
const copy=v=>JSON.parse(JSON.stringify(v));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
// Native model defines no general UI maxima. Keep values intact; validate shape and finite nonnegative numbers.
const numeric=['pressure','flow','temperature','seconds','volume','weight','target_weight','target_volume','tank_temperature','limiter.value','limiter.range','exit.value'];
export function setProfileStepField(profile,index,path,value){
 const next=copy(profile),s=next.steps[index];if(!s)throw new Error('Missing step');
 const keys=path.split('.');let target=s;while(keys.length>1){const key=keys.shift();target[key]??={};target=target[key];}target[keys[0]]=value;return next;
}
export function reorderProfileStep(profile,from,to){
 const next=copy(profile);if(from<0||to<0||from>=next.steps.length||to>=next.steps.length)throw new Error('Invalid step');
 const start=next.target_volume_count_start;
 const [moved]=next.steps.splice(from,1);next.steps.splice(to,0,moved);
 // Preserve the reference to the first counted step when its position changes.
 if(start===from)next.target_volume_count_start=to;
 else if(from<start&&to>=start)next.target_volume_count_start=start-1;
 else if(from>start&&to<=start)next.target_volume_count_start=start+1;
 return next;
}
export function removeProfileStep(profile,index){
 const next=copy(profile);if(next.steps.length<=1)throw new Error('Keep one step');if(!next.steps[index])throw new Error('Missing step');next.steps.splice(index,1);
 if(next.target_volume_count_start>index)next.target_volume_count_start--;
 next.target_volume_count_start=Math.min(next.target_volume_count_start,next.steps.length-1);return next;
}
/** Draft validation never clamps values; device-specific limits remain the native adapter’s responsibility. */
export function validateEditorProfile(profile){
 const errors=[];
 if(typeof profile?.title!=='string'||!profile.title.trim())errors.push({path:'title',code:'required'});
 if(!Array.isArray(profile?.steps)||profile.steps.length<1){errors.push({path:'steps',code:'steps'});return errors;}
 function check(obj,prefix=''){
  for(const key of numeric){const value=get(obj,key);if(value===undefined||value===null)continue;if(typeof value!=='number'||!Number.isFinite(value)||value<0)errors.push({path:prefix+key,code:'range',min:0});}
 }
 check(profile);
 if(typeof profile.tank_temperature!=='number'||!Number.isFinite(profile.tank_temperature))errors.push({path:'tank_temperature',code:'required'});
 if(!Number.isInteger(profile.target_volume_count_start)||profile.target_volume_count_start<0||profile.target_volume_count_start>=profile.steps.length)errors.push({path:'target_volume_count_start',code:'range',min:0,max:profile.steps.length-1});
 profile.steps.forEach((s,i)=>{
  const prefix=`steps.${i}.`;
  check(s,prefix);
  for(const [k,choices] of Object.entries({pump:['pressure','flow'],sensor:['coffee','water'],transition:['fast','smooth']}))if(!choices.includes(s[k]))errors.push({path:prefix+k,code:'required'});
  for(const k of ['name','volume','seconds','temperature',s.pump])if(s[k]===undefined||s[k]===null||k==='name'&&typeof s[k]!=='string')errors.push({path:prefix+k,code:'required'});
  if(s.limiter){for(const k of ['value','range'])if(typeof s.limiter[k]!=='number')errors.push({path:prefix+'limiter.'+k,code:'required'});}
  if(s.exit){if(!['flow','pressure'].includes(s.exit.type)||!['over','under'].includes(s.exit.condition)||typeof s.exit.value!=='number')errors.push({path:prefix+'exit',code:'required'});}
 });
 return errors;
}
const words={zh:{title:'编辑曲线',profile:'方案',stages:'分段',name:'名称',control:'控制方式',pressure:'压力',flow:'流量',temperature:'温度',sensor:'温度探头',coffee:'咖啡探头',water:'水温探头',transition:'过渡',fast:'快',smooth:'平滑',seconds:'最长时间',volume:'体积上限',weight:'累计杯重切段',limiter:'另一项上限',range:'限值范围',exit:'条件切段',over:'高于',under:'低于',target:'目标值',value:'阈值',add:'复制为新段',remove:'删除',up:'上移',down:'下移',cancel:'取消',save:'保留修改',note:'保留后回到“调整这一杯”，确认调整后发送到咖啡机',global:'全局设置',beverage_type:'用途',espresso:'浓缩',calibrate:'校准',cleaning:'清洁',manual:'手动',pourover:'滤泡',target_weight:'整杯目标重量',target_volume:'整杯目标体积',target_volume_count_start:'体积计数起始段',tank_temperature:'水箱温度',author:'作者',notes:'说明',off:'未设',optional:'空白表示未设',required:'请填写完整有效的参数',invalid:'参数超出范围',steps:'至少保留一段',deleteQuestion:'删除这一段？',deleteYes:'确认删除',copy:'副本',disabled:'关闭',enabled:'启用',preserved:'其他原生字段保持不变',zeroOptional:'0 是有效原生值；留空表示未设',zeroRequired:'0 是有效原生值；此项不可留空',more:'向下查看更多',deleteNamed:'删除分段',deleteDraft:'仅从当前草稿移除'},en:{title:'Edit profile',profile:'Profile',stages:'Stages',name:'Name',control:'Control',pressure:'Pressure',flow:'Flow',temperature:'Temperature',sensor:'Temperature sensor',coffee:'Coffee',water:'Water',transition:'Transition',fast:'Fast',smooth:'Smooth',seconds:'Maximum time',volume:'Volume limit',weight:'Cumulative cup weight',limiter:'Secondary limit',range:'Limit range',exit:'Exit condition',over:'Above',under:'Below',target:'Target',value:'Threshold',add:'Duplicate stage',remove:'Delete',up:'Move up',down:'Move down',cancel:'Cancel',save:'Keep changes',note:'Return to Adjust this cup, then confirm to apply the profile.',global:'Profile settings',beverage_type:'Purpose',espresso:'Espresso',calibrate:'Calibration',cleaning:'Cleaning',manual:'Manual',pourover:'Filter coffee',target_weight:'Target beverage weight',target_volume:'Target volume',target_volume_count_start:'Count volume from stage',tank_temperature:'Tank temperature',author:'Author',notes:'Notes',off:'Not set',optional:'Leave blank if not set',required:'Complete the highlighted parameters',invalid:'Value is outside the allowed range',steps:'Keep at least one stage',deleteQuestion:'Delete this stage?',deleteYes:'Delete stage',copy:'copy',disabled:'Off',enabled:'On',preserved:'Other native fields are preserved',zeroOptional:'0 is a native value; blank means not set',zeroRequired:'0 is a native value; this field is required',more:'More below',deleteNamed:'Delete stage',deleteDraft:'Removed from this draft only'}};
export function mountProfileEditor(container,{profile,locale='zh',onSave=()=>{},onCancel=()=>{}}={}){
 if(!container||!Array.isArray(profile?.steps)||!profile.steps.length)throw new Error('A profile with native steps is required');
 const lang=String(locale).startsWith('en')?'en':'zh',t=k=>words[lang][k]||k;
 let draft=copy(profile),selected=0,view='step',error='',busy=false,disposed=false,deletePending=false;
 const root=document.createElement('section');root.className='pe-overlay';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',t('title'));container.append(root);
 const btn=(label,action,cls='',disabled=false)=>`<button type="button" data-pe-action="${action}" class="${cls}" ${disabled?'disabled':''}>${label}</button>`;
 function selectField(key,label,items,value,global=false){return `<label>${t(label)}<select data-pe-key="${key}" ${global?'data-global="1"':''}>${items.map(([v,l])=>`<option value="${v}" ${value===v?'selected':''}>${t(l)}</option>`).join('')}</select></label>`;}
 function number(key,label,unit,value,global=false,optional=false){return `<label>${t(label)}${unit?' · '+unit:''}<input type="number" inputmode="decimal" data-pe-key="${key}" ${global?'data-global="1"':''} min="0" step="any" value="${esc(value??'')}" ${optional?`placeholder="${t('optional')}"`:''}>${global&&['target_volume','tank_temperature'].includes(key)?`<small class="pe-field-hint">${t(optional?'zeroOptional':'zeroRequired')}</small>`:''}</label>`;}
 function editFields(){const s=draft.steps[selected];return `<div class="pe-fields"><label class="pe-wide">${t('name')}<input data-pe-key="name" value="${esc(s.name)}" maxlength="160"></label>${selectField('pump','control',[['pressure','pressure'],['flow','flow']],s.pump)}${number(s.pump,'target',s.pump==='pressure'?'bar':'mL/s',s[s.pump])}${number('temperature','temperature','°C',s.temperature)}${selectField('sensor','sensor',[['coffee','coffee'],['water','water']],s.sensor)}${selectField('transition','transition',[['fast','fast'],['smooth','smooth']],s.transition)}${number('seconds','seconds','s',s.seconds)}${number('volume','volume','mL',s.volume)}${number('weight','weight','g',s.weight,false,true)}</div><div class="pe-section"><label class="pe-toggle"><input type="checkbox" data-pe-toggle="limiter" ${s.limiter?'checked':''}>${t('limiter')} · ${t(s.pump==='flow'?'pressure':'flow')}</label>${s.limiter?`<div class="pe-fields">${number('limiter.value','target',s.pump==='flow'?'bar':'mL/s',s.limiter.value)}${number('limiter.range','range',s.pump==='flow'?'bar':'mL/s',s.limiter.range)}</div>`:''}</div><div class="pe-section"><label class="pe-toggle"><input type="checkbox" data-pe-toggle="exit" ${s.exit?'checked':''}>${t('exit')}</label>${s.exit?`<div class="pe-fields">${selectField('exit.type','control',[['pressure','pressure'],['flow','flow']],s.exit.type)}${selectField('exit.condition','exit',[['over','over'],['under','under']],s.exit.condition)}${number('exit.value','value',s.exit.type==='pressure'?'bar':'mL/s',s.exit.value)}</div>`:''}</div>`;}
 function globalFields(){return `<div class="pe-fields"><label class="pe-wide">${t('name')}<input data-pe-key="title" data-global="1" value="${esc(draft.title)}" maxlength="160"></label>${selectField('beverage_type','beverage_type',[['espresso','espresso'],['pourover','pourover'],['manual','manual'],['calibrate','calibrate'],['cleaning','cleaning']],draft.beverage_type,true)}${number('target_weight','target_weight','g',draft.target_weight,true,true)}${number('target_volume','target_volume','mL',draft.target_volume,true,true)}${number('tank_temperature','tank_temperature','°C',draft.tank_temperature,true)}<label>${t('target_volume_count_start')}<select data-pe-key="target_volume_count_start" data-global="1">${draft.steps.map((s,i)=>`<option value="${i}" ${i===draft.target_volume_count_start?'selected':''}>${i+1} · ${esc(s.name)}</option>`).join('')}</select></label><label class="pe-wide">${t('author')}<input data-pe-key="author" data-global="1" value="${esc(draft.author)}"></label><label class="pe-wide">${t('notes')}<textarea data-pe-key="notes" data-global="1">${esc(draft.notes)}</textarea></label></div>`;}
 function updateScrollCue(){const article=root.querySelector('article');if(article)article.parentElement.classList.toggle('pe-more-below',article.scrollHeight-article.scrollTop-article.clientHeight>8);}
 function render(){if(disposed)return;const previous=root.querySelector('article'),articleTop=previous?.dataset.view===`${view}:${selected}`?previous.scrollTop:0;const scrollTop=root.querySelector('.pe-stage-list')?.scrollTop??0;root.innerHTML=`<div class="pe-stage"><header><span class="pe-brand">${brandMarkup()}</span><h1>${t('title')}</h1><small>${esc(draft.title)}</small></header><main><aside>${btn(t('global'),'global','pe-global pe-soft '+(view==='global'?'selected':''))}<h2>${t('stages')}</h2><div class="pe-stage-list">${draft.steps.map((s,i)=>`<button type="button" data-pe-index="${i}" class="${view==='step'&&i===selected?'selected':''}"><i>${i+1}</i><span>${esc(s.name)}<small>${esc(t(s.pump))} · ${esc(s[s.pump]??'—')} ${s.pump==='pressure'?'bar':'mL/s'}</small></span></button>`).join('')}</div>${btn('＋ '+t('add'),'add','pe-soft')}</aside><div class="pe-article-shell"><article data-view="${view}:${selected}"><div class="pe-article-head"><h2>${view==='global'?t('global'):esc(draft.steps[selected].name)}</h2>${view==='step'?`<div>${btn('↑ '+t('up'),'up','pe-move',selected===0)}${btn('↓ '+t('down'),'down','pe-move',selected===draft.steps.length-1)}${btn(t('remove'),'delete','pe-danger pe-delete',draft.steps.length<=1)}</div>`:''}</div>${view==='global'?globalFields():editFields()}</article><span class="pe-scroll-cue" aria-hidden="true">${t('more')} ↓</span></div></main><footer><p>${t('note')}</p>${btn(t('cancel'),'cancel')}${btn(t('save'),'save','pe-primary',busy)}</footer>${error?`<div class="pe-error" role="alert">${esc(error)}</div>`:''}${deletePending?`<div class="pe-confirm"><div><h2>${t('deleteNamed')}<br>“${esc(draft.steps[selected].name)}”?</h2><p>${t('deleteDraft')}</p>${btn(t('cancel'),'cancelDelete')}${btn(t('deleteYes'),'confirmDelete','pe-danger')}</div></div>`:''}</div>`;const list=root.querySelector('.pe-stage-list');if(list)list.scrollTop=scrollTop;const article=root.querySelector('article');article.scrollTop=articleTop;article.addEventListener('scroll',updateScrollCue,{passive:true});requestAnimationFrame(updateScrollCue);}
 const resizeObserver=new ResizeObserver(updateScrollCue);resizeObserver.observe(root);
 function finish(){disposed=true;resizeObserver.disconnect();root.remove();}
 function fieldChange(e){if(busy)return;const input=e.target,key=input.dataset.peKey;if(!key)return;const global=input.hasAttribute('data-global'),object=global?draft:draft.steps[selected];let value=input.value;if(input.type==='number')value=value.trim()===''?null:Number(value);if(key==='target_volume_count_start')value=Number(value);
  if(global)object[key]=value;else draft=setProfileStepField(draft,selected,key,value);
  if(key==='pump'){const s=draft.steps[selected];if(typeof s[value]!=='number')s[value]=0;render();}
  if(key==='exit.type')render();
 }
 root.addEventListener('input',fieldChange);
 root.addEventListener('change',e=>{if(e.target.tagName==='SELECT')fieldChange(e);const key=e.target.dataset.peToggle;if(key){const s=draft.steps[selected];const enabled=e.target.checked;s[key]=enabled?(key==='limiter'?{value:0,range:0}:{type:s.pump==='pressure'?'flow':'pressure',condition:'over',value:0}):null;render();if(enabled)root.querySelector(`[data-pe-toggle="${key}"]`)?.closest('.pe-section')?.scrollIntoView({block:'nearest'});updateScrollCue();}});
 root.addEventListener('click',async e=>{if(busy)return;const index=e.target.closest('[data-pe-index]');if(index){selected=Number(index.dataset.peIndex);view='step';deletePending=false;error='';render();return;}const action=e.target.closest('[data-pe-action]')?.dataset.peAction;if(!action)return;error='';
  if(action==='global')view='global';
  if(action==='up'||action==='down'){const next=selected+(action==='up'?-1:1);draft=reorderProfileStep(draft,selected,next);selected=next;}
  if(action==='add'){const next=copy(draft.steps[selected]);next.name=`${next.name} · ${t('copy')}`;draft.steps.splice(selected+1,0,next);if(draft.target_volume_count_start>selected)draft.target_volume_count_start++;selected++;view='step';}
  if(action==='delete')deletePending=true;
  if(action==='cancelDelete')deletePending=false;
  if(action==='confirmDelete'){draft=removeProfileStep(draft,selected);selected=Math.min(selected,draft.steps.length-1);deletePending=false;}
  if(action==='cancel'){guardDismissClick(e);finish();onCancel();return;}
  if(action==='save'){const errors=validateEditorProfile(draft);if(errors.length){const first=errors[0];error=`${t(first.code==='range'?'invalid':first.code)} · ${first.path}${first.min!==undefined?` (≥ ${first.min})`:''}`;render();return;}busy=true;render();try{await onSave(copy(draft));guardDismissClick(e);finish();}catch(e){error=e.message;busy=false;render();}return;}
  render();
 });
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!busy){if(deletePending){deletePending=false;render();}else{finish();onCancel();}}});render();return {close:()=>{if(!busy){finish();onCancel();}},getDraft:()=>copy(draft)};
}
