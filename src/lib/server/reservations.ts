import 'server-only';
import type {Prisma} from '@/generated/prisma/client';
import {getDb} from './db';
import {ShopError} from './shop-http';
type ReservedOrder=Prisma.OrderGetPayload<{include:{items:true}}>; 
export async function releaseInventory(tx:Prisma.TransactionClient,o:ReservedOrder){
 if(!o.inventoryReserved)return;
 for(const item of [...o.items].sort((a,b)=>(a.productId??'').localeCompare(b.productId??''))){
  if(!item.productId)continue;
  await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id"=${item.productId} FOR UPDATE`;
  const p=await tx.product.findUnique({where:{id:item.productId}});
  if(p&&item.stockReserved&&p.stockQuantity!==null)await tx.product.update({where:{id:p.id},data:{stockQuantity:{increment:item.quantity}}});
  const release=await tx.productDailyUsage.updateMany({where:{productId:item.productId,day:o.capacityDay,quantity:{gte:item.quantity}},data:{quantity:{decrement:item.quantity}}});
  if(!release.count)throw new ShopError('RESERVATION_CONFLICT',409);
 }
 if(o.discountCodeId){
  await tx.$queryRaw`SELECT "id" FROM "DiscountCode" WHERE "id"=${o.discountCodeId} FOR UPDATE`;
  await tx.discountCode.updateMany({where:{id:o.discountCodeId,usedCount:{gt:0}},data:{usedCount:{decrement:1}}});
 }
}
// Caller must hold the Order row lock. Gateway records are preserved: a later
// successful payment requires refund review, never fulfilment from freed stock.
export async function expireLockedReservation(tx:Prisma.TransactionClient,o:ReservedOrder,now=new Date()){
 if(o.paymentMethod==='BANK_TRANSFER'&&o.transferReviewStatus==='PENDING')return false;
 if(o.status!=='PENDING'||!o.inventoryReserved||!['UNPAID','PENDING','FAILED'].includes(o.paymentStatus)||!o.reservationExpiresAt||o.reservationExpiresAt>now)return false;
 if(await tx.courierDispatch.findUnique({where:{orderId:o.id}}))return false;
 await releaseInventory(tx,o);
 await tx.order.update({where:{id:o.id},data:{status:'CANCELLED',inventoryReserved:false,reservationExpiredAt:now}});
 await tx.orderStatusHistory.create({data:{orderId:o.id,status:'CANCELLED',note:'Unpaid reservation expired; any late payment requires refund review.'}});
 return true;
}
export async function expireOrderReservation(id:string,now=new Date()){
 return getDb().$transaction(async tx=>{
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "Order" WHERE "id"=${id} FOR UPDATE SKIP LOCKED`;
  if(!rows.length)return false;
  const o=await tx.order.findUnique({where:{id},include:{items:true}});
  return o?expireLockedReservation(tx,o,now):false;
 },{timeout:15000});
}
export async function expireDueReservations(now=new Date()){
 const orders=await getDb().order.findMany({where:{status:'PENDING',transferReviewStatus:{not:'PENDING'},inventoryReserved:true,paymentStatus:{in:['UNPAID','PENDING','FAILED']},reservationExpiresAt:{lte:now}},select:{id:true},orderBy:{reservationExpiresAt:'asc'},take:50});
 let expired=0;
 for(const o of orders)if(await expireOrderReservation(o.id,now))expired++;
 return expired;
}
