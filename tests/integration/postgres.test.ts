import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaClient} from '../../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {bankTransferDetails,confirmTransfer} from '../../src/lib/server/manual-payment';
import {placeOrder} from '../../src/lib/server/checkout';
import {changeOrderStatus} from '../../src/lib/server/admin-orders';
import {authorizeCustomer} from '../../src/lib/server/customer-otp';
import {otpDigest} from '../../src/lib/customer/otp';
import {changeAdminPassword} from '../../src/lib/server/admin-security';
import {hashPassword,verifyPassword} from '../../src/lib/admin/password';
import {saveCommunication} from '../../src/lib/server/communications';
import {expireOrderReservation} from '../../src/lib/server/reservations';
import {verifyCheckoutCode} from '../../src/lib/server/checkout-mobile';
import {sendVerificationSms} from '../../src/lib/server/sms';
const url=process.env.ROYA_INTEGRATION_DATABASE_URL;
// Never fall back to DATABASE_URL, and never run on a storefront database.
if(!url||!/^\/(roya_test|roya_integration_test)$/.test(new URL(url).pathname))throw new Error('Set ROYA_INTEGRATION_DATABASE_URL to an isolated roya_test database');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
const prefix=`test-${randomUUID()}`;
let category:any,zone:any,admin:any,oldSmsPolicy:any;
const checkoutChallengeIds:string[]=[];
const userIds:string[]=[],productIds:string[]=[],challengeIds:string[]=[],messageIds:string[]=[],announcementIds:string[]=[];
before(async()=>{
 Object.assign(process.env,{DATABASE_URL:url,ROYA_DEMO_CATALOG:'0',CUSTOMER_ACCOUNTS_ENABLED:'1',NEXTAUTH_SECRET:'test-only-session-secret'.repeat(2),CUSTOMER_OTP_SECRET:'test-only-otp-secret'.repeat(2),KAVENEGAR_API_KEY:'test-never-sent',KAVENEGAR_OTP_TEMPLATE:'test'});delete process.env.SITES_STATIC_PREVIEW;
 Object.assign(globalThis,{royaDb:db});
 oldSmsPolicy=await db.setting.findUnique({where:{key:'sms-policy'}});
 await db.setting.upsert({where:{key:'sms-policy'},create:{key:'sms-policy',value:{enabled:true}},update:{value:{enabled:true}}});
 category=await db.category.create({data:{slug:prefix,nameFa:'دسته آزمایشی',nameEn:'Integration test'}});
 zone=await db.deliveryZone.create({data:{cityFa:prefix,cityEn:'Test',nameFa:prefix,nameEn:'Test',feeToman:1000,deliveryMinutes:30}});
 admin=await db.user.create({data:{name:'Integration admin',mobile:`09${String(Math.floor(Math.random()*1e9)).padStart(9,'0')}`,role:'ADMIN',passwordHash:await hashPassword('Initial test password 123')}});userIds.push(admin.id);
});
after(async()=>{
 // Delete only this suite's fixtures, in foreign-key order.
 const orders=await db.order.findMany({where:{deliveryZoneId:zone?.id??'never'},select:{id:true}}),ids=orders.map(o=>o.id);
 await db.cryptoPayment.deleteMany({where:{orderId:{in:ids}}});
 await db.paymentAttempt.deleteMany({where:{orderId:{in:ids}}});await db.order.deleteMany({where:{id:{in:ids}}});
 await db.productDailyUsage.deleteMany({where:{productId:{in:productIds}}});await db.product.deleteMany({where:{id:{in:productIds}}});
 await db.checkoutMobileChallenge.deleteMany({where:{id:{in:checkoutChallengeIds}}});
 await db.customerLoginChallenge.deleteMany({where:{id:{in:challengeIds}}});await db.marketingConsentEvent.deleteMany({where:{userId:{in:userIds}}});await db.user.deleteMany({where:{id:{in:userIds}}});
 await db.contactMessage.deleteMany({where:{id:{in:messageIds}}});await db.clubAnnouncement.deleteMany({where:{id:{in:announcementIds}}});await db.adminAudit.deleteMany({where:{adminId:admin?.id??'never'}});
 if(oldSmsPolicy)await db.setting.update({where:{key:'sms-policy'},data:{value:oldSmsPolicy.value}});else await db.setting.deleteMany({where:{key:'sms-policy'}});
 if(zone)await db.deliveryZone.delete({where:{id:zone.id}});if(category)await db.category.delete({where:{id:category.id}});await db.$disconnect();
});
async function product(){const p=await db.product.create({data:{slug:`${prefix}-${randomUUID()}`,nameFa:'محصول آزمایشی',nameEn:'Test product',descriptionFa:'فقط آزمون',descriptionEn:'Only testing',categoryId:category.id,priceToman:100000,unit:'PIECE',priceBasisQuantity:1,minOrderQuantity:1,orderStepQuantity:1,stockQuantity:1,dailyCapacity:1,preparationMinutes:120}});productIds.push(p.id);const proofs=[];for(let n=0;n<3;n++){const id=randomUUID();checkoutChallengeIds.push(id);await db.checkoutMobileChallenge.create({data:{id,mobile:'09120000001',verifier:'0'.repeat(64),ready:true,verifiedAt:new Date(),expiresAt:new Date(Date.now()+300000),proofExpiresAt:new Date(Date.now()+1800000),proofHash:createHash('sha256').update('a'.repeat(64)).digest('hex')}});proofs.push({challengeId:id,token:'a'.repeat(64)});}return {...p,proofs};}
function input(p:any,key=randomUUID()){return {mobileProof:p.proofs.shift(),items:[{productId:p.id,quantity:1}],zoneId:zone.id,discountCode:'',name:'Test buyer',mobile:'09120000001',address:'Integration test address',notes:'',locale:'fa' as const,paymentMethod:'CASH_ON_DELIVERY' as const,idempotencyKey:key,expectedTotal:101000};}
test('PostgreSQL serializes the last stock/capacity unit and cancellation releases it once',async()=>{
 const p=await product(),results=await Promise.allSettled([placeOrder(input(p)),placeOrder(input(p))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const order=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value;assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:p.id}})).stockQuantity),0);assert.equal(order.userId,null);assert.equal(order.longestPreparationMinutes+order.zoneDeliveryMinutes,150);
 await Promise.all([changeOrderStatus(order.id,'PENDING','CANCELLED',admin.id),changeOrderStatus(order.id,'PENDING','CANCELLED',admin.id)]);
 assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:p.id}})).stockQuantity),1);assert.equal(Number((await db.productDailyUsage.findFirstOrThrow({where:{productId:p.id}})).quantity),0);assert.equal(await db.orderStatusHistory.count({where:{orderId:order.id,status:'CANCELLED'}}),1);
});
test('PostgreSQL returns one order for concurrent identical idempotency keys',async()=>{const p=await product(),payload=input(p),orders=await Promise.all([placeOrder(payload),placeOrder(payload)]);assert.equal(orders[0].id,orders[1].id);assert.equal(await db.order.count({where:{idempotencyKey:payload.idempotencyKey}}),1);});
test('OTP redemption is single-use under real row/advisory locks and only new member orders are linked',async()=>{
 const id=randomUUID(),mobile=`09${String(Math.floor(Math.random()*1e9)).padStart(9,'0')}`,code='001234';challengeIds.push(id);
 await db.customerLoginChallenge.create({data:{id,mobile,name:'Verified buyer',marketingSms:false,ready:true,verifier:otpDigest(process.env.CUSTOMER_OTP_SECRET!,id,mobile,code),expiresAt:new Date(Date.now()+300000)}});
 const result=await Promise.all([authorizeCustomer({challengeId:id,code}),authorizeCustomer({challengeId:id,code})]);assert.equal(result.filter(Boolean).length,1);
 const account=result.find(Boolean)!;userIds.push(account.id);const owner=await db.user.findUniqueOrThrow({where:{id:account.id}});assert.equal(owner.role,'CUSTOMER');assert.equal(owner.marketingSms,false);assert.equal(await db.marketingConsentEvent.count({where:{userId:owner.id}}),1);
 const p=await product(),order=await placeOrder({...input(p),mobile},{id:owner.id,mobile,sessionVersion:owner.sessionVersion});assert.equal(order.userId,owner.id);
 const another=await product(),guest=await placeOrder(input(another),{id:owner.id,mobile,sessionVersion:owner.sessionVersion});assert.equal(guest.userId,null);
});
test('admin password change verifies old credentials and revokes current sessions',async()=>{
 const before=await db.user.findUniqueOrThrow({where:{id:admin.id}});await assert.rejects(()=>changeAdminPassword(admin.id,'Wrong password','New test password 456',before.sessionVersion),/CURRENT_PASSWORD/);
 await changeAdminPassword(admin.id,'Initial test password 123','New test password 456',before.sessionVersion);const updated=await db.user.findUniqueOrThrow({where:{id:admin.id}});assert.equal(updated.sessionVersion,before.sessionVersion+1);assert(await verifyPassword('New test password 456',updated.passwordHash));assert(!await verifyPassword('Initial test password 123',updated.passwordHash));
});
test('contact read state is idempotent and stale announcement edits cannot overwrite a newer version',async()=>{
 const message=await db.contactMessage.create({data:{name:'Test sender',mobile:'09120000001',message:'Integration contact test',locale:'fa'}});messageIds.push(message.id);
 await saveCommunication({action:'message-read',id:message.id,read:true},admin.id);await saveCommunication({action:'message-read',id:message.id,read:true},admin.id);assert.equal(await db.adminAudit.count({where:{targetId:message.id,action:'CONTACT_READ'}}),1);
 const data={titleFa:prefix,titleEn:'Test announcement',bodyFa:'خبر آزمایشی برای تست',bodyEn:'Integration test announcement',startsAt:null,expiresAt:null,active:false};
 await saveCommunication({action:'announcement',announcement:data},admin.id);const a=await db.clubAnnouncement.findFirstOrThrow({where:{titleFa:prefix}});announcementIds.push(a.id);
 await saveCommunication({action:'announcement',announcement:{...data,id:a.id,expectedUpdatedAt:a.updatedAt.toISOString(),active:true}},admin.id);
 await assert.rejects(()=>saveCommunication({action:'announcement',announcement:{...data,id:a.id,expectedUpdatedAt:'2000-01-01T00:00:00.000Z'}},admin.id),/CONFLICT/);
});

