import {z} from 'zod';
import {mobileSchema} from './checkout';
import {emailSchema,passwordSchema} from '@/lib/customer/validation';
export const adminIdentifierSchema=z.union([emailSchema,mobileSchema]);
export const adminPermissionsSchema=z.array(z.enum(['products','orders','payments','bankAccounts','shipping','discounts','communications','customers','settings'])).max(9).refine(a=>new Set(a).size===a.length);
export const createAdminSchema=z.object({name:z.string().trim().min(2).max(100),identifier:adminIdentifierSchema,temporaryPassword:passwordSchema,permissions:adminPermissionsSchema}).strict();
export const updateAdminSchema=z.object({id:z.string().min(1).max(100),expectedSessionVersion:z.number().int().nonnegative(),active:z.boolean(),permissions:adminPermissionsSchema,temporaryPassword:passwordSchema.optional()}).strict();
