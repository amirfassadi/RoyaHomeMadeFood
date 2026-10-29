import 'server-only';
import {createHash,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import type {Prisma} from '@/generated/prisma/client';
import {getDb} from './db';
import {ShopError,mobileLimit} from './shop-http';
import {consumeRateLimit} from './rate-limit';
import {otpDigest,otpMatches} from '@/lib/customer/otp';
import {sendVerificationSms,smsConfigured} from './sms';
import {smsEnabled} from './sms-policy';
import {isDemoCatalog} from './catalog';
export function checkoutMobileEnabled(){return !isDemoCatalog()&&!!process.env.DATABASE_URL&&smsConfigured();}
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
function secret(){const s=process.env.CUSTOMER_OTP_SECRET;if(!s||s.length<32)throw new ShopError('MOBILE_VERIFICATION_UNAVAILABLE',503);return s;}
export async function requestCheckoutCode(mobile:string){
 if(!await smsEnabled())throw new ShopError('SMS_PAUSED',503);
 if(!checkoutMobileEnabled())throw new ShopError('MOBILE_VERIFICATION_UNAVAILABLE',503);
 if(!await consumeRateLimit('checkout:sms:global',30,3600))throw new ShopError('RATE_LIMIT',429);
 await mobileLimit(mobile,'checkout-code',3);
 if(!await consumeRateLimit(`checkout:cooldown:${digest(mobile)}`,1,60))throw new ShopError('RATE_LIMIT',429);
 const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');
 await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout-mobile:${mobile}`},0))::text`;
  await tx.checkoutMobileChallenge.updateMany({where:{mobile,consumedAt:null},data:{consumedAt:new Date()}});
  await tx.checkoutMobileChallenge.create({data:{id,mobile,verifier:otpDigest(secret(),id,mobile,code),expiresAt:new Date(Date.now()+300000)}});
 });
 try{await sendVerificationSms(mobile,code);await getDb().checkoutMobileChallenge.updateMany({where:{id,consumedAt:null},data:{ready:true}});}
 catch(error){await getDb().checkoutMobileChallenge.updateMany({where:{id},data:{consumedAt:new Date()}});throw error;}
 return {challengeId:id,resendAfter:60,expiresIn:300};
}
export async function verifyCheckoutCode(challengeId:string,code:string){
 if(!await smsEnabled())throw new ShopError('SMS_PAUSED',503);
 if(!await consumeRateLimit('checkout:verify:global',60,60))throw new ShopError('RATE_LIMIT',429);
 const found=await getDb().checkoutMobileChallenge.findUnique({where:{id:challengeId},select:{mobile:true}});
 if(!found)throw new ShopError('MOBILE_CODE_INVALID');
 await mobileLimit(found.mobile,'checkout-verify',10);
 // Return failures outside the transaction so a wrong attempt is committed.
 const proof=await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout-mobile:${found.mobile}`},0))::text`;
  await tx.$queryRaw`SELECT "id" FROM "CheckoutMobileChallenge" WHERE "id"=${challengeId}::uuid FOR UPDATE`;
  const c=await tx.checkoutMobileChallenge.findUnique({where:{id:challengeId}}),now=new Date();
  if(!c||!c.ready||c.consumedAt||c.verifiedAt||c.expiresAt<=now||c.attempts>=5)return null;
  const valid=otpMatches(c.verifier,otpDigest(secret(),c.id,c.mobile,code));
  const token=valid?randomBytes(32).toString('hex'):null;
  await tx.checkoutMobileChallenge.update({where:{id:c.id},data:{attempts:{increment:1},...(valid?{verifiedAt:now,proofHash:digest(token!),proofExpiresAt:new Date(now.getTime()+1800000)}:c.attempts===4?{consumedAt:now}:{})}});
  return token?{challengeId:c.id,token,expiresAt:new Date(now.getTime()+1800000).toISOString()}:null;
 });
 if(!proof)throw new ShopError('MOBILE_CODE_INVALID');return proof;
}
export async function consumeCheckoutProof(tx:Prisma.TransactionClient,mobile:string,proof?:{challengeId:string;token:string}){
 if(!proof)throw new ShopError('MOBILE_VERIFICATION_REQUIRED',403);
 await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout-mobile:${mobile}`},0))::text`;
 await tx.$queryRaw`SELECT "id" FROM "CheckoutMobileChallenge" WHERE "id"=${proof.challengeId}::uuid FOR UPDATE`;
 const c=await tx.checkoutMobileChallenge.findUnique({where:{id:proof.challengeId}}),now=new Date();
 const actual=Buffer.from(digest(proof.token),'hex'),expected=Buffer.from(c?.proofHash??'','hex');
 if(!c||c.mobile!==mobile||!c.verifiedAt||c.consumedAt||!c.proofExpiresAt||c.proofExpiresAt<=now||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new ShopError('MOBILE_VERIFICATION_REQUIRED',403);
 await tx.checkoutMobileChallenge.update({where:{id:c.id},data:{consumedAt:now}});
}
