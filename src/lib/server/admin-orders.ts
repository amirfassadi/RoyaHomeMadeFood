import 'server-only';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {allowedTransition,canReleaseCancellation,type Status} from '@/lib/admin/order-rules';
import {audit} from './admin-products';
export async function changeOrderStatus(id:string,expectedStatus:Status,status:Status,adminId:string){
 return getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${id} FOR UPDATE`;
  const o=await tx.order.findUnique({where:{id},include:{items:true,paymentAttempts:true}});if(!o)throw new ShopError('NOT_FOUND',404);
  if(o.status===status)return;
  if(o.status!==expectedStatus)throw new ShopError('CONFLICT',409);
  if(!allowedTransition(o.status,status))throw new ShopError('TRANSITION',409);
  if(status==='PREPARING' && o.paymentMethod==='ZARINPAL' && o.paymentStatus!=='PAID')throw new ShopError('PAYMENT_PENDING',409);
  const cancellation=status==='CANCELLED';
  if(cancellation && !canReleaseCancellation(o.paymentMethod,o.paymentStatus,o.paymentAttempts[0]?.requestState??null))throw new ShopError('PAYMENT_PENDING',409);
  if(cancellation && o.inventoryReserved){
   for(const item of [...o.items].sort((a,b)=>(a.productId??'').localeCompare(b.productId??''))){
    if(!item.productId)continue;
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id"=${item.productId} FOR UPDATE`;
    const p=await tx.product.findUnique({where:{id:item.productId}});
    if(p && item.stockReserved && p.stockQuantity!==null)await tx.product.update({where:{id:p.id},data:{stockQuantity:{increment:item.quantity}}});
    // Same day as acceptance; never decrement today's bucket by mistake.
    const release=await tx.productDailyUsage.updateMany({where:{productId:item.productId,day:o.capacityDay,quantity:{gte:item.quantity}},data:{quantity:{decrement:item.quantity}}});
    if(!release.count)throw new ShopError('RESERVATION_CONFLICT',409);
   }
   if(o.discountCodeId){await tx.$queryRaw`SELECT "id" FROM "DiscountCode" WHERE "id"=${o.discountCodeId} FOR UPDATE`;await tx.discountCode.updateMany({where:{id:o.discountCodeId,usedCount:{gt:0}},data:{usedCount:{decrement:1}}});}
  }
  await tx.order.update({where:{id},data:{status,...(cancellation?{inventoryReserved:false,refundRequired:o.paymentMethod==='ZARINPAL' && o.paymentStatus==='PAID'}:{})}});
  await tx.orderStatusHistory.create({data:{orderId:id,status}});
  await audit(tx,adminId,`ORDER_${status}`,id);
 },{timeout:15000});
}
export async function recordCodPayment(id:string,adminId:string){return getDb().$transaction(async tx=>{
 await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${id} FOR UPDATE`;
 const o=await tx.order.findUnique({where:{id}});
 if(!o || o.paymentMethod!=='CASH_ON_DELIVERY' || !['SHIPPED','DELIVERED'].includes(o.status))throw new ShopError('TRANSITION',409);
 if(o.paymentStatus==='PAID')return;
 await tx.order.update({where:{id},data:{paymentStatus:'PAID'}});await audit(tx,adminId,'COD_PAYMENT_RECEIVED',id);
});}
