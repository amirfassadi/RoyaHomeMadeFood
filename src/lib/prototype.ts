import {coordinatesSchema} from './validation/shipping';
import {FX_SCALE,FX_MAX_AGE,pricedTotalsSchema,pricingSnapshotSchema,priceTotals,currencyForCountry,type PricingSnapshot} from './pricing';
import {z} from 'zod';
import type {CatalogView} from './catalog/types';
import {calculateLineTotal, validateQuantity} from './domain/order';
import {usdCents} from './international';
import {mobileSchema} from './validation/checkout';

// Browser-only prototype. No wallet, gateway URL, payment API or live-order adapter.
export const SAMPLE_TOMAN_PER_USD = 100000;
export const QUOTE_TTL_MS = 10 * 60 * 1000;
export const countries = [
  ['IR','ایران','Iran'], ['TR','ترکیه','Türkiye'], ['AE','امارات','United Arab Emirates'],
  ['DE','آلمان','Germany'], ['GB','بریتانیا','United Kingdom'],
  ['US','آمریکا','United States'], ['CA','کانادا','Canada'], ['OTHER','سایر کشورها','Other countries'],
] as const;
export type DemoPayment = 'BANK_TRANSFER' | 'CASH' | 'DOMESTIC_CARD' | 'USDC_BSC' | 'BTC_LIGHTNING' | 'PAYPAL';
export function overseas(country:string|null) { return !!country && country !== 'IR' && (country === 'OTHER' || /^[A-Z]{2}$/.test(country)) && !['XX','ZZ','T1'].includes(country); }
export function demoPayPalAllowed(country:string|null) {return ['AE','DE','GB','US','CA'].includes(country??'');}
export function demoPaymentAllowed(country:string|null, method:DemoPayment) {
  if(method==='PAYPAL')return demoPayPalAllowed(country);
  return overseas(country) ? ['USDC_BSC','BTC_LIGHTNING'].includes(method) : ['BANK_TRANSFER','CASH','DOMESTIC_CARD'].includes(method);
}
export const demoQuoteSchema = z.object({
  subtotalToman:z.number().int().nonnegative(),discountToman:z.number().int().nonnegative(),
  deliveryFeeToman:z.number().int().nonnegative(),totalToman:z.number().int().positive(),
  pricing:pricedTotalsSchema.optional(),amountUsdCents:z.number().int().positive(),expiresAt:z.iso.datetime(),fingerprint:z.string(),
});
export type DemoQuote = z.infer<typeof demoQuoteSchema>;
export const demoDetailsSchema = z.object({
  name:z.string().trim().min(2).max(100), mobile:mobileSchema,
  destination:coordinatesSchema.optional(),address:z.string().trim().min(10).max(1000),notes:z.string().trim().max(1000),
  buyerEmail:z.union([z.literal(''),z.email().max(254)]),country:z.enum(['IR','TR','AE','DE','GB','US','CA','OTHER']),
  zoneId:z.string().min(1),deliveryAt:z.iso.datetime(),deliverySlot:z.enum(['14–18','18–21']),
  method:z.enum(['BANK_TRANSFER','CASH','DOMESTIC_CARD','USDC_BSC','BTC_LIGHTNING','PAYPAL']),
}).superRefine((d,ctx)=>{
  if(overseas(d.country)&&!d.buyerEmail)ctx.addIssue({code:'custom',path:['buyerEmail'],message:'EMAIL'});
  if(!demoPaymentAllowed(d.country,d.method))ctx.addIssue({code:'custom',path:['method'],message:'PAYMENT'});
});
export type DemoDetails = z.infer<typeof demoDetailsSchema>;
const demoLineSchema=z.object({productId:z.string(),nameFa:z.string(),nameEn:z.string(),quantity:z.number().positive(),unit:z.string(),lineTotalToman:z.number().int().nonnegative()});
export const demoOrderSchema=z.object({
  id:z.string(),trackingCode:z.string().regex(/^DEMO-[A-F0-9]{12}$/),createdAt:z.string(),
  details:demoDetailsSchema,quote:demoQuoteSchema,items:z.array(demoLineSchema).min(1),
  paymentState:z.enum(['PENDING','SIMULATED_PAID','CASH_DUE','FAILED','EXPIRED']),
  status:z.enum(['PENDING','PREPARING','SHIPPED','DELIVERED','CANCELLED']),
  history:z.array(z.object({event:z.string(),at:z.string()})),
});
export type DemoOrder=z.infer<typeof demoOrderSchema>;
export type DemoZone={id:string;feeToman:number};
export type DemoItem={productId:string;quantity:number};
export function demoFingerprint(items:DemoItem[],zoneId:string,discountCode:string,country:string|null,revision?:string) {
  return JSON.stringify({items:[...items].sort((a,b)=>a.productId.localeCompare(b.productId)),zoneId,discountCode:discountCode.trim().toUpperCase(),country,...(revision?{pricingRevision:revision}:{})});
}
export function quoteDemo(catalog:CatalogView,items:DemoItem[],zone:DemoZone,discountCode:string,country:string|null,now=new Date(),pricing?:PricingSnapshot):DemoQuote {
  if(!catalog.isDemo)throw new Error('DEMO_ONLY');
  if(!items.length||items.length>30||new Set(items.map(i=>i.productId)).size!==items.length)throw new Error('CART');
  let subtotal=0;
  for(const item of items){
    const p=catalog.products.find(p=>p.id===item.productId);
    const limits=p?[p.stockQuantity,p.dailyCapacity].filter((n):n is number=>n!==null):[];
    if(!p||!validateQuantity(item.quantity,p.minOrderQuantity,p.orderStepQuantity,limits.length?Math.min(...limits):null))throw new Error('QUANTITY');
    subtotal+=calculateLineTotal(p.priceToman,item.quantity,p.priceBasisQuantity);
  }
  const code=discountCode.trim().toUpperCase();
  if(code&&code!=='ROYA10')throw new Error('DISCOUNT');
  const discount=code?Math.min(Math.floor(subtotal/10),100000):0,total=subtotal-discount+zone.feeToman;
  if(!Number.isSafeInteger(total)||total<=0||total>2147483647)throw new Error('AMOUNT');
  if(pricing){
    pricingSnapshotSchema.parse(pricing);
    const age=now.getTime()-Date.parse(pricing.asOf);
    if(pricing.currency!==currencyForCountry(country??'IR')||age < -60000||age>=FX_MAX_AGE)throw new Error('RATES_STALE');
  }
  const priced=pricing?priceTotals(subtotal,discount,zone.feeToman,pricing):undefined;
  const amountUsdCents=pricing?priceTotals(subtotal,discount,zone.feeToman,{...pricing,currency:'USD',unitsPerUsdMicros:FX_SCALE}).totalMinor:usdCents(total,SAMPLE_TOMAN_PER_USD);
  return {subtotalToman:subtotal,discountToman:discount,deliveryFeeToman:zone.feeToman,totalToman:total,
    amountUsdCents,expiresAt:new Date(Math.min(now.getTime()+QUOTE_TTL_MS,pricing?Date.parse(pricing.asOf)+FX_MAX_AGE:Infinity)).toISOString(),
    fingerprint:demoFingerprint(items,zone.id,code,country,pricing?.revision),...(priced?{pricing:priced}:{})};
}
export function makeDemoOrder(catalog:CatalogView,items:DemoItem[],details:DemoDetails,quote:DemoQuote,now=new Date(),id=crypto.randomUUID()):DemoOrder {
  const d=demoDetailsSchema.parse(details);
  if(!catalog.isDemo||!demoPaymentAllowed(d.country,d.method))throw new Error('DEMO_ONLY');
  if(new Date(quote.expiresAt).getTime()<=now.getTime())throw new Error('EXPIRED');
  if(quote.fingerprint!==demoFingerprint(items,d.zoneId,JSON.parse(quote.fingerprint).discountCode,d.country,quote.pricing?.snapshot.revision))throw new Error('QUOTE_CHANGED');
  const verified=quoteDemo(catalog,items,{id:d.zoneId,feeToman:quote.deliveryFeeToman},JSON.parse(quote.fingerprint).discountCode,d.country,now,quote.pricing?.snapshot);
  for(const key of ['subtotalToman','discountToman','deliveryFeeToman','totalToman','amountUsdCents'] as const){if(verified[key]!==quote[key])throw new Error('QUOTE_CHANGED');}
  if(JSON.stringify(verified.pricing)!==JSON.stringify(quote.pricing))throw new Error('QUOTE_CHANGED');
  if(new Date(d.deliveryAt).getTime()<now.getTime()+24*60*60*1000)throw new Error('DELIVERY');
  const order:DemoOrder={id,trackingCode:`DEMO-${id.replace(/-/g,'').slice(0,12).toUpperCase()}`,createdAt:now.toISOString(),details:d,quote,
    items:items.map(i=>{const p=catalog.products.find(p=>p.id===i.productId)!;return {...i,nameFa:p.nameFa,nameEn:p.nameEn,unit:p.unit,lineTotalToman:calculateLineTotal(p.priceToman,i.quantity,p.priceBasisQuantity)};}),
    paymentState:d.method==='CASH'?'CASH_DUE':'PENDING',status:'PENDING',history:[{event:'CREATED',at:now.toISOString()}]};
  return demoOrderSchema.parse(order);
}
export function settleDemoOrder(order:DemoOrder,outcome:'SIMULATED_PAID'|'FAILED'|'EXPIRED',now=new Date()):DemoOrder {
  if(order.paymentState!=='PENDING'||order.status==='CANCELLED')return order;
  const state=new Date(order.quote.expiresAt).getTime()<=now.getTime()?'EXPIRED':outcome;
  return {...order,paymentState:state,history:[...order.history,{event:state,at:now.toISOString()}]};
}
export function advanceDemoOrder(order:DemoOrder,status:DemoOrder['status'],now=new Date()):DemoOrder {
  const next={PENDING:['PREPARING','CANCELLED'],PREPARING:['SHIPPED','CANCELLED'],SHIPPED:['DELIVERED'],DELIVERED:[],CANCELLED:[]} as const;
  if(!(next[order.status] as readonly string[]).includes(status))throw new Error('TRANSITION');
  if(status!=='CANCELLED'&&!['SIMULATED_PAID','CASH_DUE'].includes(order.paymentState))throw new Error('PAYMENT_PENDING');
  return {...order,status,history:[...order.history,{event:status,at:now.toISOString()}]};
}
export const DEMO_ORDERS_KEY='roya-prototype-orders-v1';
export function parseDemoOrders(raw:string|null):DemoOrder[]{
  try{const data:unknown=JSON.parse(raw??'[]');return Array.isArray(data)?data.slice(0,50).flatMap(v=>{const r=demoOrderSchema.safeParse(v);return r.success?[r.data]:[];}):[];}catch{return [];}
}
export function upsertDemoOrder(orders:DemoOrder[],order:DemoOrder){return [order,...orders.filter(o=>o.id!==order.id)].slice(0,50);}
export const demoStateLabels:Record<string,[string,string]>={
  CREATED:['سفارش آزمایشی ایجاد شد','Test order created'],PENDING:['در انتظار بررسی','Awaiting review'],
  SIMULATED_PAID:['پرداخت موفق شبیه‌سازی شد','Payment success simulated'],CASH_DUE:['پرداخت در محل (آزمایشی)','Cash due (simulated)'],
  FAILED:['پرداخت ناموفق (آزمایشی)','Payment failure simulated'],EXPIRED:['فاکتور منقضی (آزمایشی)','Invoice expired'],
  PREPARING:['در حال آماده‌سازی (آزمایشی)','Preparing (simulated)'],SHIPPED:['ارسال شده (آزمایشی)','Dispatched (simulated)'],
  DELIVERED:['تحویل شده (آزمایشی)','Delivered (simulated)'],CANCELLED:['لغو شده (آزمایشی)','Cancelled (simulated)'],
};
export const demoMethodLabels:Record<DemoPayment,[string,string]>={
  BANK_TRANSFER:['کارت به کارت / پایا / پل (آزمایشی)','Bank transfer (simulated)'],CASH:['پرداخت در محل','Cash on delivery'],DOMESTIC_CARD:['پرداخت آنلاین با زرین‌پال (آزمایشی)','Zarinpal (simulated)'],
  USDC_BSC:['USDC روی BSC','USDC on BSC'],BTC_LIGHTNING:['بیت‌کوین لایتنینگ','BTC Lightning'],PAYPAL:['پی‌پال (آزمایشی)','PayPal (simulated)'],
};
