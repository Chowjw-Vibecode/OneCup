// Real settings UI, synthetic local state; no external network or device writes.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))).version;
const origin = 'http://localhost:18999';

(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  try {
    for (const [width, height, dpr] of [[1007,602,1.33125],[1340,800,2]]) {
      for (const theme of ['light', 'dark']) for (const language of ['zh', 'en']) {
        const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:width===1007,reducedMotion:'reduce'});
        const page = await context.newPage();
        page.on('pageerror', e => {errors.push(e.message);console.error('Page error:',e.message)});
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname !== '/app.js') return route.continue();
          let source = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
            .replace('import { createUsageReporter }', 'import { createUsageReporter as createUsageReporterActual }');
          source += `
            function createUsageReporter(options) {
              const previous = {enabled:false,install_id:'a'.repeat(32),next_at:99000000,attempt_version:'${version}',retry_at:90000000};
              const test = window.settingsTest = {saved:JSON.stringify(previous),requests:0};
              const reporter = createUsageReporterActual({...options,
                getContext:()=>({pageUrl:location.href,apiUrl:'http://localhost:8080',host:{app:'decent.app',platform:'android'},settings:{simulatedDevices:[]},connection:{connected:true,machineConnected:true,stale:false},machineState:'idle',busy:false}),
                storage:{getItem:()=>test.saved,setItem:(_,value)=>{test.saved=value}},
                now:()=>1000000,setTimer:()=>1,clearTimer:()=>{},events:window,
                fetchImpl:()=>{test.requests++;throw Error('Unexpected reporting request')}
              });
              test.reporter=reporter;return reporter;
            }
          `;
          return route.fulfill({contentType:'application/javascript',body:source});
        });
        async function open(reload=false) {
          if (reload) await page.reload();
          else await page.goto(origin+'/?api=http://127.0.0.1:19080');
          await page.waitForFunction(() => window.thisCup && window.ceramicUI && window.settingsTest).catch(async error=>{
            console.error({width,height,theme,language,reload,boot:await page.evaluate(()=>({app:!!window.thisCup,ceramic:!!window.ceramicUI,test:!!window.settingsTest}))});throw error;
          });
          await page.evaluate(({theme,language}) => {
            const s=thisCup.state;s.connectSequence++;thisCup.client.close();
            s.theme=theme;s.language=language;document.documentElement.dataset.theme=theme;
            thisCup.client.get=async()=>({});
            thisCup.client.post=thisCup.client.put=thisCup.client.delete=async()=>{throw Error('Unexpected device write')};
            thisCup.render();
          }, {theme,language});
          await page.locator('#settingsButton').click();
          await page.evaluate(() => document.fonts.ready);
          const reporting = await page.evaluate(() => ({enabled:settingsTest.reporter.enabled,saved:JSON.parse(settingsTest.saved),requests:settingsTest.requests}));
          assert.deepEqual(reporting,{enabled:true,saved:{enabled:true,install_id:'a'.repeat(32),next_at:99000000,attempt_version:version,retry_at:90000000},requests:0});
          assert.equal(await page.locator('#settingsDialog [role=switch]').count(),2);
          assert.equal(await page.locator('#usageEnabled,#usageTitle,#usageHelp,#usageStatus').count(),0);
          assert.doesNotMatch(await page.locator('#settingsDialog').innerText(),/匿名|地区统计|anonymous|country.*statistics/i);
          assert.equal(await page.locator('#skinCurrentVersion').innerText(),`OneCup · ${language==='zh'?'当前版本':'Current version'} ${version}`);
        }
        async function state(id, enabled) {
          const button=page.locator('#'+id);
          assert.equal(await button.getAttribute('aria-checked'),String(enabled));
          assert.equal(await button.innerText(),language==='zh'?(enabled?'已开启':'已关闭'):(enabled?'Enabled':'Disabled'));
          const appearance=await button.evaluate(b=>{
            const thumb=getComputedStyle(b,'::after'),track=getComputedStyle(b,'::before'),r=b.getBoundingClientRect();
            return {x:new DOMMatrix(thumb.transform).m41,color:track.backgroundColor,width:parseFloat(track.width),height:r.height};
          });
          assert.equal(appearance.x,enabled?20:0);
          assert.equal(appearance.width,48);assert(appearance.height>=44);
          return appearance.color;
        }
        async function toggle(id) {
          const button=page.locator('#'+id);await button.scrollIntoViewIfNeeded();
          if (width===1007) await button.tap();else await button.click();
        }
        await open();
        const offColor=await state('skinUpdateEnabled',false);await state('chinaMirrorEnabled',true);
        await toggle('skinUpdateEnabled');const onColor=await state('skinUpdateEnabled',true);assert.notEqual(onColor,offColor);
        await state('chinaMirrorEnabled',true);
        await toggle('chinaMirrorEnabled');await state('chinaMirrorEnabled',false);await state('skinUpdateEnabled',true);
        await toggle('chinaMirrorEnabled');await state('chinaMirrorEnabled',true);
        await open(true);await state('skinUpdateEnabled',true);await state('chinaMirrorEnabled',true);
        await toggle('skinUpdateEnabled');await state('skinUpdateEnabled',false);await state('chinaMirrorEnabled',true);
        await toggle('skinUpdateEnabled');await toggle('chinaMirrorEnabled');
        await open(true);await state('skinUpdateEnabled',true);await state('chinaMirrorEnabled',false);
        if (width===1340) {
          await page.locator('#skinUpdateEnabled').focus();await page.keyboard.press('Space');await state('skinUpdateEnabled',false);
          await page.keyboard.press('Enter');await state('skinUpdateEnabled',true);
        }
        await page.locator('#chinaMirrorHelp').scrollIntoViewIfNeeded();
        for (const id of ['skinCurrentVersion','skinUpdateEnabled','skinUpdateCheck','chinaMirrorEnabled']) {
          const r=await page.locator('#'+id).boundingBox();assert(r&&r.x>=0&&r.y>=0&&r.x+r.width<=width&&r.y+r.height<=height,JSON.stringify({id,r,width,height}));
        }
        await page.mouse.move(0,0);
        if (width===1007 && language==='zh') await page.locator('section.display-settings:has(#skinUpdateEnabled)').screenshot({path:`/tmp/onecup-settings-${theme}.png`,animations:'disabled'});
        results.push({width,height,dpr,theme,language,persisted:true,touch:width===1007,oldReportingIdentityPreserved:true});
        await context.close();
      }
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,version,results,errors},null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
