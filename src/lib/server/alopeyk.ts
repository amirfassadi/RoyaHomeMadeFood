import 'server-only';
import {z} from 'zod';
import {ShopError} from './shop-http';
import {shippingTotal} from '@/lib/domain/shipping';
import {coordinatesSchema,type ShippingSettings} from '@/lib/validation/shipping';
export function courierEnvironment(){
 const environment=process.env.ALOPEYK_ENVIRONMENT;
 if(!process.env.ALOPEYK_ACCESS_TOKEN||!['sandbox','production'].includes(environment??''))throw new ShopError('DELIVERY_UNAVAILABLE',503);
 return environment as 'sandbox'|'production';
}
async function call(path:string,body?:unknown,environment=courierEnvironment()):Promise<unknown>{
 if(environment!==courierEnvironment())throw new ShopError('DELIVERY_ENVIRONMENT',409);
 const host=environment==='sandbox'?'sandbox-api.alopeyk.com':'api.alopeyk.com';
 try{
  const response=await fetch(`https://${host}/api/v2/${path}`,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${process.env.ALOPEYK_ACCESS_TOKEN}`,'Content-Type':'application/json; charset=utf-8','X-Requested-With':'XMLHttpRequest'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new Error('upstream');
  return await response.json();
 }catch{throw new ShopError('DELIVERY_UNAVAILABLE',503);}
}
export async function alopeykQuote(settings:Pick<ShippingSettings,'origin'|'markupPercent'>,destination:{lat:number;lng:number}|undefined){
 if(!destination)throw new ShopError('DELIVERY_LOCATION_REQUIRED');
 const environment=courierEnvironment();
 const reply=await call('orders/price/calc',{transport_type:'motorbike',has_return:false,cashed:false,addresses:[{type:'origin',...settings.origin},{type:'destination',...destination}]},environment);
 const parsed=z.object({status:z.literal('success'),object:z.object({status:z.literal('OK'),price:z.number().int().nonnegative().max(2147483647)})}).safeParse(reply);
 if(!parsed.success)throw new ShopError('DELIVERY_UNAVAILABLE',503);
 return {...shippingTotal(parsed.data.object.price,settings.markupPercent),deliveryProvider:'ALOPEYK' as const,deliveryTestMode:environment==='sandbox'};
}
const courierAddressSchema=coordinatesSchema.extend({type:z.enum(['origin','destination']),description:z.string().max(2000),person_fullname:z.string().min(1).max(100),person_phone:z.string().regex(/^09\d{9}$/)});
export const courierRequestSchema=z.object({transport_type:z.literal('motorbike'),has_return:z.literal(false),cashed:z.literal(false),addresses:z.array(courierAddressSchema).length(2)});
export type CourierRequest=z.infer<typeof courierRequestSchema>;
const courierReply=z.object({status:z.literal('success'),object:z.object({id:z.number().int().positive().safe(),status:z.string().min(1).max(100),price:z.number().int().nonnegative().max(2147483647),addresses:z.array(z.object({type:z.enum(['origin','destination']),lat:z.coerce.number().finite(),lng:z.coerce.number().finite(),description:z.string().nullable().optional(),person_phone:z.string().nullable().optional()})).optional()})});
export type CourierOrder=z.infer<typeof courierReply>['object'];
export async function createCourier(request:CourierRequest,environment:'sandbox'|'production'){
 const reply=courierReply.safeParse(await call('orders',courierRequestSchema.parse(request),environment));
 if(!reply.success)throw new ShopError('COURIER_REVIEW',409);
 return reply.data.object;
}
export async function getCourier(externalId:string,environment:'sandbox'|'production'){
 if(!/^[1-9]\d{0,14}$/.test(externalId))throw new ShopError('INVALID');
 const reply=courierReply.safeParse(await call(`orders/${externalId}?columns=*,addresses`,undefined,environment));
 if(!reply.success||String(reply.data.object.id)!==externalId)throw new ShopError('COURIER_REVIEW',409);
 return reply.data.object;
}
export function matchesCourier(order:CourierOrder,request:CourierRequest){
 if(order.addresses?.length!==request.addresses.length)return false;
 return request.addresses.every((expected,index)=>{
  const actual=order.addresses![index];
  return actual.type===expected.type&&Math.abs(actual.lat-expected.lat)<0.00001&&Math.abs(actual.lng-expected.lng)<0.00001&&actual.description===expected.description&&actual.person_phone===expected.person_phone;
 });
}
