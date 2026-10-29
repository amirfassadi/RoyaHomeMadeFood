import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {seoEditSchema} from '@/lib/validation/seo';
import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/admin-products';
import {json,ShopError} from '@/lib/server/shop-http';
import {revalidateTag} from 'next/cache';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const {user,body}=await adminBody(request,seoEditSchema);
 const saved=await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('settings:seo',0))::text`;
  const old=await tx.setting.findUnique({where:{key:'seo'}});
  if((old?.updatedAt.toISOString()??null)!==body.expectedUpdatedAt)throw new ShopError('CONFLICT',409);
  const result=await tx.setting.upsert({where:{key:'seo'},create:{key:'seo',value:body.settings},update:{value:body.settings}});
  await audit(tx,user.id,'SEO_SETTINGS','seo');return result;
 });
 revalidateTag('seo',{expire:0});
 return json({ok:true,updatedAt:saved.updatedAt.toISOString()});
}catch(error){return adminFailure(error);}}
