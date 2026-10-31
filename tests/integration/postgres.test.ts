import {replyToContact} from '../../src/lib/server/contact-replies';
import {consumeRateLimits} from '../../src/lib/server/rate-limit';
import {supportAction,customerSupportHistory,supportInbox} from '../../src/lib/server/support';
import {rejectTransfer} from '../../src/lib/server/manual-payment';
import {manageCampaign,deliveryPolicy,deliveryPolicyKey} from '../../src/lib/server/customer-messages';
import {dispatchPendingNotices} from '../../src/lib/server/notice-delivery';
import {reportCustomerTransfer} from '../../src/lib/server/transfer-report';
import {authorizeCustomerPassword} from '../../src/lib/server/customer-otp';
import {saveCustomerAddress} from '../../src/lib/server/customer-addresses';
import {saveEmailSettings,requestEmailTest,verifyEmailTest} from '../../src/lib/server/admin-email';
import {emailConfigured} from '../../src/lib/server/email';
import {customerOrderHistory,customerOrderTracking,changeCustomerPassword} from '../../src/lib/server/customer-account';
import {createAdminUser,updateAdminUser} from '../../src/lib/server/admin-users';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaClient,Prisma} from '../../src/generated/prisma/client';
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
 Object.assign(process.env,{DATABASE_URL:url,ROYA_DEMO_CATALOG:'0',CUSTOMER_ACCOUNTS_ENABLED:'1',NEXTAUTH_SECRET:'test-only-session-secret'.repeat(2),CUSTOMER_OTP_SECRET:'test-only-otp-secret'.repeat(2),KAVENEGAR_API_KEY:'test-never-sent',KAVENEGAR_OTP_TEMPLATE:'test',RESEND_API_KEY:'test-never-sent',CUSTOMER_EMAIL_FROM:'verify@example.com'});delete process.env.SITES_STATIC_PREVIEW;
 Object.assign(globalThis,{royaDb:db});
 oldSmsPolicy=await db.setting.findUnique({where:{key:'sms-policy'}});
 await db.setting.upsert({where:{key:'sms-policy'},create:{key:'sms-policy',value:{enabled:true}},update:{value:{enabled:true}}});
 category=await db.category.create({data:{slug:prefix,nameFa:'دسته آزمایشی',nameEn:'Integration test'}});
 zone=await db.deliveryZone.create({data:{cityFa:prefix,cityEn:'Test',nameFa:prefix,nameEn:'Test',feeToman:1000,deliveryMinutes:30}});
 admin=await db.user.create({data:{name:'Integration admin',mobile:`09${String(Math.floor(Math.random()*1e9)).padStart(9,'0')}`,role:'ADMIN',adminOwner:true,passwordHash:await hashPassword('Initial test password 123')}});userIds.push(admin.id);
});
after(async()=>{
 // Delete only this suite's fixtures, in foreign-key order.
 const orders=await db.order.findMany({where:{deliveryZoneId:zone?.id??'never'},select:{id:true}}),ids=orders.map(o=>o.id);
 await db.cryptoPayment.deleteMany({where:{orderId:{in:ids}}});
 await db.paymentAttempt.deleteMany({where:{orderId:{in:ids}}});await db.order.deleteMany({where:{id:{in:ids}}});
 await db.productDailyUsage.deleteMany({where:{productId:{in:productIds}}});await db.product.deleteMany({where:{id:{in:productIds}}});
 await db.checkoutMobileChallenge.deleteMany({where:{id:{in:checkoutChallengeIds}}});
 await db.customerRegistration.deleteMany({where:{id:{in:challengeIds}}});await db.marketingConsentEvent.deleteMany({where:{userId:{in:userIds}}});const supportThreads=await db.supportThread.findMany({where:{userId:{in:userIds}},select:{id:true}}); await db.supportMessage.deleteMany({where:{threadId:{in:supportThreads.map(t=>t.id)}}}); await db.supportThread.deleteMany({where:{userId:{in:userIds}}}); await db.user.deleteMany({where:{id:{in:userIds}}});
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
 await db.customerRegistration.create({data:{id,mobile,email:`${id}@example.com`,name:'Verified buyer',passwordHash:await hashPassword('Integration customer password 123'),marketingSms:false,mobileReady:true,mobileVerifiedAt:new Date(),mobileVerifier:otpDigest(process.env.CUSTOMER_OTP_SECRET!,`mobile:${id}`,mobile,code),emailReady:true,emailVerifier:otpDigest(process.env.CUSTOMER_OTP_SECRET!,`email:${id}`,`${id}@example.com`,code),emailExpiresAt:new Date(Date.now()+300000),expiresAt:new Date(Date.now()+900000)}});
 const result=await Promise.all([authorizeCustomer({challengeId:id,code}),authorizeCustomer({challengeId:id,code})]);assert.equal(result.filter(Boolean).length,1);
 const account=result.find(Boolean)!;userIds.push(account.id);const owner=await db.user.findUniqueOrThrow({where:{id:account.id}});assert.equal(owner.role,'CUSTOMER');assert.equal(owner.marketingSms,false);assert.equal(await db.marketingConsentEvent.count({where:{userId:owner.id}}),1);
 const p=await product(),order=await placeOrder({...input(p),mobile},{id:owner.id,mobile,sessionVersion:owner.sessionVersion});assert.equal(order.userId,owner.id);
 const another=await product(),guest=await placeOrder(input(another),{id:owner.id,mobile,sessionVersion:owner.sessionVersion});assert.equal(guest.userId,owner.id);
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

test('owner creates email-only limited admins and access changes revoke their sessions',async()=>{
 const actor=await db.user.findUniqueOrThrow({where:{id:admin.id}});
 const created=await createAdminUser(actor.id,actor.sessionVersion,{name:'Integration limited admin',identifier:`${randomUUID()}@example.com`,temporaryPassword:'Temporary integration password 123',permissions:['orders']});userIds.push(created.id);
 assert.equal(created.mobile,null);assert.equal(created.adminOwner,false);assert.equal(created.mustChangePassword,true);
 const stored=await db.user.findUniqueOrThrow({where:{id:created.id}});assert(await verifyPassword('Temporary integration password 123',stored.passwordHash));
 await assert.rejects(()=>createAdminUser(stored.id,stored.sessionVersion,{name:'Escalation',identifier:`${randomUUID()}@example.com`,temporaryPassword:'Temporary integration password 456',permissions:['bankAccounts']}),/FORBIDDEN/);
 const updated=await updateAdminUser(actor.id,actor.sessionVersion,{id:created.id,expectedSessionVersion:created.sessionVersion,active:true,permissions:['orders','bankAccounts']});assert.equal(updated.sessionVersion,created.sessionVersion+1);assert(updated.adminPermissions.includes('bankAccounts'));
});

test('panel email configuration is encrypted and only a received test code enables the email service',async()=>{
 const old=await db.setting.findUnique({where:{key:'customer-email'}}),originalFetch=globalThis.fetch;let code='';
 try{
  const settings=await saveEmailSettings({enabled:true,from:'account@mail.example.com',apiKey:'re_integration_test_not_a_real_key',expectedUpdatedAt:old?.updatedAt.toISOString()??null},admin.id);
  assert.equal(await emailConfigured(),false);const stored=await db.setting.findUniqueOrThrow({where:{key:'customer-email'}});assert(!JSON.stringify(stored.value).includes('re_integration_test_not_a_real_key'));
  globalThis.fetch=async()=>{throw new Error('intercepted test must supply fetch mock');};
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(String(options?.body));code=body.text.match(/\d{6}/)[0];return Response.json({id:'integration-email-mock'});};
  const sent=await requestEmailTest({to:'owner@example.com',expectedUpdatedAt:settings.updatedAt},admin.id);assert.equal(await emailConfigured(),false);
  const results=await Promise.allSettled([verifyEmailTest({testId:sent.testId,code},admin.id),verifyEmailTest({testId:sent.testId,code},admin.id)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await emailConfigured(),true);
 }finally{globalThis.fetch=originalFetch;if(old)await db.setting.upsert({where:{key:'customer-email'},create:{key:'customer-email',value:old.value!},update:{value:old.value!}});else await db.setting.deleteMany({where:{key:'customer-email'}});}
});
test('customer history is private and a password change invalidates the old session version',async()=>{
 const owner=await db.user.findFirstOrThrow({where:{role:'CUSTOMER',mobileVerifiedAt:{not:null}}});
 const history=await customerOrderHistory(owner.id,1);assert(history.orders.length>0);const code=history.orders[0].trackingCode;
 assert.equal((await customerOrderTracking(owner.id,code)).trackingCode,code);await assert.rejects(()=>customerOrderTracking(admin.id,code),/NOT_FOUND/);
 await changeCustomerPassword(owner.id,owner.sessionVersion,'Integration customer password 123','Updated customer password 456');const changed=await db.user.findUniqueOrThrow({where:{id:owner.id}});assert.equal(changed.sessionVersion,owner.sessionVersion+1);assert(await verifyPassword('Updated customer password 456',changed.passwordHash));assert(changed.mobileVerifiedAt);assert.equal(changed.emailVerifiedAt,null);
});


test('customer signup, address, short concurrent invoices, transfer report, admin verification and delivery complete together',async()=>{
 const oldBank=await db.setting.findUnique({where:{key:'bank-transfer'}});
 await db.setting.upsert({where:{key:'bank-transfer'},create:{key:'bank-transfer',value:{enabled:true,accounts:[{id:'00000000-0000-4000-8000-000000000001',holder:'Flow test shop',card:'6037000000000000',iban:'',active:true}]}},update:{value:{enabled:true,accounts:[{id:'00000000-0000-4000-8000-000000000001',holder:'Flow test shop',card:'6037000000000000',iban:'',active:true}]}}});
 try{
 const id=randomUUID(),mobile=`09${String(Math.floor(Math.random()*1e9)).padStart(9,'0')}`,email=`${id}@example.com`,code='004321',password='Complete flow password 123';challengeIds.push(id);
 await db.customerRegistration.create({data:{id,mobile,email,name:'Complete flow buyer',passwordHash:await hashPassword(password),mobileReady:true,mobileVerifier:otpDigest(process.env.CUSTOMER_OTP_SECRET!,`mobile:${id}`,mobile,code),expiresAt:new Date(Date.now()+900000)}});
 const signed=await authorizeCustomer({challengeId:id,code});assert(signed);userIds.push(signed.id);
 assert.equal((await authorizeCustomerPassword({identifier:email,password}))?.id,signed.id);
 assert.equal((await db.user.findUniqueOrThrow({where:{id:signed.id}})).emailVerifiedAt,null);
 await saveCustomerAddress(signed.id,{title:'Home',recipientName:'Recipient',mobile,zoneId:zone.id,address:'Complete flow test address',destination:null});
 const bank=await bankTransferDetails(),p1=await product(),p2=await product(),customer={id:signed.id,mobile,sessionVersion:signed.sessionVersion};
 const orders=await Promise.all([p1,p2].map(p=>placeOrder({...input(p),paymentMethod:'BANK_TRANSFER'},customer)));
 for(const o of orders){assert.match(o.trackingCode,/^\d{8}-\d{4,}$/);assert.equal(o.invoiceNumber,o.trackingCode);assert.equal(o.paymentReference,o.trackingCode.replace('-',''));}
 assert.equal(Math.abs(Number(orders[0].trackingCode.split('-')[1])-Number(orders[1].trackingCode.split('-')[1])),1);
 const order=orders[0],reportInput={trackingCode:order.trackingCode,reference:`BANK-${id}`,amountToman:order.totalToman,paidAt:new Date().toISOString(),accountId:bank.accounts[0].id,note:'Customer submitted bank receipt reference',expectedReportedAt:null};
 await assert.rejects(()=>reportCustomerTransfer({id:admin.id,sessionVersion:0},reportInput),/NOT_FOUND/);
 const saved=await reportCustomerTransfer(customer,reportInput);assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).paymentStatus,'PENDING');
 await assert.rejects(()=>reportCustomerTransfer(customer,reportInput),/CONFLICT/);
 const confirmation={id:order.id,reference:reportInput.reference,amountToman:order.totalToman};
 await assert.rejects(()=>confirmTransfer(confirmation,admin.id),/CONFLICT/);
 await confirmTransfer({...confirmation,expectedReportAt:saved.report.reportedAt},admin.id);
 await confirmTransfer({...confirmation,expectedReportAt:saved.report.reportedAt},admin.id);
 const paid=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(paid.paymentStatus,'PAID');assert(paid.paymentConfirmedAt);assert(paid.estimatedDeliveryAt>paid.paymentConfirmedAt);
 await assert.rejects(()=>reportCustomerTransfer(customer,{...reportInput,expectedReportedAt:saved.report.reportedAt}),/TRANSITION/);
 await changeOrderStatus(order.id,'PENDING','PREPARING',admin.id);await changeOrderStatus(order.id,'PREPARING','SHIPPED',admin.id);await changeOrderStatus(order.id,'SHIPPED','DELIVERED',admin.id);
 const history=await customerOrderHistory(customer.id);assert(history.orders.some(o=>o.trackingCode===order.trackingCode&&o.status==='DELIVERED'&&o.paymentStatus==='PAID'));
 assert.equal((await customerOrderTracking(customer.id,order.trackingCode)).trackingCode,order.trackingCode);
 await assert.rejects(()=>customerOrderTracking(admin.id,order.trackingCode),/NOT_FOUND/);
 }finally{if(oldBank)await db.setting.update({where:{key:'bank-transfer'},data:{value:oldBank.value!}});else await db.setting.deleteMany({where:{key:'bank-transfer'}});}
});


