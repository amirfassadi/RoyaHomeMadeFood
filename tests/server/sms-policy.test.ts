import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smsEnabled} from '../../src/lib/server/sms-policy';
import {sendVerificationSms} from '../../src/lib/server/sms';
import {requestCheckoutCode,verifyCheckoutCode} from '../../src/lib/server/checkout-mobile';
import {requestCustomerCode} from '../../src/lib/server/customer-otp';
test('paused SMS rejects both OTP flows before any provider call or test-budget consumption',async()=>{
 let calls=0,budget=0;const old=globalThis.fetch;
 Object.assign(globalThis,{royaDb:{setting:{findUnique:async()=>({value:{enabled:false}})},$queryRaw:async()=>{budget++;return [];}}});
 try{
  globalThis.fetch=async()=>{calls++;throw new Error('must not send');};
  await assert.rejects(()=>sendVerificationSms('09123456789','123456'),/SMS_PAUSED/);
  await assert.rejects(()=>requestCheckoutCode('09123456789'),/SMS_PAUSED/);
  await assert.rejects(()=>verifyCheckoutCode('00000000-0000-4000-8000-000000000000','123456'),/SMS_PAUSED/);
  await assert.rejects(()=>requestCustomerCode({mobile:'09123456789',name:'Test',marketingSms:false}),/SMS_PAUSED/);
  assert.equal(calls,0);assert.equal(budget,0);
 }finally{globalThis.fetch=old;}
});
test('missing policy keeps verification required and malformed policy never bypasses verification',async()=>{
 const db:any={setting:{findUnique:async()=>null}};assert.equal(await smsEnabled(db),true);
 db.setting.findUnique=async()=>({value:{enabled:'false'}});await assert.rejects(()=>smsEnabled(db),/UNAVAILABLE/);
});
