import {shippingSettingsSchema,defaultShippingSettings} from '@/lib/validation/shipping';
import {alopeykQuote} from './alopeyk';
import 'server-only';
import {createHash, randomBytes} from 'node:crypto';
import {Prisma} from '@/generated/prisma/client';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {calculateLineTotal, validateQuantity, estimateDelivery} from '@/lib/domain/order';
import {capacityDay, checkedMoney, discountAmount} from '@/lib/domain/checkout';
import type {QuoteInput, CheckoutInput} from '@/lib/validation/checkout';
import {cryptoConfig,cryptoQuote} from './international';
import {configuredBankTransfer} from './manual-payment';
import {gatewayConfiguration} from './zarinpal';
import {smsEnabled} from './sms-policy';
import {consumeCheckoutProof} from './checkout-mobile';
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
  const setting=await tx.setting.findUnique({where:{key:'shipping'}});
  const config=setting?shippingSettingsSchema.parse(setting.value):defaultShippingSettings;
  if(config.enabled&&(!config.senderName||!config.senderPhone||config.originAddress.length<10))throw new ShopError('DELIVERY_UNAVAILABLE',503);
  const shipping=config.enabled?{...await alopeykQuote(config,input.destination),shippingOrigin:config.origin}:{deliveryFeeToman:zone.feeToman};
  if(reserve && 'deliveryTestMode' in shipping && shipping.deliveryTestMode)throw new ShopError('DELIVERY_UNAVAILABLE',503);
  const totalToman=checkedMoney(subtotalToman-discountToman+shipping.deliveryFeeToman);
  return {items,zone,discount,day,subtotalToman,discountToman,...shipping,totalToman,longestPreparationMinutes:Math.max(...items.map(i=>i.preparationMinutes)),estimatedDeliveryAt:estimateDelivery(now,items.map(i=>i.preparationMinutes),zone.deliveryMinutes)};
}
export function publicQuote(q: Awaited<ReturnType<typeof calculateQuote>>) {
  return {...('deliveryProvider' in q?{deliveryProvider:q.deliveryProvider,deliveryTestMode:q.deliveryTestMode}:{}),subtotalToman:q.subtotalToman,discountToman:q.discountToman,deliveryFeeToman:q.deliveryFeeToman,totalToman:q.totalToman,estimatedDeliveryAt:q.estimatedDeliveryAt.toISOString()};
}
export async function placeOrder(input: CheckoutInput,customer?:{id:string;mobile:string;sessionVersion:number}|null) {
  const crypto=input.paymentMethod==='BTCPAY'?cryptoConfig():null;
  if(crypto&&(!input.buyerEmail||!input.expectedUsdCents))throw new ShopError('INVALID');
  const canonical={...input,...(customer?{customerId:customer.id}:{}),items:[...input.items].sort((a,b)=>a.productId.localeCompare(b.productId))};
  const fingerprint=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  const db=getDb();
  // Advisory lock makes repeated clicks / lost HTTP responses return the same order.
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey},0))::text`;
    const previous=await tx.order.findUnique({where:{idempotencyKey:input.idempotencyKey}});
    if(previous){if(previous.requestFingerprint!==fingerprint)throw new ShopError('IDEMPOTENCY_CONFLICT',409);return previous;}
    const gateway=input.paymentMethod==='ZARINPAL'?gatewayConfiguration():null;
    const bankTransfer=input.paymentMethod==='BANK_TRANSFER'?configuredBankTransfer((await tx.setting.findUnique({where:{key:'bank-transfer'}}))?.value):null;
    let userId:string|undefined;
    if(customer){
      await tx.$queryRaw`SELECT \"id\" FROM \"User\" WHERE \"id\"=${customer.id} FOR SHARE`;
      const owner=await tx.user.findUnique({where:{id:customer.id}});
      if(owner?.active&&owner.role==='CUSTOMER'&&owner.mobileVerifiedAt&&owner.sessionVersion===customer.sessionVersion)userId=owner.id;
      else throw new ShopError('UNAUTHORIZED',401);
    }
    if(!userId&&await smsEnabled(tx))await consumeCheckoutProof(tx,input.mobile,input.mobileProof);
    const now=new Date(), q=await calculateQuote(tx,input,true,now);
    if(q.totalToman!==input.expectedTotal)throw new ShopError('PRICE_CHANGED',409);
    const foreign=crypto?cryptoQuote(q.totalToman):null;
    if(foreign&&foreign.amountUsdCents!==input.expectedUsdCents)throw new ShopError('PRICE_CHANGED',409);
    if(gateway && q.totalToman<=0)throw new ShopError('PAYMENT_AMOUNT');
    for(const item of q.items){
      if(item.stockReserved)await tx.product.update({where:{id:item.productId},data:{stockQuantity:{decrement:item.quantity}}});
      await tx.productDailyUsage.upsert({where:{productId_day:{productId:item.productId,day:q.day}},create:{productId:item.productId,day:q.day,quantity:item.quantity},update:{quantity:{increment:item.quantity}}});
    }
    if(q.discount)await tx.discountCode.update({where:{id:q.discount.id},data:{usedCount:{increment:1}}});
    const trackingCode=`ROYA-${randomBytes(12).toString('hex').toUpperCase()}`;
    const invoiceNumber=`INV-${trackingCode.slice(5)}`;
    const paymentReference=BigInt('0x'+createHash('sha256').update(`${trackingCode}:${invoiceNumber}`).digest('hex').slice(0,20)).toString();
    return tx.order.create({data:{reservationExpiresAt:new Date(now.getTime()+3600000),...(bankTransfer?{bankTransferSnapshot:{accounts:bankTransfer.accounts}}:{}),invoiceNumber,paymentReference,trackingCode,idempotencyKey:input.idempotencyKey,requestFingerprint:fingerprint,locale:input.locale,capacityDay:q.day,userId,customerName:input.name,mobile:input.mobile,address:input.address,city:q.zone.cityFa,deliveryNotes:input.notes,deliveryZoneId:q.zone.id,deliveryZoneNameSnapshot:q.zone.nameFa,paymentMethod:input.paymentMethod,buyerEmail:crypto?input.buyerEmail:undefined,paymentStatus:'PENDING',subtotalToman:q.subtotalToman,discountToman:q.discountToman,deliveryFeeToman:q.deliveryFeeToman,shippingSnapshot:'deliveryProvider' in q?{provider:q.deliveryProvider,courierFeeToman:q.courierFeeToman,markupToman:q.shippingMarkupToman,markupPercent:q.shippingMarkupPercent,origin:q.shippingOrigin,destination:input.destination,quotedAt:now.toISOString()}:undefined,totalToman:q.totalToman,discountCodeId:q.discount?.id,discountCodeSnapshot:q.discount?.code,longestPreparationMinutes:q.longestPreparationMinutes,zoneDeliveryMinutes:q.zone.deliveryMinutes,estimatedDeliveryAt:q.estimatedDeliveryAt,...(crypto&&foreign?{cryptoPayment:{create:{amountUsdCents:foreign.amountUsdCents,tomanPerUsd:crypto.rate,rateExpiresAt:new Date(crypto.expires),storeId:crypto.store,gatewayOrigin:crypto.url}}}:{}),items:{create:q.items},statusHistory:{create:{status:'PENDING'}},...(gateway?{paymentAttempts:{create:{amountToman:q.totalToman,callbackNonce:randomBytes(32).toString('hex'),merchantId:gateway.merchantId,sandbox:gateway.sandbox}}}:{})}});
  },{maxWait:10000,timeout:15000});
}
