import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expireLockedReservation} from '../../src/lib/server/reservations';
import {confirmTransfer} from '../../src/lib/server/manual-payment';
function setup(){
 const order:any={id:'order',status:'PENDING',paymentStatus:'PENDING',paymentMethod:'BANK_TRANSFER',totalToman:100000,inventoryReserved:true,reservationExpiresAt:new Date(0),reservationExpiredAt:null,capacityDay:'2026-10-28',discountCodeId:'discount',longestPreparationMinutes:10,zoneDeliveryMinutes:90,estimatedDeliveryAt:new Date(1),items:[{productId:'p',quantity:1,stockReserved:true}]};
 let released=0,history=0,discount=0;
 const tx:any={$queryRaw:async()=>[],order:{findUnique:async()=>({...order}),update:async({data}:any)=>Object.assign(order,data)},courierDispatch:{findUnique:async()=>null},product:{findUnique:async()=>({id:'p',stockQuantity:0}),update:async()=>{released++;}},productDailyUsage:{updateMany:async({where}:any)=>{assert.equal(where.day,'2026-10-28');return {count:1};}},discountCode:{updateMany:async()=>{discount++;return {count:1};}},orderStatusHistory:{create:async()=>{history++;}},adminAudit:{create:async()=>{}}};
 Object.assign(globalThis,{royaDb:{$transaction:async(fn:any)=>fn(tx)}});
 return {order,tx,counts:()=>({released,history,discount})};
}
test('expiration releases original-day stock/capacity/discount once and preserves pending gateway uncertainty',async()=>{
 const {order,tx,counts}=setup();assert(await expireLockedReservation(tx,order));
 assert.equal(order.status,'CANCELLED');assert.equal(order.inventoryReserved,false);assert.equal(order.paymentStatus,'PENDING');
 assert(!await expireLockedReservation(tx,order));assert.deepEqual(counts(),{released:1,history:1,discount:1});
});
test('paid, preparing, not-yet-due and active-courier reservations are never expired',async()=>{
 for(const change of [{paymentStatus:'PAID'},{status:'PREPARING'},{reservationExpiresAt:new Date(Date.now()+60000)}]){
  const {order,tx,counts}=setup();Object.assign(order,change);assert(!await expireLockedReservation(tx,order));assert.equal(counts().released,0);
 }
 const {order,tx}=setup();tx.courierDispatch.findUnique=async()=>({id:'dispatch'});assert(!await expireLockedReservation(tx,order));
});
test('late bank confirmation expires the reservation first and records refund review without reopening fulfilment',async()=>{
 const {order,counts}=setup();const eta=order.estimatedDeliveryAt;
 const input={id:order.id,amountToman:order.totalToman,reference:'BANK-123456'};
 await confirmTransfer(input,'admin');assert.equal(order.status,'CANCELLED');assert.equal(order.refundRequired,true);assert.equal(order.paymentStatus,'PAID');assert.equal(order.estimatedDeliveryAt,eta);
 await confirmTransfer(input,'admin');assert.equal(counts().released,1);
});

test('reported bank transfer waits for the admin decision even after the old deadline',async()=>{const {order,tx,counts}=setup();order.transferReviewStatus='PENDING';assert.equal(await expireLockedReservation(tx,order),false);assert.equal(order.status,'PENDING');assert.equal(counts().released,0);});
