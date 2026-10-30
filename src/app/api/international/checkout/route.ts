import {optionalCustomer} from '@/lib/server/customer-session';
import {internationalCheckoutSchema} from '@/lib/validation/checkout';
import {readShopBody,mobileLimit,json,failure,ShopError} from '@/lib/server/shop-http';
import {requireForeign} from '@/lib/server/international';
import {placeOrder} from '@/lib/server/checkout';
import {initiateCrypto} from '@/lib/server/btcpay';
import {expireOrderReservation} from '@/lib/server/reservations';
import {getDb} from '@/lib/server/db';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
 const customer=await optionalCustomer();if(!customer)throw new ShopError('UNAUTHORIZED',401);
 requireForeign(request);const input=await readShopBody(request,internationalCheckoutSchema,'foreign-checkout');await mobileLimit(input.mobile,'foreign-checkout',5);
 // Recipient's Iranian mobile is never treated as the overseas buyer's identity.
 let order;try{order=await placeOrder(input,customer);}catch(error){if(error instanceof ShopError&&['MOBILE_VERIFICATION_REQUIRED','MOBILE_VERIFICATION_UNAVAILABLE'].includes(error.code))return json({error:error.code,checkoutNotStarted:true},error.status);throw error;}
 await expireOrderReservation(order.id);order=await getDb().order.findUniqueOrThrow({where:{id:order.id}});let paymentUrl=null;try{paymentUrl=await initiateCrypto(order.id);}catch{}
 const p=await getDb().cryptoPayment.findUniqueOrThrow({where:{orderId:order.id}});
 return json({status:order.status,reservationExpiresAt:order.reservationExpiresAt?.toISOString()??null,reservationExpiredAt:order.reservationExpiredAt?.toISOString()??null,refundRequired:order.refundRequired,trackingCode:order.trackingCode,totalToman:order.totalToman,amountUsdCents:p.amountUsdCents,estimatedDeliveryAt:order.paymentStatus==='PAID'&&order.status!=='CANCELLED'?order.estimatedDeliveryAt.toISOString():null,paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,paymentUrl},201);
}catch(e){return failure(e);}}
