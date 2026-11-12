import {guardDismissClick} from './dismiss-guard.js?v=0.2.40';
import {brandMarkup} from './brand.js?v=0.2.40';
import {stageLabel} from './stage-labels.js?v=0.2.40';
import {profileIntroChart,profileIntroModel} from './profile-intro.js?v=0.2.40';
import seed from './online-profile-seed.js?v=0.2.40';
import {normalizeOnlineProfile,onlineExecutionKey,findDownloaded,readOnlineRecord,readOfficialCatalog,readCommunityPage,saveOnlineRecord} from './online-profile-service.js?v=0.2.40';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountOnlineProfiles({getClient,getLanguage,getProfiles,onLibrary,onBrowseLocal,isAllowed,notice,explainError}){
 const host=document.createElement('div');host.id='onlineProfileHost';host.hidden=true;host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');document.body.append(host);
 const root=host.attachShadow({mode:'open'}),$=id=>root.getElementById(id);
 // Keep the loaded stylesheet connected while tabs rebuild their content.
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('./online-profiles.css?v=0.2.40',import.meta.url);
 const content=document.createElement('div');root.append(stylesheet,content);
 let language='zh',mode='official',selected=null,official=seed.map(r=>({...r,profile:normalizeOnlineProfile(r.profile)})),community=[];
 let session=0,modalEpoch=0,saveBusy=false,catalogBusy=false,modalAction=null,previousFocus,controller=null,toastTimer,libraryRef=null,activeApi=null,catalogLoaded=false;
 let communityLoaded=false,communityPage=0,communityHasMore=false,communityQuery='',listError='';
 const records=()=>mode==='community'?community:official;
 const key=r=>r.shotId?'community:'+r.shotId:r.url+'#'+onlineExecutionKey(r.profile),text=(zh,en)=>language==='zh'?zh:en;
 const title=r=>r.profile?.title||r.title||'';
 function errorText(e){const messages={invalidProfile:['这份曲线参数不完整或格式不兼容，未保存。','This profile is incomplete or incompatible and was not saved.'],notEspresso:['目前支持浓缩咖啡方案。','Only espresso profiles are supported.'],invalidURL:['请输入公开 JSON 文件或 Visualizer 出杯链接。','Enter a public JSON file or Visualizer shot link.'],sourceFailed:['来源读取失败，请稍后重试。','The source could not be read. Try again later.'],fileTooLarge:['文件过大，请使用独立曲线文件。','This file is too large. Use a single profile file.'],notJSON:['链接不是 JSON 曲线文件，请使用原始文件或 Visualizer 出杯链接。','Use a JSON file or a Visualizer shot link.'],sourceTimeout:['读取超时，请检查网络后重试。','The source timed out. Check your connection.'],sourceUnavailable:['无法读取来源，请检查网络或使用支持直接下载的链接。','Source unavailable. Check your connection or use a direct download link.'],rateLimited:['来源请求较频繁，请稍后再试。','Too many source requests. Please try again later.'],invalidCatalog:['在线目录格式无法读取。','The catalog format is not supported.'],emptyCatalog:['未读到可用曲线，已保留缓存。','No valid profiles were received. Cached profiles are available.'],libraryChanged:['本地方案已变化，请重新选择。','The local profile changed. Select it again.'],libraryFailed:['无法读取本地方案库，请检查连接。','The local library could not be read. Check your connection.'],saveUnconfirmed:['保存结果尚未确认，请重新读取本地方案库。','Saving is unconfirmed. Reload the local library.'],cancelled:['页面状态已变化，请重新打开。','The page state changed. Open the page again.']};return messages[e.code]?.[language==='zh'?0:1]||explainError?.(e)||e.message;}
 function current(epoch,api){return !host.hidden&&epoch===session&&getClient()===api&&isAllowed();}
 function close(event){guardDismissClick(event);session++;modalEpoch++;controller?.abort();controller=null;host.hidden=true;catalogBusy=false;previousFocus?.focus?.();}
 function template(){
  host.setAttribute('aria-label',text(mode==='community'?'社区方案':'官方方案',mode==='community'?'Community profiles':'Official profiles'));
  content.innerHTML=`<div class="app"><header class="top"><div class="brand">${brandMarkup()}</div><h1>${text('换个方案','Choose a profile')}</h1><button id="close" class="close" aria-label="${text('关闭','Close')}">×</button></header><nav class="toolbar"><div class="tabs"><button id="local" class="tab">${text('本地方案','Local profiles')}</button><button id="official" class="tab ${mode==='official'?'active':''}" ${mode==='official'?'aria-current="page"':''}>${text('官方方案','Official profiles')}</button><button id="community" class="tab ${mode==='community'?'active':''}" ${mode==='community'?'aria-current="page"':''}>${text('社区方案','Community profiles')}</button></div><button class="linkbtn" id="link">${text('粘贴方案链接','Paste profile link')} ↗</button></nav><main class="body"><section class="browser" aria-label="${text('方案列表','Profile list')}"><form class="search" id="searchForm"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input id="search" type="search" maxlength="200" placeholder="${mode==='community'?text('搜索社区方案名称','Community profile name'):text('搜索方案名称或作者','Name or author')}" aria-label="${text('搜索方案','Search profiles')}"><button type="submit">${text('搜索','Search')}</button></form><div class="filters">${mode==='community'?`<span>${text('公开分享 · 近一个月','Public shares · Past month')}</span>`:`<select id="filter" aria-label="${text('筛选','Filter')}"><option value="all">${text('全部官方方案','All official profiles')}</option><option value="ready">${text('尚未下载','Not downloaded')}</option><option value="saved">${text('已下载','Downloaded')}</option></select>`}<span class="captionbar" id="count"></span></div><div class="subline"><span id="network"></span><button id="refresh">${text('联网更新','Refresh online')}</button></div><div id="error" class="notice" role="alert" hidden></div><div id="list" class="list"></div></section><section class="preview" id="preview" aria-label="${text('方案预览','Profile preview')}"></section></main><footer class="footer"><div class="footnote" id="footnote">${mode==='community'?text('同名分享可能有不同参数；预览后再下载。','Same-name shares may differ. Preview before downloading.'):text('下载后保存在本地方案，使用时再切换。','Download to the local library, then choose when to use it.')}</div><div class="actions"><button id="back" class="btn text">${text('返回','Back')}</button><button id="download" class="btn primary"></button></div></footer></div><div class="veil" id="modal" hidden><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><h2 id="modalTitle"></h2><div id="modalBody"></div><p id="modalError" class="error" role="alert"></p><div class="actions"><button id="cancel" class="btn text">${text('取消','Cancel')}</button><button id="confirm" class="btn primary"></button></div></section></div><div class="toast" id="toast" role="status" hidden></div>`;
  const brand=root.querySelector('.brand .onecup-brand-art');if(brand){brand.style.width='100%';brand.style.height='100%';}
  $('close').onclick=close;$('back').onclick=close;$('local').onclick=e=>{close(e);onBrowseLocal()};
  $('official').onclick=()=>switchMode('official');$('community').onclick=()=>switchMode('community');
  $('search').value=mode==='community'?communityQuery:'';
  $('search').oninput=()=>{if(mode==='official')render()};
  $('searchForm').onsubmit=e=>{e.preventDefault();$('search').blur();if(mode==='community')void loadCommunity(true);else render()};
  if($('filter'))$('filter').onchange=render;
  $('refresh').onclick=()=>refresh();$('link').onclick=openLink;$('download').onclick=download;$('cancel').onclick=hideModal;
  $('modal').onclick=e=>{if(e.target===$('modal'))hideModal(e)};
  $('confirm').onclick=async()=>{if(!modalAction||saveBusy)return;const fn=modalAction,epoch=modalEpoch;try{await fn()}catch(e){if(epoch===modalEpoch&&!host.hidden)$('modalError').textContent=errorText(e)}};
 }
 function switchMode(next){if(next===mode||saveBusy)return;session++;modalEpoch++;controller?.abort();controller=new AbortController();catalogBusy=false;mode=next;selected=null;listError='';template();render();root.querySelector('.tab.active').focus();if(mode==='official'?!catalogLoaded:!communityLoaded)void refresh();}
 function chosen(){return records().find(r=>key(r)===selected)}
 function shareDetails(r){return [r.sharedBy||(r.custom?text('公开出杯链接','Public shot link'):''),r.sharedAt?new Date(r.sharedAt).toLocaleString(language==='zh'?'zh-CN':'en-GB',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):''].filter(Boolean).join(' · ')}
 function render(){
  if(host.hidden)return;
  const query=mode==='official'?$('search').value.trim().toLocaleLowerCase():'',filter=$('filter')?.value||'all',entries=getProfiles();
  const visible=records().filter(r=>`${title(r)} ${r.profile?.author||''} ${r.filename}`.toLocaleLowerCase().includes(query)&&(filter==='all'||(filter==='saved'?!!findDownloaded(entries,r):!findDownloaded(entries,r))));
  if(!visible.some(r=>key(r)===selected))selected=visible[0]?key(visible[0]):null;
  $('count').textContent=mode==='community'?text(`${visible.length} 条分享`,`${visible.length} shares`):text(`${visible.length} 个方案`,`${visible.length} profiles`);
  $('network').textContent=catalogBusy?text('正在读取公开目录…','Reading public sources…'):mode==='community'?(communityQuery?text(`Visualizer · 搜索：${communityQuery}`,`Visualizer · Search: ${communityQuery}`):text('Visualizer · 最新公开分享','Visualizer · Recent public shares')):text(`Decaid 内置目录 · ${official.length} 个方案`,`Decaid defaults · ${official.length} profiles`);
  $('refresh').disabled=catalogBusy;$('error').hidden=!listError;$('error').textContent=listError;
  const scrollTop=$('list').scrollTop;$('list').replaceChildren();
  for(const r of visible){
   const b=document.createElement('button'),p=r.profile,stored=p&&findDownloaded(entries,r);b.className='item'+(key(r)===selected?' selected':'');b.setAttribute('aria-pressed',String(key(r)===selected));
   b.innerHTML=`<div class="row"><strong>${esc(title(r))}</strong><span class="tag ${stored?'saved':''}">${stored?text('✓ 已下载','✓ Downloaded'):p?'JSON':text('分享','Shared')}</span></div><p>${esc(r.source==='community'?shareDetails(r):(p?.author||text('作者未注明','Author not specified')))}${p?` · ${text(`${p.steps.length} 个阶段`,`${p.steps.length} stages`)}`:''}</p>`;
   b.onclick=()=>{selected=key(r);$('search').blur();render()};$('list').append(b);
  }
  if(!visible.length)$('list').innerHTML=`<div class="empty"><h3>${catalogBusy?text('正在查找…','Searching…'):text('没有找到方案','No profiles found')}</h3><span>${mode==='community'?text('可搜索近一个月的公开分享；较早的出杯可粘贴链接。','Search public shares from the past month, or paste an older shot link.'):text('试试其他名称，或粘贴方案文件链接。','Try another name or paste a profile file link.')}</span></div>`;
  if(mode==='community'&&communityHasMore){const more=document.createElement('button');more.id='more';more.className='load-more';more.textContent=catalogBusy?text('正在读取…','Loading…'):text('加载更多分享','Load more shares');more.disabled=catalogBusy;more.onclick=()=>loadCommunity(false);$('list').append(more)}
  $('list').scrollTop=scrollTop;const record=chosen();renderPreview(record);
  const previewVisible=$('preview').getClientRects().length>0;
  $('download').disabled=saveBusy||!previewVisible||(mode==='community'&&catalogBusy)||!record?.profile||!isAllowed();
  $('download').textContent=saveBusy?text('正在保存…','Saving…'):!previewVisible?text('展开页面查看参数','Expand view to preview'):!record?.profile?text('预览后下载','Preview to download'):findDownloaded(entries,record)?text('在本地查看','View in local library'):text('下载到本地','Download to library');
  $('footnote').textContent=!previewVisible?text('收起键盘或增高窗口，即可查看完整参数。','Close the keyboard or enlarge the window to view parameters.'):mode==='community'?text('同名分享可能有不同参数；预览后再下载。','Same-name shares may differ. Preview before downloading.'):text('下载后保存在本地方案，使用时再切换。','Download to the local library, then choose when to use it.');
 }
 function renderPreview(record){
  if(!record){$('preview').innerHTML=`<div class="empty"><h3>${text('先选一个方案','Choose a profile')}</h3></div>`;return}
  if(!record.profile){
   $('preview').innerHTML=`<div class="eyebrow">${text('社区分享预览','Community share preview')}</div><h2>${esc(title(record))}</h2><div class="metadata">${esc(shareDetails(record))}</div><div class="empty"><p>${record.error?esc(record.error):text('正在读取这次分享的实际曲线参数…','Reading the profile used for this shared shot…')}</p>${record.error?`<button id="retryPreview" class="btn">${text('重新读取','Retry preview')}</button>`:''}</div>`;
   if(record.error)$('retryPreview').onclick=()=>{delete record.error;render()};else if(record.loadingEpoch!==session)void loadPreview(record);
   return;
  }
  const p=record.profile,m=profileIntroModel({profile:p},language);
  $('preview').innerHTML=`<div class="eyebrow">${record.source==='community'?text('社区分享预览','Community share preview'):record.custom?text('链接方案预览','Linked profile preview'):text('官方方案预览','Official profile preview')}</div><h2>${esc(p.title)}</h2><div class="metadata">${esc(p.author||text('作者未注明','Author not specified'))} · ${text(`${p.steps.length} 个阶段`,`${p.steps.length} stages`)}${p.target_weight>0?` · ${text('目标','Target')} ${p.target_weight} g`:''}</div>${record.source==='community'?`<div class="metadata">${text('分享：','Shared by: ')}${esc(shareDetails(record))}</div>`:''}<p class="summary">${text('查看各阶段的控制目标，确认后再下载。','Review the stage targets before downloading.')}</p><div class="chart">${profileIntroChart(m.stages,language)}</div><div class="chartnote"><span><i class="swatch" style="color:var(--green)"></i>${text('压力','Pressure')} · bar</span><span><i class="swatch" style="color:var(--blue)"></i>${text('进水流量','Inlet flow')} · mL/s</span><span>${text('实线：控制目标 · 虚线：限制','Solid: targets · Dashed: limits')}</span></div><p class="chartnote">${text('按各段最长时长预览；实际切段可能提前，自适应目标以运行时为准。','Maximum stage durations shown. Exits may occur earlier; adaptive targets are determined during brewing.')}</p><ol class="step-list">${p.steps.map((s,i)=>`<li class="step"><span>${i+1}</span><div><strong>${esc(stageLabel(s.name,language))}</strong><small>${s.pump==='pressure'?text('压力','Pressure'):text('进水流量','Inlet flow')} ${s[s.pump]} ${s.pump==='pressure'?'bar':'mL/s'} · ${text('最长','Up to')} ${s.seconds} s${s.weight>0?` · ${text('累计','Exit at')} ${s.weight} g`:''}${s.exit?` · ${s.exit.type==='pressure'?text('压力','Pressure'):text('流量','Flow')} ${s.exit.condition==='over'?text('高于','above'):text('低于','below')} ${s.exit.value} ${s.exit.type==='pressure'?'bar':'mL/s'}`:''}</small></div><em>${s.temperature}<small style="display:inline"> °C</small></em></li>`).join('')}</ol><details class="details"><summary>${text('查看作者原文说明','Read original author notes')}</summary><p>${esc(p.notes||text('原文件未附说明。','No notes provided.'))}</p></details><div class="source"><span>${record.source==='community'?text('来源：Visualizer 公开分享','Source: public Visualizer share'):text('来源：公开 JSON 曲线文件','Source: public JSON profile file')}</span><a href="${esc(record.shotURL||record.url)}" target="_blank" rel="noopener noreferrer">${record.shotURL?text('查看出杯来源','View shared shot'):text('查看原始文件','View source')} ↗</a></div>`;
 }
 async function loadPreview(record){
  const epoch=session,api=getClient();record.loadingEpoch=epoch;
  try{const loaded=await readOnlineRecord(record.url,{signal:controller.signal});if(!current(epoch,api))return;record.profile=loaded.profile;delete record.error;}
  catch(e){if(!current(epoch,api)||e.name==='AbortError')return;record.error=errorText(e)}
  finally{if(current(epoch,api)){delete record.loadingEpoch;render()}}
 }
 function showModal(title,body,label,fn){modalEpoch++;$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modalError').textContent='';$('confirm').textContent=label;$('confirm').disabled=false;modalAction=fn;$('modal').hidden=false;($('url')||$('confirm')).focus()}
 function hideModal(event){if(saveBusy)return;guardDismissClick(event);modalEpoch++;$('modal').hidden=true;modalAction=null;$('link').focus()}
 function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},3500)}
 async function loadCommunity(reset){
  if(catalogBusy){if(!reset)return;controller?.abort();controller=new AbortController();session++;catalogBusy=false;}
  const epoch=session,api=getClient(),query=reset?$('search').value.trim():communityQuery,page=reset?1:communityPage+1;catalogBusy=true;listError='';render();
  try{
   const result=await readCommunityPage({query,page,signal:controller.signal});if(!current(epoch,api))return;
   const base=reset?community.filter(r=>r.custom):community,ids=new Set(base.map(key));community=[...base,...result.records.filter(r=>!ids.has(key(r)))];communityQuery=query;communityPage=result.page;communityHasMore=result.hasMore;communityLoaded=true;
   if(reset){selected=null;$('list').scrollTop=0;}
  }catch(e){if(current(epoch,api)&&e.name!=='AbortError')listError=errorText(e)}
  finally{if(current(epoch,api)){catalogBusy=false;render()}}
 }
 async function refresh(){
  if(mode==='community'){await loadCommunity(true);return}if(catalogBusy)return;
  const epoch=session,api=getClient();catalogBusy=true;listError='';render();
  try{const result=await readOfficialCatalog({signal:controller.signal});if(!current(epoch,api))return;official=[...official.filter(r=>r.custom),...result.records];catalogLoaded=true;if(result.failed)listError=text(`${result.failed} 个文件暂时无法读取，其余方案可继续查看。`,`${result.failed} files could not be read. Other profiles are available.`);toast(text('官方目录已更新','Official catalog updated'));}
  catch(e){if(current(epoch,api)&&e.name!=='AbortError')listError=errorText(e)}
  finally{if(epoch===session){catalogBusy=false;render()}}
 }
 function openLink(){showModal(text('从链接添加方案','Add a profile link'),`<label for="url">${text('方案或出杯链接','Profile or shot URL')}</label><input id="url" type="url" placeholder="https://…"><p>${text('支持公开 JSON 直链和 Visualizer 出杯链接。读取后先预览，再确认下载。','Use a public JSON file or Visualizer shot link. Preview before downloading.')}</p>`,text('读取并预览','Read and preview'),async()=>{
  const epoch=session,api=getClient(),modal=modalEpoch,input=$('url').value,confirm=$('confirm');confirm.disabled=true;confirm.textContent=text('正在读取…','Reading…');
  try{const record=await readOnlineRecord(input,{signal:controller.signal});if(!current(epoch,api)||modal!==modalEpoch)return;let found=records().find(r=>r.profile&&onlineExecutionKey(r.profile)===onlineExecutionKey(record.profile));if(!found){found={...record,custom:true};records().unshift(found)}selected=key(found);$('search').value='';if($('filter'))$('filter').value='all';hideModal();render();}
  finally{if(epoch===session&&modal===modalEpoch){confirm.disabled=false;confirm.textContent=text('读取并预览','Read and preview')}}
 });}
 function download(event){
  const r=chosen();if(!r?.profile||saveBusy||!$('preview').getClientRects().length||(mode==='community'&&catalogBusy)||!isAllowed())return;const stored=findDownloaded(getProfiles(),r);if(stored){close(event);onBrowseLocal(stored);return}
  const sameName=getProfiles().some(e=>e.profile?.title===r.profile.title);
  showModal(sameName?text('保留为独立方案','Keep as a separate profile'):text('下载这个方案？','Download this profile?'),`<p><strong>${esc(r.profile.title)}</strong></p><p>${sameName?text('本地已有同名方案，参数不同。两份方案都会保留。','A local profile has the same name with different settings. Both will be kept.'):text('将保存至平板的本地方案库。','This profile will be saved to the tablet library.')}${text('当前使用的配方保持不变。',' Your current recipe will remain in use.')}</p>`,text('确认下载','Confirm download'),()=>save());
  async function save(restore=null){
   const epoch=session,api=getClient(),confirm=$('confirm'),label=confirm.textContent;
   saveBusy=true;confirm.disabled=true;confirm.textContent=text('正在保存…','Saving…');render();
   let result;
   try{
    result=await saveOnlineRecord(api,r,{isCurrent:()=>current(epoch,api),restore});
   }finally{
    saveBusy=false;
    if(current(epoch,api)){confirm.disabled=false;confirm.textContent=label;render();}
   }
   if(result.entries&&getClient()===api)onLibrary(result.entries);
   if(!current(epoch,api))return;
   if(result.needsRestore){
    const row=result.needsRestore,deleted=row.visibility==='deleted';
    const message=deleted?text('本地已删除同参数方案。恢复后可在本地方案中选择。','A matching local profile was deleted. Restore it to select it again.'):text('本地已隐藏同参数方案。恢复后可在本地方案中选择。','A matching local profile is hidden. Restore it to select it again.');
    showModal(text('恢复本地方案？','Restore local profile?'),`<p><strong>${esc(row.profile.title)}</strong></p><p>${message}</p>`,text('恢复到本地','Restore to library'),()=>save({id:row.id,visibility:row.visibility}));
    return;
   }
   hideModal();render();toast(result.restored?text('方案已恢复到本地','Profile restored to library'):result.already?text('方案已在本地','Profile is already in the library'):text('已下载，可在本地方案中查看','Downloaded. Available in the local library.'));
  }
 }
 let resizeFrame;window.addEventListener('resize',()=>{if(host.hidden)return;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(render)});
 host.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();if(!$('modal').hidden)hideModal();else close();}if(e.key==='Tab'){e.stopPropagation();const scope=$('modal').hidden?root:$('modal'),nodes=[...scope.querySelectorAll('button,input,select,a,summary')].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&root.activeElement===first){last.focus();e.preventDefault()}else if(!e.shiftKey&&root.activeElement===last){first.focus();e.preventDefault()}}});
 return {open(next='official'){if(!isAllowed()||saveBusy)return;close();previousFocus=document.activeElement;language=getLanguage();mode=next==='community'?'community':'official';activeApi=getClient();libraryRef=getProfiles();host.setAttribute('data-theme',document.documentElement.dataset.theme||'light');host.hidden=false;session++;controller=new AbortController();selected=records()[0]?key(records()[0]):null;listError='';template();render();root.querySelector('.tab.active').focus();if(mode==='official'?!catalogLoaded:!communityLoaded)void refresh();},close,update(){if(host.hidden)return;if(!isAllowed()||getLanguage()!==language||getClient()!==activeApi){close();return}host.setAttribute('data-theme',document.documentElement.dataset.theme||'light');if(libraryRef!==getProfiles()){libraryRef=getProfiles();render();}},get isOpen(){return !host.hidden}};
}
