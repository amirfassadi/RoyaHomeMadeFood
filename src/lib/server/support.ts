import 'server-only';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {consumeRateLimit} from './rate-limit';
import {hasAdminPermission} from '@/lib/admin/permissions';
import type {SupportAction,SupportHistory,SupportInbox,SupportCustomerContext} from '@/lib/support';

export type SupportActor={id:string;sessionVersion:number;fromAdmin:boolean};
const messageSelect={id:true,sequence:true,body:true,fromAdmin:true,createdAt:true} as const;

export async function supportHistory(threadId:string,fromAdmin:boolean,before?:number):Promise<SupportHistory>{
 const db=getDb(),thread=await db.supportThread.findUnique({where:{id:threadId}});
 if(!thread)throw new ShopError('NOT_FOUND',404);
 const rows=await db.supportMessage.findMany({where:{threadId,...(before?{sequence:{lt:before}}:{})},select:messageSelect,orderBy:{sequence:'desc'},take:51});
 return {threadId,messages:rows.slice(0,50).reverse().map(m=>({...m,createdAt:m.createdAt.toISOString()})),hasOlder:rows.length>50,lastSequence:thread.lastSequence,otherReadSequence:fromAdmin?thread.customerReadSequence:thread.adminReadSequence};
}

export async function customerSupportHistory(userId:string,before?:number):Promise<SupportHistory>{
 const thread=await getDb().supportThread.findUnique({where:{userId},select:{id:true}});
 return thread?supportHistory(thread.id,false,before):{threadId:null,messages:[],hasOlder:false,lastSequence:0,otherReadSequence:0};
}

export async function supportInbox(page:number,unreadOnly:boolean):Promise<SupportInbox>{
 const db=getDb();
 const where=unreadOnly?{lastCustomerSequence:{gt:db.supportThread.fields.adminReadSequence}}:{};
 const rows=await db.supportThread.findMany({where,orderBy:[{updatedAt:'desc'},{id:'desc'}],skip:(page-1)*20,take:21,select:{id:true,updatedAt:true,lastCustomerSequence:true,adminReadSequence:true,user:{select:{name:true,mobile:true}},messages:{orderBy:{sequence:'desc'},take:1,select:{body:true}}}});
 return {page,hasMore:rows.length>20,threads:rows.slice(0,20).map(t=>({id:t.id,customer:t.user,preview:t.messages[0]?.body.slice(0,120)??'',updatedAt:t.updatedAt.toISOString(),unread:t.lastCustomerSequence>t.adminReadSequence}))};
}

export async function supportCustomerContext(threadId:string):Promise<SupportCustomerContext>{
 const db=getDb(),thread=await db.supportThread.findUnique({where:{id:threadId},select:{userId:true,user:{select:{id:true,name:true,mobile:true,email:true,active:true,createdAt:true}}}});
 if(!thread)throw new ShopError('NOT_FOUND',404);
 // Account ownership is authoritative. A recipient mobile can belong to somebody else.
 const where={userId:thread.userId};
 const [orders,orderCount,paid]=await Promise.all([
  db.order.findMany({where,orderBy:{createdAt:'desc'},take:20,select:{id:true,trackingCode:true,invoiceNumber:true,paymentReference:true,transferReference:true,totalToman:true,status:true,paymentStatus:true,paymentMethod:true,createdAt:true}}),
  db.order.count({where}),db.order.aggregate({where:{...where,paymentStatus:'PAID'},_sum:{totalToman:true}})
 ]);
 return {customer:{...thread.user,createdAt:thread.user.createdAt.toISOString()},orderCount,paidTotalToman:paid._sum.totalToman??0,orders:orders.map(o=>({...o,createdAt:o.createdAt.toISOString()}))};
}

export async function supportAction(actor:SupportActor,action:SupportAction,threadId?:string){
 if(action.action==='send'&&!await consumeRateLimit(`support:send:${actor.id}`,20,60))throw new ShopError('RATE_LIMIT',429);
 return getDb().$transaction(async tx=>{
  // Recheck the current account/session and permission within the write transaction.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${actor.id} FOR UPDATE`;
  const user=await tx.user.findUnique({where:{id:actor.id}});
  if(!user?.active||user.sessionVersion!==actor.sessionVersion||user.role!==(actor.fromAdmin?'ADMIN':'CUSTOMER'))throw new ShopError('UNAUTHORIZED',401);
  if(actor.fromAdmin&&(user.mustChangePassword||!hasAdminPermission(user,'support')))throw new ShopError('FORBIDDEN',403);
  if(!actor.fromAdmin&&(!user.mobileVerifiedAt||!user.emailVerifiedAt))throw new ShopError('UNAUTHORIZED',401);
  const thread=actor.fromAdmin
   ?await tx.supportThread.findUnique({where:{id:threadId??''}})
   :action.action==='send'
    ?await tx.supportThread.upsert({where:{userId:actor.id},create:{userId:actor.id},update:{}})
    :await tx.supportThread.findUnique({where:{userId:actor.id}});
  if(!thread){if(action.action==='read'&&!actor.fromAdmin)return {saved:true};throw new ShopError('NOT_FOUND',404);}
  await tx.$queryRaw`SELECT "id" FROM "SupportThread" WHERE "id"=${thread.id} FOR UPDATE`;
  const current=await tx.supportThread.findUniqueOrThrow({where:{id:thread.id}});
  if(action.action==='read'){
   if(action.throughSequence>current.lastSequence)throw new ShopError('INVALID');
   const field=actor.fromAdmin?'adminReadSequence':'customerReadSequence';
   // Read receipts do not reorder the inbox; never mark a message the client has not seen.
   await tx.supportThread.update({where:{id:thread.id},data:{[field]:Math.max(current[field],action.throughSequence),updatedAt:current.updatedAt}});
   return {saved:true};
  }
  const existing=await tx.supportMessage.findUnique({where:{threadId_senderId_clientId:{threadId:thread.id,senderId:actor.id,clientId:action.clientId}}});
  if(existing){if(existing.body!==action.body)throw new ShopError('CONFLICT',409);return {saved:true};}
  const sequence=current.lastSequence+1;
  await tx.supportMessage.create({data:{threadId:thread.id,sequence,senderId:actor.id,fromAdmin:actor.fromAdmin,body:action.body,clientId:action.clientId}});
  await tx.supportThread.update({where:{id:thread.id},data:{lastSequence:sequence,...(actor.fromAdmin?{lastAdminSequence:sequence}:{lastCustomerSequence:sequence})}});
  if(actor.fromAdmin)await tx.adminAudit.create({data:{adminId:actor.id,action:'support.reply',targetId:thread.id}});
  return {saved:true};
 });
}
