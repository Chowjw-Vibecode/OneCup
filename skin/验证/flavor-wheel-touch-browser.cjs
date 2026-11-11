const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch();const errors=[];const results=[];
 for(const [width,height] of [[1007,602],[1024,640]])for(const lang of ['zh','en']){
  const page=await browser.newPage({viewport:{width,height},hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:18999/flavor-wheel/index.html?lang=${lang}`);await page.evaluate(()=>document.fonts.ready);
  const cdp=await page.context().newCDPSession(page);
  const checkFooter=async()=>{const v=await page.evaluate(()=>({height:innerHeight,scroll:document.documentElement.scrollHeight,rects:['cancel','confirm'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}})}));assert(v.scroll<=v.height+1,JSON.stringify(v));assert(v.rects.every(r=>r.top>=0&&r.bottom<=v.height&&r.height>=44),JSON.stringify(v));};
  const scale=()=>page.locator('#wheel').evaluate(e=>e.getBoundingClientRect().width/e.parentElement.clientWidth);
  const pinch=async(out=true,remaining=false)=>{
   const r=await page.locator('#wheelWindow').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
   const pt=(id,px,py)=>({id,x:px,y:py,radiusX:2,radiusY:2,force:1});
   const start=out?32:100,end=out?115:2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(1,x-start,y),pt(2,x+start,y)]});
   for(let n=1;n<=8;n++){const d=start+(end-start)*n/8;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt(1,x-d,y),pt(2,x+d,y)]});}
   if(remaining){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[pt(2,x+end,y)]});const before=await page.locator('#wheelWindow').evaluate(e=>e.scrollTop);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt(1,x-end,y-40)]});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const after=await page.locator('#wheelWindow').evaluate(e=>e.scrollTop);assert(after!==before,JSON.stringify({before,after,geometry:await page.locator('#wheelWindow').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight,t:e.scrollTop}))}));}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  await checkFooter();assert.equal(await page.locator('#zoomWheel').count(),1);
  await page.locator('#zoomWheel').click();await checkFooter();assert(await scale()>2.95);
  let selected=await page.locator('#selectedCount').innerText();await pinch(true,true);assert((await scale())<=6.02);assert((await scale())>5.9);assert.equal(await page.locator('#selectedCount').innerText(),selected);
  await pinch(false);assert((await scale())>=.99&&(await scale())<1.05);await checkFooter();
  await page.locator('#zoomWheel').click();await page.locator('[data-category=fruit]').evaluate(e=>e.click());await page.locator('[data-flavor="fruit:0:0"]').click();
  selected=await page.locator('#selectedCount').innerText();await page.locator('#zoomWheel').click();assert(await page.locator('.app').evaluate(e=>e.classList.contains('category-zoom')));await checkFooter();
  const categoryInitial=await scale();await pinch(true,true);assert((await scale())>categoryInitial*2);assert.equal(await page.locator('#selectedCount').innerText(),selected);
  // A canceled gesture must not leave the next genuine tap or drag stuck.
  const r=await page.locator('#wheelWindow').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:r.x+r.width/2,y:r.y+r.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.locator('#zoomWheel').click();assert.equal(await page.locator('[data-flavor="fruit:0:0"]').getAttribute('aria-pressed'),'true');await checkFooter();
  await page.locator('#zoomWheel').focus();await page.keyboard.press('Enter');
  const leaf=page.locator('#wheelArt [data-node="fruit:0:1"] text'),leafBox=await leaf.boundingBox();
  await page.touchscreen.tap(leafBox.x+leafBox.width/2,leafBox.y+leafBox.height/2);await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await page.locator('#wheelArt [data-node="fruit:0:1"]').getAttribute('aria-pressed'),'true','touch tap selects a leaf after pinch/cancel');
  await page.locator('#zoomWheel').click();assert.equal(await page.locator('[data-flavor="fruit:0:1"]').getAttribute('aria-pressed'),'true');
  if(width===1007&&lang==='zh'){fs.mkdirSync('/tmp/thiscup-wheel-touch',{recursive:true});await page.screenshot({path:'/tmp/thiscup-wheel-touch/small-1007x602.png'});await page.locator('#zoomWheel').click();await page.screenshot({path:'/tmp/thiscup-wheel-touch/expanded-1007x602.png'});}
  results.push({width,height,lang,result:'footer, pinch, bounds, remaining-finger pan, cancellation, selection passed'});await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
