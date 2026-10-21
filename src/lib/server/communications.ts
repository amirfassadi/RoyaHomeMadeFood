import 'server-only';
import {connection} from 'next/server';
import {isDemoAdmin} from './admin-mode';
import {requireAdmin} from './auth';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {audit} from './admin-products';
import type {z} from 'zod';
import type {communicationActionSchema} from '@/lib/validation/communications';
import type {ContactInbox} from '@/lib/admin/communications';
export async function getCommunications(page=1,filter='all'):Promise<ContactInbox>{
 if(isDemoAdmin())return {page:1,totalPages:1,unread:1,messages:[{id:'demo-message',name:'مشتری نمونه',mobile:'',message:'این پیام نمونه برای بررسی صندوق تماس است.',locale:'fa',readAt:null,createdAt:'2026-10-11T08:00:00.000Z'}],announcements:[]};
 await connection();await requireAdmin();
 const db=getDb(),where=filter==='unread'?{readAt:null}:filter==='read'?{readAt:{not:null}}:{};
 const [messages,total,unread,announcements]=await Promise.all([db.contactMessage.findMany({where,take:20,skip:(page-1)*20,orderBy:{createdAt:'desc'}}),db.contactMessage.count({where}),db.contactMessage.count({where:{readAt:null}}),db.clubAnnouncement.findMany({take:50,orderBy:{createdAt:'desc'}})]);
 return {page,totalPages:Math.max(1,Math.ceil(total/20)),unread,messages:messages.map(m=>({...m,readAt:m.readAt?.toISOString()??null,createdAt:m.createdAt.toISOString()})),announcements:announcements.map(a=>({...a,startsAt:a.startsAt?.toISOString()??null,expiresAt:a.expiresAt?.toISOString()??null,updatedAt:a.updatedAt.toISOString()}))};
}
export async function saveCommunication(input:z.infer<typeof communicationActionSchema>,adminId:string){
 return getDb().$transaction(async tx=>{
  if(input.action==='message-read'){
   const changed=await tx.contactMessage.updateMany({where:{id:input.id,...(input.read?{readAt:null}:{readAt:{not:null}})},data:{readAt:input.read?new Date():null}});
   if(changed.count)await audit(tx,adminId,input.read?'CONTACT_READ':'CONTACT_UNREAD',input.id);return;
  }
  const {id,expectedUpdatedAt,...data}=input.announcement;
  if(id){await tx.$queryRaw`SELECT "id" FROM "ClubAnnouncement" WHERE "id"=${id} FOR UPDATE`;const current=await tx.clubAnnouncement.findUnique({where:{id}});if(!current||current.updatedAt.toISOString()!==expectedUpdatedAt)throw new ShopError('CONFLICT',409);}
  const saved=id?await tx.clubAnnouncement.update({where:{id},data}):await tx.clubAnnouncement.create({data});
  await audit(tx,adminId,'ANNOUNCEMENT_SAVE',saved.id);
 });
}
