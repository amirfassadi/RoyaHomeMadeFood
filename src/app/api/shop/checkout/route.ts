import {optionalCustomer} from '@/lib/server/customer-session';
import {checkoutSchema} from '@/lib/validation/checkout';
import {readShopBody,mobileLimit,json,failure} from '@/lib/server/shop-http';
import {placeOrder} from '@/lib/server/checkout';
import {initiatePayment} from '@/lib/server/zarinpal';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
  const input=await readShopBody(request,checkoutSchema,'checkout');await mobileLimit(input.mobile,'checkout',5);
  const order=await placeOrder(input,await optionalCustomer());
  let paymentUrl=null;
  if(order.paymentMethod==='ZARINPAL')try{paymentUrl=await initiatePayment(order.id);}catch{/* Order is saved; tracking recovers uncertain payment initiation. */}
  return json({trackingCode:order.trackingCode,totalToman:order.totalToman,estimatedDeliveryAt:order.estimatedDeliveryAt.toISOString(),paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,paymentUrl},201);
}catch(e){return failure(e);}}
