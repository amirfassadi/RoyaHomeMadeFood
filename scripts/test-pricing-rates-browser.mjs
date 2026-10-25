// Actual rate/provider/admin components with a controlled loopback HTTP store.
// Complements the real PostgreSQL/HTTPS policy tests; no live accounts or APIs.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build,stop} from 'esbuild';
import {pricingPolicyEditSchema,FX_SCALE} from '../src/lib/pricing.ts';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ROYA_TEST_BROWSER_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({entryPoints:[resolve(root,'tests/browser/pricing-rates-fixture.tsx')],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',minify:true,
  define:{'process.env':'{}','process.env.NODE_ENV':'"production"'}});
const directory=resolve(root,'.next/static/chunks');
const styles=(await Promise.all((await readdir(directory)).filter(n=>n.endsWith('.css')).map(n=>readFile(resolve(directory,n),'utf8')))).join('\n');
assert(styles.length>1000,'Build the application before the browser test.');
const base=Date.now(),asOf=new Date(base).toISOString(),date=asOf.slice(0,10);
function freshFeed(toman=250000){const rates={fetchedAt:asOf,usdtTomanMicros:toman*FX_SCALE,usdTomanMicros:toman*FX_SCALE,usdtPerUsdMicros:FX_SCALE,fxMeta:{provider:'currency-api',date,mirror:'jsdelivr'},unitsPerUsd:{USD:FX_SCALE,EUR:800000,GBP:700000,AED:3672500,TRY:50000000,CAD:1400000}};
  return {schemaVersion:2,rates,tether:{fetchedAt:asOf,usdtTomanMicros:rates.usdtTomanMicros},fx:{fetchedAt:asOf,usdtPerUsdMicros:rates.usdtPerUsdMicros,unitsPerUsd:rates.unitsPerUsd,fxMeta:rates.fxMeta},sources:{nobitex:{state:'fresh',fetchedAt:asOf,refreshFailed:false},fx:{state:'fresh',fetchedAt:asOf,refreshFailed:false}}};}
