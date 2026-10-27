// Real SettingsEditor, isolated in-memory HTTP fixture; no credentials or VPS.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build,stop} from 'esbuild';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ROYA_TEST_BROWSER_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({entryPoints:[resolve(root,'tests/browser/settings-fixture.tsx')],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
const cssDir=resolve(root,'.next/static/chunks');
const styles=process.env.ROYA_TEST_CSS_FILE?await readFile(process.env.ROYA_TEST_CSS_FILE,'utf8'):(await Promise.all((await readdir(cssDir)).filter(n=>n.endsWith('.css')).map(n=>readFile(resolve(cssDir,n),'utf8')))).join('\n');
const writes=[],external=[],errors=[];
const data={zones:[],discounts:[],contact:{}};
let rejectNext=0,version=0;
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://fixture.invalid').pathname;
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  if(req.method==='POST'){
   if(!['/api/admin/settings/zones','/api/admin/settings/discounts'].includes(path)){json(404,{});return;}
   let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);writes.push({path,body});
   if(rejectNext){const status=rejectNext;rejectNext=0;json(status,{error:status===409?'CONFLICT':'UNAVAILABLE'});return;}
   const key=path.endsWith('zones')?'zones':'discounts',existing=data[key].find(row=>row.id===body.id);
   if(body.id&&(!existing||body.expectedUpdatedAt!==existing.updatedAt)){json(409,{error:'CONFLICT'});return;}
   const row={...(existing||{}),...body,id:existing?.id||'fixture-'+key,updatedAt:new Date(Date.UTC(2026,9,27,0,0,++version)).toISOString(),...(key==='discounts'?{usedCount:0}:{})};
   if(existing)data[key][data[key].indexOf(existing)]=row;else data[key].push(row);
   json(200,{ok:true});return;
  }
  if(req.method!=='GET'){json(405,{});return;}
  if(path==='/fixture/settings'){json(200,data);return;}
  if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
  if(path==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(styles);return;}
  if(path==='/fixture/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');return;}
  res.writeHead(404);res.end();
 }catch{res.writeHead(500);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
const watchdog=setTimeout(()=>{console.error('SETTINGS BROWSER TIME LIMIT');process.exit(1);},120000);
try{
 browser=await chromium.launch({headless:true,...(process.env.ROYA_TEST_BROWSER_EXECUTABLE?{executablePath:process.env.ROYA_TEST_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:375,height:950}});page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
 const button=name=>page.getByRole('button',{name,exact:true});
 const panel=title=>page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
 const zones=panel('محدوده‌ها و هزینه ارسال'),discounts=panel('کدهای تخفیف');
 await page.goto(origin+'/fixture/');await button('افزودن محدوده').click();
 for(const [label,value] of [['شهر فارسی','شهر آزمایشی'],['شهر انگلیسی','Fixture city'],['محدوده فارسی','محدوده آزمایشی'],['محدوده انگلیسی','Fixture zone'],['هزینه ارسال (تومان)','75000'],['زمان ارسال (دقیقه)','90']])await page.getByLabel(label,{exact:true}).fill(value);
 await zones.getByLabel('فعال',{exact:true}).uncheck();await button('ذخیره محدوده').click();
 await zones.getByRole('button',{name:'ویرایش / غیرفعال',exact:true}).waitFor();
 assert.equal(data.zones[0].active,false);assert.equal(data.zones[0].feeToman,75000);assert.equal(data.zones[0].deliveryMinutes,90);
 const initialZone=structuredClone(data.zones[0]);
 await zones.getByRole('button',{name:'ویرایش / غیرفعال',exact:true}).click();
 await page.getByLabel('هزینه ارسال (تومان)',{exact:true}).fill('100000');rejectNext=409;await button('ذخیره محدوده').click();
 await zones.getByRole('alert').waitFor();assert.equal(await page.getByLabel('هزینه ارسال (تومان)',{exact:true}).inputValue(),'100000');assert.deepEqual(data.zones[0],initialZone);
 await button('ذخیره محدوده').click();await zones.getByRole('button',{name:'ویرایش / غیرفعال',exact:true}).waitFor();
 assert.equal(writes.at(-1).body.id,initialZone.id);assert.equal(writes.at(-1).body.expectedUpdatedAt,initialZone.updatedAt);assert.equal(data.zones[0].feeToman,100000);
 await button('افزودن تخفیف').click();
 await page.getByLabel('کد لاتین',{exact:true}).fill('qa_20261027');
 await discounts.getByLabel('فعال',{exact:true}).uncheck();
 await page.getByLabel('مقدار درصد / مبلغ تومان',{exact:true}).fill('101');const beforeInvalid=writes.length;await button('ذخیره تخفیف').click();await discounts.getByRole('alert').waitFor();assert.equal(writes.length,beforeInvalid);
 await page.getByLabel('مقدار درصد / مبلغ تومان',{exact:true}).fill('15');
 await page.getByLabel('شروع شمسی (اختیاری، وقت تهران)',{exact:true}).fill('۱۴۰۵/۰۸/۰۵ ۰۹:۳۰');
 await page.getByLabel('پایان شمسی (اختیاری، وقت تهران)',{exact:true}).fill('۱۴۰۵/۰۸/۰۴ ۰۹:۳۰');await button('ذخیره تخفیف').click();assert.equal(writes.length,beforeInvalid);
 await page.getByLabel('پایان شمسی (اختیاری، وقت تهران)',{exact:true}).fill('۱۴۰۵/۰۸/۰۶ ۰۹:۳۰');await button('ذخیره تخفیف').click();await discounts.getByRole('button',{name:'ویرایش / غیرفعال',exact:true}).waitFor();
 const initialDiscount=structuredClone(data.discounts[0]);
 assert.equal(initialDiscount.code,'QA_20261027');assert.equal(initialDiscount.active,false);assert.equal(initialDiscount.showInCustomerClub,false);assert.equal(initialDiscount.maxDiscountToman,null);assert.equal(initialDiscount.usageLimit,null);assert.equal(initialDiscount.startsAt,'2026-10-27T06:00:00.000Z');assert.equal(initialDiscount.expiresAt,'2026-10-28T06:00:00.000Z');
 await discounts.getByRole('button',{name:'ویرایش / غیرفعال',exact:true}).click();await discounts.getByRole('combobox').selectOption('FIXED');await page.getByLabel('مقدار درصد / مبلغ تومان',{exact:true}).fill('50000');await page.getByLabel('سقف تخفیف (تومان، خالی = نامحدود)',{exact:true}).fill('25000');await page.getByLabel('سقف استفاده (خالی = نامحدود)',{exact:true}).fill('3');
 rejectNext=503;await button('ذخیره تخفیف').click();await discounts.getByRole('alert').waitFor();assert.equal(await page.getByLabel('مقدار درصد / مبلغ تومان',{exact:true}).inputValue(),'50000');assert.deepEqual(data.discounts[0],initialDiscount);
 await button('ذخیره تخفیف').click();await discounts.getByRole('button',{name:'ویرایش / غیرفعال',exact:true}).waitFor();assert.equal(data.discounts[0].type,'FIXED');assert.equal(data.discounts[0].value,50000);assert.equal(data.discounts[0].usageLimit,3);assert.equal(writes.at(-1).body.expectedUpdatedAt,initialDiscount.updatedAt);
 for(const width of [375,1440]){await page.setViewportSize({width,height:950});await discounts.getByRole('button',{name:'ویرایش / غیرفعال',exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'Settings form horizontal overflow');await button('بستن').click();}
 await page.reload();await discounts.getByText('QA_20261027',{exact:true}).waitFor();assert(await zones.getByText('شهر آزمایشی — محدوده آزمایشی',{exact:true}).isVisible());
 await page.goto(origin+'/fixture/?demo=1');await button('افزودن محدوده').click();assert(await button('ذخیره محدوده').isDisabled());await button('بستن').click();await button('افزودن تخفیف').click();assert(await button('ذخیره تخفیف').isDisabled());
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('ADMIN SETTINGS BROWSER PASS: real zone/discount forms, payload and edit versions, percent validation, Persian dates/Tehran conversion, nullable limits, preserved drafts after conflict/service error, reload, mobile/desktop and disabled demo saves. Isolated fixture only; no VPS/database writes.');
}finally{clearTimeout(watchdog);if(browser)await browser.close();server.closeAllConnections();await new Promise(done=>server.close(done));stop();}
