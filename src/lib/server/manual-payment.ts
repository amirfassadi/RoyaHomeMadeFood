import 'server-only';
import {z} from 'zod';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {audit} from './admin-products';
import {estimateDelivery} from '@/lib/domain/order';

export function bankTransferDetails(){
 const holder=process.env.PAYMENT_ACCOUNT_HOLDER?.trim();
 const card=process.env.PAYMENT_CARD_NUMBER?.trim();
 const iban=process.env.PAYMENT_IBAN?.trim().toUpperCase();
 if(!holder || (!card && !iban) || (card && !/^\d{16}$/.test(card)) || (iban && !/^IR\d{24}$/.test(iban)))throw new ShopError('PAYMENT_UNAVAILABLE',503);
 return {holder,card:card??null,iban:iban??null};
}
export const confirmTransferSchema=z.object({id:z.string().min(1).max(100),reference:z.string().trim().regex(/^[A-Za-z0-9-]{4,100}$/),amountToman:z.number().int().positive()}).strict();
export async function confirmTransfer(input:z.infer<typeof confirmTransferSchema>,adminId:string){
 return getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${input.id} FOR UPDATE`;
  const order=await tx.order.findUnique({where:{id:input.id}});
  if(!order || order.paymentMethod!=='BANK_TRANSFER' || order.status==='CANCELLED')throw new ShopError('TRANSITION',409);
  if(order.totalToman!==input.amountToman)throw new ShopError('PAYMENT_AMOUNT',409);
  if(order.paymentStatus==='PAID'){
   if(order.transferReference!==input.reference)throw new ShopError('CONFLICT',409);
   return;
  }
  const now=new Date();
  await tx.order.update({where:{id:order.id},data:{paymentStatus:'PAID',paymentConfirmedAt:now,transferReference:input.reference,estimatedDeliveryAt:estimateDelivery(now,[order.longestPreparationMinutes],order.zoneDeliveryMinutes)}});
  await audit(tx,adminId,'BANK_TRANSFER_CONFIRMED',order.id);
 });
}
