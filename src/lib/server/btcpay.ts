import 'server-only';
import {getDb} from './db';
import {cryptoConfig} from './international';
import {ShopError} from './shop-http';
import {consumeRateLimit} from './rate-limit';
import {decimalUsd} from '@/lib/international';
import {invoiceSchema,amountMatches,safeCheckoutUrl} from '@/lib/crypto-invoice';
import {estimateDelivery} from '@/lib/domain/order';
type Payment={id:string;storeId:string;gatewayOrigin:string;amountUsdCents:number;order:{trackingCode:string}};
function configuration(p:Payment){const c=cryptoConfig(false);if(c.url!==p.gatewayOrigin||c.store!==p.storeId)throw new ShopError('GATEWAY_REVIEW',409);return c;}
async function call(p:Payment,invoiceId?:string,body?:unknown){
 const c=configuration(p),url=`${p.gatewayOrigin}/api/v1/stores/${encodeURIComponent(p.storeId)}/invoices${invoiceId?`/${encodeURIComponent(invoiceId)}`:''}`;
 const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`token ${c.key}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store'});
 if(!r.ok)throw new ShopError('PAYMENT_UNAVAILABLE',503);
 const invoice=invoiceSchema.parse(await r.json());
 if(invoice.currency!=='USD'||!amountMatches(invoice.amount,p.amountUsdCents)||invoice.metadata.orderId!==p.order.trackingCode||invoice.metadata.royaPaymentId!==p.id||(invoiceId&&invoice.id!==invoiceId)||!safeCheckoutUrl(invoice.checkoutLink,p.gatewayOrigin))throw new ShopError('GATEWAY_REVIEW',409);
 return invoice;
}
export async function initiateCrypto(orderId:string){
 const db=getDb(),p=await db.cryptoPayment.findUnique({where:{orderId},include:{order:true}});
 if(!p||p.order.status==='CANCELLED'||p.order.paymentStatus==='PAID')return null;
 if(p.invoiceId)return p.invoiceStatus==='New'?p.checkoutUrl:null;
 const c=configuration(p);
 const claim=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${orderId} FOR UPDATE`;
  const o=await tx.order.findUniqueOrThrow({where:{id:orderId}});
  if(o.status==='CANCELLED'||o.paymentStatus==='PAID'||p.rateExpiresAt.getTime()<=Date.now())return {count:0};
  return tx.cryptoPayment.updateMany({where:{id:p.id,requestState:'NEW'},data:{requestState:'REQUESTING'}});
 });
 if(!claim.count)return null;
 // A timeout can mean the invoice exists remotely. Never POST a second invoice.
 try{
  const invoice=await call(p,undefined,{amount:decimalUsd(p.amountUsdCents),currency:'USD',metadata:{orderId:p.order.trackingCode,royaPaymentId:p.id},checkout:{expirationMinutes:15,monitoringMinutes:1440,paymentTolerance:0,speedPolicy:'MediumSpeed',redirectURL:`${c.site}/${p.order.locale}/tracking/`,redirectAutomatically:false}});
  await db.cryptoPayment.update({where:{id:p.id},data:{invoiceId:invoice.id,checkoutUrl:invoice.checkoutLink,invoiceStatus:invoice.status,additionalStatus:invoice.additionalStatus,requestState:'READY'}});
  return invoice.status==='New'?invoice.checkoutLink:null;
 }catch{
  await db.cryptoPayment.updateMany({where:{id:p.id,requestState:'REQUESTING'},data:{requestState:'UNKNOWN'}});return null;
 }
}
// Events are hints: authoritative invoice data is always fetched using the store-scoped API key.
export async function reconcileCrypto(orderId:string,recoveredInvoiceId?:string){
 const db=getDb(),p=await db.cryptoPayment.findUnique({where:{orderId},include:{order:true}});
 if(!p)throw new ShopError('NOT_FOUND',404);
 if(p.order.paymentStatus==='PAID')return {result:'paid'};
 const id=p.invoiceId??recoveredInvoiceId;
 if(!id)throw new ShopError('GATEWAY_REVIEW',409);
 if(!await consumeRateLimit(`crypto-verify:${p.id}`,20,60))throw new ShopError('RATE_LIMIT',429);
 const invoice=await call(p,id);
 const settled=invoice.status==='Settled'&&invoice.additionalStatus==='None';
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${orderId} FOR UPDATE`;
  const current=await tx.cryptoPayment.findUniqueOrThrow({where:{orderId}}),o=await tx.order.findUniqueOrThrow({where:{id:orderId}});
  if(current.invoiceId&&current.invoiceId!==invoice.id)throw new ShopError('GATEWAY_REVIEW',409);
  if(o.paymentStatus==='PAID')return;
  const now=new Date();
  await tx.cryptoPayment.update({where:{id:p.id},data:{invoiceId:invoice.id,checkoutUrl:invoice.checkoutLink,invoiceStatus:invoice.status,additionalStatus:invoice.additionalStatus,requestState:'READY',...(settled?{verifiedAt:now}:{})}});
  if(settled)await tx.order.update({where:{id:orderId},data:{paymentStatus:'PAID',paymentConfirmedAt:now,...(o.status==='CANCELLED'?{refundRequired:true}:{estimatedDeliveryAt:estimateDelivery(now,[o.longestPreparationMinutes],o.zoneDeliveryMinutes)})}});
 });
 return {result:settled?'paid':'pending'};
}
