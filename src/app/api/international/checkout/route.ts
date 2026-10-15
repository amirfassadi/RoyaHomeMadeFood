import {internationalCheckoutSchema} from '@/lib/validation/checkout';
import {readShopBody,mobileLimit,json,failure} from '@/lib/server/shop-http';
import {requireForeign} from '@/lib/server/international';
import {placeOrder} from '@/lib/server/checkout';
import {initiateCrypto} from '@/lib/server/btcpay';
import {getDb} from '@/lib/server/db';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
 requireForeign(request);const input=await readShopBody(request,internationalCheckoutSchema,'foreign-checkout');await mobileLimit(input.mobile,'foreign-checkout',5);
 // Recipient's Iranian mobile is never treated as the overseas buyer's identity.
 const order=await placeOrder(input);let paymentUrl=null;try{paymentUrl=await initiateCrypto(order.id);}catch{}
 const p=await getDb().cryptoPayment.findUniqueOrThrow({where:{orderId:order.id}});
 return json({trackingCode:order.trackingCode,totalToman:order.totalToman,amountUsdCents:p.amountUsdCents,estimatedDeliveryAt:order.estimatedDeliveryAt.toISOString(),paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,paymentUrl},201);
}catch(e){return failure(e);}}
