// Real responsive header, logo, cart and region providers; loopback only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {basename,resolve} from 'node:path';
import {build,stop} from 'esbuild';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ROYA_TEST_BROWSER_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({entryPoints:[resolve(root,'tests/browser/header-fixture.tsx')],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',minify:true,
  alias:{'next/navigation':resolve(root,'tests/browser/header-navigation.ts')},
  define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.__NEXT_TRAILING_SLASH':'true'}});
const directory=resolve(root,'.next/static/chunks');
const styles=process.env.ROYA_TEST_CSS_FILE?await readFile(process.env.ROYA_TEST_CSS_FILE,'utf8'):(await Promise.all((await readdir(directory)).filter(n=>n.endsWith('.css')).map(n=>readFile(resolve(directory,n),'utf8')))).join('\n');
assert(styles.length>1000,'Build the application before testing the header.');
const writes=[],external=[],errors=[];
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'){writes.push(req.method+' '+req.url);res.writeHead(503);res.end();return;}
  const pathname=new URL(req.url,'http://fixture.invalid').pathname;
  if(pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(bundle.outputFiles[0].contents);return;}
  if(pathname==='/fixture.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(styles);return;}
  if((pathname.startsWith('/media/')||pathname.startsWith('/_next/static/media/'))&&/^[a-zA-Z0-9_.-]+\.woff2$/.test(basename(pathname))){res.setHeader('Content-Type','font/woff2');res.end(await readFile(resolve(root,process.env.ROYA_TEST_CSS_FILE?'node_modules/@fontsource-variable/vazirmatn/files':'.next/static/media',basename(pathname))));return;}
  if(/^\/(fa|en)\//.test(pathname)){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');return;}
  res.writeHead(404);res.end();
 }catch{res.writeHead(500);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
const watchdog=setTimeout(()=>{console.error('HEADER BROWSER TIME LIMIT');process.exit(1);},150000);
try{
 browser=await chromium.launch({headless:true,...(process.env.ROYA_TEST_BROWSER_EXECUTABLE?{executablePath:process.env.ROYA_TEST_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:375,height:900}});
 page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort();});
 async function fits(label){
  const geometry=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
   controls:[...document.querySelectorAll('header a,header button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {text:e.getAttribute('aria-label')||e.textContent,left:r.left,right:r.right,height:r.height};})}));
  assert(geometry.scroll<=geometry.client+1,label+' horizontal overflow: '+JSON.stringify(geometry));
  for(const control of geometry.controls)assert(control.left>=-1&&control.right<=geometry.client+1,label+' clipped control: '+JSON.stringify(control));
 }
 for(const locale of ['fa','en'])for(const width of [320,375,640,768,1280,1440]){
  await page.setViewportSize({width,height:900});
  await page.goto(origin+`/${locale}/catalog/?count=30`);
  await page.getByText('HEADER_FIXTURE_READY',{exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.fonts.check('18px "Vazirmatn Variable"')),'The production font must load before measuring the header.');
  const cartName=locale==='fa'?'سبد خرید':'Shopping bag';
  const cart=page.getByRole('link',{name:cartName,exact:true});
  await page.waitForFunction(()=>[...document.querySelectorAll('header a')].some(a=>a.href.includes('/cart/')&&/30|۳۰/.test(a.textContent))).catch(async error=>{
   console.error('HEADER FIXTURE STATE',JSON.stringify({locale,width,errors,state:await page.evaluate(()=>({header:document.querySelector('header')?.innerText,storage:{...localStorage}}))}));throw error;
  });
  assert.equal(await cart.getAttribute('href'),`/${locale}/cart/`);
  assert.equal(await page.evaluate(()=>document.documentElement.dir),locale==='fa'?'rtl':'ltr');
  await fits(`${locale} ${width}px closed`);
  if(process.env.ROYA_TEST_SCREENSHOT_DIR&&width<=375)await page.screenshot({path:resolve(process.env.ROYA_TEST_SCREENSHOT_DIR,`${locale}-${width}-closed.png`)});
  if(width<1280){
   const menu=page.getByRole('button',{name:locale==='fa'?'باز کردن منو':'Open menu',exact:true});
   await menu.click();
   await page.locator('#mobile-nav').waitFor();
   await fits(`${locale} ${width}px open`);
   if(process.env.ROYA_TEST_SCREENSHOT_DIR&&width<=375)await page.screenshot({path:resolve(process.env.ROYA_TEST_SCREENSHOT_DIR,`${locale}-${width}-open.png`)});
   const nav=page.locator('#mobile-nav');
   assert.equal(await nav.getByRole('link').count(),8);
   const rates=nav.locator(`a[href="/${locale}/rates/"]`);
   await rates.click();
   await page.waitForURL(origin+`/${locale}/rates/`);
   assert.equal(await page.locator('#mobile-nav').count(),0);
   await page.getByRole('link',{name:locale==='fa'?'تغییر زبان':'Change language',exact:true}).click();
   await page.waitForURL(origin+`/${locale==='fa'?'en':'fa'}/rates/`);
  }else{
   assert.equal(await page.getByRole('button',{name:/Open menu|باز کردن منو/}).count(),0);
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);
 console.log('HEADER BROWSER PASS: FA/EN, 320/375/640/768/1280/1440px, two-digit cart badge, visible unclipped controls, real menu open/navigation and locale switch; no external requests or writes.');
}finally{
 clearTimeout(watchdog);
 if(browser)await browser.close();
 server.closeAllConnections();await new Promise(done=>server.close(done));stop();
}