test('crypto checkout snapshots USD, rejects stale pricing and cannot prepare or release an uncertain payment',async()=>{
 Object.assign(process.env,{ROYA_INTERNATIONAL_ENABLED:'1',BTCPAY_URL:'https://gateway.example',BTCPAY_STORE_ID:'store',BTCPAY_API_KEY:'test-only-api-key-0000',BTCPAY_WEBHOOK_SECRET:'test-only-webhook-secret'.repeat(2),ROYA_USD_RATE_TOMAN:'100000',ROYA_USD_RATE_EXPIRES_AT:'2099-01-01T00:00:00Z',NEXT_PUBLIC_SITE_URL:'https://shop.example'});
 const p=await product(),payload={...input(p),paymentMethod:'BTCPAY' as const,buyerEmail:'buyer@example.com',expectedUsdCents:101};
 await assert.rejects(()=>placeOrder({...payload,expectedUsdCents:100}),/PRICE_CHANGED/);
 const [a,b]=await Promise.all([placeOrder(payload),placeOrder(payload)]);assert.equal(a.id,b.id);assert.equal(a.userId,null);assert.equal(a.buyerEmail,'buyer@example.com');
 const payment=await db.cryptoPayment.findUniqueOrThrow({where:{orderId:a.id}});assert.equal(payment.amountUsdCents,101);assert.equal(payment.tomanPerUsd,100000);
 await assert.rejects(()=>changeOrderStatus(a.id,'PENDING','PREPARING',admin.id),/PAYMENT_PENDING/);
 await db.cryptoPayment.update({where:{id:payment.id},data:{requestState:'UNKNOWN'}});
 await assert.rejects(()=>changeOrderStatus(a.id,'PENDING','CANCELLED',admin.id),/PAYMENT_PENDING/);
 await db.cryptoPayment.update({where:{id:payment.id},data:{requestState:'NEW'}});
 await changeOrderStatus(a.id,'PENDING','CANCELLED',admin.id);assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:p.id}})).stockQuantity),1);
});


