import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {supportAction,customerSupportHistory,supportCustomerContext} from '../../src/lib/server/support';
import {supportActionSchema} from '../../src/lib/support';
import {POST,GET} from '../../src/app/api/customer/support/route';
import {GET as inbox} from '../../src/app/api/admin/support/route';
import {canViewAdminSection} from '../../src/lib/admin/permissions';

function setup(){
 const users:any={customer:{id:'customer',role:'CUSTOMER',active:true,sessionVersion:1,mobileVerifiedAt:new Date(),emailVerifiedAt:new Date()},admin:{id:'admin',role:'ADMIN',active:true,sessionVersion:1,adminPermissions:['support'],adminOwner:false,mustChangePassword:false}};
 const thread:any={id:'thread',userId:'customer',lastSequence:0,lastAdminSequence:0,lastCustomerSequence:0,adminReadSequence:0,customerReadSequence:0,updatedAt:new Date()};
 const messages:any[]=[];let rateCount=1,audits=0;
 const tx:any={user:{findUnique:async({where}:any)=>users[where.id]},$queryRaw:async()=>[{count:rateCount}],supportThread:{
  findUnique:async({where}:any)=>where.userId?where.userId===thread.userId?{...thread}:null:where.id===thread.id?{...thread}:null,
  findUniqueOrThrow:async()=>({...thread}),upsert:async({where}:any)=>{assert.equal(where.userId,'customer');return {...thread};},update:async({data}:any)=>Object.assign(thread,data)
 },supportMessage:{findUnique:async({where}:any)=>messages.find(m=>Object.entries(where.threadId_senderId_clientId).every(([k,v])=>m[k]===v))??null,create:async({data}:any)=>{const m={id:String(messages.length),createdAt:new Date(),...data};messages.push(m);return m;}},adminAudit:{create:async()=>{audits++;}}};
 const db={...tx,$transaction:async(fn:any)=>fn(tx)};Object.assign(globalThis,{royaDb:db});
 return {users,thread,messages,db,audits:()=>audits,limit:()=>{rateCount=21;}};
}
const customer={id:'customer',sessionVersion:1,fromAdmin:false},admin={id:'admin',sessionVersion:1,fromAdmin:true};
const send=(body='Question')=>({action:'send' as const,body,clientId:randomUUID()});

test('support rejects blank/oversized messages, forged identities and invalid cursors',()=>{
 for(const body of ['', ' '.repeat(5),'x'.repeat(2001)])assert(!supportActionSchema.safeParse(send(body)).success);
 assert(!supportActionSchema.safeParse({...send(),senderId:'admin'}).success);
 assert(!supportActionSchema.safeParse({action:'read',throughSequence:-1}).success);
 assert(supportActionSchema.safeParse(send('سلام')).success);
});
test('guest APIs reject both reading and sending, including the admin inbox',async()=>{
 process.env.ROYA_DEMO_CATALOG='1';
 for(const handler of [GET,POST,inbox]){const result=await handler(new Request('https://example.com/api/support/'));assert.equal(result.status,401);}
});
test('customer writes use account ownership, ignore supplied thread IDs and make retries idempotent',async()=>{
 const s=setup(),input=send();await supportAction(customer,input,'somebody-else');await supportAction(customer,input);
 assert.equal(s.messages.length,1);assert.equal(s.messages[0].threadId,'thread');assert.equal(s.messages[0].senderId,'customer');assert.equal(s.messages[0].fromAdmin,false);assert.equal(s.thread.lastCustomerSequence,1);
 await assert.rejects(()=>supportAction(customer,{...input,body:'Changed retry'}),/CONFLICT/);
});
test('SMS-verified customers can chat while email verification is deferred',async()=>{const s=setup();s.users.customer.emailVerifiedAt=null;await supportAction(customer,send());assert.equal(s.messages.length,1);});

test('read receipts never move backwards or acknowledge future messages; replies are audited',async()=>{
 const s=setup();await supportAction(customer,send());await supportAction(admin,send('Reply'),'thread');
 assert.equal(s.thread.lastAdminSequence,2);assert.equal(s.audits(),1);
 await supportAction(customer,{action:'read',throughSequence:2});await supportAction(customer,{action:'read',throughSequence:1});assert.equal(s.thread.customerReadSequence,2);
 await assert.rejects(()=>supportAction(admin,{action:'read',throughSequence:3},'thread'),/INVALID/);
});
test('disabled, stale, unverified and promoted accounts cannot send',async()=>{
 for(const change of [{active:false},{sessionVersion:2},{mobileVerifiedAt:null},{role:'ADMIN'}]){const s=setup();Object.assign(s.users.customer,change);await assert.rejects(()=>supportAction(customer,send()),/UNAUTHORIZED/);assert.equal(s.messages.length,0);}
});
test('support permission is independent; revocation, password change, missing threads and rate limits reject writes',async()=>{
 assert(canViewAdminSection({adminPermissions:['support'],adminOwner:false,mustChangePassword:false},'support'));
 for(const change of [{adminPermissions:[]},{mustChangePassword:true}]){const s=setup();Object.assign(s.users.admin,change);await assert.rejects(()=>supportAction(admin,send(),'thread'),/FORBIDDEN/);assert.equal(s.messages.length,0);}
 setup();await assert.rejects(()=>supportAction(admin,send(),'missing'),/NOT_FOUND/);
 const s=setup();s.limit();await assert.rejects(()=>supportAction(customer,send()),/RATE_LIMIT/);assert.equal(s.messages.length,0);
});
test('a different customer cannot read another account history',async()=>{setup();const history=await customerSupportHistory('someone-else');assert.equal(history.threadId,null);assert.deepEqual(history.messages,[]);});
test('customer context queries orders by owner ID, never recipient mobile',async()=>{
 const s=setup();s.db.supportThread.findUnique=async()=>({userId:'customer',user:{id:'customer',name:'Name',mobile:'09120000001',email:'test@example.com',active:true,createdAt:new Date()}});
 (s.db as any).order={findMany:async({where}:any)=>{assert.deepEqual(where,{userId:'customer'});return [];},count:async({where}:any)=>{assert.deepEqual(where,{userId:'customer'});return 3;},aggregate:async({where}:any)=>{assert.deepEqual(where,{userId:'customer',paymentStatus:'PAID'});return {_sum:{totalToman:1000}};}};
 const context=await supportCustomerContext('thread');assert.equal(context.orderCount,3);assert.equal(context.paidTotalToman,1000);
});
