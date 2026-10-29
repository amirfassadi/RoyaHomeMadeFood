import 'server-only';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {allowedTransition,canReleaseCancellation,type Status} from '@/lib/admin/order-rules';
import {audit} from './admin-products';
import {releaseInventory} from './reservations';
export async function changeOrderStatus(id:string,expectedStatus:Status,status:Status,adminId:string){
 return getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${id} FOR UPDATE`;
  const o=await tx.order.findUnique({where:{id},include:{items:true,paymentAttempts:true,cryptoPayment:true,courierDispatch:true}});if(!o)throw new ShopError('NOT_FOUND',404);
  if(o.status===status)return;
  if(o.status!==expectedStatus)throw new ShopError('CONFLICT',409);
  if(!allowedTransition(o.status,status))throw new ShopError('TRANSITION',409);
  if(o.courierDispatch && o.courierDispatch.requestState!=='CANCELLED' && ['SHIPPED','DELIVERED','CANCELLED'].includes(status))throw new ShopError('COURIER_ACTIVE',409);
  if(!o.courierDispatch && (o.shippingSnapshot as {provider?:string}|null)?.provider==='ALOPEYK' && ['SHIPPED','DELIVERED'].includes(status))throw new ShopError('COURIER_REQUIRED',409);
  if(status==='PREPARING' && o.paymentMethod!=='CASH_ON_DELIVERY' && o.paymentStatus!=='PAID')throw new ShopError('PAYMENT_PENDING',409);
  const cancellation=status==='CANCELLED';
  if(cancellation && !canReleaseCancellation(o.paymentMethod,o.paymentStatus,o.cryptoPayment?.requestState??o.paymentAttempts[0]?.requestState??null))throw new ShopError('PAYMENT_PENDING',409);
  if(cancellation)await releaseInventory(tx,o);
  await tx.order.update({where:{id},data:{status,...(cancellation?{inventoryReserved:false,refundRequired:o.paymentMethod!=='CASH_ON_DELIVERY' && o.paymentStatus==='PAID'}:{})}});
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
