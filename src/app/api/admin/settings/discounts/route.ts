import {withBackendTrust} from '@/lib/server/api-guard';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json,ShopError} from '@/lib/server/shop-http';
import {discountSchema} from '@/lib/validation/admin';
import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/admin-products';
export const runtime='nodejs';
export const maxDuration=60;
async function handlePOST(request:Request){try{
const {user,body}=await adminBody(request,discountSchema);const {id,expectedUpdatedAt,...data}=body;await getDb().$transaction(async tx=>{if(id){await tx.$queryRaw`SELECT "id" FROM "DiscountCode" WHERE "id"=${id} FOR UPDATE`;const old=await tx.discountCode.findUnique({where:{id}});if(!old || old.updatedAt.toISOString()!==expectedUpdatedAt)throw new ShopError('CONFLICT',409);if(data.usageLimit!==null && data.usageLimit<old.usedCount)throw new ShopError('INVALID');}const saved=id?await tx.discountCode.update({where:{id},data}):await tx.discountCode.create({data});await audit(tx,user.id,'DISCOUNT_SAVE',saved.id);});return json({ok:true});
}catch(e){return adminFailure(e);}}

export const POST=withBackendTrust(handlePOST);
