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
 await connection();await requireAdmin();const db=getDb(),data=emptyData(),page=Math.max(1,Math.min(10000,options.page??1)),take=20,skip=(page-1)*take;data.page=page;
 const q=(options.q??'').slice(0,100);
 if(section==='dashboard'){
  const [products,orders,pending,recent]=await Promise.all([db.product.count(),db.order.count(),db.order.count({where:{status:'PENDING'}}),db.order.findMany({select:summary,orderBy:{createdAt:'desc'},take:5})]);data.stats={products,orders,pending};data.orders=JSON.parse(JSON.stringify(recent));
 }
 if(section==='products'){
  const where:Prisma.ProductWhereInput=q?{OR:[{nameFa:{contains:q,mode:'insensitive'}},{nameEn:{contains:q,mode:'insensitive'}}]}:{};
  const [products,count,categories]=await Promise.all([db.product.findMany({where,include:{media:{orderBy:{sortOrder:'asc'}}},orderBy:{createdAt:'desc'},take,skip}),db.product.count({where}),db.category.findMany({where:{active:true},select:{id:true,nameFa:true},orderBy:{sortOrder:'asc'}})]);
  data.products=products.map(p=>({...p,priceBasisQuantity:Number(p.priceBasisQuantity),minOrderQuantity:Number(p.minOrderQuantity),orderStepQuantity:Number(p.orderStepQuantity),stockQuantity:p.stockQuantity===null?null:Number(p.stockQuantity),dailyCapacity:p.dailyCapacity===null?null:Number(p.dailyCapacity),updatedAt:p.updatedAt.toISOString(),media:p.media.map(m=>({id:m.id,url:m.secureUrl,type:m.type,altFa:m.altFa,altEn:m.altEn}))}));data.categories=categories;data.totalPages=Math.max(1,Math.ceil(count/take));
 }
 if(section==='orders'||section==='customer'){
  const statuses=['PENDING','PREPARING','SHIPPED','DELIVERED','CANCELLED'];
  const where:Prisma.OrderWhereInput={...(statuses.includes(options.status??'')?{status:options.status as Prisma.OrderWhereInput['status']}:{}),...(options.mobile?{mobile:options.mobile}:{}),...(q?{OR:[{trackingCode:{contains:q,mode:'insensitive'}},{customerName:{contains:q}},{mobile:{contains:q}}]}:{})};
  const [rows,count]=await Promise.all([db.order.findMany({where,select:summary,orderBy:{createdAt:'desc'},take,skip}),db.order.count({where})]);data.orders=JSON.parse(JSON.stringify(rows));data.totalPages=Math.max(1,Math.ceil(count/take));
 }
 if(section==='customers'){
  const where:Prisma.OrderWhereInput=q?{OR:[{mobile:{contains:q}},{customerName:{contains:q}}]}:{};
  const rows=await db.order.groupBy({by:['mobile'],where,_count:{_all:true},_sum:{totalToman:true},_max:{createdAt:true},orderBy:{_max:{createdAt:'desc'}},take,skip});
  const latest=await db.order.findMany({where:{mobile:{in:rows.map(r=>r.mobile)}},distinct:['mobile'],orderBy:{createdAt:'desc'},select:{mobile:true,customerName:true}});
  const groups=await db.order.groupBy({by:['mobile'],where});data.totalPages=Math.max(1,Math.ceil(groups.length/take));
  data.customers=rows.map(r=>({mobile:r.mobile,name:latest.find(n=>n.mobile===r.mobile)?.customerName??'',orders:r._count._all,totalToman:r._sum.totalToman??0,lastOrder:r._max.createdAt!.toISOString()}));
 }
 if(section==='settings'){
  const [zones,discounts,contact]=await Promise.all([db.deliveryZone.findMany({orderBy:{cityFa:'asc'}}),db.discountCode.findMany({orderBy:{createdAt:'desc'}}),db.setting.findUnique({where:{key:'contact'}})]);
  data.zones=JSON.parse(JSON.stringify(zones));data.discounts=JSON.parse(JSON.stringify(discounts));data.contact=contactSettingsSchema.safeParse(contact?.value).data??{};
 }
 if(section==='order'){
  const o=await db.order.findUnique({where:{id:options.id??''},select:{...summary,address:true,city:true,deliveryNotes:true,deliveryZoneNameSnapshot:true,subtotalToman:true,discountToman:true,deliveryFeeToman:true,items:{select:{id:true,productNameFa:true,unit:true,quantity:true,lineTotalToman:true}},statusHistory:{select:{status:true,createdAt:true},orderBy:{createdAt:'asc'}},paymentAttempts:{select:{requestState:true}}}});
  if(!o)throw new ShopError('NOT_FOUND',404);
  const {paymentAttempts,...safe}=o;data.detail=JSON.parse(JSON.stringify({...safe,items:o.items.map(i=>({...i,quantity:Number(i.quantity)})),requestState:paymentAttempts[0]?.requestState??null}));
 }
 return data;
}
