import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json} from '@/lib/server/shop-http';
import {shippingEditSchema} from '@/lib/validation/shipping';
import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/admin-products';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const {user,body}=await adminBody(request,shippingEditSchema);
 await getDb().$transaction(async tx=>{await tx.setting.upsert({where:{key:'shipping'},create:{key:'shipping',value:body},update:{value:body}});await audit(tx,user.id,'SHIPPING_SETTINGS','shipping');});
 return json({ok:true});
}catch(e){return adminFailure(e);}}
