import {withBackendTrust} from '@/lib/server/api-guard';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json,ShopError} from '@/lib/server/shop-http';
import {statusSchema} from '@/lib/validation/admin';
import {changeOrderStatus} from '@/lib/server/admin-orders';
import {revalidateTag} from 'next/cache';
export const runtime='nodejs';
export const maxDuration=60;
async function handlePOST(request:Request){try{
const {user,body}=await adminBody(request,statusSchema);await changeOrderStatus(body.id,body.expectedStatus,body.status,user.id);revalidateTag('catalog',{expire:0});return json({ok:true});
}catch(e){return adminFailure(e);}}

export const POST=withBackendTrust(handlePOST);
