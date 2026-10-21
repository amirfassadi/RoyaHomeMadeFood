import {z} from 'zod';
import {pricingPolicySchema,type PricingPolicy} from './pricing';
export const storePolicyResponseSchema=z.object({policy:pricingPolicySchema,scope:z.literal('store'),schemaVersion:z.literal(1)});
export function newerPolicy(current:PricingPolicy,next:PricingPolicy){return Date.parse(next.updatedAt)>=Date.parse(current.updatedAt)?next:current;}
export class PricingSaveError extends Error{constructor(public code:'CONFLICT'|'UNAUTHORIZED'|'UNCERTAIN'){super(code);}}
