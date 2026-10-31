import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {replyToContact} from '../../src/lib/server/contact-replies';
import {POST} from '../../src/app/api/admin/communications/reply/route';
function setup(member=true){
 Object.assign(process.env,{DATABASE_URL:'postgresql://test',ROYA_DEMO_CATALOG:'0',NEXTAUTH_SECRET:'x'.repeat(40),RESEND_API_KEY:'mock-only',CUSTOMER_EMAIL_FROM:'reply@example.com',KAVENEGAR_API_KEY:'mock-only',KAVENEGAR_SENDER:'100000',ROYA_SMS_MODE:'production'});delete process.env.SITES_STATIC_PREVIEW;
 const state={contact:{id:'contact',mobile:'09123456789',email:'guest@example.com',readAt:null as Date|null},user:member?{id:'buyer',active:true,role:'CUSTOMER',mobileVerifiedAt:new Date()}:null as any,replies:[] as any[],notices:[] as any[],audits:[] as any[],enabled:false,quota:1};
 const tx:any={$queryRaw:async()=>[],contactMessage:{findUnique:async({where}:any)=>where.id===state.contact.id?state.contact:null,update:async({data}:any)=>Object.assign(state.contact,data)},user:{findUnique:async()=>state.user},contactReply:{findUnique:async({where}:any)=>state.replies.find(r=>r.requestKey===where.requestKey)??null,create:async({data}:any)=>{const reply={id:randomUUID(),createdAt:new Date(),...data};state.replies.push(reply);return reply;},update:async({where,data}:any)=>{const reply=state.replies.find(r=>r.id===where.id);return Object.assign(reply,data);}},customerNotice:{create:async({data}:any)=>{state.notices.push(data);return data;}},adminAudit:{create:async({data}:any)=>{state.audits.push(data);return data;}},setting:{findUnique:async({where}:any)=>where.key==='customer-delivery-policy'?{value:{enabled:state.enabled,transactional:true,marketing:false}}:where.key==='sms-policy'?{value:{enabled:true}}:null}};
 Object.assign(globalThis,{royaDb:{...tx,$queryRaw:async()=>[{count:state.quota}],$transaction:async(fn:any)=>fn(tx)}});return state;
}
const input=(channel:'PANEL'|'EMAIL'|'SMS'='PANEL')=>({contactMessageId:'contact',requestKey:randomUUID(),channel,body:'Reply to the contact request.'});
test('member reply is private in-panel, audited, read and idempotent even when external delivery is off',async()=>{
 const s=setup(),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not send');};
 try{const payload=input(),first=await replyToContact(payload,'admin'),retry=await replyToContact(payload,'admin');assert.equal(first.reply.status,'IN_APP');assert.equal(first.reply.id,retry.reply.id);assert.equal(s.notices.length,1);assert.equal(s.notices[0].userId,'buyer');assert.equal(s.notices[0].kind,'CONTACT_REPLY');assert.equal(s.notices[0].status,'IN_APP');assert.equal(s.replies.length,1);assert(s.contact.readAt);assert.equal(s.audits.length,1);assert.equal(calls,0);
 await assert.rejects(()=>replyToContact({...payload,body:'Changed body'},'admin'),/CONFLICT/);
 await assert.rejects(()=>replyToContact({...payload},'other-admin'),/CONFLICT/);
 }finally{globalThis.fetch=original;}
});
test('only an active customer with a verified matching mobile gets in-panel replies',async()=>{
 for(const change of [null,{active:false},{role:'ADMIN'},{mobileVerifiedAt:null}]){const s=setup();if(change)s.user={...s.user,...change};else s.user=null;await assert.rejects(()=>replyToContact(input(),'admin'),/CONTACT_NO_ACCOUNT/);assert.equal(s.notices.length,0);}
 const s=setup();s.enabled=true;await assert.rejects(()=>replyToContact(input('SMS'),'admin'),/CONTACT_USE_PANEL/);assert.equal(s.replies.length,0);
});
test('guest email reply uses the stored contact address once, not any client-selected destination',async()=>{
 const s=setup(false);s.enabled=true;const original=globalThis.fetch,calls:any[]=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(String(options?.body))});return Response.json({id:'accepted'});};
 try{const payload=input('EMAIL');assert.equal((await replyToContact(payload,'admin')).reply.status,'ACCEPTED');await replyToContact(payload,'admin');assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.resend.com/emails');assert.deepEqual(calls[0].body.to,['guest@example.com']);assert.equal(s.notices.length,0);
 await assert.rejects(()=>replyToContact({...input('EMAIL'),to:'attacker@example.com'} as any,'admin'));assert.equal(calls.length,1);
 }finally{globalThis.fetch=original;}
});
test('guest SMS reply uses the contact mobile and preserves uncertain status without resend',async()=>{
 const s=setup(false);s.enabled=true;const original=globalThis.fetch;let calls=0;globalThis.fetch=async(_url,options)=>{calls++;assert.equal((options?.body as URLSearchParams).get('receptor'),s.contact.mobile);return Response.json({return:{status:200},entries:[{}]});};
 try{assert.equal((await replyToContact(input('SMS'),'admin')).reply.status,'ACCEPTED');const payload=input('SMS');globalThis.fetch=async()=>{calls++;throw new Error('timeout');};assert.equal((await replyToContact(payload,'admin')).reply.status,'UNKNOWN');await replyToContact(payload,'admin');assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
test('disabled delivery, missing email, rate limit and nonexistent contact do not create a reply',async()=>{
 let s=setup(false);await assert.rejects(()=>replyToContact(input('SMS'),'admin'),/DELIVERY_DISABLED/);assert.equal(s.replies.length,0);
 s=setup(false);s.enabled=true;s.contact.email='';await assert.rejects(()=>replyToContact(input('EMAIL'),'admin'),/EMAIL_UNAVAILABLE/);assert.equal(s.replies.length,0);
 s=setup();s.quota=21;await assert.rejects(()=>replyToContact(input(),'admin'),/RATE_LIMIT/);assert.equal(s.replies.length,0);
 s=setup();await assert.rejects(()=>replyToContact({...input(),contactMessageId:'missing'},'admin'),/NOT_FOUND/);assert.equal(s.replies.length,0);
});
test('reply HTTP endpoint rejects guests before reading or writing contact data',async()=>{
 setup();process.env.ROYA_DEMO_CATALOG='1';const response=await POST(new Request('https://shop.example/api/admin/communications/reply/',{method:'POST'}));assert.equal(response.status,401);
});

test('interrupted external send becomes unknown on status check and is never resent',async()=>{
 const s=setup(false),payload=input('SMS');s.replies.push({id:'interrupted',...payload,adminId:'admin',status:'SENDING',createdAt:new Date(Date.now()-600000)});
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not send');};
 try{assert.equal((await replyToContact(payload,'admin')).reply.status,'UNKNOWN');assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
