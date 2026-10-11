import 'server-only';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import {getDb} from './db';
import {isDemoCatalog} from './catalog';
import {consumeRateLimit} from './rate-limit';
import {ShopError} from './shop-http';
import {otpDigest,otpMatches} from '@/lib/customer/otp';
import {consentVersion,requestCodeSchema,verifyCodeSchema} from '@/lib/customer/validation';
function secret(){const value=process.env.CUSTOMER_OTP_SECRET;if(!value||value.length<32)throw new ShopError('UNAVAILABLE',503);return value;}
export function customerLoginEnabled(){return !isDemoCatalog()&&process.env.CUSTOMER_ACCOUNTS_ENABLED==='1'&&!!process.env.DATABASE_URL&&(process.env.NEXTAUTH_SECRET?.length??0)>=32&&(process.env.CUSTOMER_OTP_SECRET?.length??0)>=32&&!!process.env.KAVENEGAR_API_KEY&&!!process.env.KAVENEGAR_OTP_TEMPLATE;}
async function limit(mobile:string,kind:string,count:number,seconds:number){const key=createHash('sha256').update(mobile).digest('hex');if(!await consumeRateLimit(`customer:${kind}:${key}`,count,seconds))throw new ShopError('RATE_LIMIT',429);}
export async function requestCustomerCode(raw:unknown){
 if(!customerLoginEnabled())throw new ShopError('UNAVAILABLE',503);
 const input=requestCodeSchema.parse(raw);
 if(!await consumeRateLimit('customer:sms:global',30,3600))throw new ShopError('RATE_LIMIT',429);
 await limit(input.mobile,'send-cooldown',1,60);await limit(input.mobile,'send',3,600);await limit(input.mobile,'daily',10,86400);
 const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0'),now=new Date();
 const db=getDb();
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer:${input.mobile}`},0))::text`;
  await tx.customerLoginChallenge.updateMany({where:{mobile:input.mobile,consumedAt:null},data:{consumedAt:now}});
  await tx.customerLoginChallenge.create({data:{id,...input,verifier:otpDigest(secret(),id,input.mobile,code),expiresAt:new Date(now.getTime()+300000)}});
 });
 try{
  const response=await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(process.env.KAVENEGAR_API_KEY!)}/verify/lookup.json`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({receptor:input.mobile,token:code,template:process.env.KAVENEGAR_OTP_TEMPLATE!,type:'sms'}),signal:AbortSignal.timeout(10000),cache:'no-store',redirect:'error'});
  const result=await response.json();
  if(!response.ok||result?.return?.status!==200||!Array.isArray(result.entries)||!result.entries.length)throw new Error();
  await db.customerLoginChallenge.updateMany({where:{id,consumedAt:null},data:{ready:true}});
 }catch{await db.customerLoginChallenge.updateMany({where:{id},data:{consumedAt:new Date()}});throw new ShopError('SMS_UNAVAILABLE',503);}
 return {challengeId:id,expiresIn:300,resendAfter:60};
}
export async function authorizeCustomer(raw:unknown){
 if(!customerLoginEnabled())return null;
 const parsed=verifyCodeSchema.safeParse(raw);if(!parsed.success)return null;
 if(!await consumeRateLimit('customer:verify:global',60,60))return null;
 const db=getDb(),{challengeId,code}=parsed.data;
 // Serialize redemption and resend under the same mobile lock, then lock the row.
 const found=await db.customerLoginChallenge.findUnique({where:{id:challengeId},select:{mobile:true}});if(!found)return null;
 try{await limit(found.mobile,'verify',10,600);}catch{return null;}
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer:${found.mobile}`},0))::text`;
  await tx.$queryRaw`SELECT "id" FROM "CustomerLoginChallenge" WHERE "id"=${challengeId}::uuid FOR UPDATE`;
  const challenge=await tx.customerLoginChallenge.findUnique({where:{id:challengeId}}),now=new Date();
  if(!challenge||!challenge.ready||challenge.consumedAt||challenge.expiresAt<=now||challenge.attempts>=5)return null;
  const valid=otpMatches(challenge.verifier,otpDigest(secret(),challengeId,challenge.mobile,code));
  await tx.customerLoginChallenge.update({where:{id:challengeId},data:{attempts:{increment:1},...((valid||challenge.attempts===4)?{consumedAt:now}:{})}});
  if(!valid)return null;
  let user=await tx.user.findUnique({where:{mobile:challenge.mobile}});
  // Customer OTP can never sign in an admin or reactivate a disabled account.
  if(user&&(!user.active||user.role!=='CUSTOMER'||user.twoFactorEnabled))return null;
  if(!user){user=await tx.user.create({data:{name:challenge.name,mobile:challenge.mobile,mobileVerifiedAt:now,marketingSms:challenge.marketingSms,role:'CUSTOMER',consentEvents:{create:{allowed:challenge.marketingSms,policyVersion:consentVersion,source:'registration'}}}});}
  else user=await tx.user.update({where:{id:user.id},data:{mobileVerifiedAt:now}});
  return {id:user.id,name:user.name,role:'CUSTOMER',sessionVersion:user.sessionVersion};
 });
}
