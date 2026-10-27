import {withBackendTrust} from '@/lib/server/api-guard';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json,ShopError} from '@/lib/server/shop-http';
import {archiveSchema} from '@/lib/validation/admin';
import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/admin-products';
import {revalidateTag} from 'next/cache';
export const runtime='nodejs';
export const maxDuration=60;
async function handlePOST(request:Request){try{
const {user,body}=await adminBody(request,archiveSchema);await getDb().$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id"=${body.id} FOR UPDATE`;const p=await tx.product.findUnique({where:{id:body.id}});if(!p || p.updatedAt.toISOString()!==body.expectedUpdatedAt)throw new ShopError('CONFLICT',409);await tx.product.update({where:{id:body.id},data:{active:false}});await audit(tx,user.id,'PRODUCT_ARCHIVE',body.id);});revalidateTag('catalog',{expire:0});return json({ok:true});
}catch(e){return adminFailure(e);}}

export const POST=withBackendTrust(handlePOST);
