import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bankTransferDetails,confirmTransfer,confirmTransferSchema} from '../../src/lib/server/manual-payment';
function setup(){
 const order={id:'order',paymentMethod:'BANK_TRANSFER',status:'PENDING',paymentStatus:'PENDING',totalToman:150000,longestPreparationMinutes:240,zoneDeliveryMinutes:60,transferReference:null,paymentConfirmedAt:null as Date|null,estimatedDeliveryAt:null as Date|null};
 const events:unknown[]=[];
 const tx={$queryRaw:async()=>[],order:{findUnique:async()=>({...order}),update:async({data}:any)=>Object.assign(order,data)},adminAudit:{create:async(data:unknown)=>{events.push(data);}}};
 Object.assign(globalThis,{royaDb:{$transaction:async(fn:any)=>fn(tx)}});
 return {order,events};
}
test('manual confirmation requires exact funds and starts delivery once from confirmation',async()=>{
 const s=setup();const input={id:'order',amountToman:150000,reference:'BANK-12345'};
 await assert.rejects(()=>confirmTransfer({...input,amountToman:15000},'admin'),/PAYMENT_AMOUNT/);
 assert.equal(s.order.paymentStatus,'PENDING');
 await confirmTransfer(input,'admin');
 assert.equal(s.order.paymentStatus,'PAID');
 assert.equal(s.order.estimatedDeliveryAt!.getTime()-s.order.paymentConfirmedAt!.getTime(),300*60000);
 const first=s.order.paymentConfirmedAt;
 await confirmTransfer(input,'admin');
 assert.equal(s.order.paymentConfirmedAt,first);assert.equal(s.events.length,1);
 await assert.rejects(()=>confirmTransfer({...input,reference:'OTHER-123'},'admin'),/CONFLICT/);
});
test('manual confirmation cannot settle cancelled orders or online gateway orders',async()=>{
 const s=setup();s.order.status='CANCELLED';
 const input={id:'order',amountToman:150000,reference:'BANK-12345'};
 await assert.rejects(()=>confirmTransfer(input,'admin'),/TRANSITION/);
 s.order.status='PENDING';s.order.paymentMethod='ZARINPAL';
 await assert.rejects(()=>confirmTransfer(input,'admin'),/TRANSITION/);
 assert.equal(s.order.paymentStatus,'PENDING');
});
test('bank destinations come from active admin accounts and snapshots survive later settings changes',async()=>{
 const account={id:'00000000-0000-4000-8000-000000000001',holder:'Test holder',card:'6037000000000000',iban:'',active:true};
 let value:unknown={enabled:true,accounts:[account,{...account,id:'00000000-0000-4000-8000-000000000002',holder:'Inactive',card:'6037000000000001',active:false}]};
 Object.assign(globalThis,{royaDb:{setting:{findUnique:async()=>({value})}}});
 const details=await bankTransferDetails();
 assert.equal(details.accounts.length,1);assert.equal(details.holder,'Test holder');
 value={enabled:false,accounts:[]};
 await assert.rejects(()=>bankTransferDetails(),/BANK_TRANSFER_UNAVAILABLE/);
 assert.equal((await bankTransferDetails({accounts:details.accounts})).card,'6037000000000000');
 assert.equal(confirmTransferSchema.safeParse({id:'order',amountToman:100,reference:'BANK-123',paymentStatus:'PAID'}).success,false);
});
