import {z} from 'zod';
import {toLatinDigits} from '@/lib/format';
export const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  mobile: z.string().transform(s => toLatinDigits(s).replace(/[\s-]/g, '')).pipe(z.string().regex(/^09\d{9}$/)),
  message: z.string().trim().min(10).max(3000),
  locale: z.enum(['fa', 'en']), website: z.string().max(200).default(''),
});
export const contactSettingsSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{7,15}$/).optional(), email: z.email().optional(),
  addressFa: z.string().max(500).optional(), addressEn: z.string().max(500).optional(),
  hoursFa: z.string().max(300).optional(), hoursEn: z.string().max(300).optional(),
});
export type ContactSettings = z.infer<typeof contactSettingsSchema>;
