import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json,ShopError} from '@/lib/server/shop-http';
import {zoneSchema} from '@/lib/validation/admin';
import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/admin-products';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
const {user,body}=await adminBody(request,zoneSchema);const {id,expectedUpdatedAt,...data}=body;await getDb().$transaction(async tx=>{if(id){await tx.$queryRaw`SELECT "id" FROM "DeliveryZone" WHERE "id"=${id} FOR UPDATE`;const old=await tx.deliveryZone.findUnique({where:{id}});if(!old || old.updatedAt.toISOString()!==expectedUpdatedAt)throw new ShopError('CONFLICT',409);}const saved=id?await tx.deliveryZone.update({where:{id},data}):await tx.deliveryZone.create({data});await audit(tx,user.id,'ZONE_SAVE',saved.id);});return json({ok:true});
}catch(e){return adminFailure(e);}}
