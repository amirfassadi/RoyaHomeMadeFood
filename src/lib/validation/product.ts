import {z} from 'zod';
export const saleUnits = ['KG', 'GRAM', 'PIECE', 'PACK'] as const;
const quantity = z.number().positive().max(999_999_999).refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, 'Maximum three decimal places');
export const productSchema = z.object({
  nameFa: z.string().trim().min(2).max(150), nameEn: z.string().trim().min(2).max(150),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(150), categoryId: z.string().min(1),
  descriptionFa: z.string().trim().min(10).max(10000), descriptionEn: z.string().trim().min(10).max(10000),
  priceToman: z.number().int().min(0).max(2147483647), unit: z.enum(saleUnits),
  priceBasisQuantity: quantity, minOrderQuantity: quantity, orderStepQuantity: quantity,
  stockQuantity: quantity.or(z.literal(0)).nullable(), dailyCapacity: quantity.or(z.literal(0)).nullable(),
  preparationMinutes: z.number().int().min(0).max(525600), active: z.boolean(), featured: z.boolean(),
}).superRefine((p, ctx) => {
  if (p.unit === 'PIECE' || p.unit === 'PACK') {
    for (const key of ['priceBasisQuantity', 'minOrderQuantity', 'orderStepQuantity', 'stockQuantity', 'dailyCapacity'] as const) {
      if (p[key] != null && !Number.isInteger(p[key])) ctx.addIssue({code: 'custom', path: [key], message: 'Discrete units must be integers'});
    }
  }
});
export const mediaSchema = z.object({
  type: z.enum(['IMAGE', 'VIDEO']), cloudinaryId: z.string().min(1).max(255),
  secureUrl: z.url().refine(url => {const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com';}),
  altFa: z.string().trim().min(1).max(300), altEn: z.string().trim().min(1).max(300),
  width: z.number().int().positive(), height: z.number().int().positive(), bytes: z.number().int().positive(),
  durationSeconds: z.number().positive().nullable(),
}).superRefine((m, ctx) => {
  if (m.type === 'VIDEO' && m.bytes > 20_000_000) ctx.addIssue({code: 'custom', path: ['bytes'], message: 'Video must not exceed 20 MB'});
  if (m.type === 'VIDEO' && m.durationSeconds == null) ctx.addIssue({code: 'custom', path: ['durationSeconds'], message: 'Video duration is required'});
});
