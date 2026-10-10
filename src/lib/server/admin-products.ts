import 'server-only';
import {z} from 'zod';
import type {MediaUpload,Prisma} from '@/generated/prisma/client';
import {getDb} from './db';
import {getCloudinary} from './cloudinary';
import {capacityDay} from '@/lib/domain/checkout';
import {ShopError} from './shop-http';
import {productEditSchema} from '@/lib/validation/admin';
import {mediaSchema} from '@/lib/validation/product';
type Input=z.infer<typeof productEditSchema>;
export async function saveProduct(input:Input,adminId:string){
 const db=getDb();
 // Metadata is fetched from our own Cloudinary account, never trusted from the browser.
 const uploads:{ticket:MediaUpload;value:z.infer<typeof mediaSchema>}[]=[];
 for(const m of input.media){if(!m.uploadId)continue;
  const ticket=await db.mediaUpload.findUnique({where:{id:m.uploadId}});
  if(!ticket || ticket.adminId!==adminId || ticket.consumed || Date.now()-ticket.createdAt.getTime()>86400000)throw new ShopError('MEDIA_INVALID');
  const r=await getCloudinary().api.resource(ticket.publicId,{resource_type:ticket.type==='VIDEO'?'video':'image',type:'upload'});
  if(r.public_id!==ticket.publicId || (ticket.type==='VIDEO' && r.format!=='mp4') || (ticket.type==='IMAGE' && r.format!=='webp'))throw new ShopError('MEDIA_INVALID');
  const secureUrl=String(r.secure_url);
  if(!secureUrl.startsWith(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`))throw new ShopError('MEDIA_INVALID');
  const parsed=mediaSchema.safeParse({type:ticket.type,cloudinaryId:ticket.publicId,secureUrl,altFa:m.altFa,altEn:m.altEn,width:r.width,height:r.height,bytes:r.bytes,durationSeconds:ticket.type==='VIDEO'?r.duration:null});
  if(!parsed.success)throw new ShopError('MEDIA_INVALID');
  const value=parsed.data;
  if(value.type==='IMAGE' && value.bytes>10000000)throw new ShopError('MEDIA_INVALID');
  uploads.push({ticket,value});
 }
 return db.$transaction(async tx=>{
  let existing=null;
  if(input.id){await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id"=${input.id} FOR UPDATE`;existing=await tx.product.findUnique({where:{id:input.id},include:{media:true}});if(!existing || existing.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new ShopError('CONFLICT',409);
   // Changing a unit after orders exist makes stock-release snapshots incompatible.
   if(existing.unit!==input.product.unit && await tx.orderItem.count({where:{productId:input.id}})>0)throw new ShopError('UNIT_LOCKED',409);
  }
  if(input.id && input.product.dailyCapacity!==null){const used=await tx.productDailyUsage.findUnique({where:{productId_day:{productId:input.id,day:capacityDay(new Date())}}});if(Number(used?.quantity??0)>input.product.dailyCapacity)throw new ShopError('CAPACITY_RESERVED',409);}
  const category=await tx.category.findFirst({where:{id:input.product.categoryId,active:true}});if(!category)throw new ShopError('INVALID');
  const kept=input.media.filter(m=>m.id).map(m=>m.id!);
  if(kept.some(id=>!existing?.media.some(m=>m.id===id)))throw new ShopError('MEDIA_INVALID');
  const p=input.id?await tx.product.update({where:{id:input.id},data:input.product}):await tx.product.create({data:input.product});
  // Remove only links. Assets remain in Cloudinary for explicit later cleanup / reuse audit.
  await tx.productMedia.deleteMany({where:{productId:p.id,id:{notIn:kept}}});
  for(const [index,m] of input.media.entries()){
   if(m.id)await tx.productMedia.update({where:{id:m.id},data:{altFa:m.altFa,altEn:m.altEn,sortOrder:index}});
   else{
    const u=uploads.find(u=>u.ticket.id===m.uploadId)!;
    const claim=await tx.mediaUpload.updateMany({where:{id:u.ticket.id,adminId,consumed:false},data:{consumed:true}});
    if(!claim.count)throw new ShopError('MEDIA_INVALID',409);
    await tx.productMedia.create({data:{productId:p.id,...u.value,sortOrder:index}});
   }
  }
  await audit(tx,adminId,'PRODUCT_SAVE',p.id);return p.id;
 },{timeout:15000});
}
export async function audit(tx:Prisma.TransactionClient,adminId:string,action:string,targetId:string){await tx.adminAudit.create({data:{adminId,action,targetId}});}
