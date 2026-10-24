// Actual cart/checkout/tracking/admin-local-order components, controlled prices
// and browser storage. No external services, real SMS, accounts or orders.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ROYA_TEST_BROWSER_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({entryPoints:[resolve(root,'tests/browser/storefront-fixture.tsx')],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',minify:true,
 alias:{'next/navigation':resolve(root,'tests/browser/storefront-navigation.ts')},define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.__NEXT_IMAGE_OPTS':JSON.stringify(require('next/dist/shared/lib/image-config').imageConfigDefault)}});
const directory=resolve(root,'.next/static/chunks');
const styles=(await Promise.all((await readdir(directory)).filter(n=>n.endsWith('.css')).map(n=>readFile(resolve(directory,n),'utf8')))).join('\n');
assert(styles.length>1000,'Build the application first.');
const writes=[];
const server=createServer(async(req,res)=>{
 if(req.method!=='GET'){writes.push(req.method+' '+req.url);res.writeHead(503);res.end();return;}
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
 if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(styles);return;}
 if(req.url.startsWith('/fixture/')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');return;}
 res.writeHead(404);res.end();
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.ROYA_TEST_BROWSER_EXECUTABLE?{executablePath:process.env.ROYA_TEST_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],external=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>{errors.push(e.message);console.error('STOREFRONT_FIXTURE_ERROR: '+e.message);});
 await page.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort();});
 const nav=view=>page.getByRole('button',{name:'FIXTURE '+view,exact:true}).click();
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('roya-prototype-orders-v1')||'[]'));
 await page.goto(origin+'/fixture/?locale=en');
 await page.getByRole('button',{name:'FIXTURE add half kg',exact:true}).click();
 let row=page.getByRole('article').filter({hasText:'Test cold cuts'});
 await row.getByRole('button',{name:'Increase quantity'}).click();
 await row.getByRole('button',{name:'Increase quantity'}).click();
 await row.getByRole('button',{name:'Increase quantity'}).click();
 await row.getByRole('button',{name:'Decrease quantity'}).click();
 assert.match(await row.getByRole('status').innerText(),/1\.5/);
 await page.getByRole('button',{name:'FIXTURE add limited',exact:true}).click();
 const limited=page.getByRole('article').filter({hasText:'Test limited product'});
 await limited.getByRole('button',{name:'Increase quantity'}).click();
 assert(await limited.getByRole('button',{name:'Increase quantity'}).isDisabled());
 await limited.getByRole('button',{name:'Remove',exact:true}).click();assert.equal(await limited.count(),0);

 const cases=[['IR','IRT','DOMESTIC_CARD',null],['TR','TRY','USDC_BSC',113225],['AE','AED','PAYPAL',8672],['DE','EUR','BTC_LIGHTNING',1889],['GB','GBP','PAYPAL',1653],['US','USD','PAYPAL',2361],['CA','CAD','BTC_LIGHTNING',3306],['OTHER','USD','USDC_BSC',2361]];
 const created=[];
 for(const [country,currency,method,total] of cases){
  await nav('cart');
  if(created.length){await page.getByRole('button',{name:'FIXTURE add half kg',exact:true}).click();await page.getByRole('article').filter({hasText:'Test cold cuts'}).getByRole('button',{name:'Increase quantity'}).click();await page.getByRole('article').filter({hasText:'Test cold cuts'}).getByRole('button',{name:'Increase quantity'}).click();}
  await page.getByLabel('Buyer country (test scenario)').selectOption(country);
  await page.locator('aside').getByText(new RegExp(country==='IR'?'Toman':currency)).first().waitFor();
  await nav('checkout');
  if(country==='IR'){
   await page.getByRole('button',{name:'Review order & total',exact:true}).click();
   assert(await page.getByLabel('Recipient name',{exact:true}).evaluate(input=>input.validity.valueMissing));
   assert.equal((await saved()).length,0);
  }
  await page.getByRole('button',{name:'Fill sample details',exact:true}).click();
  if(country==='IR'){
   await page.getByLabel('Recipient’s Iranian mobile').fill('+49123456789');
   await page.getByRole('button',{name:'Review order & total',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'Check the name'}).waitFor();
   await page.getByLabel('Recipient’s Iranian mobile').fill('09123456789');
  }
  if(country==='CA')await page.getByLabel('Recipient’s Iranian mobile').fill('09121111111');
  for(const candidate of ['USDC_BSC','BTC_LIGHTNING','PAYPAL']){
   const radio=page.locator('input[type=radio][value="'+candidate+'"]');
   if(country==='IR')assert.equal(await radio.count(),0);
   else assert.equal(await radio.isDisabled(),candidate==='PAYPAL'&&['TR','OTHER'].includes(country));
  }
  await page.locator('input[type=radio][value="'+method+'"]').check();
  await page.getByLabel('Sample discount code').fill('BAD');
  await page.getByRole('button',{name:'Review order & total',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Use ROYA10'}).waitFor();
  await page.getByLabel('Sample discount code').fill('ROYA10');
  await page.getByRole('button',{name:'Review order & total',exact:true}).click();
  if(country==='IR'){
   await page.getByRole('button',{name:'Create test invoice',exact:true}).waitFor();
   await page.getByLabel('Buyer country (test scenario)').selectOption('DE');
   await page.getByRole('button',{name:'Review order & total',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Create test invoice',exact:true}).count(),0);
   assert.equal(await page.locator('input[type=radio][value=DOMESTIC_CARD]').count(),0);
   await page.getByLabel('Buyer country (test scenario)').selectOption('IR');
   await page.locator('input[type=radio][value=DOMESTIC_CARD]').check();
   await page.getByRole('button',{name:'Review order & total',exact:true}).click();
  }
  await page.getByRole('button',{name:'Create test invoice',exact:true}).click();
  await page.getByRole('button',{name:'Simulate success',exact:true}).click();
  const orders=await saved(),order=orders[0];created.push(order);
  assert.equal(order.details.country,country);assert.equal(order.details.method,method);assert.equal(order.paymentState,'SIMULATED_PAID');
  assert.equal(order.items[0].quantity,1.5);assert.equal(order.items[0].lineTotalToman,2250000);
  assert.equal(order.quote.subtotalToman,2250000);assert.equal(order.quote.discountToman,100000);assert.equal(order.quote.deliveryFeeToman,50000);assert.equal(order.quote.totalToman,2200000);
  if(country==='IR')assert.equal(order.quote.pricing,undefined);
  else{assert.equal(order.quote.pricing.snapshot.currency,currency);assert.equal(order.quote.pricing.snapshot.feeBps,country==='TR'?300:750);assert.equal(order.quote.pricing.totalMinor,total);}
  assert(Date.parse(order.details.deliveryAt)>=Date.parse(order.createdAt)+48*60*60*1000);
 }
 console.log('STOREFRONT BROWSER PASS: quantity/stock/removal, guest validation, discount cap, 48-hour preparation, all eight country currencies/fees and USDC/BSC, Lightning, PayPal/domestic selection with successful browser-only invoices.');

 const target=created[0],other=created.find(o=>o.details.country==='CA');
 await nav('tracking');await page.getByLabel('Tracking code',{exact:true}).fill(target.trackingCode);
 await page.getByLabel('Recipient mobile',{exact:true}).fill('09121111111');await page.getByRole('button',{name:'Find test order',exact:true}).click();await page.getByRole('alert').waitFor();
 await page.getByLabel('Recipient mobile',{exact:true}).fill('۰۹۱۲۳۴۵۶۷۸۹');await page.getByRole('button',{name:'Find test order',exact:true}).click();
 console.log('TRACKING LOOKUP FIXTURE: '+JSON.stringify({target:target.trackingCode,mobileMatches:target.details.mobile==='09123456789',visible:await page.locator('main').innerText()}));
 await page.getByText('Payment success simulated',{exact:true}).waitFor();
 await nav('admin');
 const details=page.locator('details').filter({has:page.getByText(target.trackingCode,{exact:true})});await details.locator('summary').click();
 await details.getByRole('button',{name:'در حال آماده‌سازی (آزمایشی)',exact:true}).click();
 await nav('tracking');await page.getByLabel('Tracking code',{exact:true}).fill(target.trackingCode);await page.getByLabel('Recipient mobile',{exact:true}).fill('09123456789');await page.getByRole('button',{name:'Find test order',exact:true}).click();await page.getByRole('heading',{name:'Preparing (simulated)',exact:true}).waitFor();

 await page.getByRole('button',{name:'I do not have my tracking code',exact:true}).click();
 const mobile=page.getByLabel('Mobile recorded on the order',{exact:true});await mobile.fill('۰۹۱۲۳۴۵۶۷۸۹');
 assert.equal(await page.getByText('Sample orders for this mobile',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Show test code',exact:true}).click();
 const codeOutput=page.getByLabel('Displayed test code',{exact:true}),code=await codeOutput.innerText();assert.match(code,/^[0-9]{6}$/);
 await page.getByLabel('Test verification code',{exact:true}).fill(code==='999999'?'000000':'999999');
 await page.getByRole('button',{name:'Verify test code',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByText('Sample orders for this mobile',{exact:true}).count(),0);
 await page.getByLabel('Test verification code',{exact:true}).fill(code);await page.getByRole('button',{name:'Verify test code',exact:true}).click();
 await page.getByRole('heading',{name:'Sample orders for this mobile',exact:true}).waitFor();
 assert.equal(await page.getByText(other.trackingCode,{exact:true}).count(),0);
 await page.getByRole('button',{name:new RegExp(target.trackingCode)}).click();await page.getByRole('heading',{name:'Preparing (simulated)',exact:true}).waitFor();
 await mobile.fill('09121111111');assert.equal(await page.getByRole('heading',{name:'Sample orders for this mobile',exact:true}).count(),0);assert.equal(await page.getByRole('heading',{name:'Preparing (simulated)',exact:true}).count(),0);
 await page.reload();await nav('tracking');await page.getByRole('button',{name:'I do not have my tracking code',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'Sample orders for this mobile',exact:true}).count(),0);assert.equal((await saved()).length,8);
 await page.clock.install();
 await page.getByLabel('Mobile recorded on the order',{exact:true}).fill('09123456789');await page.getByRole('button',{name:'Show test code',exact:true}).click();
 const expiredCode=await page.getByLabel('Displayed test code',{exact:true}).innerText();
 await page.clock.fastForward(5*60*1000+1000);await page.getByText('The code expired. Request a fresh code to continue.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Verify test code',exact:true}).count(),0);
 await page.getByRole('button',{name:'New test code',exact:true}).click();
 const freshCode=await page.getByLabel('Displayed test code',{exact:true}).innerText();
 for(let n=0;n<5;n++){await page.getByLabel('Test verification code',{exact:true}).fill(freshCode==='999999'?'000000':'999999');await page.getByRole('button',{name:'Verify test code',exact:true}).click();}
 await page.getByRole('alert').filter({hasText:'No attempts remain'}).waitFor();
 assert(await page.getByRole('button',{name:'New test code',exact:true}).isDisabled());
 await page.clock.fastForward(61*1000);await page.getByRole('button',{name:'New test code',exact:true}).click();
 const viewingCode=await page.getByLabel('Displayed test code',{exact:true}).innerText();await page.getByLabel('Test verification code',{exact:true}).fill(viewingCode);await page.getByRole('button',{name:'Verify test code',exact:true}).click();
 await page.getByRole('heading',{name:'Sample orders for this mobile',exact:true}).waitFor();await page.clock.fastForward(10*60*1000+1000);await page.getByText('Viewing access expired. Verify the mobile again.',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Sample orders for this mobile',exact:true}).count(),0);
 assert(expiredCode.length===6);await page.clock.resume();
 await page.setViewportSize({width:375,height:812});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'English tracking overflows mobile.');
 await page.goto(origin+'/fixture/?locale=fa');await nav('tracking');await page.getByRole('button',{name:'کد پیگیری را ندارم',exact:true}).click();await page.getByLabel('موبایل ثبت‌شده در سفارش',{exact:true}).fill('09123456789');await page.getByRole('button',{name:'نمایش کد آزمایشی',exact:true}).click();
 const faCode=await page.getByLabel('کد نمایش‌داده‌شدهٔ آزمایشی',{exact:true}).innerText();await page.getByLabel('کد تأیید آزمایشی',{exact:true}).fill(faCode);await page.getByRole('button',{name:'تأیید کد آزمایشی',exact:true}).click();await page.getByRole('heading',{name:'سفارش‌های نمونهٔ این شماره',exact:true}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Persian tracking overflows mobile.');
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(external,[]);
 console.log('TRACKING RECOVERY BROWSER PASS: actual code/mobile tracking, local admin fulfilment, optional demo code, no pre-verification list, wrong-code/mobile isolation, reload, expiry/attempt/cooldown/access expiry, Persian/English mobile and zero external requests or POSTs. Real SMS/account authorization is not covered.');
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
