import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizeAdmin} from '../../src/lib/server/auth';
import {hashPassword} from '../../src/lib/admin/password';
import {changeOrderStatus} from '../../src/lib/server/admin-orders';
test('credentials enforce admin role, active account and shared rate limits',async()=>{
 process.env.DATABASE_URL='postgresql://test';process.env.NEXTAUTH_SECRET='x'.repeat(40);process.env.ROYA_DEMO_CATALOG='0';delete process.env.SITES_STATIC_PREVIEW;
 const user={id:'admin',name:'Admin',role:'ADMIN',active:true,twoFactorEnabled:false,sessionVersion:3,passwordHash:await hashPassword('A strong password 123')};let count=1;
 Object.assign(globalThis,{royaDb:{$queryRaw:async()=>[{count}],user:{findUnique:async()=>user}}});
 const credentials={mobile:'09123456789',password:'A strong password 123'};
 assert.equal((await authorizeAdmin(credentials))?.id,'admin');user.role='CUSTOMER';assert.equal(await authorizeAdmin(credentials),null);user.role='ADMIN';user.active=false;assert.equal(await authorizeAdmin(credentials),null);user.active=true;count=999;assert.equal(await authorizeAdmin(credentials),null);
});
function orderDb(method='CASH_ON_DELIVERY',requestState='NEW'){
 const order={id:'o',status:'PENDING',paymentMethod:method,paymentStatus:'UNPAID',inventoryReserved:true,capacityDay:'2026-10-10',discountCodeId:'discount',items:[{productId:'p',quantity:25,stockReserved:true}],paymentAttempts:[{requestState}]};let stock=100,usage=25,discount=1,history=0,audits=0;
 const tx={$queryRaw:async()=>[],order:{findUnique:async()=>structuredClone(order),update:async({data}:any)=>{Object.assign(order,data);}},product:{findUnique:async()=>({id:'p',stockQuantity:stock}),update:async({data}:any)=>{stock+=Number(data.stockQuantity.increment);}},productDailyUsage:{updateMany:async({where,data}:any)=>{assert.equal(where.day,'2026-10-10');if(usage<Number(where.quantity.gte))return {count:0};usage-=Number(data.quantity.decrement);return {count:1};}},discountCode:{updateMany:async()=>{discount--;return {count:1};}},orderStatusHistory:{create:async()=>{history++;}},adminAudit:{create:async()=>{audits++;}}};
 Object.assign(globalThis,{royaDb:{$transaction:async(fn:any)=>fn(tx)}});
 return {order,values:()=>({stock,usage,discount,history,audits})};
}
test('cancellation releases original-day capacity, stock and discount exactly once',async()=>{
 const db=orderDb();await changeOrderStatus('o','PENDING','CANCELLED','admin');assert.deepEqual(db.values(),{stock:125,usage:0,discount:0,history:1,audits:1});assert.equal(db.order.inventoryReserved,false);
 await changeOrderStatus('o','PENDING','CANCELLED','admin');assert.deepEqual(db.values(),{stock:125,usage:0,discount:0,history:1,audits:1});
});
test('UNKNOWN gateway attempts cannot release reserved inventory',async()=>{
 const db=orderDb('ZARINPAL','UNKNOWN');await assert.rejects(()=>changeOrderStatus('o','PENDING','CANCELLED','admin'),/PAYMENT_PENDING/);assert.deepEqual(db.values(),{stock:100,usage:25,discount:1,history:0,audits:0});
});
