import 'server-only';
import {getDb} from './db';
import {consumeRateLimit} from './rate-limit';
import {hashPassword,verifyPassword} from '@/lib/admin/password';
import {ShopError} from './shop-http';
import {audit} from './admin-products';
export async function changeAdminPassword(adminId:string,currentPassword:string,newPassword:string,expectedSessionVersion:number){
 if(!await consumeRateLimit(`admin-password:${adminId}`,5,600))throw new ShopError('RATE_LIMIT',429);
 const db=getDb(),user=await db.user.findUnique({where:{id:adminId}});
 const valid=await verifyPassword(currentPassword,user?.passwordHash??null);
 if(!valid||!user?.active||user.role!=='ADMIN'||user.sessionVersion!==expectedSessionVersion)throw new ShopError('CURRENT_PASSWORD',403);
 const passwordHash=await hashPassword(newPassword);
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${adminId} FOR UPDATE`;
  const locked=await tx.user.findUnique({where:{id:adminId}});
  if(!locked?.active||locked.role!=='ADMIN'||locked.passwordHash!==user.passwordHash||locked.sessionVersion!==user.sessionVersion)throw new ShopError('CONFLICT',409);
  await tx.user.update({where:{id:adminId},data:{passwordHash,sessionVersion:{increment:1}}});
  await audit(tx,adminId,'ADMIN_PASSWORD_CHANGED',adminId);
 });
}
