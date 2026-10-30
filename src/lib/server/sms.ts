import 'server-only';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {smsEnabled} from './sms-policy';

export function smsConfigured(){return !!process.env.KAVENEGAR_API_KEY?.trim()&&!!process.env.KAVENEGAR_OTP_TEMPLATE?.trim()&&(process.env.CUSTOMER_OTP_SECRET?.length??0)>=32;}
export async function sendVerificationSms(mobile:string,code:string){
 if(!await smsEnabled())throw new ShopError('SMS_PAUSED',503);
 if(!smsConfigured())throw new ShopError('SMS_UNAVAILABLE',503);
 await authorizeSmsRecipient(mobile);
 try{
  const response=await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(process.env.KAVENEGAR_API_KEY!)}/verify/lookup.json`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({receptor:mobile,token:code,template:process.env.KAVENEGAR_OTP_TEMPLATE!,type:'sms'}),signal:AbortSignal.timeout(10000),cache:'no-store',redirect:'error'});
  const result=await response.json();
  if(!response.ok||result?.return?.status!==200||!Array.isArray(result.entries)||!result.entries.length)throw new Error();
 }catch{throw new ShopError('SMS_UNAVAILABLE',503);}
}

export async function authorizeSmsRecipient(mobile:string){
 if(!await smsEnabled())throw new ShopError('SMS_PAUSED',503);
 // Test mode is fail-closed and is the default. Production requires explicit opt-in.
 if(process.env.ROYA_SMS_MODE!=='production'){
  const allowed=(process.env.ROYA_SMS_TEST_MOBILES??'').split(',').map(s=>s.trim());
  if(!allowed.includes(mobile))throw new ShopError('SMS_TEST_RECIPIENT',403);
  // A persistent, atomic counter shared by both app processes and both OTP flows.
  // It never resets with time or deployment. Uncertain/failed sends consume a slot.
  const rows=await getDb().$queryRaw<{used:number}[]>`
   INSERT INTO "SmsTestBudget" ("id","used") VALUES ('initial-five',1)
   ON CONFLICT ("id") DO UPDATE SET "used"="SmsTestBudget"."used"+1
   WHERE "SmsTestBudget"."used"<5 RETURNING "used"`;
  if(!rows.length)throw new ShopError('SMS_TEST_BUDGET',429);
 }
}

export async function sendNotificationSms(mobile:string,message:string){
 if(!process.env.KAVENEGAR_API_KEY?.trim()||!process.env.KAVENEGAR_SENDER?.trim())throw new ShopError('SMS_UNAVAILABLE',503);
 await authorizeSmsRecipient(mobile);
 try{const response=await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(process.env.KAVENEGAR_API_KEY)}/sms/send.json`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({receptor:mobile,sender:process.env.KAVENEGAR_SENDER,message}),signal:AbortSignal.timeout(10000),cache:'no-store',redirect:'error'});const result=await response.json();if(!response.ok||result?.return?.status!==200||!result.entries?.length)throw new Error();}catch{throw new ShopError('SMS_UNAVAILABLE',503);}
}
