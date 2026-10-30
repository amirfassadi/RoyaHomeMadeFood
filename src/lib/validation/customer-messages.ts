import {z} from 'zod';
import {toLatinDigits} from '@/lib/format';
export const deliveryPolicySchema=z.object({enabled:z.boolean(),transactional:z.boolean(),marketing:z.boolean()}).strict();
export const disabledDeliveryPolicy={enabled:false,transactional:false,marketing:false};
export const campaignSchema=z.object({title:z.string().trim().min(2).max(150),body:z.string().trim().min(5).max(3000),category:z.enum(['MESSAGE','PRODUCT','OFFER','DISCOUNT']),purpose:z.enum(['TRANSACTIONAL','MARKETING']),audience:z.enum(['CUSTOMER','SUBSCRIBERS']),identifier:z.string().trim().max(254).transform(v=>v.includes('@')?v.toLowerCase():toLatinDigits(v).replace(/[\s-]/g,'')),preference:z.enum(['AUTO','EMAIL','SMS']),notBefore:z.iso.datetime()}).strict().refine(v=>v.audience!=='CUSTOMER'||/^(?:09\d{9}|[^@\s]+@[^@\s]+\.[^@\s]+)$/.test(v.identifier)).refine(v=>v.purpose==='MARKETING'||v.audience==='CUSTOMER'&&v.category==='MESSAGE');
export const campaignActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),campaign:campaignSchema}).strict(),
 z.object({action:z.enum(['prepare','release','cancel']),id:z.string().min(1).max(100),expectedUpdatedAt:z.iso.datetime()}).strict(),
]);
export const deliveryPolicyEditSchema=z.object({policy:deliveryPolicySchema,expectedUpdatedAt:z.iso.datetime().nullable()}).strict();
