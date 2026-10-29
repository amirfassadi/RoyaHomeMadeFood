import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {bankTransferEditSchema} from '@/lib/validation/bank-transfer';
import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/admin-products';
import {json,ShopError} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const {user,body}=await adminBody(request,bankTransferEditSchema);
 const saved=await getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('settings:bank-transfer',0))::text`;
  const current=await tx.setting.findUnique({where:{key:'bank-transfer'}});
  if((current?.updatedAt.toISOString()??null)!==body.expectedUpdatedAt)throw new ShopError('CONFLICT',409);
  const result=await tx.setting.upsert({where:{key:'bank-transfer'},create:{key:'bank-transfer',value:body.settings},update:{value:body.settings}});
  await audit(tx,user.id,'BANK_TRANSFER_SETTINGS','bank-transfer');
  return result;
 });
 return json({ok:true,updatedAt:saved.updatedAt.toISOString()});
}catch(error){return adminFailure(error);}}
