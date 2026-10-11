import {z} from 'zod';
import {mobileSchema} from '@/lib/validation/checkout';
import {toLatinDigits} from '@/lib/format';
export const consentVersion='sms-news-v1';
export const requestCodeSchema=z.object({mobile:mobileSchema,name:z.string().trim().min(2).max(100),marketingSms:z.boolean().default(false)}).strict();
export const verifyCodeSchema=z.object({challengeId:z.uuid(),code:z.string().transform(toLatinDigits).pipe(z.string().regex(/^\d{6}$/))});
export const profileSchema=z.object({name:z.string().trim().min(2).max(100),marketingSms:z.boolean()}).strict();
