import {z} from 'zod';
import {emailSchema} from '@/lib/customer/validation';
export const emailSettingsEditSchema=z.object({enabled:z.boolean(),from:emailSchema,apiKey:z.string().trim().min(16).max(2048).optional(),expectedUpdatedAt:z.iso.datetime().nullable()}).strict();
export const emailTestSchema=z.object({to:emailSchema,expectedUpdatedAt:z.iso.datetime()}).strict();
export const emailTestVerifySchema=z.object({testId:z.uuid(),code:z.string().regex(/^\d{6}$/)}).strict();
export const storedEmailSettingsSchema=z.object({enabled:z.boolean(),from:emailSchema,apiKeyEnc:z.string().min(1).max(5000),verifiedAt:z.iso.datetime().nullable(),test:z.object({id:z.uuid(),adminId:z.string(),to:emailSchema,verifier:z.string().length(64),expiresAt:z.iso.datetime(),attempts:z.number().int().nonnegative(),ready:z.boolean()}).nullable()}).strict();
export type EmailSettingsView={enabled:boolean;configured:boolean;from:string;keyPresent:boolean;source:'panel'|'environment'|'none';verified:boolean;updatedAt:string|null;testPending:boolean};
