import {emailSettingsView} from './email';
import {customerLoginEnabled} from './customer-otp';
import {smsConfigured} from './sms';
import {canViewAdminSection,hasAdminPermission} from '@/lib/admin/permissions';
import {smsEnabled} from './sms-policy';
import {seoSettingsSchema} from '@/lib/validation/seo';
import {bankTransferSettingsSchema,emptyBankTransferSettings} from '@/lib/validation/bank-transfer';
import {shippingSettingsSchema,defaultShippingSettings} from '@/lib/validation/shipping';
import 'server-only';
import {connection} from 'next/server';
import {isDemoCatalog} from './catalog';
import {requireAdmin} from './auth';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {emptyData,type AdminData} from '@/lib/admin/types';
import {demoAdminData} from '@/lib/admin/demo';
import {contactSettingsSchema} from '@/lib/validation/contact';
import type {Prisma} from '@/generated/prisma/client';
const summary={id:true,trackingCode:true,customerName:true,mobile:true,status:true,paymentMethod:true,paymentStatus:true,totalToman:true,createdAt:true,estimatedDeliveryAt:true,refundRequired:true} as const;
export async function getAdminData(section:string,options:{page?:number;q?:string;status?:string;id?:string;mobile?:string}={}):Promise<AdminData>{
 if(isDemoCatalog())return demoAdminData();
 await connection();const user=await requireAdmin();if(user.mustChangePassword)throw new ShopError('PASSWORD_CHANGE_REQUIRED',403);if(!canViewAdminSection(user,section))throw new ShopError('FORBIDDEN',403);const db=getDb(),data=emptyData(),page=Math.max(1,Math.min(10000,options.page??1)),take=20,skip=(page-1)*take;data.page=page;data.access={adminOwner:user.adminOwner,adminPermissions:user.adminPermissions,mustChangePassword:user.mustChangePassword};
 const q=(options.q??'').slice(0,100);
 if(section==='dashboard'&&(hasAdminPermission(user,'orders')||hasAdminPermission(user,'payments'))){
  const [products,orders,pending,recent]=await Promise.all([db.product.count(),db.order.count(),db.order.count({where:{status:'PENDING'}}),db.order.findMany({select:summary,orderBy:{createdAt:'desc'},take:5})]);data.stats={products,orders,pending};data.orders=JSON.parse(JSON.stringify(recent));
 }
 if(section==='products'){
  const where:Prisma.ProductWhereInput=q?{OR:[{nameFa:{contains:q,mode:'insensitive'}},{nameEn:{contains:q,mode:'insensitive'}}]}:{};
  const [products,count,categories]=await Promise.all([db.product.findMany({where,include:{media:{orderBy:{sortOrder:'asc'}}},orderBy:{createdAt:'desc'},take,skip}),db.product.count({where}),db.category.findMany({where:{active:true},select:{id:true,nameFa:true},orderBy:{sortOrder:'asc'}})]);
  data.products=products.map(p=>({...p,priceBasisQuantity:Number(p.priceBasisQuantity),minOrderQuantity:Number(p.minOrderQuantity),orderStepQuantity:Number(p.orderStepQuantity),stockQuantity:p.stockQuantity===null?null:Number(p.stockQuantity),dailyCapacity:p.dailyCapacity===null?null:Number(p.dailyCapacity),updatedAt:p.updatedAt.toISOString(),media:p.media.map(m=>({id:m.id,url:m.secureUrl,type:m.type,altFa:m.altFa,altEn:m.altEn}))}));data.categories=categories;data.totalPages=Math.max(1,Math.ceil(count/take));
 }
 if(section==='orders'||section==='customer'){
  const statuses=['PENDING','PREPARING','SHIPPED','DELIVERED','CANCELLED'];
  const where:Prisma.OrderWhereInput={...(statuses.includes(options.status??'')?{status:options.status as Prisma.OrderWhereInput['status']}:{}),...(options.mobile?{mobile:options.mobile}:{}),...(q?{OR:[{trackingCode:{contains:q,mode:'insensitive'}},{invoiceNumber:{contains:q,mode:'insensitive'}},{paymentReference:{contains:q}},{transferReference:{contains:q}},{customerName:{contains:q}},{mobile:{contains:q}}]}:{})};
  const [rows,count]=await Promise.all([db.order.findMany({where,select:summary,orderBy:{createdAt:'desc'},take,skip}),db.order.count({where})]);data.orders=JSON.parse(JSON.stringify(rows));data.totalPages=Math.max(1,Math.ceil(count/take));
 }
 if(section==='customers'){
  const memberWhere:Prisma.UserWhereInput={role:'CUSTOMER',...(q?{OR:[{name:{contains:q}},{mobile:{contains:q}}]}:{})};
  const [members,memberCount]=await Promise.all([db.user.findMany({where:memberWhere,select:{id:true,name:true,mobile:true,marketingSms:true,createdAt:true},orderBy:{createdAt:'desc'},take,skip}),db.user.count({where:memberWhere})]);data.members=members.map(m=>({...m,mobile:m.mobile??'',createdAt:m.createdAt.toISOString()}));
  const where:Prisma.OrderWhereInput=q?{OR:[{mobile:{contains:q}},{customerName:{contains:q}}]}:{};
  const rows=await db.order.groupBy({by:['mobile'],where,_count:{_all:true},_sum:{totalToman:true},_max:{createdAt:true},orderBy:{_max:{createdAt:'desc'}},take,skip});
  const latest=await db.order.findMany({where:{mobile:{in:rows.map(r=>r.mobile)}},distinct:['mobile'],orderBy:{createdAt:'desc'},select:{mobile:true,customerName:true}});
  const groups=await db.order.groupBy({by:['mobile'],where});data.totalPages=Math.max(1,Math.ceil(Math.max(groups.length,memberCount)/take));
  data.customers=rows.map(r=>({mobile:r.mobile,name:latest.find(n=>n.mobile===r.mobile)?.customerName??'',orders:r._count._all,totalToman:r._sum.totalToman??0,lastOrder:r._max.createdAt!.toISOString()}));
 }
 if(section==='settings'){
  if(user.adminOwner){data.email=await emailSettingsView();data.registration={accountsEnabled:customerLoginEnabled(),smsConfigured:smsConfigured()};}
  if(hasAdminPermission(user,'settings')){
   const [seo,contact,sms]=await Promise.all([db.setting.findUnique({where:{key:'seo'}}),db.setting.findUnique({where:{key:'contact'}}),db.setting.findUnique({where:{key:'sms-policy'}})]);
   data.seo={settings:seoSettingsSchema.safeParse(seo?.value).data??{enabled:false,googleVerification:''},updatedAt:seo?.updatedAt.toISOString()??null};data.contact=contactSettingsSchema.safeParse(contact?.value).data??{};
   const budget=await db.smsTestBudget.findUnique({where:{id:'initial-five'}});data.sms={enabled:await smsEnabled(),used:budget?.used??0,testMode:process.env.ROYA_SMS_MODE!=='production',updatedAt:sms?.updatedAt.toISOString()??null};
  }
  if(hasAdminPermission(user,'bankAccounts')){const bank=await db.setting.findUnique({where:{key:'bank-transfer'}});data.bankTransfer={settings:bankTransferSettingsSchema.safeParse(bank?.value).data??emptyBankTransferSettings(),updatedAt:bank?.updatedAt.toISOString()??null};}
  if(hasAdminPermission(user,'shipping')){const [shipping,zones]=await Promise.all([db.setting.findUnique({where:{key:'shipping'}}),db.deliveryZone.findMany({orderBy:{cityFa:'asc'}})]);data.shipping=shippingSettingsSchema.safeParse(shipping?.value).data??defaultShippingSettings;data.zones=JSON.parse(JSON.stringify(zones));}
  if(hasAdminPermission(user,'discounts'))data.discounts=JSON.parse(JSON.stringify(await db.discountCode.findMany({orderBy:{createdAt:'desc'}})));
 }
 if(section==='order'){
  const o=await db.order.findUnique({where:{id:options.id??''},select:{...summary,reservationExpiresAt:true,reservationExpiredAt:true,shippingSnapshot:true,courierDispatch:{select:{id:true,requestState:true,externalId:true,externalStatus:true,quotedFeeToman:true,actualFeeToman:true,readyAt:true,lastSyncedAt:true}},invoiceNumber:true,paymentReference:true,paymentConfirmedAt:true,transferReference:true,address:true,city:true,deliveryNotes:true,deliveryZoneNameSnapshot:true,subtotalToman:true,discountToman:true,deliveryFeeToman:true,items:{select:{id:true,productNameFa:true,unit:true,quantity:true,lineTotalToman:true}},statusHistory:{select:{status:true,createdAt:true},orderBy:{createdAt:'asc'}},buyerEmail:true,cryptoPayment:{select:{amountUsdCents:true,requestState:true,invoiceId:true,invoiceStatus:true,additionalStatus:true}},paymentAttempts:{select:{requestState:true}}}});
  if(!o)throw new ShopError('NOT_FOUND',404);
  const {paymentAttempts,cryptoPayment,...safe}=o;data.detail=JSON.parse(JSON.stringify({...safe,items:o.items.map(i=>({...i,quantity:Number(i.quantity)})),cryptoPayment,requestState:cryptoPayment?.requestState??paymentAttempts[0]?.requestState??null}));
 }
 return data;
}
