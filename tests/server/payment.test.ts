import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initiatePayment,verifyPayment} from '../../src/lib/server/zarinpal';
const authority='S'+'0'.repeat(35);
function setup(){
 process.env.ZARINPAL_MERCHANT_ID='123e4567-e89b-42d3-a456-426614174000';
 process.env.ZARINPAL_SANDBOX='true';process.env.NEXT_PUBLIC_SITE_URL='http://localhost:3000';
 const order={id:'order',trackingCode:'ROYA-0123456789ABCDEF01234567',mobile:'09123456789',locale:'fa',paymentStatus:'PENDING',longestPreparationMinutes:240,zoneDeliveryMinutes:60};
 const attempt={id:'attempt',orderId:'order',order,amountToman:120000,authority:null as string|null,requestState:'NEW',callbackNonce:'nonce',merchantId:process.env.ZARINPAL_MERCHANT_ID,sandbox:true,status:'PENDING',referenceId:null as string|null};
 const tx={
  $queryRaw:async()=>[{count:1}],
  paymentAttempt:{findUnique:async()=>({...attempt,order:{...order}}),updateMany:async({where,data}:any)=>{if(attempt.requestState!==where.requestState)return {count:0};Object.assign(attempt,data);return {count:1};},update:async({data}:any)=>{Object.assign(attempt,data);return attempt;}},
  order:{findUniqueOrThrow:async()=>({...order}),update:async({data}:any)=>{Object.assign(order,data);return order;}}
 };
 Object.assign(globalThis,{royaDb:{...tx,$transaction:async(fn:any)=>fn(tx)}});
 let calls=0;const bodies:any[]=[];
 const respond=(data:any)=>{globalThis.fetch=async(_url,options)=>{calls++;bodies.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({data,errors:[]}));};};
 return {attempt,order,respond,bodies,calls:()=>calls};
}
test('gateway initiation converts money, stores authority and issues only one request',async()=>{
 const s=setup();s.respond({code:100,authority});
 const url=await initiatePayment('order');assert.equal(url,`https://sandbox.zarinpal.com/pg/StartPay/${authority}`);
 assert.equal(s.bodies[0].amount,1200000);assert.equal(s.bodies[0].currency,'IRR');
 assert.match(s.bodies[0].callback_url,/attempt=attempt&nonce=nonce/);
 assert.equal(s.attempt.authority,authority);assert.equal(s.attempt.requestState,'READY');
 await initiatePayment('order');assert.equal(s.calls(),1);
});
test('uncertain request is retained as UNKNOWN and is never reissued automatically',async()=>{
 const s=setup();let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('connection lost');};
 assert.equal(await initiatePayment('order'),null);assert.equal(s.attempt.requestState,'UNKNOWN');
 assert.equal(await initiatePayment('order'),null);assert.equal(calls,1);
});
test('browser NOK and mismatched callback nonce cannot mark an order paid',async()=>{
 const s=setup();s.attempt.authority=authority;s.respond({code:100,ref_id:555});
 await verifyPayment('attempt','nonce',authority,'NOK');assert.equal(s.calls(),0);assert.equal(s.order.paymentStatus,'PENDING');
 await assert.rejects(()=>verifyPayment('attempt','wrong',authority,'OK'));assert.equal(s.calls(),0);
});
test('verified 101 reconciles a prior successful verify; repeated callback is idempotent',async()=>{
 const s=setup();s.attempt.authority=authority;s.respond({code:101,ref_id:555});
 const result=await verifyPayment('attempt','nonce',authority,'OK');
 assert.equal(result.result,'paid');assert.equal(s.order.paymentStatus,'PAID');assert.equal(s.attempt.referenceId,'555');
 assert.equal(s.bodies[0].amount,1200000);
 await verifyPayment('attempt','nonce',authority,'OK');assert.equal(s.calls(),1);
});
test('incomplete or failed gateway verification never reports a successful payment',async()=>{
 const s=setup();s.attempt.authority=authority;s.respond({code:100});
 assert.equal((await verifyPayment('attempt','nonce',authority,'OK')).result,'pending');assert.equal(s.order.paymentStatus,'PENDING');
 s.respond({code:-51});assert.equal((await verifyPayment('attempt','nonce',authority,'OK')).result,'pending');
});
test('an order cancelled before initiation cannot obtain a gateway authority',async()=>{
 const s=setup();Object.assign(s.order,{status:'CANCELLED'});s.respond({code:100,authority});
 assert.equal(await initiatePayment('order'),null);assert.equal(s.calls(),0);
});
test('cancellation between initial read and gateway claim is checked under the order lock',async()=>{
 const s=setup();s.respond({code:100,authority});
 const db=(globalThis as any).royaDb,read=db.paymentAttempt.findUnique;
 db.paymentAttempt.findUnique=async()=>{const snapshot=await read();Object.assign(s.order,{status:'CANCELLED'});return snapshot;};
 assert.equal(await initiatePayment('order'),null);assert.equal(s.calls(),0);
});
