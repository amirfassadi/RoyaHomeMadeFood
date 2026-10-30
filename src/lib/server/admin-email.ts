import 'server-only';
import {randomUUID,randomInt} from 'node:crypto';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {consumeRateLimit} from './rate-limit';
import {audit} from './admin-products';
import {otpDigest,otpMatches} from '@/lib/customer/otp';
import {emailSettingsEditSchema,emailTestSchema,emailTestVerifySchema,storedEmailSettingsSchema} from '@/lib/validation/email-settings';
import {emailSettingsKey,encryptEmailKey,readEmailConfiguration,emailSettingsView,sendEmailWithConfiguration} from './email';
export async function saveEmailSettings(raw:unknown,adminId:string){
 const input=emailSettingsEditSchema.parse(raw);let config:Awaited<ReturnType<typeof readEmailConfiguration>>=null;try{config=await readEmailConfiguration();}catch(e){if(!input.apiKey)throw e;}
 const key=input.apiKey??config?.apiKey;if(!key)throw new ShopError('EMAIL_KEY_REQUIRED');
 await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('settings:customer-email',0))::text`;
  const old=await tx.setting.findUnique({where:{key:emailSettingsKey}});if((old?.updatedAt.toISOString()??null)!==input.expectedUpdatedAt)throw new ShopError('CONFLICT',409);
  const unchanged=config?.source==='panel'&&!input.apiKey&&config.from===input.from;
  const value={enabled:input.enabled,from:input.from,apiKeyEnc:encryptEmailKey(key),verifiedAt:unchanged?(config?.verifiedAt??null):null,test:null};
  await tx.setting.upsert({where:{key:emailSettingsKey},create:{key:emailSettingsKey,value},update:{value}});await audit(tx,adminId,'EMAIL_SETTINGS_SAVED',emailSettingsKey);
 });return emailSettingsView();
}
function testDigest(id:string,to:string,code:string){const secret=process.env.NEXTAUTH_SECRET;if(!secret||secret.length<32)throw new ShopError('EMAIL_CONFIGURATION',503);return otpDigest(secret,`email-settings-test:${id}`,to,code);}
export async function requestEmailTest(raw:unknown,adminId:string){
 const input=emailTestSchema.parse(raw);
 if(!await consumeRateLimit(`email-test:${adminId}`,3,3600)||!await consumeRateLimit('email-test:global',10,3600))throw new ShopError('RATE_LIMIT',429);
 const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0'),config=await readEmailConfiguration();if(!config||config.source!=='panel')throw new ShopError('EMAIL_CONFIGURATION',503);
 const test={id,adminId,to:input.to,verifier:testDigest(id,input.to,code),expiresAt:new Date(Date.now()+300000).toISOString(),attempts:0,ready:false};
 await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('settings:customer-email',0))::text`;
  const row=await tx.setting.findUnique({where:{key:emailSettingsKey}});if(row?.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new ShopError('CONFLICT',409);
  const saved=storedEmailSettingsSchema.parse(row.value);await tx.setting.update({where:{key:emailSettingsKey},data:{value:{...saved,test}}});
 });
 await sendEmailWithConfiguration(config,{to:input.to,subject:'تست ایمیل باشگاه رویا | Roya email test',text:`کد تست تنظیمات ایمیل باشگاه رویا: ${code}\nEmail setup test code: ${code}\nاعتبار: ۵ دقیقه / Valid for 5 minutes. این کد برای ورود یا ثبت‌نام نیست.`});
 await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('settings:customer-email',0))::text`;
  const row=await tx.setting.findUnique({where:{key:emailSettingsKey}}),saved=storedEmailSettingsSchema.parse(row?.value);if(saved.test?.id!==id)throw new ShopError('CONFLICT',409);
  await tx.setting.update({where:{key:emailSettingsKey},data:{value:{...saved,test:{...test,ready:true}}}});await audit(tx,adminId,'EMAIL_TEST_SENT',emailSettingsKey);
 });return {testId:id,settings:await emailSettingsView()};
}
export async function verifyEmailTest(raw:unknown,adminId:string){
 const {testId,code}=emailTestVerifySchema.parse(raw);
 if(!await consumeRateLimit(`email-test-verify:${adminId}`,10,600))throw new ShopError('RATE_LIMIT',429);
 const valid=await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('settings:customer-email',0))::text`;
  const row=await tx.setting.findUnique({where:{key:emailSettingsKey}}),saved=storedEmailSettingsSchema.parse(row?.value),test=saved.test;
  if(!test||test.id!==testId||test.adminId!==adminId||!test.ready||test.attempts>=5||Date.parse(test.expiresAt)<=Date.now())return false;
  const ok=otpMatches(test.verifier,testDigest(test.id,test.to,code));
  await tx.setting.update({where:{key:emailSettingsKey},data:{value:{...saved,verifiedAt:ok?new Date().toISOString():saved.verifiedAt,test:ok||test.attempts===4?null:{...test,attempts:test.attempts+1}}}});
  if(ok)await audit(tx,adminId,'EMAIL_TEST_VERIFIED',emailSettingsKey);return ok;
 });if(!valid)throw new ShopError('CODE_INVALID');return emailSettingsView();
}
