import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json,ShopError} from '@/lib/server/shop-http';
import {orderIdSchema} from '@/lib/validation/admin';
import {getDb} from '@/lib/server/db';
import {verifyPayment} from '@/lib/server/zarinpal';
import {audit} from '@/lib/server/admin-products';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
const {user,body}=await adminBody(request,orderIdSchema);const p=await getDb().paymentAttempt.findUnique({where:{orderId:body.id}});if(!p?.authority)throw new ShopError('GATEWAY_REVIEW',409);const result=await verifyPayment(p.id,p.callbackNonce,p.authority,'OK');await audit(getDb(),user.id,'PAYMENT_RECONCILE',body.id);return json(result);
}catch(e){return adminFailure(e);}}
