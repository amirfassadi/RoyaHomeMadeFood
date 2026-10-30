import 'server-only';
import type {Prisma} from '@/generated/prisma/client';
import type {z} from 'zod';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {audit} from './admin-products';
import {deliveryPolicySchema,disabledDeliveryPolicy,type campaignActionSchema,type deliveryPolicyEditSchema} from '@/lib/validation/customer-messages';
export const deliveryPolicyKey='customer-delivery-policy';
export async function deliveryPolicy(db:Pick<Prisma.TransactionClient,'setting'>=getDb()){const row=await db.setting.findUnique({where:{key:deliveryPolicyKey}});return {policy:deliveryPolicySchema.safeParse(row?.value).data??disabledDeliveryPolicy,updatedAt:row?.updatedAt?.toISOString()??null};}
export async function saveDeliveryPolicy(input:z.infer<typeof deliveryPolicyEditSchema>,adminId:string){return getDb().$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('customer-delivery-policy',0))::text`;const old=await deliveryPolicy(tx);if(old.updatedAt!==input.expectedUpdatedAt)throw new ShopError('CONFLICT',409);await tx.setting.upsert({where:{key:deliveryPolicyKey},create:{key:deliveryPolicyKey,value:input.policy},update:{value:input.policy}});await audit(tx,adminId,'CUSTOMER_DELIVERY_POLICY',deliveryPolicyKey);return deliveryPolicy(tx);});}
export async function queuePaymentNotice(tx:Prisma.TransactionClient,order:{id:string;userId:string|null;trackingCode:string},reportAt:string,reason:string){if(!order.userId)return;const {policy}=await deliveryPolicy(tx);await tx.customerNotice.upsert({where:{dedupeKey:`payment-rejected:${order.id}:${reportAt}`},update:{},create:{userId:order.userId,orderId:order.id,dedupeKey:`payment-rejected:${order.id}:${reportAt}`,kind:'TRANSACTIONAL',title:`نتیجه بررسی واریز سفارش ${order.trackingCode}`,body:`واریز اعلام‌شده برای سفارش ${order.trackingCode} تأیید نشد. دلیل: ${reason}\nجزئیات را در حساب کاربری فروشگاه رویا بررسی کنید.`,status:policy.enabled&&policy.transactional?'QUEUED':'HELD'}});}
export async function campaignWorkspace(){const db=getDb();const [policy,campaigns,recent,counts]=await Promise.all([deliveryPolicy(),db.customerCampaign.findMany({take:30,orderBy:{createdAt:'desc'}}),db.customerNotice.findMany({take:30,orderBy:{createdAt:'desc'},select:{id:true,kind:true,title:true,status:true,channel:true,errorCode:true,createdAt:true,updatedAt:true}}),db.customerNotice.groupBy({by:['status'],_count:{_all:true}})]);return JSON.parse(JSON.stringify({...policy,campaigns,recent,counts}));}
export async function manageCampaign(input:z.infer<typeof campaignActionSchema>,adminId:string){return getDb().$transaction(async tx=>{
 if(input.action==='save'){const saved=await tx.customerCampaign.create({data:{...input.campaign,identifier:input.campaign.audience==='CUSTOMER'?input.campaign.identifier:null,notBefore:new Date(input.campaign.notBefore),createdBy:adminId}});await audit(tx,adminId,'CAMPAIGN_DRAFT',saved.id);return {id:saved.id};}
 await tx.$queryRaw`SELECT "id" FROM "CustomerCampaign" WHERE "id"=${input.id} FOR UPDATE`;
 const c=await tx.customerCampaign.findUnique({where:{id:input.id}});if(!c||c.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new ShopError('CONFLICT',409);
 if(input.action==='cancel'){if(c.status==='CANCELLED')return {cancelled:true};await tx.customerNotice.updateMany({where:{campaignId:c.id,status:{in:['HELD','QUEUED']}},data:{status:'CANCELLED'}});await tx.customerCampaign.update({where:{id:c.id},data:{status:'CANCELLED'}});await audit(tx,adminId,'CAMPAIGN_CANCEL',c.id);return {cancelled:true};}
 if(input.action==='release'){const {policy}=await deliveryPolicy(tx);if(!policy.enabled||!(c.purpose==='MARKETING'?policy.marketing:policy.transactional))throw new ShopError('DELIVERY_DISABLED',409);if(c.status!=='PREPARED')throw new ShopError('TRANSITION',409);await tx.customerNotice.updateMany({where:{campaignId:c.id,status:'HELD'},data:{status:'QUEUED'}});await tx.customerCampaign.update({where:{id:c.id},data:{status:'RELEASED'}});await audit(tx,adminId,'CAMPAIGN_RELEASE',c.id);return {queued:true};}
 if(c.status!=='DRAFT')throw new ShopError('TRANSITION',409);
 const consent=c.purpose==='MARKETING'?(c.preference==='EMAIL'?{marketingEmail:true}:c.preference==='SMS'?{marketingSms:true}:{OR:[{marketingEmail:true},{marketingSms:true}]}):{};
 const users=await tx.user.findMany({where:{active:true,role:'CUSTOMER',mobileVerifiedAt:{not:null},...consent,...(c.audience==='CUSTOMER'?{[c.identifier!.includes('@')?'email':'mobile']:c.identifier}:{})},select:{id:true},take:501});
 if(!users.length)throw new ShopError('NO_RECIPIENTS',409);if(users.length>500)throw new ShopError('AUDIENCE_LIMIT',409);
 await tx.customerNotice.createMany({data:users.map(u=>({userId:u.id,campaignId:c.id,dedupeKey:`campaign:${c.id}:${u.id}`,kind:c.purpose,title:c.title,body:c.body,preference:c.preference,status:'HELD',notBefore:c.notBefore})),skipDuplicates:true});
 await tx.customerCampaign.update({where:{id:c.id},data:{status:'PREPARED'}});await audit(tx,adminId,'CAMPAIGN_PREPARE',c.id);return {recipients:users.length};
 });}

export async function releaseHeldNotice(id:string,expectedUpdatedAt:string,adminId:string){return getDb().$transaction(async tx=>{
 await tx.$queryRaw`SELECT "id" FROM "CustomerNotice" WHERE "id"=${id} FOR UPDATE`;
 const n=await tx.customerNotice.findUnique({where:{id}});if(!n||n.updatedAt.toISOString()!==expectedUpdatedAt)throw new ShopError('CONFLICT',409);
 const {policy}=await deliveryPolicy(tx);if(!policy.enabled||!(n.kind==='MARKETING'?policy.marketing:policy.transactional))throw new ShopError('DELIVERY_DISABLED',409);
 if(n.status!=='HELD'||n.campaignId)throw new ShopError('TRANSITION',409);
 await tx.customerNotice.update({where:{id},data:{status:'QUEUED'}});await audit(tx,adminId,'NOTICE_RELEASE',id);
 });}
