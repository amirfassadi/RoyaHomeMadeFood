import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {smsPolicyEditSchema} from '@/lib/validation/sms-policy';
import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/admin-products';
import {json,ShopError} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const {user,body}=await adminBody(request,smsPolicyEditSchema);
 const result=await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('settings:sms-policy',0))::text`;
  const old=await tx.setting.findUnique({where:{key:'sms-policy'}});
  if((old?.updatedAt.toISOString()??null)!==body.expectedUpdatedAt)throw new ShopError('CONFLICT',409);
  const saved=await tx.setting.upsert({where:{key:'sms-policy'},create:{key:'sms-policy',value:body.settings},update:{value:body.settings}});
  await audit(tx,user.id,body.settings.enabled?'SMS_RESUMED':'SMS_PAUSED','sms-policy');return saved;
 });
 return json({ok:true,updatedAt:result.updatedAt.toISOString()});
}catch(error){return adminFailure(error);}}
