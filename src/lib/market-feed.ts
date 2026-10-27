import {z} from 'zod';
import {marketRatesSchema} from './pricing';

const sourceSchema=z.object({state:z.enum(['fresh','stale','unavailable']),fetchedAt:z.iso.datetime().nullable(),refreshFailed:z.boolean()}).strict();
export const marketFeedSchema=z.object({
  schemaVersion:z.literal(2),
  rates:marketRatesSchema.nullable(),
  tether:z.object({fetchedAt:z.iso.datetime(),usdtTomanMicros:marketRatesSchema.shape.usdtTomanMicros}).strict().nullable(),
  fx:marketRatesSchema.pick({fetchedAt:true,usdtPerUsdMicros:true,unitsPerUsd:true,fxMeta:true}).nullable(),
  sources:z.object({nobitex:sourceSchema,fx:sourceSchema}).strict(),
}).strict();
export type MarketFeed=z.infer<typeof marketFeedSchema>;
export async function fetchStoreMarketFeed():Promise<MarketFeed>{
  const response=await fetch('/api/shop/rates/',{cache:'no-store',signal:AbortSignal.timeout(11000)});
  if(!response.ok&&response.status!==503)throw new Error('RATE_UNAVAILABLE');
  return marketFeedSchema.parse(await response.json());
}
