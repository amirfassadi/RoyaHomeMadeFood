import {expireLockedReservation} from './reservations';
import 'server-only';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {consumeRateLimit} from './rate-limit';
import {bankTransferDetails} from './manual-payment';
import {parseTransferReport,submitTransferReportSchema} from '@/lib/validation/transfer-report';
export async function reportCustomerTransfer(user:{id:string;sessionVersion:number},raw:unknown){
 const {trackingCode,expectedReportedAt,...input}=submitTransferReportSchema.parse(raw);
 if(!await consumeRateLimit(`transfer-report:${user.id}`,10,600))throw new ShopError('RATE_LIMIT',429);
 return getDb().$transaction(async tx=>{
  const found=await tx.order.findFirst({where:{trackingCode,userId:user.id},select:{id:true}});
  if(!found)throw new ShopError('NOT_FOUND',404);
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${found.id} FOR UPDATE`;
  const order=await tx.order.findUniqueOrThrow({where:{id:found.id},include:{items:true}});
  const owner=await tx.user.findUnique({where:{id:user.id}});
  if(order.userId!==user.id||!owner?.active||owner.role!=='CUSTOMER'||!owner.mobileVerifiedAt||owner.sessionVersion!==user.sessionVersion)throw new ShopError('UNAUTHORIZED',401);
  if(order.paymentMethod!=='BANK_TRANSFER'||order.paymentStatus==='PAID'||order.paymentStatus==='REFUNDED'||order.status==='CANCELLED'&&!order.reservationExpiredAt)throw new ShopError('TRANSITION',409);
  const existing=parseTransferReport(order.transferReport);
  if((existing?.reportedAt??null)!==expectedReportedAt)throw new ShopError('CONFLICT',409);
  const paidAt=new Date(input.paidAt),now=new Date();
  if(paidAt.getTime()>now.getTime()+300000||paidAt.getTime()<order.createdAt.getTime()-300000)throw new ShopError('PAYMENT_DATE');
  const bank=await bankTransferDetails(order.bankTransferSnapshot);
  if(!bank.accounts.some(a=>a.id===input.accountId))throw new ShopError('BANK_ACCOUNT');
  const expired=await expireLockedReservation(tx,order,now);
  const report={...input,reportedAt:new Date(Math.max(now.getTime(),existing?Date.parse(existing.reportedAt)+1:0)).toISOString()};
  await tx.order.update({where:{id:order.id},data:{transferReport:report,transferReviewStatus:'PENDING',transferReviewReason:null,transferReviewedAt:null,...(order.status!=='CANCELLED'&&!expired?{reservationExpiresAt:null}:{})}});
  return {report};
 });
}