test('bank reports hold reservations for review; rejection is audited and queued without sending; campaigns require consent and explicit release',async()=>{
 const oldPolicy=await db.setting.findUnique({where:{key:deliveryPolicyKey}}),oldBank=await db.setting.findUnique({where:{key:'bank-transfer'}}),campaignIds:string[]=[];
 const originalFetch=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw new Error('External sends forbidden in this test');};
 try{
 await db.setting.deleteMany({where:{key:deliveryPolicyKey}});assert.equal((await deliveryPolicy()).policy.enabled,false);
 const accountId='00000000-0000-4000-8000-000000000001';await db.setting.upsert({where:{key:'bank-transfer'},create:{key:'bank-transfer',value:{enabled:true,accounts:[{id:accountId,holder:'Test shop',card:'6037000000000000',iban:'',active:true}]}},update:{value:{enabled:true,accounts:[{id:accountId,holder:'Test shop',card:'6037000000000000',iban:'',active:true}]}}});
 const buyer=await db.user.create({data:{name:'Review test buyer',role:'CUSTOMER',mobile:`09${String(Math.floor(Math.random()*1e9)).padStart(9,'0')}`,email:`${randomUUID()}@example.com`,mobileVerifiedAt:new Date()}});userIds.push(buyer.id);
 const customer={id:buyer.id,mobile:buyer.mobile!,sessionVersion:buyer.sessionVersion},p=await product(),order=await placeOrder({...input(p),paymentMethod:'BANK_TRANSFER'},customer);
 const raw={trackingCode:order.trackingCode,reference:`BANK-${randomUUID()}`,amountToman:order.totalToman,paidAt:new Date().toISOString(),accountId,note:'Review test',expectedReportedAt:null};
 const first=await reportCustomerTransfer(customer,raw);let current=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(current.transferReviewStatus,'PENDING');assert.equal(current.reservationExpiresAt,null);
 await db.order.update({where:{id:order.id},data:{reservationExpiresAt:new Date(0)}});assert.equal(await expireOrderReservation(order.id),false);assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).status,'PENDING');assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:p.id}})).stockQuantity),0);
 const rejection={id:order.id,expectedReportAt:first.report.reportedAt,reason:'شماره پیگیری در حساب مقصد یافت نشد'};
 await Promise.all([rejectTransfer(rejection,admin.id),rejectTransfer(rejection,admin.id)]);current=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(current.transferReviewStatus,'REJECTED');assert.equal(current.paymentStatus,'PENDING');assert(current.reservationExpiresAt!>new Date());
 assert.equal(await db.customerNotice.count({where:{orderId:order.id,status:'HELD'}}),1);assert.equal(await db.adminAudit.count({where:{targetId:order.id,action:'BANK_TRANSFER_REJECTED'}}),1);await dispatchPendingNotices();assert.equal(requests,0);
 await assert.rejects(()=>confirmTransfer({id:order.id,reference:raw.reference,amountToman:order.totalToman,expectedReportAt:first.report.reportedAt},admin.id),/CONFLICT/);
 const corrected=await reportCustomerTransfer(customer,{...raw,reference:`BANK-${randomUUID()}`,expectedReportedAt:first.report.reportedAt});assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).transferReviewStatus,'PENDING');
 await confirmTransfer({id:order.id,reference:corrected.report.reference,amountToman:order.totalToman,expectedReportAt:corrected.report.reportedAt},admin.id);assert.equal((await db.order.findUniqueOrThrow({where:{id:order.id}})).paymentStatus,'PAID');
 const saved=await manageCampaign({action:'save',campaign:{title:'پیشنهاد جدید',body:'متن پیشنهاد تخفیف دوره‌ای آزمایشی',category:'DISCOUNT',purpose:'MARKETING',audience:'CUSTOMER',identifier:buyer.email!,preference:'EMAIL',notBefore:new Date().toISOString()}},admin.id);campaignIds.push(saved.id!);
 let c=await db.customerCampaign.findUniqueOrThrow({where:{id:saved.id}});assert.equal(c.status,'DRAFT');await assert.rejects(()=>manageCampaign({action:'prepare',id:c.id,expectedUpdatedAt:c.updatedAt.toISOString()},admin.id),/NO_RECIPIENTS/);
 await db.user.update({where:{id:buyer.id},data:{marketingEmail:true}});await manageCampaign({action:'prepare',id:c.id,expectedUpdatedAt:c.updatedAt.toISOString()},admin.id);c=await db.customerCampaign.findUniqueOrThrow({where:{id:c.id}});assert.equal(c.status,'PREPARED');assert.equal(await db.customerNotice.count({where:{campaignId:c.id,status:'HELD'}}),1);
 await assert.rejects(()=>manageCampaign({action:'release',id:c.id,expectedUpdatedAt:c.updatedAt.toISOString()},admin.id),/DELIVERY_DISABLED/);await dispatchPendingNotices();assert.equal(requests,0);
 }finally{globalThis.fetch=originalFetch;await db.customerCampaign.deleteMany({where:{id:{in:campaignIds}}});if(oldPolicy)await db.setting.upsert({where:{key:deliveryPolicyKey},create:{key:deliveryPolicyKey,value:oldPolicy.value!},update:{value:oldPolicy.value!}});else await db.setting.deleteMany({where:{key:deliveryPolicyKey}});if(oldBank)await db.setting.upsert({where:{key:'bank-transfer'},create:{key:'bank-transfer',value:oldBank.value!},update:{value:oldBank.value!}});else await db.setting.deleteMany({where:{key:'bank-transfer'}});}
});

