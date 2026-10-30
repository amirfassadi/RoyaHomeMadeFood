import {encode} from 'next-auth/jwt';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cpSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';

async function main(){
 const url=process.env.ROYA_INTEGRATION_DATABASE_URL;
 if(!url||!/^\/(roya_test|roya_integration_test)$/.test(new URL(url).pathname))throw new Error('Product render check requires an isolated integration database.');
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
 const slug=`render-check-${randomUUID()}`;
 let buyerId:string|undefined,reviewOrderId:string|undefined,adminId:string|undefined,categoryId:string|undefined,productId:string|undefined,zoneId:string|undefined,orderId:string|undefined,logs='',spawnError:Error|undefined;
 const port=3417,sessionSecret='isolated-render-check-session-secret-only';
 // The product is deliberately created after next build: its slug must work
 // on the first request without having been included in generateStaticParams.
 // Match the deployed standalone layout rather than reusing next start's
 // build-time data cache (which intentionally contains an empty catalog).
 cpSync('public','.next/standalone/public',{recursive:true});
 cpSync('.next/static','.next/standalone/.next/static',{recursive:true});
 const maintenanceCategory=await db.category.create({data:{slug:slug+'-maintenance',nameFa:'آزمون انقضا',nameEn:'Expiry check'}});
 const maintenanceProduct=await db.product.create({data:{slug:slug+'-maintenance',categoryId:maintenanceCategory.id,nameFa:'آزمون انقضا',nameEn:'Expiry check',descriptionFa:'محصول تست موقت',descriptionEn:'Temporary test product',priceToman:1000,unit:'PACK',priceBasisQuantity:1,minOrderQuantity:1,orderStepQuantity:1,stockQuantity:0,preparationMinutes:0}});
 const zone=await db.deliveryZone.create({data:{cityFa:slug,cityEn:'Test',nameFa:slug,nameEn:'Test',feeToman:0,deliveryMinutes:0}});zoneId=zone.id;
 await db.productDailyUsage.create({data:{productId:maintenanceProduct.id,day:'2026-10-01',quantity:1}});
 const pending=await db.order.create({data:{trackingCode:'ROYA-'+randomUUID().replaceAll('-','').slice(0,24).toUpperCase(),idempotencyKey:randomUUID(),requestFingerprint:'0'.repeat(64),locale:'en',capacityDay:'2026-10-01',customerName:'Expiry test',mobile:'09120000001',address:'Temporary test address',city:'Test',deliveryZoneId:zone.id,deliveryZoneNameSnapshot:'Test',paymentMethod:'BANK_TRANSFER',paymentStatus:'PENDING',subtotalToman:1000,deliveryFeeToman:0,totalToman:1000,longestPreparationMinutes:0,zoneDeliveryMinutes:0,estimatedDeliveryAt:new Date(),reservationExpiresAt:new Date(0),items:{create:{productId:maintenanceProduct.id,productNameFa:'آزمون',productNameEn:'Test',unit:'PACK',quantity:1,priceBasisQuantity:1,unitPriceToman:1000,lineTotalToman:1000,preparationMinutes:0,stockReserved:true}}}});orderId=pending.id;
 const server=spawn(process.execPath,['.next/standalone/server.js'],{env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),DATABASE_URL:url,DIRECT_URL:url,ROYA_DEMO_CATALOG:'0',SITES_STATIC_PREVIEW:'0',NEXTAUTH_SECRET:sessionSecret,NEXTAUTH_URL:`http://127.0.0.1:${port}`,NEXT_PUBLIC_SITE_URL:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe']});
 server.on('error',error=>{spawnError=error;});
 const capture=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-20000);};
 server.stdout.on('data',capture);server.stderr.on('data',capture);
 try{
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){
   if(spawnError)throw spawnError;
   if(server.exitCode!==null)throw new Error('Production server exited before readiness.');
   try{const response=await fetch(`http://127.0.0.1:${port}/api/health/`,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
   await delay(250);
  }
  assert(ready,'Production server did not become ready.');
  const admin=await db.user.create({data:{name:'Render check admin',role:'ADMIN',adminOwner:true}});adminId=admin.id;
  const jwt=await encode({secret:sessionSecret,token:{adminId:admin.id,sessionVersion:admin.sessionVersion},maxAge:600});
  const headers={Cookie:`next-auth.session-token=${jwt}`,'User-Agent':'Googlebot'};
  const api=await fetch(`http://127.0.0.1:${port}/api/admin/data/?section=order&id=${pending.id}`,{headers,signal:AbortSignal.timeout(20000)});
  const apiBody=await api.json();assert.equal(api.status,200,`Admin detail API failed: ${JSON.stringify(apiBody)}`);assert.equal(apiBody.detail.id,pending.id);
  const detail=await fetch(`http://127.0.0.1:${port}/admin/orders/${pending.id}/`,{headers,signal:AbortSignal.timeout(20000)});
  const detailHtml=await detail.text();assert.equal(detail.status,200,`Admin page returned ${detail.status}`);assert(detailHtml.includes('جزئیات سفارش')&&!detailHtml.includes('پنل در دسترس نیست'),'Authenticated admin order page did not render.');
  console.log('Authenticated production admin order API and page render OK for a runtime-created order.');
  const workspace=await fetch(`http://127.0.0.1:${port}/api/admin/campaigns/`,{headers,signal:AbortSignal.timeout(20000)});assert.equal(workspace.status,200);assert.equal((await workspace.json()).policy.enabled,false,'Customer delivery must stay disabled by default.');
  const buyer=await db.user.create({data:{name:'Runtime review buyer',role:'CUSTOMER',mobile:`09${String(Math.floor(Math.random()*1e9)).padStart(9,'0')}`,email:`${randomUUID()}@example.com`,mobileVerifiedAt:new Date()}});buyerId=buyer.id;
  const reportAt=new Date().toISOString(),bankId='00000000-0000-4000-8000-000000000001';
  const reviewOrder=await db.order.create({data:{userId:buyer.id,trackingCode:'ROYA-'+randomUUID().replaceAll('-','').slice(0,24).toUpperCase(),idempotencyKey:randomUUID(),requestFingerprint:'0'.repeat(64),locale:'fa',capacityDay:'2026-10-30',customerName:buyer.name,mobile:buyer.mobile!,address:'Runtime review test address',city:'Test',deliveryZoneId:zone.id,deliveryZoneNameSnapshot:'Test',paymentMethod:'BANK_TRANSFER',paymentStatus:'PENDING',subtotalToman:1000,deliveryFeeToman:0,totalToman:1000,longestPreparationMinutes:5,zoneDeliveryMinutes:5,estimatedDeliveryAt:new Date(),transferReviewStatus:'PENDING',transferReport:{reference:'12345678',amountToman:1000,paidAt:reportAt,reportedAt:reportAt,accountId:bankId,note:''},bankTransferSnapshot:{accounts:[{id:bankId,holder:'Runtime test',card:'6037000000000000',iban:'',active:true}]}}});reviewOrderId=reviewOrder.id;
  const reviewPage=await fetch(`http://127.0.0.1:${port}/admin/orders/${reviewOrder.id}/`,{headers,signal:AbortSignal.timeout(20000)});const reviewHtml=await reviewPage.text();assert.equal(reviewPage.status,200);assert(reviewHtml.includes('رد واریز و ثبت دلیل'));assert(reviewHtml.includes('هنوز تأیید یا رد نشده'));
  const rejected=await fetch(`http://127.0.0.1:${port}/api/admin/orders/transfer-reject/`,{method:'POST',headers:{...headers,Origin:`http://127.0.0.1:${port}`,'Content-Type':'application/json'},body:JSON.stringify({id:reviewOrder.id,expectedReportAt:reportAt,reason:'Runtime bank reference not received'}),signal:AbortSignal.timeout(20000)});assert.equal(rejected.status,200,await rejected.text());
  assert.equal((await db.order.findUniqueOrThrow({where:{id:reviewOrder.id}})).transferReviewStatus,'REJECTED');assert.equal(await db.customerNotice.count({where:{orderId:reviewOrder.id,status:'HELD'}}),1);
  const customerJwt=await encode({secret:sessionSecret,token:{customerId:buyer.id,sessionVersion:buyer.sessionVersion},maxAge:600});
  const account=await fetch(`http://127.0.0.1:${port}/fa/account/`,{headers:{Cookie:`next-auth.session-token=${customerJwt}`,'User-Agent':'Googlebot'},signal:AbortSignal.timeout(20000)});const accountHtml=await account.text();assert.equal(account.status,200);assert(accountHtml.includes('Runtime bank reference not received'));assert(accountHtml.includes('خبرها و پیشنهادها را ایمیلی دریافت کنم'));
  console.log('Production bank-review reminder, rejection API, held notification, disabled campaign delivery and buyer inbox render OK.');

  let expired=false;
  for(let n=0;n<40;n++){if((await db.order.findUniqueOrThrow({where:{id:pending.id}})).status==='CANCELLED'){expired=true;break;}await delay(250);}
  assert(expired,'Production startup did not run reservation expiry.');
  assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:maintenanceProduct.id}})).stockQuantity),1);
  console.log('Production reservation worker automatically expired a stale order and released stock.');
  const category=await db.category.create({data:{slug,nameFa:'دسته آزمون رندر',nameEn:'Render test category'}});categoryId=category.id;
  const product=await db.product.create({data:{slug,categoryId,nameFa:'محصول آزمون رندر',nameEn:'Product render verification',descriptionFa:'محصول موقت برای بررسی اجرای صفحه محصول',descriptionEn:'Temporary product for verifying production page rendering.',priceToman:100000,unit:'PACK',priceBasisQuantity:1,minOrderQuantity:1,orderStepQuantity:1,preparationMinutes:60}});productId=product.id;
  assert.equal(await db.product.count({where:{id:productId,active:true,category:{active:true}}}),1,'Runtime product fixture is not visible in the test database.');
  for(const locale of ['fa','en']){
   const response=await fetch(`http://127.0.0.1:${port}/${locale}/products/${slug}/`,{headers:{'User-Agent':'Googlebot'},signal:AbortSignal.timeout(20000)});
   const html=await response.text();
   assert.equal(response.status,200,`${locale} product failed: ${html.slice(0,500)}`);
   assert(html.includes(locale==='fa'?product.nameFa:product.nameEn),'Product content missing.');
   assert.equal((html.match(/<h1\b/g)??[]).length,1,'Expected one visible product heading.');
   console.log(`Production product render OK: ${locale}, new runtime slug, HTTP 200.`);
  }
  const missing=await fetch(`http://127.0.0.1:${port}/fa/products/missing-${randomUUID()}/`,{headers:{'User-Agent':'Googlebot'},signal:AbortSignal.timeout(20000)});
  assert.equal(missing.status,404,'Missing products must return a real 404.');
  console.log('Missing product correctly returns HTTP 404.');
 }catch(error){console.error(logs);throw error;}
 finally{
  server.kill('SIGTERM');
  await Promise.race([new Promise<void>(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',()=>resolve());}),delay(5000)]);
  if(server.exitCode===null)server.kill('SIGKILL');
  if(reviewOrderId)await db.order.deleteMany({where:{id:reviewOrderId}});
  if(buyerId)await db.user.deleteMany({where:{id:buyerId}});
  if(adminId)await db.user.deleteMany({where:{id:adminId}});
  if(orderId)await db.order.deleteMany({where:{id:orderId}});
  if(zoneId)await db.deliveryZone.deleteMany({where:{id:zoneId}});
  await db.product.deleteMany({where:{id:maintenanceProduct.id}});
  await db.category.deleteMany({where:{id:maintenanceCategory.id}});
  if(productId)await db.product.deleteMany({where:{id:productId}});
  if(categoryId)await db.category.deleteMany({where:{id:categoryId}});
  await db.$disconnect();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
