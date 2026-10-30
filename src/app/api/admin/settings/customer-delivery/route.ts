import {deliveryPolicy,saveDeliveryPolicy} from '@/lib/server/customer-messages';
import {deliveryPolicyEditSchema} from '@/lib/validation/customer-messages';
import {requireAdmin} from '@/lib/server/auth';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json,ShopError} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function GET(){try{const user=await requireAdmin();if(!user.adminOwner)throw new ShopError('FORBIDDEN',403);return json(await deliveryPolicy());}catch(e){return adminFailure(e);}}
export async function POST(request:Request){try{const {user,body}=await adminBody(request,deliveryPolicyEditSchema);if(!user.adminOwner)throw new ShopError('FORBIDDEN',403);return json(await saveDeliveryPolicy(body,user.id));}catch(e){return adminFailure(e);}}
