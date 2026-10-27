import {z} from 'zod';

export const FX_SCALE = 1_000_000;
export const FX_MAX_AGE = 15 * 60 * 1000;
export const DAILY_FX_MAX_AGE=48*60*60*1000;
export const fxMetadataSchema=z.discriminatedUnion('provider',[
  z.object({provider:z.literal('coinbase')}).strict(),
  z.object({provider:z.literal('currency-api'),date:z.iso.date(),mirror:z.enum(['jsdelivr','cloudflare'])}).strict(),
]);
export type FxMetadata=z.infer<typeof fxMetadataSchema>;
export function fxObservationFresh(meta:FxMetadata|undefined,now=Date.now()){
  if(meta?.provider!=='currency-api')return true;
  const date=Date.parse(meta.date+'T00:00:00.000Z');
  return new Date(date).toISOString().slice(0,10)===meta.date&&now>=date&&now<date+DAILY_FX_MAX_AGE;
}
export const currencyCodes = ['IRT','USD','EUR','GBP','AED','TRY','CAD'] as const;
export type Currency = typeof currencyCodes[number];
export const countryCurrency:Record<string,Currency> = {IR:'IRT',TR:'TRY',AE:'AED',DE:'EUR',GB:'GBP',US:'USD',CA:'CAD',OTHER:'USD'};
export const currencyForCountry = (country:string) => countryCurrency[country] ?? 'USD';
const scaled = z.number().int().positive().max(1_000_000_000_000_000);
export const marketRatesSchema = z.object({
  fetchedAt:z.iso.datetime(), usdtTomanMicros:scaled, usdTomanMicros:scaled,
  sample:z.boolean().optional(),
  fxMeta:fxMetadataSchema.optional(),
  usdtPerUsdMicros:scaled,
  unitsPerUsd:z.object({USD:scaled,EUR:scaled,GBP:scaled,AED:scaled,TRY:scaled,CAD:scaled}).strict(),
}).strict();
export type MarketRates=z.infer<typeof marketRatesSchema>;
// Explicit opt-in fixture for the private simulator, never a market quote.
export function sampleMarketRates(now=new Date()):MarketRates{
  return marketRatesSchema.parse({sample:true,fetchedAt:now.toISOString(),usdtTomanMicros:100000*FX_SCALE,usdTomanMicros:100000*FX_SCALE,usdtPerUsdMicros:FX_SCALE,
    unitsPerUsd:{USD:FX_SCALE,EUR:800000,GBP:700000,AED:3672500,TRY:50000000,CAD:1400000}});
}
export const pricingPolicySchema=z.object({
  feeBps:z.number().int().min(0).max(10000),
  countryFees:z.record(z.string().regex(/^(TR|AE|DE|GB|US|CA|OTHER)$/),z.number().int().min(0).max(10000)),
  manualUsdToman:z.number().positive().max(1_000_000_000).nullable(),
  updatedAt:z.iso.datetime(),
}).strict();
export type PricingPolicy=z.infer<typeof pricingPolicySchema>;
export const pricingPolicyEditSchema=z.object({
  policy:pricingPolicySchema.omit({updatedAt:true}),
  expectedUpdatedAt:z.iso.datetime(),
}).strict();
export type PricingPolicyEdit=z.infer<typeof pricingPolicyEditSchema>;
export const defaultPricingPolicy:PricingPolicy={feeBps:0,countryFees:{},manualUsdToman:null,updatedAt:'1970-01-01T00:00:00.000Z'};
export const pricingSnapshotSchema=z.object({
  currency:z.enum(currencyCodes), usdTomanMicros:scaled, unitsPerUsdMicros:scaled,
  feeBps:z.number().int().min(0).max(10000), asOf:z.iso.datetime(),
  dollarSource:z.enum(['tether-cross','manual','sample']), revision:z.string().min(1).max(1000),
  fxMeta:fxMetadataSchema.optional(),
}).strict();
export type PricingSnapshot=z.infer<typeof pricingSnapshotSchema>;
export const pricedTotalsSchema=z.object({
  snapshot:pricingSnapshotSchema,
  subtotalMinor:z.number().int().nonnegative().safe(),discountMinor:z.number().int().nonnegative().safe(),
  feeMinor:z.number().int().nonnegative().safe(),deliveryMinor:z.number().int().nonnegative().safe(),
  totalMinor:z.number().int().positive().safe(),
}).strict();
export type PricedTotals=z.infer<typeof pricedTotalsSchema>;
export function ratesFresh(rates:MarketRates,now=Date.now()){
  const age=now-Date.parse(rates.fetchedAt);return age>=-60000&&age<FX_MAX_AGE&&fxObservationFresh(rates.fxMeta,now);
}
export function snapshotExpiresAt(snapshot:PricingSnapshot){
  return Math.min(Date.parse(snapshot.asOf)+FX_MAX_AGE,snapshot.fxMeta?.provider==='currency-api'?Date.parse(snapshot.fxMeta.date+'T00:00:00.000Z')+DAILY_FX_MAX_AGE:Infinity);
}
export function snapshotFresh(snapshot:PricingSnapshot,now=Date.now()){
  return now>=Date.parse(snapshot.asOf)-60000&&now<snapshotExpiresAt(snapshot)&&fxObservationFresh(snapshot.fxMeta,now);
}
export function pricingSnapshot(country:string,rates:MarketRates|null,policy:PricingPolicy,now=Date.now()):PricingSnapshot|null{
  if(country==='IR')return null;
  if(!rates||!ratesFresh(rates,now))return null;
  const currency=currencyForCountry(country);
  if(currency==='IRT')return null;
  const usdTomanMicros=policy.manualUsdToman===null?rates.usdTomanMicros:Math.round(policy.manualUsdToman*FX_SCALE);
  const feeBps=policy.countryFees[country]??policy.feeBps;
  const unitsPerUsdMicros=rates.unitsPerUsd[currency];
  return pricingSnapshotSchema.parse({currency,usdTomanMicros,unitsPerUsdMicros,feeBps,asOf:rates.fetchedAt,
    dollarSource:rates.sample?'sample':policy.manualUsdToman===null?'tether-cross':'manual',
    ...(rates.fxMeta?{fxMeta:rates.fxMeta}:{}),
    revision:JSON.stringify([country,currency,rates.fetchedAt,usdTomanMicros,unitsPerUsdMicros,feeBps,policy.updatedAt,!!rates.sample,rates.fxMeta??null])});
}
function safeNumber(value:bigint){const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('AMOUNT');return n;}
function rounded(n:bigint,d:bigint){return (n+d/2n)/d;}
export function convertTomanMinor(toman:number,snapshot:PricingSnapshot){
  if(!Number.isSafeInteger(toman)||toman<0)throw new Error('AMOUNT');
  if(snapshot.currency==='IRT')return toman;
  return safeNumber(rounded(BigInt(toman)*BigInt(snapshot.unitsPerUsdMicros)*100n,BigInt(snapshot.usdTomanMicros)));
}
export function priceTotals(subtotalToman:number,discountToman:number,deliveryToman:number,snapshot:PricingSnapshot):PricedTotals{
  pricingSnapshotSchema.parse(snapshot);
  if(discountToman>subtotalToman)throw new Error('AMOUNT');
  const subtotalMinor=convertTomanMinor(subtotalToman,snapshot),discountMinor=convertTomanMinor(discountToman,snapshot);
  const feeMinor=snapshot.currency==='IRT'?0:safeNumber(rounded(BigInt(subtotalMinor-discountMinor)*BigInt(snapshot.feeBps),10000n));
  const deliveryMinor=convertTomanMinor(deliveryToman,snapshot),totalMinor=subtotalMinor-discountMinor+feeMinor+deliveryMinor;
  return pricedTotalsSchema.parse({snapshot,subtotalMinor,discountMinor,feeMinor,deliveryMinor,totalMinor});
}
export function formatMoney(minor:number,currency:Currency,locale:string){
  if(currency==='IRT')return `${new Intl.NumberFormat(locale==='fa'?'fa-IR':'en-GB').format(minor)} ${locale==='fa'?'تومان':'Toman'}`;
  return new Intl.NumberFormat(locale==='fa'?'fa-IR':'en-GB',{style:'currency',currency,currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2}).format(minor/100);
}
