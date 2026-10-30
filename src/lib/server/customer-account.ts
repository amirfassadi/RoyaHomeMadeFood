import 'server-only';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {consumeRateLimit} from './rate-limit';
import {hashPassword,verifyPassword} from '@/lib/admin/password';
export const customerOrderSelect={trackingCode:true,status:true,paymentStatus:true,totalToman:true,createdAt:true} as const;
export async function customerOrderHistory(userId:string,page=1){const db=getDb(),where={userId};const [orders,count]=await Promise.all([db.order.findMany({where,select:customerOrderSelect,orderBy:[{createdAt:'desc'},{id:'desc'}],take:20,skip:(page-1)*20}),db.order.count({where})]);return {orders:orders.map(o=>({...o,createdAt:o.createdAt.toISOString()})),page,totalPages:Math.max(1,Math.ceil(count/20))};}
export async function customerOrderTracking(userId:string,trackingCode:string){const order=await getDb().order.findFirst({where:{userId,trackingCode},select:{trackingCode:true,mobile:true}});if(!order)throw new ShopError('NOT_FOUND',404);return order;}
export async function changeCustomerPassword(userId:string,sessionVersion:number,currentPassword:string,newPassword:string){
 if(!await consumeRateLimit(`customer-password-change:${userId}`,5,600))throw new ShopError('RATE_LIMIT',429);
 const db=getDb(),user=await db.user.findUnique({where:{id:userId}}),valid=await verifyPassword(currentPassword,user?.passwordHash??null);
 if(!valid||!user?.active||user.role!=='CUSTOMER'||!user.mobileVerifiedAt||!user.emailVerifiedAt||user.sessionVersion!==sessionVersion)throw new ShopError('CURRENT_PASSWORD',403);
 const passwordHash=await hashPassword(newPassword);
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
  const current=await tx.user.findUnique({where:{id:userId}});if(!current?.active||current.role!=='CUSTOMER'||current.sessionVersion!==sessionVersion||current.passwordHash!==user.passwordHash)throw new ShopError('UNAUTHORIZED',401);
  await tx.user.update({where:{id:userId},data:{passwordHash,sessionVersion:{increment:1}}});
 });
}
