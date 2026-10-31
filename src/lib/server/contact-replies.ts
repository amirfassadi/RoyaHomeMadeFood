import 'server-only';
import type {z} from 'zod';
import {contactReplySchema} from '@/lib/validation/contact';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {consumeRateLimit} from './rate-limit';
import {audit} from './admin-products';
import {deliveryPolicy} from './customer-messages';
import {emailConfigured,sendCustomerEmail} from './email';
import {smsEnabled} from './sms-policy';
import {sendNotificationSms} from './sms';

export async function contactReplyAvailability(){
 const {policy}=await deliveryPolicy();
 return {enabled:policy.enabled&&policy.transactional,email:await emailConfigured(),sms:await smsEnabled().catch(()=>false)&&!!process.env.KAVENEGAR_API_KEY?.trim()&&!!process.env.KAVENEGAR_SENDER?.trim()};
}
const view=(reply:{id:string;channel:string;body:string;status:string;createdAt:Date})=>({id:reply.id,channel:reply.channel,body:reply.body,status:reply.status,createdAt:reply.createdAt.toISOString()});
export async function replyToContact(raw:z.infer<typeof contactReplySchema>,adminId:string){
 const input=contactReplySchema.parse(raw),db=getDb();
 const prepared=await db.$transaction(async tx=>{
  // Serialize retries even if the same request key is used for another contact.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`contact-reply:${input.requestKey}`},0))::text`;
  const previous=await tx.contactReply.findUnique({where:{requestKey:input.requestKey}});
  if(previous){
   if(previous.contactMessageId!==input.contactMessageId||previous.channel!==input.channel||previous.body!==input.body||previous.adminId!==adminId)throw new ShopError('CONFLICT',409);
   const reply=previous.status==='SENDING'&&Date.now()-previous.createdAt.getTime()>300000?await tx.contactReply.update({where:{id:previous.id},data:{status:'UNKNOWN'}}):previous;
   return {reply,send:false,email:null,mobile:''};
  }
  await tx.$queryRaw`SELECT "id" FROM "ContactMessage" WHERE "id"=${input.contactMessageId} FOR UPDATE`;
  const contact=await tx.contactMessage.findUnique({where:{id:input.contactMessageId}});
  if(!contact)throw new ShopError('NOT_FOUND',404);
  const member=await tx.user.findUnique({where:{mobile:contact.mobile},select:{id:true,active:true,role:true,mobileVerifiedAt:true}});
  const user=member?.active&&member.role==='CUSTOMER'&&member.mobileVerifiedAt?member:null;
  if(user&&input.channel!=='PANEL')throw new ShopError('CONTACT_USE_PANEL',409);
  if(!user&&input.channel==='PANEL')throw new ShopError('CONTACT_NO_ACCOUNT',409);
  if(input.channel!=='PANEL'){
   const {policy}=await deliveryPolicy(tx);
   if(!policy.enabled||!policy.transactional)throw new ShopError('DELIVERY_DISABLED',409);
   if(input.channel==='EMAIL'&&(!contact.email||!await emailConfigured()))throw new ShopError('EMAIL_UNAVAILABLE',503);
   if(input.channel==='SMS'&&(!await smsEnabled(tx)||!process.env.KAVENEGAR_API_KEY?.trim()||!process.env.KAVENEGAR_SENDER?.trim()))throw new ShopError('SMS_UNAVAILABLE',503);
  }
  if(!await consumeRateLimit(`contact-reply:${adminId}`,20,600))throw new ShopError('RATE_LIMIT',429,600);
  const reply=await tx.contactReply.create({data:{...input,adminId,userId:user?.id??null,status:input.channel==='PANEL'?'IN_APP':'SENDING'}});
  if(user)await tx.customerNotice.create({data:{userId:user.id,dedupeKey:`contact-reply:${reply.id}`,kind:'CONTACT_REPLY',title:'پاسخ پیام ارتباط با ما | Contact reply',body:input.body,preference:'PANEL',status:'IN_APP'}});
  await tx.contactMessage.update({where:{id:contact.id},data:{readAt:new Date()}});
  await audit(tx,adminId,'CONTACT_REPLY',reply.id);
  return {reply,send:input.channel!=='PANEL',email:contact.email,mobile:contact.mobile};
 });
 if(!prepared.send)return {reply:view(prepared.reply)};
 // A claim is committed before outbound I/O. Timeout/crash never causes an automatic resend.
 let status='ACCEPTED';
 try{
  const {policy}=await deliveryPolicy();
  if(!policy.enabled||!policy.transactional){status='CANCELLED';}
  else if(input.channel==='EMAIL')await sendCustomerEmail({to:prepared.email!,subject:'پاسخ پیام شما در رویا | Roya contact reply',text:input.body});
  else await sendNotificationSms(prepared.mobile,`پاسخ محصولات غذایی رویا:\n${input.body}`);
 }catch{status='UNKNOWN';}
 const reply=await db.contactReply.update({where:{id:prepared.reply.id},data:{status}});
 return {reply:view(reply)};
}
