import {profileLibraryData} from './profile-library-data.js';
import {selectedProfileContext,profileExecutionKey} from './client.js';
import {stageLabel} from './stage-labels.js';

const number = v => v !== null && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v)) ? Number(v) : null;
const format = v => number(v) === null ? '—' : String(Math.round(Number(v) * 100) / 100);
const el = (tag, cls = '', text) => {const n = document.createElement(tag);if(cls)n.className = cls;if(text !== undefined)n.textContent = text;return n;};
const positive = v => number(v) > 0 ? Number(v) : null;
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b))) : v);
export function referenceMatches(profile, reference) {return !!reference && stable({steps:profile?.steps,target_weight:profile?.target_weight??0,target_volume:profile?.target_volume??0,target_volume_count_start:profile?.target_volume_count_start??0}) === stable({steps:reference.steps,target_weight:reference.target_weight??0,target_volume:reference.target_volume??0,target_volume_count_start:reference.target_volume_count_start??0});}
const categories = [['favorites','常用'],['light','浅烘'],['medium','中烘'],['dark','深烘'],['filter','滤杯'],['tea','茶饮'],['cleaning','清洗'],['all','全部'],['community','社区']];
export function libraryCategory(entry) {
  const p=entry.profile||{},meta=profileLibraryData[p.title];
  if(meta)return meta.categories||[];
  if(p.beverage_type==='cleaning')return ['cleaning'];
  if(/^(Tea[ /]|茶)/i.test(p.title||''))return ['tea'];
  if(p.beverage_type==='pourover'||/^(Pour over|Filter)/i.test(p.title||''))return ['filter'];
  return [];
}
export function libraryHistoryIdentity(shot, entries=[]) {
 const profile=shot?.workflow?.profile,binding=shot?.workflow?.context?.extras?.thisCupProfileBinding;
 if(typeof binding?.id!=='string'||!binding.id)return undefined;
 const entry=entries.find(e=>e.id===binding.id);
 // Keep a deleted native identity distinct from an unbound legacy shot.
 if(!entry)return binding.id;
 return entry.profile?.title===profile?.title&&binding.execution===profileExecutionKey(profile)?binding.id:undefined;
}
export function historyFor(entry, history=[], entries=[]) {
 const sameName=entries.filter(x=>x.profile?.title===entry.profile?.title).length===1;
 const records=history.filter(h=>(h.hasProfileIdentity||h.profileId)?h.profileId===entry.id:sameName&&h.name===entry.profile?.title);
 return {count:records.reduce((n,h)=>n+(positive(h.count)||1),0),last:records.slice().sort((a,b)=>(number(b.timestamp)||Date.parse(b.timestamp)||0)-(number(a.timestamp)||Date.parse(a.timestamp)||0))[0]||null};
}
export function libraryRecipe(entry, history=[], entries=[]) {
 return recipeForLastShot(entry,historyFor(entry,history,entries).last);
}
function recipeForLastShot(entry,last) {
 const meta=profileLibraryData[entry.profile?.title];
 if(last && positive(last.dose) && positive(last.yield))return {dose:+last.dose,yield:+last.yield,yieldUnit:last.yieldUnit||'g',source:'上次记录'};
 const context={...(entry.context||entry.workflow?.context||{}),...selectedProfileContext(entry)};
 const dose=positive(context.targetDoseWeight??entry.targetDoseWeight??entry.dose);
 const yieldWeight=positive(context.targetYield??entry.profile?.target_weight);
 if(dose)return {dose,yield:yieldWeight,yieldUnit:'g',source:'保存配方'};
 const ref=meta?.authorRecipe||meta?.officialRecipe||meta?.communityRecipe;
 if(ref)return {dose:positive(ref.dose),yield:positive(ref.yield),yieldUnit:ref.yieldUnit||'g',source:ref.label||(meta.authorRecipe?'作者参考':meta.officialRecipe?'官方参考':'社区案例')};
 return {dose:positive(meta?.referenceDose),yield:yieldWeight,yieldUnit:'g',source:meta?.referenceDose?'作者参考':'保存配方'};
}
function svg(tag,attrs={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
export function libraryChart(profile, mini=false,active=0){
 const steps=Array.isArray(profile?.steps)?profile.steps:[];
 if(!steps.length)return el('p','pl-muted','没有可绘制的分段数据');
 const W=mini?180:500,H=mini?54:178,L=mini?3:25,R=6,T=mini?4:12,B=mini?37:123;
 const temps=steps.map(s=>number(s.temperature)).filter(v=>v!==null),minTemp=Math.min(...temps),maxTemp=Math.max(...temps);
 const max=Math.ceil(Math.max(6,...steps.map(s=>number(s[s.pump])||0))/2)*2,unit=(W-L-R)/steps.length,y=v=>B-v/max*(B-T);
 const g=svg('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':`${profile.title||'方案'}设定曲线；阶段等宽，非实测曲线`});
 if(!mini){for(let n=0;n<=max;n+=max/4)g.append(svg('line',{x1:L,x2:W-R,y1:y(n),y2:y(n),stroke:'currentColor',opacity:.16,'stroke-width':.7}),svg('text',{x:L-6,y:y(n)+4,'text-anchor':'end',fill:'currentColor','font-size':12},format(n)));
 steps.forEach((s,i)=>{const x=L+i*unit;g.append(svg('rect',{x,y:T,width:unit,height:B-T,fill:'#95cfdf',opacity:i===active?.35:0,'data-stage':i}),svg('text',{x:x+unit/2,y:B+17,'text-anchor':'middle',fill:'currentColor','font-size':12},i+1));});}
 for(const mode of ['pressure','flow']){let d='',previous=null;steps.forEach((s,i)=>{const x=L+i*unit,v=number(s[mode]);if(s.pump!==mode||v===null){previous=null;return;}const yy=y(v);if(previous===null)d+=` M ${x} ${yy} L ${x+unit} ${yy}`;else if(s.transition==='smooth')d+=` C ${x+unit*.22} ${previous} ${x+unit*.55} ${yy} ${x+unit} ${yy}`;else d+=` L ${x} ${yy} L ${x+unit} ${yy}`;previous=yy;});if(d)g.append(svg('path',{d,fill:'none',stroke:mode==='flow'?'#0876da':'#12aa8b','stroke-width':mini?2.5:2.8,'stroke-linecap':'round','stroke-linejoin':'round','data-series':mode}));}
 let td='';steps.forEach((s,i)=>{const temp=number(s.temperature);if(temp===null)return;const x=L+i*unit,ty=mini?(maxTemp===minTemp?48:52-(temp-minTemp)/(maxTemp-minTemp)*9):(maxTemp===minTemp?166:173-(temp-minTemp)/(maxTemp-minTemp)*17);td+=`${td?' L':'M'} ${x} ${ty} L ${x+unit} ${ty}`;});if(td)g.append(svg('path',{d:td,fill:'none',stroke:'#df6a89','stroke-width':mini?1.8:2,'data-series':'temperature'}));return g;
}
function section(parent,title,text){if(Array.isArray(text))text=text.map(x=>typeof x==='string'?x:x.text).filter(Boolean).join(' ');if(!text)return;const s=el('section','pl-block');s.append(el('h3','',title),el('p','',text));parent.append(s);return s;}
function tuning(parent,g,full){if(!g?.tuning?.length)return;const box=el('section','pl-block');box.append(el('h3','','调校关注'));for(const t of g.tuning){const s=section(box,t.parameter,[t.reference,t.adjustment].filter(Boolean).join(' '));if(full&&t.basis)s?.append(el('p','pl-source',t.basis));}parent.append(box);}
function cases(parent,title,items){if(!items?.length)return;const box=el('section','pl-block');box.append(el('h3','',title));for(const x of items){const a=el('article','pl-case');if(x.title)a.append(el('h4','',x.title));a.append(el('p','',x.text));if(x.source)a.append(el('p','pl-source',x.source));box.append(a);}parent.append(box);}


const englishText = {"常用": "Favorites", "浅烘": "Light roast", "中烘": "Medium roast", "深烘": "Dark roast", "滤杯": "Filter", "茶饮": "Tea", "清洗": "Cleaning", "全部": "All", "社区": "Community", "选择方案": "Choose a profile", "关闭": "Close", "方案分类": "Profile categories", "搜索方案": "Search profiles", "方案排序": "Sort profiles", "名称排序": "Name", "难易度排序": "Difficulty", "▦ 小图": "▦ Cards", "☷ 列表": "☷ List", "‹ 返回列表": "‹ Back to list", "‹ 返回方案": "‹ Back to profile", "‹ 返回": "‹ Back", "✓ 使用此方案": "✓ Use this profile", "请选择方案": "Choose a profile", "资料保存在皮肤中": "Reference material is included in the skin", "查看完整介绍 ›": "Read full introduction ›", "移出常用": "Remove from favorites", "加入常用": "Add to favorites", "分段参数": "Stage settings", "曲线预览 · 压力 / 流量 / 温度": "Profile targets · Pressure / Flow / Temperature", "保存设定 · 阶段等宽，非实际时长；平滑过渡为示意": "Saved targets · Equal-width stages, not elapsed time; smooth transitions are illustrative", "初段温度": "Initial temperature", "粉液比": "Yield ratio", "配比 mL/g": "Ratio mL/g", "上次记录": "Last shot", "保存配方": "Saved recipe", "作者参考": "Author reference", "官方参考": "Official reference", "社区案例": "Community example", "社区同名": "Community example", "新手友好": "Beginner friendly", "进阶玩家": "Intermediate", "高阶挑战": "Advanced", "方案介绍": "Profile introduction", "方案说明": "Profile notes", "版本说明": "Version note", "方案简介": "Overview", "作者思路": "Author’s intent", "作者经验": "Author’s experience", "资料参考版如何运行": "How the reference version works", "调校关注": "Key adjustments", "社区具体反馈": "Community reports", "社区反馈": "Community reports", "资料说明": "Reference notes", "资料依据": "Sources", "配方参考": "Recipe reference", "当前保存目标": "Current saved target", "还没有常用方案，点方案详情的星标添加。": "No favorites yet. Use the star in profile details to add one.", "没有匹配的方案。": "No matching profiles.", "没有可绘制的分段数据": "No stage data to plot", "水温控制": "Water temperature control", "咖啡温度控制": "Coffee temperature control"};
export function libraryText(text, language='zh') {
 if(language!=='en')return text;
 if(englishText[text])return englishText[text];
 if(/^\d+ 个方案 · 可跨分类 · 近期次数优先$/.test(text))return text.replace(/^(\d+).*/, '$1 profiles · Categories may overlap · Recent use first');
 if(text.includes(' · '))return text.split(' · ').map(part=>libraryText(part,language)).join(' · ');
 return text.replace(/^(上次记录|保存配方|作者参考|官方参考|社区案例|社区同名)(粉量|出液)$/,(_,source,kind)=>`${englishText[source]} ${kind==='粉量'?'dose':'yield'}`)
  .replace(/^(\d+) 个方案 · 可跨分类 · 近期次数优先$/, '$1 profiles · Categories may overlap · Recent use first')
  .replace(/^近期 (\d+) 次$/, '$1 recent shots').replace(/^(\d+) 阶段$/, '$1 stages');
}

export function mountProfileLibrary(api={}) {
 const language=()=>api.getLanguage?.()==='en'?'en':'zh';
 function localize(node){if(language()!=='en')return;const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())n.nodeValue=libraryText(n.nodeValue,'en');for(const e of [node,...node.querySelectorAll('[aria-label],[placeholder]')])for(const key of ['aria-label','placeholder']){const value=e.getAttribute?.(key);if(value)e.setAttribute(key,libraryText(value,'en'));}}

 let root=null,selected=null,category='all',query='',view='list',sort='name',page='list',scroll=0,focusBefore=null,applying=false,lastKey='';
 const stages=new Map();
 let guideReturnScroll=0;
 let previousInputs;
 function takeRefreshKey(){
  const inputs=[api.getEntries?.(),favorites(),history(),language(),canApply()];
  if(previousInputs&&inputs.every((value,index)=>value===previousInputs[index]))return lastKey;
  previousInputs=inputs;
  return stable(inputs);
 }
 const entries=()=> (api.getEntries?.()||[]).filter(x=>x?.id&&x.profile&&x.visibility!=='hidden');
 const favorites=()=>api.getFavorites?.()||[];
 const history=()=>api.getHistory?.()||[];
 const current=()=>entries().find(x=>x.id===selected?.id)||null;
 const button=(text,fn,cls='')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
 const canApply=()=> !!current()?.profile?.steps?.length&&!applying&&(api.canApply?.(current())??true);
 function close(){if(!root)return;root.remove();root=null;selected=null;page='list';lastKey='';previousInputs=undefined;focusBefore?.focus?.();}
 function dismiss(){close();api.onClose?.();}
 function back(){
  if(page==='info'){
   page='detail';
   render();
   const link=root.querySelector('.pl-guide .pl-text-button');
   link?.focus({preventScroll:true});
   const guide=root.querySelector('.pl-guide');
   if(guide)guide.scrollTop=guideReturnScroll;
  }else if(page==='detail'){page='list';render();}else dismiss();
 }
 function openIntroduction(){
  guideReturnScroll=root.querySelector('.pl-guide')?.scrollTop||0;
  page='info';
  render();
  root.querySelector('.pl-info-body')?.focus({preventScroll:true});
 }
 function renderIntroduction(main,entry){
  const info=el('article','pl-info');
  const header=el('div','pl-info-heading');
  const title=el('h2','',entry.profile.title);
  title.id='pl-introduction-title';
  header.append(button('‹ 返回方案',back,'pl-info-back'),title);
  const body=el('div','pl-info-body');
  body.tabIndex=0;
  body.setAttribute('role','region');
  body.setAttribute('aria-labelledby',title.id);
  const text=el('div','pl-info-text');
  guideContent(text,entry,true);
  body.append(text);
  info.append(header,body);
  main.append(info);
 }
 function choose(entry){scroll=root.querySelector('.pl-profiles')?.scrollTop||0;selected=entry;page='detail';api.onSelect?.(entry);render();}
 function guideContent(parent,entry,full=false){if(language()==='en')parent.append(el('p','pl-source','Research notes are currently available in Chinese.'));const meta=profileLibraryData[entry.profile.title],g=meta?.guide;
  if(!g){section(parent,'方案说明',entry.profile.notes||'这份本地方案尚无对应的曲线库资料；下方曲线和分段参数来自实际保存方案。');return;}
  if(!referenceMatches(entry.profile,meta.referenceProfile))section(parent,'版本说明','实际保存方案与资料参考版参数不同。左侧曲线、分段和当前目标来自实际保存方案；以下作者与社区资料按其注明版本阅读。');
  section(parent,'方案简介',g.summary);section(parent,'作者思路',g.intent);
  if(full){cases(parent,'作者经验',g.authorExperience);section(parent,'资料参考版如何运行',g.operation);}
  tuning(parent,g,full);cases(parent,'社区具体反馈',g.community);
  if(full&&!g.community?.length)section(parent,'社区反馈','尚未找到能对应这个方案的独立使用反馈；作者试饮另列。');
  section(parent,'资料说明',g.limits);
  if(full){const names=[...new Set((g.sources||[]).map(x=>x.title))];section(parent,'资料依据',names.join('；'));}
  else parent.append(button('查看完整介绍 ›',openIntroduction,'pl-text-button'));
 }
 function recipeBox(entry){const rv=libraryRecipe(entry,history(),entries()),meta=profileLibraryData[entry.profile.title],box=el('div','pl-recipe');
 const ratio=rv.dose&&rv.yield?`1:${format(rv.yield/rv.dose)}`:meta?.referenceRatio||'—';
 for(const[v,u,label]of[[rv.dose,'g',rv.source+'粉量'],[rv.yield,rv.yieldUnit,rv.source+'出液'],[ratio,'',rv.yieldUnit==='mL'?'配比 mL/g':'粉液比'],[entry.profile.steps?.[0]?.temperature,'°C','初段温度']]){const d=el('div'),n=el('strong','',typeof v==='string'?v:format(v));if(v!==null&&v!==undefined&&u)n.append(el('small','',u));d.append(n,el('span','',label));box.append(d);}return box;}
 function detail(){const entry=current();if(!entry){page='list';selected=null;return list();}selected=entry;
 const bar=el('div','pl-toolbar');bar.append(button('‹ 返回列表',back),el('small','','资料保存在皮肤中'));root.querySelector('.pl-content').append(bar);
 const surface=el('section','pl-detail'),head=el('div','pl-detail-head');head.append(el('h2','',entry.profile.title));const star=button(favorites().includes(entry.id)?'★':'☆',async()=>{await api.onFavorite?.(entry);if(root)render();},'pl-star');star.setAttribute('aria-label',favorites().includes(entry.id)?'移出常用':'加入常用');star.setAttribute('aria-pressed',String(favorites().includes(entry.id)));head.append(star);surface.append(head);
 const grid=el('div','pl-detail-grid'),left=el('div','pl-chart-pane'),right=el('aside','pl-guide');left.append(recipeBox(entry));
 const rv=libraryRecipe(entry,history(),entries()),meta=profileLibraryData[entry.profile.title];if(rv.source==='上次记录')section(right,'上次记录','按保存的方案身份匹配；没有身份时仅在同名唯一的方案中匹配。');else if(meta?.referenceNote)section(right,'配方参考',meta.referenceNote);
 if(rv.source!=='保存配方'&&positive(entry.profile.target_weight)&&rv.yield!==entry.profile.target_weight)section(right,'当前保存目标',`重量目标 ${format(entry.profile.target_weight)} g；上方 ${rv.source} 不改变实际保存方案。`);
 left.append(el('h3','pl-chart-heading','曲线预览 · 压力 / 流量 / 温度'));const plot=el('div','pl-chart');plot.append(libraryChart(entry.profile));left.append(plot,el('p','pl-chart-note','保存设定 · 阶段等宽，非实际时长；平滑过渡为示意'));
 const select=el('select','pl-stage-select');select.setAttribute('aria-label','分段参数');(entry.profile.steps||[]).forEach((s,i)=>{const option=el('option','',`${i+1} · ${stageLabel(s.name,language())||'阶段'}`);option.value=i;select.append(option);});select.value=String(Math.min(stages.get(entry.id)||0,Math.max(0,(entry.profile.steps?.length||1)-1)));const info=el('p','pl-stage-info');
 function stage(){const i=Number(select.value),s=entry.profile.steps?.[i];stages.set(entry.id,i);if(!s)return;const words=[`${s.pump==='flow'?'流量':'压力'} ${format(s[s.pump])} ${s.pump==='flow'?'mL/s':'bar'}`,`${format(s.temperature)} °C`, `最长 ${format(s.seconds)} s`];if(positive(s.weight))words.push(`累计重量阈值 ${format(s.weight)} g`);if(positive(s.volume))words.push(`阶段计量上限 ${format(s.volume)} mL`);if(s.sensor==='water')words.push('水温控制');else if(s.sensor==='coffee')words.push('咖啡温度控制');if(s.exit)words.push(`${s.exit.type==='flow'?'流量':'压力'} ${s.exit.condition==='under'?'<':'>'} ${format(s.exit.value)} ${s.exit.type==='flow'?'mL/s':'bar'} 转段`);if(positive(s.limiter?.value))words.push(`${s.pump==='flow'?'限压':'限流'} ${format(s.limiter.value)} ${s.pump==='flow'?'bar':'mL/s'}`);info.textContent=words.join(' · ');if(language()==='en')info.textContent=info.textContent.replaceAll('累计重量阈值','Cumulative weight threshold').replaceAll('阶段计量上限','Stage volume limit').replaceAll('咖啡温度控制','Coffee temperature control').replaceAll('水温控制','Water temperature control').replaceAll('最长','Up to').replaceAll('转段','exit').replaceAll('限压','Pressure limit').replaceAll('限流','Flow limit').replaceAll('流量','Flow').replaceAll('压力','Pressure');plot.querySelectorAll('[data-stage]').forEach(r=>r.setAttribute('opacity',+r.dataset.stage===i?'.35':'0'));}
 select.onchange=stage;left.append(select,info);stage();guideContent(right,entry);grid.append(left,right);surface.append(grid);root.querySelector('.pl-content').append(surface);
 }
 function list(){const content=root.querySelector('.pl-content'),bar=el('div','pl-toolbar');bar.append(el('h2','',categories.find(c=>c[0]===category)?.[1]||'全部'));
 const input=el('input');input.type='search';input.placeholder='搜索方案';input.setAttribute('aria-label','搜索方案');input.value=query;input.oninput=()=>{query=input.value;fill();};
 const order=el('select');order.setAttribute('aria-label','方案排序');for(const[v,t]of[['name','名称排序'],['difficulty','难易度排序']]){const o=el('option','',t);o.value=v;order.append(o);}order.value=sort;order.onchange=()=>{sort=order.value;fill();};bar.append(input,order,button(view==='list'?'▦ 小图':'☷ 列表',()=>{view=view==='list'?'grid':'list';render();}));content.append(bar);
 const note=el('p','pl-list-note','可跨分类 · 近期次数优先 · 分类以作者设计及官方资料为主'),items=el('div','pl-profiles '+view);content.append(note,items);
 function fill(){
  const rank={'新手友好':0,'进阶玩家':1,'高阶挑战':2};
  const all=entries();
  const recentShots=history();
  const favoriteIds=new Set(favorites());
  const needle=query.toLocaleLowerCase();
  const matchesCategory=entry=>category==='all'||(category==='favorites'
    ? favoriteIds.has(entry.id) : libraryCategory(entry).includes(category));
  const rows=all.filter(entry=>matchesCategory(entry)&&entry.profile.title.toLocaleLowerCase().includes(needle))
    .map(entry=>({entry,recent:historyFor(entry,recentShots,all),meta:profileLibraryData[entry.profile.title]}));
  rows.sort((a,b)=>{
   const recentDifference=b.recent.count-a.recent.count;
   if(recentDifference)return recentDifference;
   if(sort==='difficulty'){
    const difficultyDifference=(rank[a.meta?.difficulty]??3)-(rank[b.meta?.difficulty]??3);
    if(difficultyDifference)return difficultyDifference;
   }
   return a.entry.profile.title.localeCompare(b.entry.profile.title,'zh-Hans',{numeric:true});
  });
  const content=document.createDocumentFragment();
  note.textContent=`${rows.length} 个方案 · 可跨分类 · 近期次数优先`;
  for(const {entry,recent,meta} of rows){
   const recipe=recipeForLastShot(entry,recent.last);
   const row=button('',()=>choose(entry),'pl-profile');
   const name=el('div','pl-name');
   const summary=[recent.count?`近期 ${recent.count} 次`:'',meta?.difficulty,`${entry.profile.steps?.length||0} 阶段`];
   name.append(el('strong','',entry.profile.title),el('small','',summary.filter(Boolean).join(' · ')));
   const mini=el('div','pl-mini');
   mini.append(libraryChart(entry.profile,true));
   const values=el('div','pl-values');
   const amount=recipe.dose?`${format(recipe.dose)} → ${format(recipe.yield)} ${recipe.yieldUnit}`
     : recipe.yield?`${format(recipe.yield)} ${recipe.yieldUnit}`:'—';
   const ratio=recipe.dose&&recipe.yield?'1:'+format(recipe.yield/recipe.dose)+' · ':'';
   values.append(el('strong','',amount),el('small','',ratio+recipe.source));
   row.append(name,mini,values,el('span','pl-arrow','›'));
   content.append(row);
  }
  if(!rows.length)content.append(el('p','pl-empty',category==='favorites'
   ?'还没有常用方案，点方案详情的星标添加。':'没有匹配的方案。'));
  items.replaceChildren(content);
  localize(items);
  localize(note);
 }
 fill();items.scrollTop=scroll;
 }
 function render(){if(!root)return;const previous=root.querySelector('.pl-profiles');if(previous)scroll=previous.scrollTop;root.replaceChildren();
 root.classList.toggle('pl-reading',page==='info');
 const header=el('header','pl-header');const brand=el('img','pl-brand');brand.src=new URL('./assets/ceramic/onecup-brand.svg',import.meta.url).href;brand.alt='这一杯 · OneCup';const actions=el('div','water-header-actions');actions.append(el('onecup-water'),button('关闭',dismiss));header.append(brand,el('h1','',page==='info'?'方案介绍':'选择方案'),actions);root.append(header);
 if(page==='info'&&current()){
  const main=el('main','pl-main');
  renderIntroduction(main,current());
  root.append(main);
  localize(root);
  return;
 }
 if(page==='info'){page='list';render();return;}
 const main=el('main','pl-main'),nav=el('nav','pl-categories');nav.setAttribute('aria-label','方案分类');for(const[id,name]of categories){const b=button(name,()=>{if(id==='community'){api.onCommunity?.();return;}category=id;query='';page='list';scroll=0;render();},id===category?'active':'');b.setAttribute('aria-current',id===category?'page':'false');nav.append(b);}const content=el('div','pl-content');main.append(nav,content);root.append(main);
 if(page==='detail')detail();else list();
 const foot=el('footer','pl-footer');foot.append(button('‹ 返回',back));const notice=el('p','pl-selection',selected?selected.profile.title:'请选择方案');foot.append(notice);if(page==='detail'){const apply=button('✓ 使用此方案',async()=>{if(!canApply())return;const entry=current();applying=true;apply.disabled=true;try{await api.onApply?.(entry);}finally{applying=false;if(root)render();}},'pl-apply');apply.disabled=!canApply();foot.append(apply);}root.append(foot);localize(root);
 }
 function open(entry){
  if(!root&&!entry){
   category='favorites';
   query='';
   scroll=0;
  }
  focusBefore=document.activeElement;
  if(!root){root=el('div','onecup-profile-library');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','选择方案');root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();back();}if(e.key==='Tab'){const nodes=[...root.querySelectorAll('button:not(:disabled),input,select')].filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});document.body.append(root);}selected=entry&&entries().find(e=>e.id===entry.id)||null;page=selected?'detail':'list';render();lastKey=takeRefreshKey();root.querySelector('button')?.focus();}
 function refresh(){if(!root)return;const next=takeRefreshKey();if(next===lastKey)return;lastKey=next;const guideScroll=root.querySelector('.pl-guide')?.scrollTop||0,infoScroll=root.querySelector('.pl-info-body')?.scrollTop||0;if(selected)selected=current();if(!selected&&page!=='list')page='list';render();const guide=root.querySelector('.pl-guide'),info=root.querySelector('.pl-info-body');if(guide)guide.scrollTop=guideScroll;if(info)info.scrollTop=infoScroll;}
 return {open,refresh,close,destroy:close};
}