test('bank transfer saves active destinations per order, retries once and confirms only matched bank funds',async()=>{
 const old=await db.setting.findUnique({where:{key:'bank-transfer'}});
 const accounts=[{id:randomUUID(),holder:'Integration holder A',card:'6037000000000000',iban:'',active:true},{id:randomUUID(),holder:'Integration holder B',card:'',iban:'IR'+'0'.repeat(24),active:true}];
 try{
  await db.setting.upsert({where:{key:'bank-transfer'},create:{key:'bank-transfer',value:{enabled:false,accounts:[]}},update:{value:{enabled:false,accounts:[]}}});
  const p=await product(),payload={...input(p),paymentMethod:'BANK_TRANSFER' as const};
  await assert.rejects(()=>placeOrder(payload),/BANK_TRANSFER_UNAVAILABLE/);
  assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:p.id}})).stockQuantity),1);
  await db.setting.update({where:{key:'bank-transfer'},data:{value:{enabled:true,accounts}}});
  const [a,b]=await Promise.all([placeOrder(payload),placeOrder(payload)]);
  assert.equal(a.id,b.id);assert.equal(a.paymentStatus,'PENDING');assert(a.paymentReference);
  assert.equal((await bankTransferDetails(a.bankTransferSnapshot)).accounts.length,2);
  await db.setting.update({where:{key:'bank-transfer'},data:{value:{enabled:false,accounts:[]}}});
  assert.equal((await placeOrder(payload)).id,a.id);
  assert.equal((await bankTransferDetails(a.bankTransferSnapshot)).accounts[0].holder,'Integration holder A');
  await assert.rejects(()=>changeOrderStatus(a.id,'PENDING','PREPARING',admin.id),/PAYMENT_PENDING/);
  const confirmation={id:a.id,reference:'BANK-'+randomUUID(),amountToman:a.totalToman};
  await assert.rejects(()=>confirmTransfer({...confirmation,amountToman:a.totalToman-1},admin.id),/PAYMENT_AMOUNT/);
  await Promise.all([confirmTransfer(confirmation,admin.id),confirmTransfer(confirmation,admin.id)]);
  const paid=await db.order.findUniqueOrThrow({where:{id:a.id}});
  assert.equal(paid.paymentStatus,'PAID');assert.equal(paid.estimatedDeliveryAt.getTime()-paid.paymentConfirmedAt!.getTime(),150*60000);
  assert.equal(await db.adminAudit.count({where:{targetId:a.id,action:'BANK_TRANSFER_CONFIRMED'}}),1);
  await changeOrderStatus(a.id,'PENDING','PREPARING',admin.id);
 }finally{
  if(old)await db.setting.upsert({where:{key:'bank-transfer'},create:{key:'bank-transfer',value:old.value!},update:{value:old.value!}});
  else await db.setting.deleteMany({where:{key:'bank-transfer'}});
 }
});

