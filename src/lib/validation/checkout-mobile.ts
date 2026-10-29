import {z} from 'zod';
import {mobileSchema} from './checkout';
import {toLatinDigits} from '@/lib/format';
export const checkoutCodeSchema=z.object({mobile:mobileSchema}).strict();
export const checkoutVerifySchema=z.object({challengeId:z.uuid(),code:z.string().transform(toLatinDigits).pipe(z.string().regex(/^\d{6}$/))}).strict();
