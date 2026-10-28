import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchReadyOrder,syncCourierOrder} from '../../src/lib/server/courier-dispatch';
import {changeOrderStatus} from '../../src/lib/server/admin-orders';

function fixture(){
 const origin={lat:35.7,lng:51.4},destination={lat:35.8,lng:51.5};
 const order:any={id:'o',status:'PREPARING',paymentStatus:'PAID',paymentMethod:'BANK_TRANSFER',customerName:'Test buyer',mobile:'09123456789',address:'Test delivery address',deliveryNotes:'Unit 3',deliveryFeeToman:101000,totalToman:301000,shippingSnapshot:{provider:'ALOPEYK',origin,destination,courierFeeToman:100000,markupToman:1000,markupPercent:1,quotedAt:new Date().toISOString()}};
 const settings={enabled:true,markupPercent:1,origin,originAddress:'Test shop address',senderName:'Test sender',senderPhone:'09121234567'};
 let dispatch:any=null,creates=0,quoteCalls=0,fail=false,remoteStatus='new',wrong=false;
 const history:string[]=[],audits:string[]=[];
 const tx:any={$queryRaw:async()=>[],order:{findUnique:async()=>({...order,courierDispatch:dispatch}),findUniqueOrThrow:async()=>({...order}),update:async({data}:any)=>Object.assign(order,data)},setting:{findUnique:async()=>({value:settings})},courierDispatch:{findUnique:async()=>dispatch,findUniqueOrThrow:async()=>dispatch,create:async({data}:any)=>dispatch={...data,requestState:'REQUESTING',externalId:null,externalStatus:null,actualFeeToman:null},update:async({data}:any)=>Object.assign(dispatch,data),updateMany:async({where,data}:any)=>{if(dispatch?.requestState===where.requestState)Object.assign(dispatch,data);return {count:1};}},adminAudit:{create:async({data}:any)=>audits.push(data.action)},orderStatusHistory:{create:async({data}:any)=>history.push(data.status)}};
 // A deterministic stand-in for PostgreSQL's serialized order-row lock.
 let tail=Promise.resolve();
 Object.assign(globalThis,{royaDb:{...tx,$transaction:(fn:any)=>{const next=tail.then(()=>fn(tx));tail=next.catch(()=>{});return next;}}});
 process.env.ALOPEYK_ACCESS_TOKEN='test-never-sent';process.env.ALOPEYK_ENVIRONMENT='production';
 globalThis.fetch=async(url,init)=>{
  if(String(url).endsWith('price/calc')){quoteCalls++;return Response.json({status:'success',object:{status:'OK',price:95000}});}
  if(init?.method==='POST'){creates++;assert(dispatch,'Intent must be persisted before upstream creation');assert.equal(dispatch.requestState,'REQUESTING');if(fail)throw new Error('response lost');}
  const addresses=structuredClone(dispatch.requestSnapshot.addresses);if(wrong)addresses[1].lng+=1;
  return Response.json({status:'success',object:{id:123,status:remoteStatus,price:96000,addresses}});
 };
 return {order,settings,history,audits,get dispatch(){return dispatch;},get creates(){return creates;},get quoteCalls(){return quoteCalls;},fail:()=>{fail=true;},status:(s:string)=>{remoteStatus=s;},wrong:(v:boolean)=>{wrong=v;}};
}

test('ready dispatch persists once, blocks duplicate clicks and only ships after courier pickup',async()=>{
 const original=globalThis.fetch,env={...process.env};
 try{
  const f=fixture();
  const results=await Promise.allSettled([dispatchReadyOrder('o','admin'),dispatchReadyOrder('o','admin')]);
  assert(results.some(r=>r.status==='fulfilled'));assert.equal(f.creates,1);assert.equal(f.quoteCalls,1);
  assert.equal(f.dispatch.externalId,'123');assert.equal(f.order.status,'PREPARING');assert.equal(f.dispatch.actualFeeToman,96000);
  assert.equal(f.order.deliveryFeeToman,101000);assert.equal(f.order.totalToman,301000);
  await dispatchReadyOrder('o','admin');assert.equal(f.creates,1);
  await assert.rejects(()=>changeOrderStatus('o','PREPARING','CANCELLED','admin'),/COURIER_ACTIVE/);
  f.status('delivering');await syncCourierOrder('o','admin');assert.equal(f.order.status,'SHIPPED');
  f.status('delivered');await syncCourierOrder('o','admin');assert.equal(f.order.status,'DELIVERED');
  f.status('new');await syncCourierOrder('o','admin');assert.equal(f.dispatch.requestState,'COMPLETED');
  assert.deepEqual(f.history,['SHIPPED','DELIVERED']);assert.equal(f.creates,1);
 }finally{globalThis.fetch=original;process.env=env;delete (globalThis as any).royaDb;}
});

test('unpaid, unready, sandbox and changed-origin orders never create a courier',async()=>{
 const original=globalThis.fetch,env={...process.env};
 try{
  let f=fixture();f.order.paymentStatus='PENDING';await assert.rejects(()=>dispatchReadyOrder('o','admin'),/PAYMENT_PENDING/);assert.equal(f.creates,0);
  f=fixture();f.order.status='PENDING';await assert.rejects(()=>dispatchReadyOrder('o','admin'),/TRANSITION/);assert.equal(f.creates,0);
  f=fixture();process.env.ALOPEYK_ENVIRONMENT='sandbox';await assert.rejects(()=>dispatchReadyOrder('o','admin'),/DELIVERY_ENVIRONMENT/);assert.equal(f.creates,0);
  f=fixture();f.settings.origin={...f.settings.origin,lng:50};await assert.rejects(()=>dispatchReadyOrder('o','admin'),/SHIPPING_ORIGIN_CHANGED/);assert.equal(f.creates,0);
 }finally{globalThis.fetch=original;process.env=env;delete (globalThis as any).royaDb;}
});

test('lost creation response requires verified recovery and cannot trigger a second courier',async()=>{
 const original=globalThis.fetch,env={...process.env};
 try{
  const f=fixture();f.fail();await assert.rejects(()=>dispatchReadyOrder('o','admin'),/COURIER_REVIEW/);
  assert.equal(f.dispatch.requestState,'UNKNOWN');await assert.rejects(()=>dispatchReadyOrder('o','admin'),/COURIER_REVIEW/);assert.equal(f.creates,1);
  f.wrong(true);await assert.rejects(()=>syncCourierOrder('o','admin','123'),/COURIER_REVIEW/);assert.equal(f.dispatch.externalId,null);
  f.wrong(false);await syncCourierOrder('o','admin','123');assert.equal(f.dispatch.externalId,'123');assert.equal(f.creates,1);
  process.env.ALOPEYK_ENVIRONMENT='sandbox';await assert.rejects(()=>syncCourierOrder('o','admin'),/DELIVERY_ENVIRONMENT/);
 }finally{globalThis.fetch=original;process.env=env;delete (globalThis as any).royaDb;}
});