test('guest verification is mandatory, consumed atomically and reusable only by the identical order retry',async()=>{
 const p=await product(),payload=input(p);
 await assert.rejects(()=>placeOrder({...payload,mobileProof:undefined}),/MOBILE_VERIFICATION_REQUIRED/);
 await assert.rejects(()=>placeOrder({...payload,mobile:'09120000002'}),/MOBILE_VERIFICATION_REQUIRED/);
 assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:p.id}})).stockQuantity),1);
 // Repricing failure rolls back proof consumption as well as inventory.
 await assert.rejects(()=>placeOrder({...payload,expectedTotal:1}),/PRICE_CHANGED/);
 const order=await placeOrder(payload);assert(order.reservationExpiresAt);
 assert.equal((await placeOrder(payload)).id,order.id);
 await assert.rejects(()=>placeOrder({...payload,idempotencyKey:randomUUID()}),/MOBILE_VERIFICATION_REQUIRED/);
});

test('real locks expire one reservation exactly once and preserve stock when a paid order is checked',async()=>{
 const p=await product(),order=await placeOrder(input(p));
 await db.order.update({where:{id:order.id},data:{reservationExpiresAt:new Date(0)}});
 const results=await Promise.all([expireOrderReservation(order.id),expireOrderReservation(order.id)]);
 assert.equal(results.filter(Boolean).length,1);
 assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:p.id}})).stockQuantity),1);
 assert.equal(await db.orderStatusHistory.count({where:{orderId:order.id,status:'CANCELLED'}}),1);
 const fresh=await db.order.findUniqueOrThrow({where:{id:order.id}});assert(fresh.reservationExpiredAt);assert.equal(fresh.paymentStatus,'PENDING');
 const other=await product(),paid=await placeOrder(input(other));
 await db.order.update({where:{id:paid.id},data:{paymentStatus:'PAID',reservationExpiresAt:new Date(0)}});
 assert.equal(await expireOrderReservation(paid.id),false);
 assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:other.id}})).stockQuantity),0);
});

