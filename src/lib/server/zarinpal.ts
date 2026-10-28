import 'server-only';
import {z} from 'zod';
import {getDb} from './db';
import {consumeRateLimit} from './rate-limit';
import {ShopError} from './shop-http';
import {tomanToRial} from '@/lib/domain/checkout';
import {estimateDelivery} from '@/lib/domain/order';
export function gatewayConfiguration(){
  const merchantId=z.uuid().safeParse(process.env.ZARINPAL_MERCHANT_ID);
  const site=z.url().safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  if(!merchantId.success || !site.success)throw new ShopError('PAYMENT_UNAVAILABLE',503);
  const sandbox=process.env.ZARINPAL_SANDBOX==='true';
  if(!sandbox && !site.data.startsWith('https://'))throw new ShopError('PAYMENT_UNAVAILABLE',503);
  return {merchantId:merchantId.data,sandbox,origin:new URL(site.data).origin};
}
const host=(sandbox:boolean)=>sandbox?'https://sandbox.zarinpal.com':'https://payment.zarinpal.com';
export const paymentUrl=(sandbox:boolean,authority:string)=>`${host(sandbox)}/pg/StartPay/${encodeURIComponent(authority)}`;
async function call(sandbox:boolean,action:'request'|'verify',body:unknown){
  const response=await fetch(`${host(sandbox)}/pg/v4/payment/${action}.json`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!response.ok)throw new Error('Gateway HTTP error');
  const raw:unknown=await response.json();
  const parsed=z.object({data:z.union([z.object({code:z.number().int(),authority:z.string().regex(/^[AS][A-Za-z0-9]{35}$/).optional(),ref_id:z.union([z.number().int().safe(),z.string().regex(/^\d+$/)]).optional()}),z.array(z.unknown())]),errors:z.unknown().optional()}).safeParse(raw);
  if(!parsed.success || Array.isArray(parsed.data.data))throw new Error('Invalid gateway response');
  return parsed.data.data;
}
export async function initiatePayment(orderId:string){
  const db=getDb(), attempt=await db.paymentAttempt.findUnique({where:{orderId},include:{order:true}});
  if(!attempt)return null;
  if(attempt.order.paymentStatus==='PAID' || attempt.order.status==='CANCELLED')return null;
  if(attempt.authority)return paymentUrl(attempt.sandbox,attempt.authority);
  // A single caller can initiate. Uncertain network results are never retried blindly.
  const claim=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${attempt.orderId} FOR UPDATE`;
    const order=await tx.order.findUniqueOrThrow({where:{id:attempt.orderId}});
    if(order.status==='CANCELLED' || order.paymentStatus==='PAID')return {count:0};
    return tx.paymentAttempt.updateMany({where:{id:attempt.id,requestState:'NEW'},data:{requestState:'REQUESTING'}});
  });
  if(!claim.count)return null;
  let response;
  try{
    const origin=gatewayConfiguration().origin;
    const callback=new URL('/api/payment/callback',origin);callback.searchParams.set('attempt',attempt.id);callback.searchParams.set('nonce',attempt.callbackNonce);
    response=await call(attempt.sandbox,'request',{merchant_id:attempt.merchantId,amount:tomanToRial(attempt.amountToman),currency:'IRR',description:`Roya Food ${attempt.order.trackingCode}`,callback_url:callback.toString(),metadata:{mobile:attempt.order.mobile,order_id:attempt.order.trackingCode}});
  }catch{
    await db.paymentAttempt.update({where:{id:attempt.id},data:{requestState:'UNKNOWN'}});return null;
  }
  if(response.code!==100 || !response.authority){await db.paymentAttempt.update({where:{id:attempt.id},data:{requestState:'REJECTED',status:'FAILED'}});return null;}
  // Store authority before providing a redirect to the customer.
  await db.paymentAttempt.update({where:{id:attempt.id},data:{authority:response.authority,requestState:'READY'}});
  return paymentUrl(attempt.sandbox,response.authority);
}
export async function verifyPayment(attemptId:string,nonce:string,authority:string,status:string|null){
  const db=getDb(), attempt=await db.paymentAttempt.findUnique({where:{id:attemptId},include:{order:true}});
  if(!attempt || attempt.callbackNonce!==nonce || attempt.authority!==authority)throw new ShopError('INVALID');
  const locale=attempt.order.locale;
  if(attempt.order.paymentStatus==='PAID')return {locale,result:'paid'};
  // Browser-returned NOK is not proof of a failed charge; keep the reservation.
  if(status!=='OK')return {locale,result:'pending'};
  if(!await consumeRateLimit(`payment-verify:${attempt.id}`,10,60))return {locale,result:'pending'};
  let verified;
  try{verified=await call(attempt.sandbox,'verify',{merchant_id:attempt.merchantId,amount:tomanToRial(attempt.amountToman),authority});}catch{return {locale,result:'pending'};}
  if(![100,101].includes(verified.code))return {locale,result:'pending'};
  if(verified.code===100 && verified.ref_id===undefined)return {locale,result:'pending'};
  await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${attempt.orderId} FOR UPDATE`;
    const current=await tx.order.findUniqueOrThrow({where:{id:attempt.orderId}});
    if(current.paymentStatus==='PAID')return;
    const now=new Date();
    await tx.paymentAttempt.update({where:{id:attempt.id},data:{status:'PAID',referenceId:verified.ref_id===undefined?undefined:String(verified.ref_id),verifiedAt:now}});
    await tx.order.update({where:{id:attempt.orderId},data:{paymentStatus:'PAID',paymentConfirmedAt:now,estimatedDeliveryAt:estimateDelivery(now,[current.longestPreparationMinutes],current.zoneDeliveryMinutes)}});
  });
  return {locale,result:'paid'};
}
