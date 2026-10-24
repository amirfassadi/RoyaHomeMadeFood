// Actual content editor in an isolated browser. No account or real database is used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build,stop} from 'esbuild';
import {contentEditSchema,defaultContentDocument} from '../src/lib/storefront-content.ts';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ROYA_TEST_BROWSER_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({entryPoints:[resolve(root,'tests/browser/content-editor-fixture.tsx')],bundle:true,write:false,
  platform:'browser',format:'iife',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
const stylesDirectory=resolve(root,'.next/static/chunks');
const styles=(await Promise.all((await readdir(stylesDirectory)).filter(name=>name.endsWith('.css')).map(name=>readFile(resolve(stylesDirectory,name),'utf8')))).join('\n');
assert(styles.length>1000,'Build the application before the browser form test.');
let document=defaultContentDocument(),writes=[],loseResponse=false,phase='setup';
const server=createServer(async(request,response)=>{
  if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript; charset=utf-8');response.end(bundle.outputFiles[0].contents);return;}
  if(request.url==='/fixture.css'){response.setHeader('Content-Type','text/css; charset=utf-8');response.end(styles);return;}
  if(request.url==='/api/admin/settings/content/'){
    response.setHeader('Content-Type','application/json');
    if(request.method==='GET'){response.end(JSON.stringify({document}));return;}
    if(request.method==='POST'){
      const chunks=[];for await(const chunk of request)chunks.push(chunk);
      const input=contentEditSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString()));
      writes.push(input.success?input.data:null);
      if(!input.success){response.statusCode=400;response.end('{"error":"INVALID"}');return;}
      if(input.data.expectedUpdatedAt!==document.updatedAt){response.statusCode=409;response.end('{"error":"CONFLICT"}');return;}
      document={content:input.data.content,updatedAt:new Date(Math.max(Date.now(),new Date(document.updatedAt).getTime()+1)).toISOString()};
      if(loseResponse){loseResponse=false;response.statusCode=503;response.end('{"error":"UNAVAILABLE"}');return;}
      response.end(JSON.stringify({document}));return;
    }
  }
  if(request.url.startsWith('/fixture/')){response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');return;}
  response.statusCode=404;response.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
const watchdog=setTimeout(()=>{
  console.error('CONTENT FORM TEST TIMEOUT:',phase,process.getActiveResourcesInfo());
  server.closeAllConnections();
  process.exit(1);
},90000);
watchdog.unref();
function checkpoint(value){phase=value;console.log('CONTENT FORM CHECK:',value);}
try{
  browser=await chromium.launch({headless:true,...(process.env.ROYA_TEST_BROWSER_EXECUTABLE?{executablePath:process.env.ROYA_TEST_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  const title=page.getByLabel('عنوان اصلی — خط اول',{exact:true});
  const save=page.getByRole('button',{name:'ذخیرهٔ متن‌های هر دو زبان',exact:true});
  const reload=page.getByRole('button',{name:'بارگیری نسخهٔ سرور و کنارگذاشتن تغییرات',exact:true});
  await page.goto(origin+'/fixture/');await title.waitFor();assert(await save.isDisabled());
  checkpoint('form mounted');
  await title.fill('عنوان آزمایشی فارسی');
  await page.getByRole('button',{name:'English',exact:true}).click();await title.fill('English fixture headline');
  assert.equal(await title.getAttribute('dir'),'ltr');
  await page.getByRole('button',{name:'فارسی',exact:true}).click();assert.equal(await title.inputValue(),'عنوان آزمایشی فارسی');assert.equal(writes.length,0);
  await page.getByLabel('داستان رویا',{exact:true}).fill('داستان {رویا}\n<script>window.contentInjected=true</script>');
  assert.equal(await page.evaluate(()=>window.contentInjected),undefined);
  await save.click();await page.getByText('متن‌های هر دو زبان ذخیره شدند.',{exact:true}).waitFor();
  assert.equal(writes.length,1);assert.equal(writes[0].content.en.homeTitle1,'English fixture headline');assert.equal(writes[0].expectedUpdatedAt,defaultContentDocument().updatedAt);
  checkpoint('bilingual save and literal preview');
  const firstVersion=document.updatedAt;
  await title.fill('پیش‌نویس مدیر اول');
  document={content:{...document.content,fa:{...document.content.fa,homeTitle1:'متن مدیر دیگر'}},updatedAt:new Date(new Date(firstVersion).getTime()+1).toISOString()};
  await save.click();await page.getByRole('alert').waitFor();assert.equal(await title.inputValue(),'پیش‌نویس مدیر اول');assert.equal(document.content.fa.homeTitle1,'متن مدیر دیگر');assert(await save.isDisabled());
  await reload.click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('input')).some(input=>input.value==='متن مدیر دیگر'));assert.equal(await title.inputValue(),'متن مدیر دیگر');assert(await save.isDisabled());
  checkpoint('conflict retained and server version loaded');
  await title.fill('نسخهٔ دریافت‌نشده');loseResponse=true;await save.click();await page.getByRole('alert').waitFor();assert(await save.isDisabled());assert.equal(document.content.fa.homeTitle1,'نسخهٔ دریافت‌نشده');
  await reload.click();await page.getByRole('alert').waitFor({state:'detached'});assert.equal(await title.inputValue(),'نسخهٔ دریافت‌نشده');
  checkpoint('uncertain save recovered');
  const before=writes.length;await title.fill('');await save.click();assert.equal(writes.length,before);assert.equal(await title.evaluate(element=>element.validity.valueMissing),true);
  await title.fill('عنوان موبایل');await page.setViewportSize({width:375,height:812});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Content form overflows mobile viewport.');
  await save.click();await page.getByText('متن‌های هر دو زبان ذخیره شدند.',{exact:true}).waitFor();
  checkpoint('required field and mobile');
  await page.goto(origin+'/fixture/?demo=1');await title.waitFor();await title.fill('پیش‌نمایش بدون ذخیره');assert(await save.isDisabled());
  assert.deepEqual(errors,[]);
  checkpoint('all assertions passed');
  console.log('ADMIN CONTENT BROWSER PASS: bilingual drafts, literal text preview, explicit versioned save, conflict preservation, lost-response recovery, required fields, mobile and read-only demonstration.');
}finally{
  if(browser)await browser.close();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  stop();clearTimeout(watchdog);
}
