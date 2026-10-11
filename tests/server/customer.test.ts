import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizeCustomer,requestCustomerCode} from '../../src/lib/server/customer-otp';
import {otpDigest} from '../../src/lib/customer/otp';
const id='be106b8b-1dab-4370-b9ba-e8787e43834f',mobile='09123456789',code='012345';
function setup(role='CUSTOMER',existing=false){
 Object.assign(process.env,{DATABASE_URL:'postgresql://test',NEXTAUTH_SECRET:'x'.repeat(40),CUSTOMER_OTP_SECRET:'y'.repeat(40),CUSTOMER_ACCOUNTS_ENABLED:'1',KAVENEGAR_API_KEY:'test-only',KAVENEGAR_OTP_TEMPLATE:'test',ROYA_DEMO_CATALOG:'0'});delete process.env.SITES_STATIC_PREVIEW;
 const challenge={id,mobile,name:'Test customer',marketingSms:false,ready:true,attempts:0,expiresAt:new Date(Date.now()+300000),consumedAt:null as Date|null,verifier:otpDigest(process.env.CUSTOMER_OTP_SECRET!,id,mobile,code)};
 let user:any=existing?{id:'user',role,active:true,twoFactorEnabled:false,name:'Existing',sessionVersion:2,marketingSms:true}:null,created=0;
 const tx={$queryRaw:async()=>[],customerLoginChallenge:{findUnique:async()=>structuredClone(challenge),update:async({data}:any)=>{challenge.attempts+=data.attempts.increment;if(data.consumedAt)challenge.consumedAt=data.consumedAt;}},user:{findUnique:async()=>user,create:async({data}:any)=>{created++;user={id:'user',sessionVersion:0,...data};return user;},update:async({data}:any)=>Object.assign(user,data)}};
 Object.assign(globalThis,{royaDb:{$queryRaw:async()=>[{count:1}],customerLoginChallenge:{findUnique:async()=>({mobile})},$transaction:async(fn:any)=>fn(tx)}});
 return {challenge,getUser:()=>user,created:()=>created};
}
test('OTP creates a verified CUSTOMER once with explicit consent and rejects reuse',async()=>{const state=setup();assert.equal((await authorizeCustomer({challengeId:id,code}))?.role,'CUSTOMER');assert(state.getUser().mobileVerifiedAt);assert.equal(state.getUser().marketingSms,false);assert.equal(state.getUser().consentEvents.create.allowed,false);assert.equal(await authorizeCustomer({challengeId:id,code}),null);assert.equal(state.created(),1);});
test('expired codes and five wrong attempts cannot create an account',async()=>{let state=setup();state.challenge.expiresAt=new Date(0);assert.equal(await authorizeCustomer({challengeId:id,code}),null);assert.equal(state.created(),0);state=setup();for(let n=0;n<5;n++)assert.equal(await authorizeCustomer({challengeId:id,code:'999999'}),null);assert(state.challenge.consumedAt);assert.equal(await authorizeCustomer({challengeId:id,code}),null);assert.equal(state.created(),0);});
test('customer OTP cannot authenticate admins or disabled users and login preserves marketing preference',async()=>{let state=setup('ADMIN',true);assert.equal(await authorizeCustomer({challengeId:id,code}),null);state=setup('CUSTOMER',true);state.getUser().active=false;assert.equal(await authorizeCustomer({challengeId:id,code}),null);state=setup('CUSTOMER',true);assert.equal((await authorizeCustomer({challengeId:id,code}))?.id,'user');assert.equal(state.getUser().marketingSms,true);});
test('SMS configuration missing does not fabricate a code or account',async()=>{setup();delete process.env.KAVENEGAR_API_KEY;await assert.rejects(()=>requestCustomerCode({mobile,name:'Customer',marketingSms:false}),/UNAVAILABLE/);assert.equal(await authorizeCustomer({challengeId:id,code}),null);});
test('SMS send activates only an accepted challenge and hides the OTP from its response',async()=>{
 setup();let record:any=null;
 const db={...((globalThis as any).royaDb),customerLoginChallenge:{updateMany:async({where,data}:any)=>{if(record&&where.id===record.id)Object.assign(record,data);return {count:1};}},$transaction:async(fn:any)=>fn({$queryRaw:async()=>[],customerLoginChallenge:{updateMany:async()=>({count:0}),create:async({data}:any)=>{record={consumedAt:null,...data};return record;}}})};
 Object.assign(globalThis,{royaDb:db});const original=globalThis.fetch;let sentCode='';
 try{globalThis.fetch=async(_url,options)=>{const body=options?.body as URLSearchParams;sentCode=body.get('token')!;assert.equal(body.get('receptor'),mobile);return Response.json({return:{status:200},entries:[{messageid:1}]});};
 const result=await requestCustomerCode({mobile,name:'Test',marketingSms:true});assert(record.ready);assert.equal(record.marketingSms,true);assert.equal(record.verifier,otpDigest(process.env.CUSTOMER_OTP_SECRET!,result.challengeId,mobile,sentCode));assert(!('code' in result));assert(!('verifier' in result));
 globalThis.fetch=async()=>{throw new Error('uncertain timeout');};await assert.rejects(()=>requestCustomerCode({mobile,name:'Test',marketingSms:false}),/SMS_UNAVAILABLE/);assert(record.consumedAt);assert(!record.ready);
 }finally{globalThis.fetch=original;}
});
