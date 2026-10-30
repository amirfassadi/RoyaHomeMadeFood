import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateQuote,publicQuote,placeOrder} from '../../src/lib/server/checkout';
test('checkout re-quotes server fare, refuses changed totals and sandbox orders before reserving inventory',async()=>{
 const original=globalThis.fetch;
 process.env.ALOPEYK_ACCESS_TOKEN='test-only';process.env.ALOPEYK_ENVIRONMENT='production';
 let percent=1,enabled=true,created=0;
 let sessionVersion=0;const customer={id:'buyer',mobile:'09999999999',sessionVersion:0};
 const tx:any={orderDailySequence:{upsert:async()=>({last:1})},$queryRaw:async()=>[],user:{findUnique:async()=>({id:'buyer',active:true,role:'CUSTOMER',mobileVerifiedAt:new Date(),emailVerifiedAt:new Date(),sessionVersion})},product:{findMany:async()=>[{id:'p',nameFa:'غذا',nameEn:'Food',unit:'PIECE',minOrderQuantity:1,orderStepQuantity:1,stockQuantity:null,dailyCapacity:null,priceBasisQuantity:1,priceToman:200000,preparationMinutes:30}]},productDailyUsage:{findUnique:async()=>null,upsert:async()=>{}},deliveryZone:{findFirst:async()=>({id:'z',feeToman:50000,deliveryMinutes:30})},setting:{findUnique:async({where}:any)=>where.key==='sms-policy'?({value:{enabled:false}}):({value:{enabled,markupPercent:percent,originAddress:'Test shop address',senderName:'Test sender',senderPhone:'09121234567',origin:{lat:35.7,lng:51.4}}})},order:{findUnique:async()=>null,create:async({data}:any)=>{created++;return data;}}};
 Object.assign(globalThis,{royaDb:{$transaction:async(fn:any)=>fn(tx)}});
 const input={items:[{productId:'p',quantity:1}],zoneId:'z',discountCode:'',destination:{lat:35.8,lng:51.5}};
 try{
  globalThis.fetch=async()=>Response.json({status:'success',object:{status:'OK',price:100000}});
  assert.equal(publicQuote(await calculateQuote(tx,input)).totalToman,301000);
  const checkout={...input,name:'Test',mobile:'09123456789',address:'Test delivery address',notes:'',locale:'fa' as const,paymentMethod:'CASH_ON_DELIVERY' as const,idempotencyKey:'00000000-0000-4000-8000-000000000000',expectedTotal:301000};
  percent=2;await assert.rejects(()=>placeOrder(checkout),/PRICE_CHANGED/);assert.equal(created,0);
  const saved=await placeOrder({...checkout,expectedTotal:302000});assert.equal(JSON.parse(JSON.stringify(saved.shippingSnapshot)).markupPercent,2);assert.equal(saved.deliveryFeeToman,102000);
  process.env.ALOPEYK_ENVIRONMENT='sandbox';await assert.rejects(()=>placeOrder({...checkout,expectedTotal:302000}),/DELIVERY_UNAVAILABLE/);assert.equal(created,1);
  enabled=false;assert.equal((await calculateQuote(tx,input)).totalToman,250000);
  const linked=await placeOrder({...checkout,expectedTotal:250000},customer);assert.equal(linked.userId,'buyer');assert.notEqual(checkout.mobile,customer.mobile);
  sessionVersion=1;await assert.rejects(()=>placeOrder({...checkout,expectedTotal:250000},customer),/UNAUTHORIZED/);
 }finally{globalThis.fetch=original;delete process.env.ALOPEYK_ACCESS_TOKEN;delete process.env.ALOPEYK_ENVIRONMENT;delete (globalThis as any).royaDb;}
});
