import 'server-only';
import {randomUUID} from 'node:crypto';
import {getDb} from './db';
import {ShopError} from './shop-http';
import {audit} from './admin-products';
import {shippingSettingsSchema,shippingSnapshotSchema} from '@/lib/validation/shipping';
import {alopeykQuote,courierEnvironment,courierRequestSchema,createCourier,getCourier,matchesCourier,type CourierOrder} from './alopeyk';

export async function dispatchReadyOrder(orderId:string,adminId:string){
 const db=getDb();
 // Commit the intent BEFORE the external side effect. A crash never permits a second create.
 const prepared=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${orderId} FOR UPDATE`;
  const order=await tx.order.findUnique({where:{id:orderId},include:{courierDispatch:true}});
  if(!order)throw new ShopError('NOT_FOUND',404);
  if(order.courierDispatch)return {dispatch:order.courierDispatch,send:false};
  if(order.status!=='PREPARING')throw new ShopError('TRANSITION',409);
  if(order.paymentStatus!=='PAID')throw new ShopError('PAYMENT_PENDING',409);
  const setting=await tx.setting.findUnique({where:{key:'shipping'}});
  const config=shippingSettingsSchema.safeParse(setting?.value);
  const snapshot=shippingSnapshotSchema.safeParse(order.shippingSnapshot);
  if(!config.success||!config.data.enabled||!config.data.originAddress||!config.data.senderName||!config.data.senderPhone||!snapshot.success)throw new ShopError('SHIPPING_SETUP',409);
  // New orders preserve their quoted origin. Legacy orders need explicit migration/review.
  if(!snapshot.data.origin)throw new ShopError('SHIPPING_SETUP',409);
  const environment=courierEnvironment();
  if(environment!=='production')throw new ShopError('DELIVERY_ENVIRONMENT',409);
  if(config.data.origin.lat!==snapshot.data.origin.lat||config.data.origin.lng!==snapshot.data.origin.lng)throw new ShopError('SHIPPING_ORIGIN_CHANGED',409);
  const id=randomUUID();
  const request=courierRequestSchema.parse({transport_type:'motorbike',has_return:false,cashed:false,addresses:[
   {type:'origin',...snapshot.data.origin,description:`${config.data.originAddress}\nROYA-DISPATCH:${id}`,person_fullname:config.data.senderName,person_phone:config.data.senderPhone},
   {type:'destination',...snapshot.data.destination,description:[order.address,order.deliveryNotes].filter(Boolean).join('\n'),person_fullname:order.customerName,person_phone:order.mobile}
  ]});
  const quote=await alopeykQuote({...config.data,origin:snapshot.data.origin,markupPercent:0},snapshot.data.destination);
  const dispatch=await tx.courierDispatch.create({data:{id,orderId,environment,requestedBy:adminId,requestSnapshot:request,quotedFeeToman:quote.courierFeeToman}});
  await audit(tx,adminId,'COURIER_READY_REQUESTED',orderId);
  return {dispatch,send:true};
 },{timeout:15000});
 if(!prepared.send){
  if(['REQUESTING','UNKNOWN'].includes(prepared.dispatch.requestState))throw new ShopError('COURIER_REVIEW',409);
  return prepared.dispatch;
 }
 try{
  const remote=await createCourier(courierRequestSchema.parse(prepared.dispatch.requestSnapshot),prepared.dispatch.environment as 'production');
  return await saveCourier(prepared.dispatch.id,remote,adminId);
 }catch{
  // Even an HTTP failure may have happened AFTER upstream created the order.
  await db.courierDispatch.updateMany({where:{id:prepared.dispatch.id,requestState:'REQUESTING'},data:{requestState:'UNKNOWN'}});
  throw new ShopError('COURIER_REVIEW',409);
 }
}

export async function syncCourierOrder(orderId:string,adminId:string,externalId?:string){
 const dispatch=await getDb().courierDispatch.findUnique({where:{orderId}});
 if(!dispatch)throw new ShopError('NOT_FOUND',404);
 const id=dispatch.externalId??externalId;
 if(!id)throw new ShopError('COURIER_REVIEW',409);
 if(externalId&&dispatch.externalId&&externalId!==dispatch.externalId)throw new ShopError('COURIER_REVIEW',409);
 const remote=await getCourier(id,dispatch.environment as 'sandbox'|'production');
 if(!dispatch.externalId&&!matchesCourier(remote,courierRequestSchema.parse(dispatch.requestSnapshot)))throw new ShopError('COURIER_REVIEW',409);
 return saveCourier(dispatch.id,remote,adminId);
}

async function saveCourier(id:string,remote:CourierOrder,adminId:string){
 return getDb().$transaction(async tx=>{
  const existing=await tx.courierDispatch.findUnique({where:{id}});
  if(!existing)throw new ShopError('NOT_FOUND',404);
  // Same lock order as ordinary admin status changes and creation.
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${existing.orderId} FOR UPDATE`;
  const current=await tx.courierDispatch.findUniqueOrThrow({where:{id}});
  const order=await tx.order.findUniqueOrThrow({where:{id:current.orderId}});
  if(current.externalId&&current.externalId!==String(remote.id))throw new ShopError('COURIER_REVIEW',409);
  // Concurrent refreshes must not regress a terminal result.
  if(['COMPLETED','CANCELLED'].includes(current.requestState))return current;
  const state=remote.status==='delivered'?'COMPLETED':remote.status==='cancelled'?'CANCELLED':'ACTIVE';
  const dispatch=await tx.courierDispatch.update({where:{id},data:{externalId:String(remote.id),externalStatus:remote.status,actualFeeToman:remote.price,requestState:state,lastSyncedAt:new Date()}});
  const status=remote.status==='delivered'?'DELIVERED':['delivering'].includes(remote.status)?'SHIPPED':null;
  if(status&&(['PREPARING','SHIPPED'] as string[]).includes(order.status)&&order.status!==status){
   if(status==='DELIVERED'&&order.status==='PREPARING')await tx.orderStatusHistory.create({data:{orderId:order.id,status:'SHIPPED',note:'تطبیق وضعیت الوپیک'}});
   await tx.order.update({where:{id:order.id},data:{status}});
   await tx.orderStatusHistory.create({data:{orderId:order.id,status,note:'تطبیق وضعیت الوپیک'}});
  }
  await audit(tx,adminId,'COURIER_SYNC',order.id);
  return dispatch;
 });
}
