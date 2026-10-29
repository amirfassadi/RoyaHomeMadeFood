import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {otpDigest} from '../../src/lib/customer/otp';
import {verifyCheckoutCode,consumeCheckoutProof} from '../../src/lib/server/checkout-mobile';
import {sendVerificationSms} from '../../src/lib/server/sms';
const id='be106b8b-1dab-4370-b9ba-e8787e43834f',mobile='09123456789';
function setup(){
 process.env.CUSTOMER_OTP_SECRET='s'.repeat(40);
 const row:any={id,mobile,ready:true,verifiedAt:null,consumedAt:null,attempts:0,expiresAt:new Date(Date.now()+300000),proofExpiresAt:null,verifier:otpDigest(process.env.CUSTOMER_OTP_SECRET,id,mobile,'123456')};
 const tx:any={$queryRaw:async()=>[],checkoutMobileChallenge:{findUnique:async()=>({...row}),update:async({data}:any)=>{row.attempts+=data.attempts?.increment??0;const {attempts,...rest}=data;Object.assign(row,rest);}}};
 Object.assign(globalThis,{royaDb:{setting:{findUnique:async()=>null},$queryRaw:async()=>[{count:1}],checkoutMobileChallenge:{findUnique:async()=>({mobile})},$transaction:async(fn:any)=>fn(tx)}});
 return {row,tx};
}
test('guest SMS proof is single-use, bound to the mobile, and no raw proof is stored',async()=>{
 const {row,tx}=setup();const proof=await verifyCheckoutCode(id,'123456');
 assert.equal(row.proofHash,createHash('sha256').update(proof.token).digest('hex'));assert.notEqual(row.proofHash,proof.token);
 await assert.rejects(()=>verifyCheckoutCode(id,'123456'),/MOBILE_CODE_INVALID/);
 await assert.rejects(()=>consumeCheckoutProof(tx,'09120000000',proof),/MOBILE_VERIFICATION_REQUIRED/);
 assert.equal(row.consumedAt,null);
 await consumeCheckoutProof(tx,mobile,proof);assert(row.consumedAt);
 await assert.rejects(()=>consumeCheckoutProof(tx,mobile,proof),/MOBILE_VERIFICATION_REQUIRED/);
});
test('wrong codes commit attempts, expire after five failures and cannot be redeemed later',async()=>{
 const {row}=setup();for(let i=0;i<5;i++)await assert.rejects(()=>verifyCheckoutCode(id,'000000'),/MOBILE_CODE_INVALID/);
 assert.equal(row.attempts,5);assert(row.consumedAt);
 await assert.rejects(()=>verifyCheckoutCode(id,'123456'),/MOBILE_CODE_INVALID/);
});
test('expired and forged guest proofs cannot reserve inventory',async()=>{
 const {row,tx}=setup();const proof=await verifyCheckoutCode(id,'123456');
 await assert.rejects(()=>consumeCheckoutProof(tx,mobile,{...proof,token:'0'.repeat(64)}),/MOBILE_VERIFICATION_REQUIRED/);
 row.proofExpiresAt=new Date(0);await assert.rejects(()=>consumeCheckoutProof(tx,mobile,proof),/MOBILE_VERIFICATION_REQUIRED/);
 await assert.rejects(()=>consumeCheckoutProof(tx,mobile),/MOBILE_VERIFICATION_REQUIRED/);
});
test('test SMS attempts stop at five across concurrent calls and failures never restore budget',async()=>{
 Object.assign(process.env,{KAVENEGAR_API_KEY:'test-only-key',KAVENEGAR_OTP_TEMPLATE:'test',CUSTOMER_OTP_SECRET:'s'.repeat(40),ROYA_SMS_MODE:'test',ROYA_SMS_TEST_MOBILES:mobile});
 let used=0,calls=0;const original=globalThis.fetch;
 Object.assign(globalThis,{royaDb:{setting:{findUnique:async()=>null},$queryRaw:async()=>used<5?[{used:++used}]:[]}});
 try{
  globalThis.fetch=async()=>{calls++;throw new Error('uncertain response');};
  await assert.rejects(()=>sendVerificationSms('09120000000','123456'),/SMS_TEST_RECIPIENT/);assert.equal(used,0);
  const results=await Promise.allSettled(Array.from({length:10},()=>sendVerificationSms(mobile,'123456')));
  assert.equal(used,5);assert.equal(calls,5);assert.equal(results.filter(r=>r.status==='rejected').length,10);
  await assert.rejects(()=>sendVerificationSms(mobile,'123456'),/SMS_TEST_BUDGET/);assert.equal(calls,5);
 }finally{globalThis.fetch=original;}
});
