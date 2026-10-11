import 'server-only';
import {createHash, randomBytes} from 'node:crypto';
import {Prisma} from '@/generated/prisma/client';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {calculateLineTotal, validateQuantity, estimateDelivery} from '@/lib/domain/order';
import {capacityDay, checkedMoney, discountAmount} from '@/lib/domain/checkout';
import type {QuoteInput, CheckoutInput} from '@/lib/validation/checkout';
import {gatewayConfiguration} from './zarinpal';
type Tx=Prisma.TransactionClient;
export async function calculateQuote(tx: Tx, input: QuoteInput, reserve=false, now=new Date()) {
  const ids=input.items.map(i=>i.productId).sort();
  // Product locks serialize stock and daily-capacity reservations across all instances.
  if(reserve) for(const id of ids) await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id"=${id} FOR UPDATE`;
  const products=await tx.product.findMany({where:{id:{in:ids},active:true,category:{active:true}}});
  if(products.length!==ids.length)throw new ShopError('PRODUCT_CHANGED',409);
  if(reserve) await tx.$queryRaw`SELECT "id" FROM "DeliveryZone" WHERE "id"=${input.zoneId} FOR SHARE`;
  const zone=await tx.deliveryZone.findFirst({where:{id:input.zoneId,active:true}});
  if(!zone)throw new ShopError('ZONE_CHANGED',409);
  const day=capacityDay(now);
  const items=[];
  for(const entry of input.items){
    const p=products.find(p=>p.id===entry.productId)!;
    const used=await tx.productDailyUsage.findUnique({where:{productId_day:{productId:p.id,day}}});
    const max=p.dailyCapacity===null?null:Number(p.dailyCapacity)-Number(used?.quantity??0);
    if(!validateQuantity(entry.quantity,Number(p.minOrderQuantity),Number(p.orderStepQuantity),p.stockQuantity===null?null:Number(p.stockQuantity)) || (max!==null && entry.quantity>max))throw new ShopError('QUANTITY_CHANGED',409);
    items.push({productId:p.id,productNameFa:p.nameFa,productNameEn:p.nameEn,unit:p.unit,quantity:entry.quantity,priceBasisQuantity:Number(p.priceBasisQuantity),unitPriceToman:p.priceToman,lineTotalToman:calculateLineTotal(p.priceToman,entry.quantity,Number(p.priceBasisQuantity)),preparationMinutes:p.preparationMinutes,stockReserved:p.stockQuantity!==null});
  }
  const subtotalToman=checkedMoney(items.reduce((n,i)=>n+i.lineTotalToman,0));
  let discount=null;
  if(input.discountCode){
    if(reserve)await tx.$queryRaw`SELECT "id" FROM "DiscountCode" WHERE "code"=${input.discountCode} FOR UPDATE`;
    discount=await tx.discountCode.findUnique({where:{code:input.discountCode}});
    if(!discount || !discount.active || subtotalToman<discount.minSubtotalToman || (discount.startsAt && now<discount.startsAt) || (discount.expiresAt && now>=discount.expiresAt) || (discount.usageLimit!==null && discount.usedCount>=discount.usageLimit))throw new ShopError('DISCOUNT_INVALID',409);
  }
  const discountToman=discount?discountAmount(subtotalToman,discount):0;
  const totalToman=checkedMoney(subtotalToman-discountToman+zone.feeToman);
  return {items,zone,discount,day,subtotalToman,discountToman,deliveryFeeToman:zone.feeToman,totalToman,longestPreparationMinutes:Math.max(...items.map(i=>i.preparationMinutes)),estimatedDeliveryAt:estimateDelivery(now,items.map(i=>i.preparationMinutes),zone.deliveryMinutes)};
}
export function publicQuote(q: Awaited<ReturnType<typeof calculateQuote>>) {
  return {subtotalToman:q.subtotalToman,discountToman:q.discountToman,deliveryFeeToman:q.deliveryFeeToman,totalToman:q.totalToman,estimatedDeliveryAt:q.estimatedDeliveryAt.toISOString()};
}
export async function placeOrder(input: CheckoutInput,customer?:{id:string;mobile:string;sessionVersion:number}|null) {
  const gateway=input.paymentMethod==='ZARINPAL'?gatewayConfiguration():null;
  const canonical={...input,items:[...input.items].sort((a,b)=>a.productId.localeCompare(b.productId))};
  const fingerprint=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  const db=getDb();
  // Advisory lock makes repeated clicks / lost HTTP responses return the same order.
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey},0))::text`;
    const previous=await tx.order.findUnique({where:{idempotencyKey:input.idempotencyKey}});
    if(previous){if(previous.requestFingerprint!==fingerprint)throw new ShopError('IDEMPOTENCY_CONFLICT',409);return previous;}
    let userId:string|undefined;
    if(customer && customer.mobile===input.mobile){
      await tx.$queryRaw`SELECT \"id\" FROM \"User\" WHERE \"id\"=${customer.id} FOR SHARE`;
      const owner=await tx.user.findUnique({where:{id:customer.id}});
      if(owner?.active&&owner.role==='CUSTOMER'&&owner.mobileVerifiedAt&&owner.sessionVersion===customer.sessionVersion)userId=owner.id;
    }
    const now=new Date(), q=await calculateQuote(tx,input,true,now);
    if(q.totalToman!==input.expectedTotal)throw new ShopError('PRICE_CHANGED',409);
    if(gateway && q.totalToman<=0)throw new ShopError('PAYMENT_AMOUNT');
    for(const item of q.items){
      if(item.stockReserved)await tx.product.update({where:{id:item.productId},data:{stockQuantity:{decrement:item.quantity}}});
      await tx.productDailyUsage.upsert({where:{productId_day:{productId:item.productId,day:q.day}},create:{productId:item.productId,day:q.day,quantity:item.quantity},update:{quantity:{increment:item.quantity}}});
    }
    if(q.discount)await tx.discountCode.update({where:{id:q.discount.id},data:{usedCount:{increment:1}}});
    return tx.order.create({data:{trackingCode:`ROYA-${randomBytes(12).toString('hex').toUpperCase()}`,idempotencyKey:input.idempotencyKey,requestFingerprint:fingerprint,locale:input.locale,capacityDay:q.day,userId,customerName:input.name,mobile:input.mobile,address:input.address,city:q.zone.cityFa,deliveryNotes:input.notes,deliveryZoneId:q.zone.id,deliveryZoneNameSnapshot:q.zone.nameFa,paymentMethod:input.paymentMethod,paymentStatus:gateway?'PENDING':'UNPAID',subtotalToman:q.subtotalToman,discountToman:q.discountToman,deliveryFeeToman:q.deliveryFeeToman,totalToman:q.totalToman,discountCodeId:q.discount?.id,discountCodeSnapshot:q.discount?.code,longestPreparationMinutes:q.longestPreparationMinutes,zoneDeliveryMinutes:q.zone.deliveryMinutes,estimatedDeliveryAt:q.estimatedDeliveryAt,items:{create:q.items},statusHistory:{create:{status:'PENDING'}},...(gateway?{paymentAttempts:{create:{amountToman:q.totalToman,callbackNonce:randomBytes(32).toString('hex'),merchantId:gateway.merchantId,sandbox:gateway.sandbox}}}:{})}});
  },{maxWait:10000,timeout:15000});
}
