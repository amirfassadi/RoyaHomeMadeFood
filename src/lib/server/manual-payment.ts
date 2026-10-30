import {queuePaymentNotice} from './customer-messages';
import {rejectTransferSchema} from '@/lib/validation/transfer-report';
import {bankReferenceSchema,parseTransferReport} from '@/lib/validation/transfer-report';
import 'server-only';
import {z} from 'zod';
import {bankTransferSettingsSchema,bankTransferSnapshotSchema,type BankTransferDetails} from '@/lib/validation/bank-transfer';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {expireLockedReservation} from './reservations';
import {audit} from './admin-products';
import {estimateDelivery} from '@/lib/domain/order';

export function configuredBankTransfer(value:unknown):BankTransferDetails {
 const parsed=bankTransferSettingsSchema.safeParse(value);
 if(!parsed.success||!parsed.data.enabled)throw new ShopError('BANK_TRANSFER_UNAVAILABLE',503);
 const accounts=parsed.data.accounts.filter(account=>account.active);
 const first=accounts[0];
 if(!first)throw new ShopError('BANK_TRANSFER_UNAVAILABLE',503);
 return {holder:first.holder,card:first.card||null,iban:first.iban||null,accounts};
}
export async function bankTransferDetails(snapshot?:unknown):Promise<BankTransferDetails>{
 if(snapshot!==undefined&&snapshot!==null){
  const parsed=bankTransferSnapshotSchema.safeParse(snapshot);
  if(!parsed.success)throw new ShopError('UNAVAILABLE',503);
  const first=parsed.data.accounts[0];
  return {holder:first.holder,card:first.card||null,iban:first.iban||null,accounts:parsed.data.accounts};
 }
 const setting=await getDb().setting.findUnique({where:{key:'bank-transfer'}});
 return configuredBankTransfer(setting?.value);
}
export const confirmTransferSchema=z.object({id:z.string().min(1).max(100),reference:bankReferenceSchema,amountToman:z.number().int().positive(),expectedReportAt:z.iso.datetime().nullable().optional()}).strict();
export async function confirmTransfer(input:z.infer<typeof confirmTransferSchema>,adminId:string){
 return getDb().$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${input.id} FOR UPDATE`;
  const order=await tx.order.findUnique({where:{id:input.id},include:{items:true}});
  const report=parseTransferReport(order?.transferReport);
  if(!order || order.paymentMethod!=='BANK_TRANSFER' || (order.status==='CANCELLED'&&!order.reservationExpiredAt&&!report))throw new ShopError('TRANSITION',409);
  if(order.totalToman!==input.amountToman)throw new ShopError('PAYMENT_AMOUNT',409);
  if(order.paymentStatus==='PAID'){
   if(order.transferReference!==input.reference)throw new ShopError('CONFLICT',409);
   return;
  }
  if(order.transferReviewStatus==='REJECTED')throw new ShopError('CONFLICT',409);
  if((report?.reportedAt??null)!==(input.expectedReportAt??null))throw new ShopError('CONFLICT',409);
  const now=new Date(),expired=await expireLockedReservation(tx,order,new Date());
  await tx.order.update({where:{id:order.id},data:{transferReviewStatus:'APPROVED',transferReviewReason:null,transferReviewedAt:now,paymentStatus:'PAID',paymentConfirmedAt:now,transferReference:input.reference,...(order.status==='CANCELLED'||expired?{refundRequired:true}:{estimatedDeliveryAt:estimateDelivery(now,[order.longestPreparationMinutes],order.zoneDeliveryMinutes)})}});
  await audit(tx,adminId,'BANK_TRANSFER_CONFIRMED',order.id);
 });
}

export async function rejectTransfer(input:z.infer<typeof rejectTransferSchema>,adminId:string){return getDb().$transaction(async tx=>{
 await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${input.id} FOR UPDATE`;
 const order=await tx.order.findUnique({where:{id:input.id}}),report=parseTransferReport(order?.transferReport);
 if(!order||order.paymentMethod!=='BANK_TRANSFER'||order.paymentStatus==='PAID'||order.paymentStatus==='REFUNDED'||!report)throw new ShopError('TRANSITION',409);
 if(report.reportedAt!==input.expectedReportAt)throw new ShopError('CONFLICT',409);
 if(order.transferReviewStatus==='REJECTED'){if(order.transferReviewReason===input.reason)return;throw new ShopError('CONFLICT',409);}
 if(order.transferReviewStatus!=='PENDING')throw new ShopError('TRANSITION',409);
 const now=new Date();await tx.order.update({where:{id:order.id},data:{transferReviewStatus:'REJECTED',transferReviewReason:input.reason,transferReviewedAt:now,...(order.status==='PENDING'&&order.inventoryReserved?{reservationExpiresAt:new Date(now.getTime()+3600000)}:{})}});
 await queuePaymentNotice(tx,order,report.reportedAt,input.reason);await audit(tx,adminId,'BANK_TRANSFER_REJECTED',order.id);
 });}
