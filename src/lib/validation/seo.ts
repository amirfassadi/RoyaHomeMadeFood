import {z} from 'zod';
export const seoSettingsSchema=z.object({enabled:z.boolean(),googleVerification:z.string().trim().max(200).regex(/^[A-Za-z0-9_-]*$/).default('')}).strict();
export type SeoSettings=z.infer<typeof seoSettingsSchema>;
export const seoEditSchema=z.object({settings:seoSettingsSchema,expectedUpdatedAt:z.iso.datetime().nullable()}).strict();