test('support sequences, retries and read receipts serialize under PostgreSQL row locks',async()=>{
 const user=await db.user.create({data:{name:'Support test customer',mobileVerifiedAt:new Date(),emailVerifiedAt:null}});userIds.push(user.id);
 const actor={id:user.id,sessionVersion:user.sessionVersion,fromAdmin:false};
 const input={action:'send' as const,body:'First question',clientId:randomUUID()};
 await Promise.all([supportAction(actor,input),supportAction(actor,input)]);
 const thread=await db.supportThread.findUniqueOrThrow({where:{userId:user.id}});
 assert.equal(await db.supportMessage.count({where:{threadId:thread.id}}),1);
 const staff=await db.user.findUniqueOrThrow({where:{id:admin.id}});
 await Promise.all([
  supportAction(actor,{action:'send',body:'Another question',clientId:randomUUID()}),
  supportAction({id:staff.id,sessionVersion:staff.sessionVersion,fromAdmin:true},{action:'send',body:'Support reply',clientId:randomUUID()},thread.id)
 ]);
 const history=await customerSupportHistory(user.id);assert.deepEqual(history.messages.map(m=>m.sequence),[1,2,3]);
 assert((await supportInbox(1,true)).threads.some(t=>t.id===thread.id));
 await Promise.all([supportAction(actor,{action:'read',throughSequence:3}),supportAction(actor,{action:'read',throughSequence:1})]);
 assert.equal((await db.supportThread.findUniqueOrThrow({where:{id:thread.id}})).customerReadSequence,3);
 const other=await db.user.create({data:{name:'Other support customer'}});userIds.push(other.id);
 assert.equal((await customerSupportHistory(other.id)).threadId,null);
 const earlier=await customerSupportHistory(user.id,3);assert.deepEqual(earlier.messages.map(m=>m.sequence),[1,2]);
});


