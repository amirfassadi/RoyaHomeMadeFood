import {z} from 'zod';
export const smsPolicySchema=z.object({enabled:z.boolean()}).strict();
export const smsPolicyEditSchema=z.object({settings:smsPolicySchema,expectedUpdatedAt:z.iso.datetime().nullable()}).strict();
