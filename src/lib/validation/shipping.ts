import {z} from 'zod';
export const coordinatesSchema=z.object({lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180)}).strict();
export const shippingSettingsSchema=z.object({enabled:z.boolean(),markupPercent:z.number().finite().min(0).max(100).refine(n=>Math.abs(n*100-Math.round(n*100))<1e-7),origin:coordinatesSchema,originAddress:z.string().trim().max(500).default(''),senderName:z.string().trim().max(100).default(''),senderPhone:z.string().regex(/^09\d{9}$|^$/).default('')}).strict();
export type ShippingSettings=z.infer<typeof shippingSettingsSchema>;
export const defaultShippingSettings:ShippingSettings={enabled:false,markupPercent:1,origin:{lat:35.7,lng:51.4},originAddress:'',senderName:'',senderPhone:''};
export const shippingSnapshotSchema=z.object({provider:z.literal('ALOPEYK'),destination:coordinatesSchema,origin:coordinatesSchema.optional(),courierFeeToman:z.number().int().nonnegative(),markupToman:z.number().int().nonnegative(),markupPercent:z.number().min(0).max(100),quotedAt:z.iso.datetime()});
export const dispatchActionSchema=z.object({id:z.string().min(1).max(100)}).strict();
export const dispatchReconcileSchema=dispatchActionSchema.extend({externalId:z.string().regex(/^[1-9]\d{0,14}$/)}).strict();