test('SMS quota reservation rolls back all buckets on rejection and serializes concurrent sends',async()=>{
 const globalKey=`${prefix}:quota:global`,mobileKey=`${prefix}:quota:mobile`,otherKey=`${prefix}:quota:other`;
 const quota=(key:string,limit:number,windowSeconds=60)=>({key,limit,windowSeconds});
 const keys=[globalKey,mobileKey,otherKey];
 try{
  const requests=await Promise.all(Array.from({length:6},()=>consumeRateLimits([quota(globalKey,30),quota(mobileKey,1)])));
  assert.equal(requests.filter(r=>r.allowed).length,1);
  assert(requests.filter(r=>!r.allowed).every(r=>r.retryAfter>0&&r.retryAfter<=60));
  assert.equal((await db.rateLimitBucket.findUniqueOrThrow({where:{key:globalKey}})).count,1);
  assert.equal((await db.rateLimitBucket.findUniqueOrThrow({where:{key:mobileKey}})).count,1);
  // One exhausted recipient cannot consume the global budget or a new bucket.
  assert.equal((await consumeRateLimits([quota(otherKey,10),quota(mobileKey,1),quota(globalKey,30)])).allowed,false);
  assert.equal(await db.rateLimitBucket.findUnique({where:{key:otherKey}}),null);
  assert.equal((await db.rateLimitBucket.findUniqueOrThrow({where:{key:globalKey}})).count,1);
  await db.rateLimitBucket.update({where:{key:mobileKey},data:{expiresAt:new Date(Date.now()-1000)}});
  assert.equal((await consumeRateLimits([quota(globalKey,30),quota(mobileKey,1)])).allowed,true);
  assert.equal((await db.rateLimitBucket.findUniqueOrThrow({where:{key:mobileKey}})).count,1);
  // The client must wait for the longest blocked window, not just the cooldown.
  await db.$executeRaw`UPDATE "RateLimitBucket" SET "count"=30, "expiresAt"=clock_timestamp()+INTERVAL '1 hour' WHERE "key"=${globalKey}`;
  const blocked=await consumeRateLimits([quota(globalKey,30,3600),quota(mobileKey,1)]);
  assert.equal(blocked.allowed,false);assert(blocked.retryAfter>3500&&blocked.retryAfter<=3600,`unexpected retry duration: ${blocked.retryAfter}`);
 }finally{await db.rateLimitBucket.deleteMany({where:{key:{in:keys}}});}
});


