import {parseTransferReport} from '@/lib/validation/transfer-report';
import 'server-only';
import {getDb} from './db';
import {deliveryPolicy} from './customer-messages';
import {emailConfigured,sendCustomerEmail} from './email';
import {sendNotificationSms} from './sms';
export async function dispatchPendingNotices(){
 const db=getDb(),{policy}=await deliveryPolicy();if(!policy.enabled)return {processed:0};
 // Interrupted provider calls are uncertain, never automatically repeated.
 await db.customerNotice.updateMany({where:{status:'SENDING',updatedAt:{lt:new Date(Date.now()-300000)}},data:{status:'UNKNOWN',errorCode:'DELIVERY_INTERRUPTED'}});
 const rows=await db.customerNotice.findMany({where:{status:'QUEUED',notBefore:{lte:new Date()},kind:{in:[...(policy.transactional?['TRANSACTIONAL']:[]),...(policy.marketing?['MARKETING']:[])]}},take:10,orderBy:{createdAt:'asc'}});
 let processed=0;
 for(const n of rows){
  const claim=await db.customerNotice.updateMany({where:{id:n.id,status:'QUEUED'},data:{status:'SENDING'}});if(!claim.count)continue;
  const fresh=await deliveryPolicy(),u=await db.user.findUnique({where:{id:n.userId}}),marketing=n.kind==='MARKETING';
  if(!fresh.policy.enabled||!(marketing?fresh.policy.marketing:fresh.policy.transactional)){await db.customerNotice.update({where:{id:n.id},data:{status:'HELD'}});continue;}
  if(!u?.active||u.role!=='CUSTOMER'||!u.mobileVerifiedAt){await db.customerNotice.update({where:{id:n.id},data:{status:'SUPPRESSED',errorCode:'RECIPIENT_INACTIVE'}});continue;}
  if(n.orderId){const order=await db.order.findUnique({where:{id:n.orderId},select:{transferReviewStatus:true,transferReport:true}}),report=parseTransferReport(order?.transferReport);if(order?.transferReviewStatus!=='REJECTED'||!report||n.dedupeKey!==`payment-rejected:${n.orderId}:${report.reportedAt}`){await db.customerNotice.update({where:{id:n.id},data:{status:'SUPPRESSED',errorCode:'REVIEW_SUPERSEDED'}});continue;}}
  const emailAllowed=n.preference!=='SMS'&&!!u.email&&(!marketing||u.marketingEmail),smsAllowed=n.preference!=='EMAIL'&&!!u.mobile&&(!marketing||u.marketingSms);
  let channel:string|null=null;
  const site=process.env.NEXT_PUBLIC_SITE_URL??'',footer=`\nحساب و تنظیمات دریافت پیام: ${site}/fa/account/`;
  if(emailAllowed){try{if(await emailConfigured()){await sendCustomerEmail({to:u.email!,subject:n.title,text:n.body+footer});channel='EMAIL';}}catch{/* An unavailable email service may fall back to opted-in SMS. */}}
  if(!channel&&smsAllowed){try{await sendNotificationSms(u.mobile!,`${n.title}\n${n.body.slice(0,1400)}${footer}`);channel='SMS';}catch{}}
  await db.customerNotice.update({where:{id:n.id},data:channel?{status:'ACCEPTED',channel,sentAt:new Date(),errorCode:null}:{status:emailAllowed||smsAllowed?'FAILED':'SUPPRESSED',errorCode:emailAllowed||smsAllowed?'PROVIDER_UNAVAILABLE':'NO_CONSENT_OR_CONTACT'}});processed++;
 }
 return {processed};
}
