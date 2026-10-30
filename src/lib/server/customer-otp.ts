import {emailConfigured,sendCustomerEmail} from './email';
import {sendVerificationSms} from './sms';
import {smsEnabled} from './sms-policy';
import 'server-only';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import {getDb} from './db';
import {isDemoCatalog} from './catalog';
import {consumeRateLimit} from './rate-limit';
import {ShopError} from './shop-http';
import {hashPassword,verifyPassword} from '@/lib/admin/password';
import {otpDigest,otpMatches} from '@/lib/customer/otp';
import {consentVersion,requestCodeSchema,verifyCodeSchema,resendEmailSchema,customerPasswordSchema} from '@/lib/customer/validation';
function secret(){const value=process.env.CUSTOMER_OTP_SECRET;if(!value||value.length<32)throw new ShopError('UNAVAILABLE',503);return value;}
export function customerLoginEnabled(){return !isDemoCatalog()&&process.env.CUSTOMER_ACCOUNTS_ENABLED==='1'&&!!process.env.DATABASE_URL&&(process.env.NEXTAUTH_SECRET?.length??0)>=32;}
export async function customerRegistrationEnabled(){return customerLoginEnabled()&&(process.env.CUSTOMER_OTP_SECRET?.length??0)>=32&&!!process.env.KAVENEGAR_API_KEY&&!!process.env.KAVENEGAR_OTP_TEMPLATE&&await emailConfigured();}
async function limit(value:string,kind:string,count:number,seconds:number){const key=createHash('sha256').update(value).digest('hex');if(!await consumeRateLimit(`customer:${kind}:${key}`,count,seconds))throw new ShopError('RATE_LIMIT',429);}
const newCode=()=>String(randomInt(0,1000000)).padStart(6,'0');
function digest(id:string,value:string,code:string,kind:'mobile'|'email'){return otpDigest(secret(),`${kind}:${id}`,value,code);}
export async function requestCustomerCode(raw:unknown){
 if(!await smsEnabled())throw new ShopError('SMS_PAUSED',503);
 if(!await customerRegistrationEnabled())throw new ShopError('UNAVAILABLE',503);
 const {password,...input}=requestCodeSchema.parse(raw);
 if(!await consumeRateLimit('customer:sms:global',30,3600))throw new ShopError('RATE_LIMIT',429);
 await limit(input.mobile,'send-cooldown',1,60);await limit(input.mobile,'send',3,600);await limit(input.mobile,'daily',10,86400);await limit(input.email,'email-register',10,86400);
 const db=getDb(),existing=await db.user.findFirst({where:{OR:[{mobile:input.mobile},{email:input.email}]}});
 // Legacy mobile-only customers may complete registration after proving both contacts.
 if(existing&&(!existing.active||existing.role!=='CUSTOMER'||existing.passwordHash||existing.emailVerifiedAt||existing.mobile!==input.mobile))throw new ShopError('ACCOUNT_EXISTS',409);
 const id=randomUUID(),code=newCode(),now=new Date(),passwordHash=await hashPassword(password);
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer:${input.mobile}`},0))::text`;
  await tx.customerRegistration.updateMany({where:{mobile:input.mobile,consumedAt:null},data:{consumedAt:now}});
  await tx.customerRegistration.create({data:{id,...input,passwordHash,mobileVerifier:digest(id,input.mobile,code,'mobile'),expiresAt:new Date(now.getTime()+900000)}});
 });
 try{
  await sendVerificationSms(input.mobile,code);
  await db.customerRegistration.updateMany({where:{id,consumedAt:null},data:{mobileReady:true}});
 }catch{await db.customerRegistration.updateMany({where:{id},data:{consumedAt:new Date()}});throw new ShopError('SMS_UNAVAILABLE',503);}
 return {challengeId:id,expiresIn:300,resendAfter:60};
}
export async function verifyCustomerMobile(raw:unknown){
 if(!await customerRegistrationEnabled())throw new ShopError('UNAVAILABLE',503);
 const {challengeId,code}=verifyCodeSchema.parse(raw);await limit(challengeId,'mobile-verify',10,600);
 const valid=await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "CustomerRegistration" WHERE "id"=${challengeId}::uuid FOR UPDATE`;
  const c=await tx.customerRegistration.findUnique({where:{id:challengeId}}),now=new Date();
  if(!c||!c.mobileReady||c.consumedAt||c.mobileVerifiedAt||c.expiresAt<=now||c.createdAt.getTime()+300000<=now.getTime()||c.mobileAttempts>=5)return false;
  const ok=otpMatches(c.mobileVerifier,digest(c.id,c.mobile,code,'mobile'));
  await tx.customerRegistration.update({where:{id:c.id},data:{mobileAttempts:{increment:1},...(ok?{mobileVerifiedAt:now}:c.mobileAttempts===4?{consumedAt:now}:{})}});
  return ok;
 });
 if(!valid)throw new ShopError('CODE_INVALID');
 return {mobileVerified:true};
}
export async function requestCustomerEmailCode(raw:unknown){
 if(!await customerRegistrationEnabled())throw new ShopError('UNAVAILABLE',503);
 const {challengeId}=resendEmailSchema.parse(raw),db=getDb();
 await limit(challengeId,'email-cooldown',1,60);await limit(challengeId,'email-send',5,900);
 const c=await db.customerRegistration.findUnique({where:{id:challengeId}}),now=new Date();
 if(!c?.mobileVerifiedAt||c.consumedAt||c.expiresAt<=now)throw new ShopError('CODE_INVALID');
 await limit(c.email,'email-daily',10,86400);
 const code=newCode(),verifier=digest(c.id,c.email,code,'email');
 // Keep attempts across resends. Only the newest accepted send can activate its verifier.
 const changed=await db.customerRegistration.updateMany({where:{id:c.id,consumedAt:null,expiresAt:{gt:now}},data:{emailVerifier:verifier,emailReady:false,emailExpiresAt:new Date(now.getTime()+300000)}});
 if(!changed.count)throw new ShopError('CODE_INVALID');
 try{
  await sendCustomerEmail({to:c.email,subject:'کد تأیید ایمیل رویا | Roya email verification',text:`کد تأیید ایمیل شما: ${code}\nYour Roya verification code: ${code}\nاعتبار: ۵ دقیقه / Valid for 5 minutes.`});
  await db.customerRegistration.updateMany({where:{id:c.id,emailVerifier:verifier,consumedAt:null},data:{emailReady:true}});
 }catch{throw new ShopError('EMAIL_UNAVAILABLE',503);}
 return {sent:true,expiresIn:300,resendAfter:60};
}
export async function authorizeCustomer(raw:unknown){
 if(!await customerRegistrationEnabled())return null;
 const parsed=verifyCodeSchema.safeParse(raw);if(!parsed.success)return null;
 const {challengeId,code}=parsed.data;try{await limit(challengeId,'email-verify',10,600);}catch{return null;}
 const db=getDb();
 try{return await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "CustomerRegistration" WHERE "id"=${challengeId}::uuid FOR UPDATE`;
  const c=await tx.customerRegistration.findUnique({where:{id:challengeId}}),now=new Date();
  if(!c?.mobileVerifiedAt||!c.emailReady||!c.emailVerifier||!c.emailExpiresAt||c.consumedAt||c.expiresAt<=now||c.emailExpiresAt<=now||c.emailAttempts>=5)return null;
  const valid=otpMatches(c.emailVerifier,digest(c.id,c.email,code,'email'));
  await tx.customerRegistration.update({where:{id:c.id},data:{emailAttempts:{increment:1},...((valid||c.emailAttempts===4)?{consumedAt:now}:{})}});
  if(!valid)return null;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer:${c.mobile}`},0))::text`;
  let user=await tx.user.findUnique({where:{mobile:c.mobile}});
  const emailOwner=await tx.user.findUnique({where:{email:c.email}});
  if(emailOwner&&emailOwner.id!==user?.id)return null;
  if(user&&(!user.active||user.role!=='CUSTOMER'||user.twoFactorEnabled||user.passwordHash||user.emailVerifiedAt))return null;
  const data={name:c.name,email:c.email,passwordHash:c.passwordHash,mobileVerifiedAt:c.mobileVerifiedAt,emailVerifiedAt:now};
  if(user)user=await tx.user.update({where:{id:user.id},data:{...data,sessionVersion:{increment:1}}});
  else user=await tx.user.create({data:{...data,mobile:c.mobile,marketingSms:c.marketingSms,role:'CUSTOMER',consentEvents:{create:{allowed:c.marketingSms,policyVersion:consentVersion,source:'registration'}}}});
  return {id:user.id,name:user.name,role:'CUSTOMER',sessionVersion:user.sessionVersion};
 });}catch{return null;}
}
export async function authorizeCustomerPassword(raw:unknown){
 if(!customerLoginEnabled())return null;
 const parsed=customerPasswordSchema.safeParse(raw);if(!parsed.success)return null;
 const {identifier,password}=parsed.data;
 try{if(!await consumeRateLimit('customer:password:global',60,60))return null;await limit(identifier,'password',5,600);}catch{return null;}
 const user=await getDb().user.findUnique({where:identifier.includes('@')?{email:identifier}:{mobile:identifier}});
 const valid=await verifyPassword(password,user?.passwordHash??null);
 if(!valid||!user?.active||user.role!=='CUSTOMER'||user.twoFactorEnabled||!user.mobileVerifiedAt||!user.emailVerifiedAt)return null;
 return {id:user.id,name:user.name,role:'CUSTOMER',sessionVersion:user.sessionVersion};
}

export async function registrationProgress(challengeId:string){
 if(!customerLoginEnabled())throw new ShopError('UNAVAILABLE',503);
 const c=await getDb().customerRegistration.findUnique({where:{id:challengeId}}),now=Date.now();
 if(!c||c.consumedAt||c.expiresAt.getTime()<=now||!c.mobileVerifiedAt&&c.createdAt.getTime()+300000<=now)throw new ShopError('CODE_INVALID');
 const lastSent=c.mobileVerifiedAt&&c.emailExpiresAt?c.emailExpiresAt.getTime()-300000:c.createdAt.getTime();
 return {step:c.mobileVerifiedAt?'email':'mobile',mobile:c.mobile,email:c.email,resendAfter:Math.max(0,Math.ceil((lastSent+60000-now)/1000)),emailSent:!!c.emailReady};
}
