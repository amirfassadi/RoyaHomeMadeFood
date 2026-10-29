import {optionalCustomer} from '@/lib/server/customer-session';
import {domesticCheckoutSchema} from '@/lib/validation/checkout';
import {readShopBody,mobileLimit,json,failure,ShopError} from '@/lib/server/shop-http';
import {placeOrder} from '@/lib/server/checkout';
import {initiatePayment} from '@/lib/server/zarinpal';
import {expireOrderReservation} from '@/lib/server/reservations';
import {getDb} from '@/lib/server/db';
import {bankTransferDetails} from '@/lib/server/manual-payment';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
  const input=await readShopBody(request,domesticCheckoutSchema,'checkout');await mobileLimit(input.mobile,'checkout',5);
  let order;
  try{order=await placeOrder(input,await optionalCustomer());}
  catch(error){if(error instanceof ShopError&&['PAYMENT_UNAVAILABLE','BANK_TRANSFER_UNAVAILABLE','MOBILE_VERIFICATION_REQUIRED','MOBILE_VERIFICATION_UNAVAILABLE'].includes(error.code))return json({error:error.code,checkoutNotStarted:true},error.status);throw error;}
  await expireOrderReservation(order.id);
  order=await getDb().order.findUniqueOrThrow({where:{id:order.id}});
  let paymentUrl=null;
  if(order.paymentMethod==='ZARINPAL')try{paymentUrl=await initiatePayment(order.id);}catch{/* Order is saved; tracking recovers uncertain payment initiation. */}
  return json({status:order.status,reservationExpiresAt:order.reservationExpiresAt?.toISOString()??null,reservationExpiredAt:order.reservationExpiredAt?.toISOString()??null,refundRequired:order.refundRequired,invoiceNumber:order.invoiceNumber,paymentReference:order.paymentReference,bankTransfer:order.paymentMethod==='BANK_TRANSFER'&&order.status!=='CANCELLED'&&order.paymentStatus!=='PAID'?await bankTransferDetails(order.bankTransferSnapshot):null,trackingCode:order.trackingCode,totalToman:order.totalToman,estimatedDeliveryAt:order.paymentStatus==='PAID'&&order.status!=='CANCELLED'?order.estimatedDeliveryAt.toISOString():null,paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,paymentUrl},201);
}catch(e){return failure(e);}}