let policy={feeBps:750,countryFees:{TR:300},manualUsdToman:null,updatedAt:'2026-01-01T00:00:00.000Z'},feed=freshFeed(),readDown=false,writeMode='ok',phase='setup';
const writes=[],unexpected=[],errors=[],external=[];
const responsePolicy=()=>({policy,scope:'store',schemaVersion:1});
function advancePolicy(edit){policy={...policy,...edit,updatedAt:new Date(Math.max(Date.now(),Date.parse(policy.updatedAt)+1)).toISOString()};}
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(bundle.outputFiles[0].contents);return;}
  if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(styles);return;}
  if(req.method==='GET'&&req.url==='/api/shop/rates/'){res.setHeader('Content-Type','application/json; charset=utf-8');res.statusCode=feed.rates?200:503;res.end(JSON.stringify(feed));return;}
  if(req.method==='GET'&&req.url==='/api/shop/pricing/'){res.setHeader('Content-Type','application/json; charset=utf-8');res.statusCode=readDown?503:200;res.end(JSON.stringify(readDown?{error:'UNAVAILABLE'}:responsePolicy()));return;}
  if(req.method==='POST'&&req.url==='/api/admin/settings/pricing/'){
    res.setHeader('Content-Type','application/json; charset=utf-8');const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const raw=JSON.parse(Buffer.concat(chunks).toString()),parsed=pricingPolicyEditSchema.safeParse(raw);writes.push(raw);
    if(writeMode==='deny'){res.statusCode=401;res.end('{"error":"UNAUTHORIZED"}');return;}
    if(!parsed.success){res.statusCode=400;res.end('{"error":"INVALID"}');return;}
    if(parsed.data.expectedUpdatedAt!==policy.updatedAt){res.statusCode=409;res.end('{"error":"CONFLICT"}');return;}
    advancePolicy(parsed.data.policy);
    if(writeMode==='uncertain'){writeMode='ok';res.statusCode=503;res.end('{"error":"UNAVAILABLE"}');return;}
    res.end(JSON.stringify(responsePolicy()));return;
  }
  if(req.method==='GET'&&req.url.startsWith('/fixture/')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');return;}
  if(req.url!=='/favicon.ico')unexpected.push(req.method+' '+req.url);res.statusCode=404;res.end();
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
let browser;const watchdog=setTimeout(()=>{console.error('PRICING/RATES TIMEOUT',phase);server.closeAllConnections();process.exit(1);},150000);watchdog.unref();
const check=value=>{phase=value;console.log('PRICING/RATES CHECK:',value);};
try{
  browser=await chromium.launch({headless:true,...(process.env.ROYA_TEST_BROWSER_EXECUTABLE?{executablePath:process.env.ROYA_TEST_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  context.on('page',p=>{p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));});
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort();});
  const page=await context.newPage();await page.clock.install({time:new Date(base)});
  await page.goto(origin+'/fixture/?country=DE&locale=en');
  const state=()=>page.getByTestId('pricing-state').evaluate(e=>JSON.parse(e.textContent));
  await page.getByTestId('pricing-state').waitFor({state:'attached'});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=pricing-state]').textContent).rates!==null);
  assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
  await page.getByText('USD derived from Tether',{exact:true}).waitFor();
  await page.getByText(/Daily global rates/).waitFor();
  assert.match(await page.locator('#rates-amount-result').innerText(),/3\.20/);assert.match(await page.locator('#rates-amount-result').innerText(),/0\.24/);assert.match(await page.locator('#rates-amount-result').innerText(),/3\.44/);
  await page.getByLabel('Base amount (Toman)',{exact:true}).fill('۱٬۰۰۰٬۰۰۰');assert.match(await page.locator('#rates-amount-result').innerText(),/3\.44/);
  await page.getByLabel('Base amount (Toman)',{exact:true}).fill('0');await page.getByText('Enter a whole amount from 1 to 1,000,000,000 Toman.',{exact:true}).waitFor();
  await page.getByLabel('Base amount (Toman)',{exact:true}).fill('1');await page.getByText(/below this currency/).waitFor();
  check('live-labelled controlled provenance, Persian digits, independent conversion and invalid/tiny inputs');

  await page.getByRole('button',{name:'FIXTURE add kg',exact:true}).click();await page.getByRole('button',{name:'FIXTURE checkout',exact:true}).click();
  await page.getByRole('button',{name:'Fill sample details',exact:true}).click();await page.getByRole('button',{name:'Review order & total',exact:true}).click();await page.getByRole('button',{name:'Create test invoice',exact:true}).click();
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('roya-prototype-orders-v1')||'[]'));
  const pending=(await saved())[0];assert.equal(pending.paymentState,'PENDING');assert.equal(pending.quote.pricing.snapshot.dollarSource,'tether-cross');
  assert.equal(pending.quote.pricing.totalMinor,532);assert.equal(pending.quote.pricing.snapshot.usdTomanMicros,250000*FX_SCALE);
  await page.getByRole('button',{name:'Simulate success',exact:true}).click();const frozen=JSON.stringify((await saved())[0]);
  await page.getByRole('button',{name:'FIXTURE rates',exact:true}).click();

  const admin=await context.newPage();await admin.goto(origin+'/fixture/?view=admin');
  const fee=admin.getByLabel('کارمزد پیش‌فرض خرید خارجی (درصد)',{exact:true}),manual=admin.getByLabel('نرخ دلار فروشگاه به تومان (خالی = محاسبه از تتر)',{exact:true}),tr=admin.getByLabel('ترکیه',{exact:true}),de=admin.getByLabel('آلمان',{exact:true});
  const save=admin.getByRole('button',{name:'ذخیرهٔ تنظیمات فروشگاه',exact:true}),reload=admin.getByRole('button',{name:'بارگیری نسخهٔ سرور و کنارگذاشتن تغییرات فرم',exact:true});
  await admin.waitForFunction(()=>[...document.querySelectorAll('input')].some(x=>x.value==='7.5'));
  await fee.fill('8.25');await manual.fill('220000');await tr.fill('0');await de.fill('4');assert.equal(writes.length,0);
  advancePolicy({feeBps:3000});await Promise.all([admin.waitForResponse(r=>r.url().endsWith('/api/shop/pricing/')),admin.evaluate(()=>window.dispatchEvent(new Event('focus')))]);
  assert.equal(await fee.inputValue(),'8.25');assert.equal(await manual.inputValue(),'220000');
  await save.click();await admin.getByRole('status').filter({hasText:'هم‌زمان'}).waitFor();assert.equal(policy.feeBps,3000);assert.equal(await fee.inputValue(),'8.25');
  await reload.click();await admin.waitForFunction(()=>[...document.querySelectorAll('input')].some(x=>x.value==='30'));
  check('unsaved form survives refresh/focus; stale editor cannot overwrite newer server policy');
  await fee.fill('8.25');await manual.fill('220000');await tr.fill('0');await de.fill('');await save.click();await admin.getByText('سیاست قیمت‌گذاری فروشگاه ذخیره شد.',{exact:true}).waitFor();
  assert.equal(policy.feeBps,825);assert.equal(policy.countryFees.TR,0);assert.equal('DE' in policy.countryFees,false);assert.equal(policy.manualUsdToman,220000);
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=pricing-state]').textContent).policy.feeBps===825);
  await page.getByText('Store-set USD rate',{exact:true}).waitFor();assert.equal((await state()).policy.manualUsdToman,220000);assert.equal(JSON.stringify((await saved())[0]),frozen);
  check('versioned save, empty/zero country fees, real second-tab storage event, manual label and frozen invoice');

  const before=writes.length;await fee.fill('101');await save.click();assert.equal(writes.length,before);assert(await fee.evaluate(e=>e.validity.rangeOverflow));await fee.fill('9.25');
  readDown=true;await admin.evaluate(()=>window.dispatchEvent(new Event('focus')));await admin.getByRole('alert').waitFor();assert.equal(await fee.inputValue(),'9.25');assert(await save.isDisabled());
  readDown=false;await admin.evaluate(()=>window.dispatchEvent(new Event('focus')));await admin.getByRole('alert').waitFor({state:'detached'});assert.equal(await fee.inputValue(),'9.25');
  writeMode='deny';await save.click();await admin.getByRole('status').filter({hasText:'نشست ادمین'}).waitFor();assert.equal(await fee.inputValue(),'9.25');assert.equal(policy.feeBps,825);
  writeMode='uncertain';await save.click();await admin.getByRole('status').filter({hasText:'قطعی نیست'}).waitFor();assert(await save.isDisabled());assert.equal(policy.feeBps,925);assert.equal(await fee.inputValue(),'9.25');
  const uncertainWrites=writes.length;await reload.click();await admin.getByRole('alert').waitFor({state:'detached'});assert.equal(writes.length,uncertainWrites);assert.equal(await fee.inputValue(),'9.25');
  await manual.fill('');await tr.fill('');await save.click();await admin.getByText('سیاست قیمت‌گذاری فروشگاه ذخیره شد.',{exact:true}).waitFor();assert.equal(policy.manualUsdToman,null);assert.equal('TR' in policy.countryFees,false);
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=pricing-state]').textContent).policy.manualUsdToman===null);await page.getByText('USD derived from Tether',{exact:true}).waitFor();
  await admin.setViewportSize({width:375,height:812});assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('invalid fees, read outage, expired-session response, uncertain committed save recovery and automatic USD');

  feed={...feed,rates:null,fx:null,sources:{...feed.sources,fx:{state:'unavailable',fetchedAt:null,refreshFailed:true}}};
  await page.getByRole('button',{name:'Fetch market rates',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=pricing-state]').textContent).error);
  assert.equal((await state()).rates.fetchedAt,asOf);assert.notEqual((await state()).rates.sample,true);
  await page.clock.fastForward(16*60*1000);await page.getByText('Cached rates are stale; currency checkout is paused.',{exact:true}).waitFor();
  await page.getByText('Fresh rates and a valid pricing policy are required.',{exact:true}).waitFor();assert.equal((await state()).rates.fetchedAt,asOf);assert.equal(JSON.stringify((await saved())[0]),frozen);
  await page.getByRole('button',{name:'FIXTURE add kg',exact:true}).click();await page.getByRole('button',{name:'FIXTURE checkout',exact:true}).click();assert(await page.getByRole('button',{name:'Review order & total',exact:true}).isDisabled());
  await page.getByRole('button',{name:'FIXTURE rates',exact:true}).click();
  check('partial failure keeps original age; stale rates block converter/checkout without changing paid invoice');
  await page.getByText('Test tool: fictional rates',{exact:true}).click();await page.getByRole('button',{name:'Use sample rates for testing',exact:true}).click();await page.getByText(/Sample rates are active/).waitFor();
  assert.equal((await state()).rates.sample,true);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('roya-market-rates-v1')).fetchedAt),asOf);
  await page.reload();await page.getByText('Cached rates are stale; currency checkout is paused.',{exact:true}).waitFor();assert.notEqual((await state()).rates.sample,true);assert.equal(JSON.stringify((await saved())[0]),frozen);
  check('sample requires explicit opt-in, never overwrites live cache and disappears on reload');

  await page.clock.setSystemTime(new Date(base));feed=freshFeed(300000);await page.getByRole('button',{name:'Fetch market rates',exact:true}).click();await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=pricing-state]').textContent).rates?.usdTomanMicros===300000000000);
  assert.equal(JSON.stringify((await saved())[0]),frozen);await page.getByRole('button',{name:'FIXTURE checkout',exact:true}).click();await page.getByRole('button',{name:'Fill sample details',exact:true}).click();await page.getByRole('button',{name:'Review order & total',exact:true}).click();await page.getByRole('button',{name:'Create test invoice',exact:true}).click();
  const expiring=(await saved())[0];assert.equal(expiring.paymentState,'PENDING');assert(Date.parse(expiring.quote.expiresAt)<=base+15*60*1000);
  await page.clock.fastForward(11*60*1000);await page.getByText('Invoice expired',{exact:true}).waitFor();assert.equal((await saved())[0].paymentState,'EXPIRED');assert.deepEqual((await saved())[0].quote,expiring.quote);assert.equal(JSON.stringify((await saved())[1]),frozen);
  check('pending invoice expires without altering its quote or earlier paid invoice');
  await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'FIXTURE rates',exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.goto(origin+'/fixture/?country=DE&locale=fa');await page.getByText('نرخ ارز و قیمت خرید شما',{exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(unexpected,[]);
  console.log('PRICING FORM BROWSER PASS: unsaved drafts, real two-tab updates, version conflicts, manual/default/country fees, invalid input, read/session failures and uncertain-save recovery. Mock loopback HTTP complements existing real PostgreSQL tests.');
  console.log('RATE SAFETY BROWSER PASS: explicit provenance, Persian converter, partial outage and stale checkout guard, original cache age, opt-in sample/reload, frozen paid invoice, pending expiry and FA/EN mobile. No market/provider/VPS requests or real orders/payments/SMS.');
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(done=>server.close(done));stop();clearTimeout(watchdog);}
