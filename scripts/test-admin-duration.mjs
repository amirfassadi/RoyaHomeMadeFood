// Isolated browser regression of the actual ProductEditor and its POST payload.
// Optional Playwright is installed outside the application dependency tree in CI.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ROYA_TEST_BROWSER_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({entryPoints:[resolve(root,'tests/browser/product-duration-fixture.tsx')],bundle:true,write:false,
 platform:'browser',format:'iife',jsx:'automatic',minify:true,
 define:{'process.env.NODE_ENV':'"production"','process.env.__NEXT_IMAGE_OPTS':JSON.stringify(require('next/dist/shared/lib/image-config').imageConfigDefault)}});
const styleDirectory=resolve(root,'.next/static/chunks');
const styles=(await Promise.all((await readdir(styleDirectory)).filter(n=>n.endsWith('.css')).map(n=>readFile(resolve(styleDirectory,n),'utf8')))).join('\n');
assert(styles.length>1000,'Build the application before the browser form test.');
let received=[];
const server=createServer(async(req,res)=>{
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(bundle.outputFiles[0].contents);return;}
 if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(styles);return;}
 if(req.url==='/api/admin/products'&&req.method==='POST'){
  const chunks=[];for await(const part of req)chunks.push(part);
  received.push(JSON.parse(Buffer.concat(chunks).toString()));
  res.setHeader('Content-Type','application/json');res.end('{"ok":true}');return;
 }
 if(req.url.startsWith('/fixture/')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');return;}
 res.statusCode=404;res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.ROYA_TEST_BROWSER_EXECUTABLE?{executablePath:process.env.ROYA_TEST_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();
 page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('FORM_FIXTURE_ERROR: '+e.message);});
 await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 async function open(minutes){received=[];await page.goto(origin+'/fixture/?minutes='+minutes);await page.getByLabel('زمان آماده‌سازی',{exact:true}).waitFor();}
 const amount=page.getByLabel('زمان آماده‌سازی',{exact:true});
 const unit=page.getByLabel(/واحد زمان آماده‌سازی/);
 const save=page.getByRole('button',{name:'ذخیره محصول',exact:true});
 async function saved(expected){await save.click();await page.getByText('FIXTURE_SAVED',{exact:true}).waitFor();assert.equal(received.length,1);assert.equal(received[0].product.preparationMinutes,expected);assert.equal(received[0].id,'duration-fixture');assert.equal(received[0].expectedUpdatedAt,'2026-10-23T00:00:00.000Z');}

 await open(240);assert.equal(await amount.inputValue(),'4');assert.equal(await unit.inputValue(),'hour');assert.equal(received.length,0);
 await unit.selectOption('day');await amount.fill('2');await page.getByRole('status').filter({hasText:'۲٬۸۸۰'}).waitFor();await saved(2880);
 await open(240);await unit.selectOption('minute');assert.equal(await amount.inputValue(),'240');await unit.selectOption('day');await saved(240);
 for(const [minutes,value,kind] of [[2880,'2','day'],[90,'90','minute'],[0,'0','minute']]){
  await open(minutes);assert.equal(await amount.inputValue(),value);assert.equal(await unit.inputValue(),kind);await saved(minutes);
 }
 await open(240);await amount.fill('4.1');await saved(246);
 await open(240);await amount.fill('');await save.click();assert.equal(received.length,0);assert.equal(await amount.evaluate(e=>e.validity.valueMissing),true);
 await unit.selectOption('minute');await amount.fill('0.5');await save.click();await page.getByRole('alert').waitFor();assert.equal(received.length,0);
 await unit.selectOption('day');await amount.fill('366');await save.click();assert.equal(received.length,0);assert.equal(await amount.evaluate(e=>e.validity.rangeOverflow),true);
 await amount.fill('-1');await save.click();assert.equal(received.length,0);assert.equal(await amount.evaluate(e=>e.validity.rangeUnderflow),true);
 await amount.fill('2');await saved(2880);
 await page.setViewportSize({width:375,height:812});await open(2880);
 assert.equal(await amount.inputValue(),'2');assert(await amount.isVisible());assert(await unit.isVisible());
 const overflowing=await page.evaluate(()=>Array.from(document.querySelectorAll('main *')).filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1||r.left< -1;}).slice(0,12).map(e=>({tag:e.tagName,type:e.getAttribute('type'),className:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Product form overflows the mobile viewport: '+JSON.stringify(overflowing));
 assert.deepEqual(errors,[]);
 console.log('ADMIN DURATION BROWSER PASS: 4-hour display, 2 days -> 2880-minute product payload, unchanged duration on unit switch, exact fractional-hour conversion, legacy/zero preservation, invalid-input rejection and mobile form.');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
