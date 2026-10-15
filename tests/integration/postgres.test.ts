import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '../../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {placeOrder} from '../../src/lib/server/checkout';
import {changeOrderStatus} from '../../src/lib/server/admin-orders';
import {authorizeCustomer} from '../../src/lib/server/customer-otp';
import {otpDigest} from '../../src/lib/customer/otp';
import {changeAdminPassword} from '../../src/lib/server/admin-security';
import {hashPassword,verifyPassword} from '../../src/lib/admin/password';
import {saveCommunication} from '../../src/lib/server/communications';
const url=process.env.ROYA_INTEGRATION_DATABASE_URL;
// Never fall back to DATABASE_URL, and never run on a storefront database.
if(!url||!/^\/(roya_test|roya_integration_test)$/.test(new URL(url).pathname))throw new Error('Set ROYA_INTEGRATION_DATABASE_URL to an isolated roya_test database');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
const prefix=`test-${randomUUID()}`;
let category:any,zone:any,admin:any;
const userIds:string[]=[],productIds:string[]=[],challengeIds:string[]=[],messageIds:string[]=[],announcementIds:string[]=[];
before(async()=>{
 Object.assign(process.env,{DATABASE_URL:url,ROYA_DEMO_CATALOG:'0',CUSTOMER_ACCOUNTS_ENABLED:'1',NEXTAUTH_SECRET:'test-only-session-secret'.repeat(2),CUSTOMER_OTP_SECRET:'test-only-otp-secret'.repeat(2),KAVENEGAR_API_KEY:'test-never-sent',KAVENEGAR_OTP_TEMPLATE:'test'});delete process.env.SITES_STATIC_PREVIEW;
 Object.assign(globalThis,{royaDb:db});
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
 await db.customerLoginChallenge.deleteMany({where:{id:{in:challengeIds}}});await db.marketingConsentEvent.deleteMany({where:{userId:{in:userIds}}});await db.user.deleteMany({where:{id:{in:userIds}}});
 await db.contactMessage.deleteMany({where:{id:{in:messageIds}}});await db.clubAnnouncement.deleteMany({where:{id:{in:announcementIds}}});await db.adminAudit.deleteMany({where:{adminId:admin?.id??'never'}});
 if(zone)await db.deliveryZone.delete({where:{id:zone.id}});if(category)await db.category.delete({where:{id:category.id}});await db.$disconnect();
});
async function product(){const p=await db.product.create({data:{slug:`${prefix}-${randomUUID()}`,nameFa:'محصول آزمایشی',nameEn:'Test product',descriptionFa:'فقط آزمون',descriptionEn:'Only testing',categoryId:category.id,priceToman:100000,unit:'PIECE',priceBasisQuantity:1,minOrderQuantity:1,orderStepQuantity:1,stockQuantity:1,dailyCapacity:1,preparationMinutes:120}});productIds.push(p.id);return p;}
function input(p:any,key=randomUUID()){return {items:[{productId:p.id,quantity:1}],zoneId:zone.id,discountCode:'',name:'Test buyer',mobile:'09120000001',address:'Integration test address',notes:'',locale:'fa' as const,paymentMethod:'CASH_ON_DELIVERY' as const,idempotencyKey:key,expectedTotal:101000};}
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
