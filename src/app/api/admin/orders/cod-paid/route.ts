import {withBackendTrust} from '@/lib/server/api-guard';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json,ShopError} from '@/lib/server/shop-http';
import {orderIdSchema} from '@/lib/validation/admin';
import {recordCodPayment} from '@/lib/server/admin-orders';
export const runtime='nodejs';
export const maxDuration=60;
async function handlePOST(request:Request){try{
const {user,body}=await adminBody(request,orderIdSchema);await recordCodPayment(body.id,user.id);return json({ok:true});
}catch(e){return adminFailure(e);}}

export const POST=withBackendTrust(handlePOST);
