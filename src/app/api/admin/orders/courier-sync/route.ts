import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json} from '@/lib/server/shop-http';
import {dispatchActionSchema,dispatchReconcileSchema} from '@/lib/validation/shipping';
import {syncCourierOrder} from '@/lib/server/courier-dispatch';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
 const {user,body}=await adminBody(request,dispatchActionSchema.or(dispatchReconcileSchema));
 const dispatch=await syncCourierOrder(body.id,user.id,'externalId' in body?body.externalId:undefined);
 return json({ok:true,state:dispatch.requestState});
}catch(e){return adminFailure(e);}}
