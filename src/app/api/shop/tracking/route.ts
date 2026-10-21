import {withBackendTrust} from '@/lib/server/api-guard';
import {reconcileCrypto,initiateCrypto} from '@/lib/server/btcpay';
import {trackingSchema} from '@/lib/validation/checkout';
import {readShopBody,mobileLimit,json,failure,ShopError} from '@/lib/server/shop-http';
import {getDb} from '@/lib/server/db';
import {paymentUrl} from '@/lib/server/zarinpal';
export const runtime='nodejs';
async function handlePOST(request:Request){try{
 const input=await readShopBody(request,trackingSchema,'tracking');await mobileLimit(input.mobile,'tracking');
 const o=await getDb().order.findFirst({where:{trackingCode:input.trackingCode,mobile:input.mobile},include:{items:true,cryptoPayment:true,statusHistory:{orderBy:{createdAt:'asc'}},paymentAttempts:true}});
 if(!o)throw new ShopError('NOT_FOUND',404);
 let cryptoUrl:string|null=null;
 if(o.cryptoPayment&&o.status!=='CANCELLED'&&o.paymentStatus!=='PAID'){
  try{if(o.cryptoPayment.invoiceId)await reconcileCrypto(o.id);else cryptoUrl=await initiateCrypto(o.id);}catch{}
  const fresh=await getDb().order.findUniqueOrThrow({where:{id:o.id},include:{cryptoPayment:true}});
  o.paymentStatus=fresh.paymentStatus;o.estimatedDeliveryAt=fresh.estimatedDeliveryAt;o.cryptoPayment=fresh.cryptoPayment;
  cryptoUrl=o.cryptoPayment?.invoiceStatus==='New'?o.cryptoPayment.checkoutUrl:cryptoUrl;
 }
 const p=o.paymentAttempts[0];
 // Explicit allowlist prevents exposing customer addresses or internal notes.
 return json({trackingCode:o.trackingCode,status:o.status,paymentStatus:o.paymentStatus,paymentMethod:o.paymentMethod,amountUsdCents:o.cryptoPayment?.amountUsdCents,totalToman:o.totalToman,subtotalToman:o.subtotalToman,discountToman:o.discountToman,deliveryFeeToman:o.deliveryFeeToman,estimatedDeliveryAt:o.estimatedDeliveryAt.toISOString(),createdAt:o.createdAt.toISOString(),items:o.items.map(i=>({nameFa:i.productNameFa,nameEn:i.productNameEn,quantity:Number(i.quantity),unit:i.unit,lineTotalToman:i.lineTotalToman})),history:o.statusHistory.map(h=>({status:h.status,date:h.createdAt.toISOString()})),paymentUrl:o.paymentStatus!=='PAID'&&o.status!=='CANCELLED'&&o.cryptoPayment?cryptoUrl:o.paymentStatus!=='PAID' && o.status!=='CANCELLED' && p?.authority?paymentUrl(p.sandbox,p.authority):null});
}catch(e){return failure(e);}}

export const POST=withBackendTrust(handlePOST);