test('contact replies serialize concurrent retries, publish only to the matching member and send guest email once',async()=>{
 const memberMobile=`09${String(Math.floor(Math.random()*1e9)).padStart(9,'0')}`,guestMobile=`09${String(Math.floor(Math.random()*1e9)).padStart(9,'0')}`;
 const member=await db.user.create({data:{name:'Contact reply test',mobile:memberMobile,email:`${prefix}-contact@example.com`,mobileVerifiedAt:new Date()}});userIds.push(member.id);
 const contact=await db.contactMessage.create({data:{name:'Member',mobile:memberMobile,email:'untrusted-contact@example.com',message:'Member contact question',locale:'en'}});messageIds.push(contact.id);
 const guest=await db.contactMessage.create({data:{name:'Guest',mobile:guestMobile,email:'guest-test@example.com',message:'Guest contact question',locale:'en'}});messageIds.push(guest.id);
 const oldPolicy=await db.setting.findUnique({where:{key:'customer-delivery-policy'}}),originalFetch=globalThis.fetch;
 const payload={contactMessageId:contact.id,requestKey:randomUUID(),channel:'PANEL' as const,body:'Private contact answer'};
 try{
  await db.setting.upsert({where:{key:'customer-delivery-policy'},create:{key:'customer-delivery-policy',value:{enabled:false,transactional:false,marketing:false}},update:{value:{enabled:false,transactional:false,marketing:false}}});
  const replies=await Promise.all(Array.from({length:6},()=>replyToContact(payload,admin.id)));
  assert.equal(new Set(replies.map(r=>r.reply.id)).size,1);
  assert.equal(await db.contactReply.count({where:{contactMessageId:contact.id}}),1);
  assert.equal(await db.customerNotice.count({where:{userId:member.id,kind:'CONTACT_REPLY',status:'IN_APP'}}),1);
  assert.equal(await db.customerNotice.count({where:{userId:admin.id,kind:'CONTACT_REPLY'}}),0);
  await assert.rejects(()=>replyToContact({...payload,body:'Changed answer'},admin.id),/CONFLICT/);
  await db.setting.update({where:{key:'customer-delivery-policy'},data:{value:{enabled:true,transactional:true,marketing:false}}});
  let sends=0;globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://api.resend.com/emails');assert.deepEqual(JSON.parse(String(options?.body)).to,['guest-test@example.com']);sends++;return Response.json({id:'mock-contact-reply'});};
  const emailReply={contactMessageId:guest.id,requestKey:randomUUID(),channel:'EMAIL' as const,body:'Guest contact answer'};
  await Promise.all(Array.from({length:5},()=>replyToContact(emailReply,admin.id)));
  assert.equal(sends,1);assert.equal(await db.contactReply.count({where:{contactMessageId:guest.id,status:'ACCEPTED'}}),1);
  assert((await db.contactMessage.findUniqueOrThrow({where:{id:guest.id}})).readAt);
  // More concurrent requests than pool connections must not need a second connection inside the transaction.
  await Promise.all(Array.from({length:12},()=>replyToContact({...payload,requestKey:randomUUID()},admin.id)));
  assert.equal(await db.contactReply.count({where:{contactMessageId:contact.id}}),13);
 }finally{
  globalThis.fetch=originalFetch;
  if(oldPolicy)await db.setting.update({where:{key:oldPolicy.key},data:{value:oldPolicy.value??Prisma.JsonNull}});else await db.setting.deleteMany({where:{key:'customer-delivery-policy'}});
 }
});