test('guest OTP redemption commits one proof under concurrent real database locks',async()=>{
 const id=randomUUID(),mobile='09120000001';checkoutChallengeIds.push(id);
 await db.checkoutMobileChallenge.create({data:{id,mobile,ready:true,verifier:otpDigest(process.env.CUSTOMER_OTP_SECRET!,id,mobile,'123456'),expiresAt:new Date(Date.now()+300000)}});
 const results=await Promise.allSettled([verifyCheckoutCode(id,'123456'),verifyCheckoutCode(id,'123456')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const record=await db.checkoutMobileChallenge.findUniqueOrThrow({where:{id}});assert(record.verifiedAt);assert(record.proofHash);assert.equal(record.attempts,1);
});

test('persistent SMS test budget permits only five concurrent provider calls, with no real SMS',async()=>{
 const old=await db.smsTestBudget.findUnique({where:{id:'initial-five'}}),original=globalThis.fetch;
 const oldMode=process.env.ROYA_SMS_MODE,oldMobiles=process.env.ROYA_SMS_TEST_MOBILES;let calls=0;
 try{
  await db.smsTestBudget.deleteMany({where:{id:'initial-five'}});
  process.env.ROYA_SMS_MODE='test';process.env.ROYA_SMS_TEST_MOBILES='09120000001';
  globalThis.fetch=async()=>{calls++;return Response.json({return:{status:200},entries:[{messageid:1}]});};
  const results=await Promise.allSettled(Array.from({length:12},()=>sendVerificationSms('09120000001','123456')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.equal(calls,5);
  assert.equal((await db.smsTestBudget.findUniqueOrThrow({where:{id:'initial-five'}})).used,5);
 }finally{
  globalThis.fetch=original;
  if(oldMode===undefined)delete process.env.ROYA_SMS_MODE;else process.env.ROYA_SMS_MODE=oldMode;
  if(oldMobiles===undefined)delete process.env.ROYA_SMS_TEST_MOBILES;else process.env.ROYA_SMS_TEST_MOBILES=oldMobiles;
  await db.smsTestBudget.deleteMany({where:{id:'initial-five'}});if(old)await db.smsTestBudget.create({data:old});
 }
});

test('pausing SMS permits guest checkout without proof and preserves the SMS test budget',async()=>{
 const before=await db.smsTestBudget.findUnique({where:{id:'initial-five'}});
 try{
  await db.setting.update({where:{key:'sms-policy'},data:{value:{enabled:false}}});
  const p=await product(),payload=input(p);
  const order=await placeOrder({...payload,mobileProof:undefined});assert(order.reservationExpiresAt);assert.equal(order.userId,null);
  await assert.rejects(()=>sendVerificationSms('09120000001','123456'),/SMS_PAUSED/);
  assert.deepEqual(await db.smsTestBudget.findUnique({where:{id:'initial-five'}}),before);
 }finally{await db.setting.update({where:{key:'sms-policy'},data:{value:{enabled:true}}});}
});
