import {z} from 'zod';
import type {CatalogView} from './types';
const positive=z.number().positive().finite(),nonnegative=z.number().nonnegative().finite();
const product=z.object({
 id:z.string().min(1),slug:z.string().min(1),nameFa:z.string(),nameEn:z.string(),descriptionFa:z.string(),descriptionEn:z.string(),categoryId:z.string(),
 priceToman:z.number().int().nonnegative(),unit:z.enum(['KG','GRAM','PIECE','PACK']),priceBasisQuantity:positive,minOrderQuantity:positive,orderStepQuantity:positive,
 stockQuantity:nonnegative.nullable(),dailyCapacity:nonnegative.nullable(),preparationMinutes:nonnegative,featured:z.boolean(),
 media:z.array(z.object({id:z.string(),type:z.enum(['IMAGE','VIDEO']),url:z.string().url(),altFa:z.string(),altEn:z.string(),width:positive,height:positive})),
});
export const privateCatalogResponseSchema=z.object({scope:z.literal('private-database'),catalog:z.object({
 products:z.array(product),categories:z.array(z.object({id:z.string(),slug:z.string(),nameFa:z.string(),nameEn:z.string()})),isDemo:z.literal(true),source:z.literal('database'),
})});
export function cartStorageKey(catalog:CatalogView){return `roya-cart-v1-${catalog.isDemo?(catalog.source==='database'?'database-preview':'demo'):'live'}`;}
