import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json} from '@/lib/server/shop-http';
import {dispatchActionSchema} from '@/lib/validation/shipping';
import {dispatchReadyOrder} from '@/lib/server/courier-dispatch';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
 const {user,body}=await adminBody(request,dispatchActionSchema,'orders');
 const dispatch=await dispatchReadyOrder(body.id,user.id);
 return json({ok:true,state:dispatch.requestState});
}catch(e){return adminFailure(e);}}
