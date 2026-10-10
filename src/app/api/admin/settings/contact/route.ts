import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json,ShopError} from '@/lib/server/shop-http';
import {contactEditSchema} from '@/lib/validation/admin';
import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/admin-products';
import {revalidateTag} from 'next/cache';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
const {user,body}=await adminBody(request,contactEditSchema);await getDb().$transaction(async tx=>{await tx.setting.upsert({where:{key:'contact'},create:{key:'contact',value:body},update:{value:body}});await audit(tx,user.id,'CONTACT_SETTINGS','contact');});revalidateTag('settings',{expire:0});return json({ok:true});
}catch(e){return adminFailure(e);}}
