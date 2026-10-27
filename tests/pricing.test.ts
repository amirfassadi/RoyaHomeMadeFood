import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMarketRates,parseDailyUsdRates,combineMarketRates} from '../src/lib/fx-rates';
import {FX_SCALE,FX_MAX_AGE,sampleMarketRates,currencyForCountry,defaultPricingPolicy,pricingPolicySchema,pricingSnapshot,convertTomanMinor,priceTotals,ratesFresh,snapshotFresh,type MarketRates} from '../src/lib/pricing';
import {demoCatalog} from '../src/lib/catalog/demo';
import {quoteDemo,makeDemoOrder,parseDemoOrders,type DemoDetails} from '../src/lib/prototype';
import {parseTomanInput} from '../src/lib/currency-converter';

const now=new Date('2026-10-19T00:00:00Z');
const rates:MarketRates={fetchedAt:now.toISOString(),usdTomanMicros:100000*FX_SCALE,usdtTomanMicros:100000*FX_SCALE,usdtPerUsdMicros:FX_SCALE,
 unitsPerUsd:{USD:FX_SCALE,EUR:800000,GBP:700000,AED:3672500,TRY:50000000,CAD:1400000}};
const policy={...defaultPricingPolicy,feeBps:500,countryFees:{TR:1000},updatedAt:now.toISOString()};
const snapshot=()=>pricingSnapshot('DE',rates,policy,now.getTime())!;

test('public rate parsing distinguishes rial, Toman, USDT and USD rather than pegging Tether',()=>{
 const n={status:'ok',stats:{'usdt-rls':{latest:'1000000',isClosed:false}}};
 const c={data:{currency:'USD',rates:{USD:'1',USDT:'1.01',EUR:'.8',GBP:'.7',AED:'3.6725',TRY:'50',CAD:'1.4'}}};
 const parsed=parseMarketRates(n,c,now);
 assert.equal(parsed.usdtTomanMicros,100000*FX_SCALE);
 assert.equal(parsed.usdTomanMicros,101000*FX_SCALE);
 assert.throws(()=>parseMarketRates({...n,status:'error'},c,now));
 assert.throws(()=>parseMarketRates({status:'ok',stats:{'usdt-rls':{latest:'0',isClosed:false}}},c,now));
 assert.throws(()=>parseMarketRates(n,{data:{currency:'EUR',rates:c.data.rates}},now));
 assert.throws(()=>parseMarketRates(n,{data:{currency:'USD',rates:{...c.data.rates,USDT:'NaN'}}},now));
});
test('country currency, fee overrides, manual rates and freshness are independent of language',()=>{
 for(const [country,currency] of Object.entries({IR:'IRT',TR:'TRY',AE:'AED',DE:'EUR',GB:'GBP',US:'USD',CA:'CAD',OTHER:'USD'}))assert.equal(currencyForCountry(country),currency);
 assert.equal(pricingSnapshot('IR',rates,policy,now.getTime()),null);
 assert.equal(pricingSnapshot('TR',rates,policy,now.getTime())!.feeBps,1000);
 assert.equal(snapshot().feeBps,500);
 assert.equal(pricingSnapshot('DE',rates,{...policy,manualUsdToman:200000},now.getTime())!.dollarSource,'manual');
 assert.equal(pricingSnapshot('DE',rates,policy,now.getTime()+FX_MAX_AGE),null);
 assert.equal(ratesFresh({...rates,fetchedAt:new Date(now.getTime()+120000).toISOString()},now.getTime()),false);
 assert.equal(pricingPolicySchema.safeParse({...policy,feeBps:-1}).success,false);
 assert.equal(pricingPolicySchema.safeParse({...policy,countryFees:{IR:500}}).success,false);
 assert.equal(pricingPolicySchema.safeParse({...policy,manualUsdToman:0}).success,false);
});
test('minor-unit totals apply the fee after discount, excluding shipping, and add up exactly',()=>{
 const s=snapshot(),q=priceTotals(850000,85000,50000,s);
 assert.deepEqual([q.subtotalMinor,q.discountMinor,q.feeMinor,q.deliveryMinor,q.totalMinor],[680,68,31,40,683]);
 assert.equal(q.totalMinor,q.subtotalMinor-q.discountMinor+q.feeMinor+q.deliveryMinor);
 assert.equal(convertTomanMinor(625,s),1); // exactly half of one EUR cent rounds up
 assert.equal(priceTotals(850000,0,50000,{...s,feeBps:0}).feeMinor,0);
 assert.throws(()=>convertTomanMinor(Number.NaN,s));
 assert.throws(()=>priceTotals(1000,1001,0,s));
 const manual=pricingSnapshot('DE',rates,{...policy,manualUsdToman:200000},now.getTime())!;
 assert.equal(convertTomanMinor(850000,manual),340);
});
test('foreign invoice snapshots reject tampering and stale rates, survive reload, and never rewrite history',()=>{
 const items=[{productId:'demo-platter',quantity:1}],zone={id:'test-zone',feeToman:50000};
 const details:DemoDetails={name:'Test recipient',mobile:'09123456789',address:'A complete test delivery address',notes:'',buyerEmail:'buyer@example.com',country:'DE',zoneId:zone.id,deliveryAt:'2026-10-22T10:30:00Z',deliverySlot:'14–18',method:'PAYPAL'};
 const q=quoteDemo(demoCatalog,items,zone,'ROYA10','DE',now,snapshot());
 assert.equal(q.pricing!.totalMinor,683);
 const order=makeDemoOrder(demoCatalog,items,details,q,now,'123e4567-e89b-42d3-a456-426614174000');
 assert.deepEqual(parseDemoOrders(JSON.stringify([order]))[0].quote.pricing,q.pricing);
 const changed=pricingSnapshot('DE',rates,{...policy,feeBps:900},now.getTime())!;
 assert.notEqual(quoteDemo(demoCatalog,items,zone,'ROYA10','DE',now,changed).fingerprint,q.fingerprint);
 assert.equal(order.quote.pricing!.snapshot.feeBps,500);
 assert.throws(()=>makeDemoOrder(demoCatalog,items,details,{...q,pricing:{...q.pricing!,totalMinor:1}},now),/QUOTE_CHANGED/);
 assert.throws(()=>quoteDemo(demoCatalog,items,zone,'','TR',now,snapshot()),/RATES_STALE/);
 assert.throws(()=>quoteDemo(demoCatalog,items,zone,'','DE',new Date(now.getTime()+FX_MAX_AGE),snapshot()),/RATES_STALE/);
 const late=new Date(now.getTime()+14*60*1000);
 assert.equal(Date.parse(quoteDemo(demoCatalog,items,zone,'','DE',late,snapshot()).expiresAt),now.getTime()+FX_MAX_AGE);
 assert.equal(items[0].quantity,1);
});

test('sample rates require explicit selection and keep their fictional source on saved invoices',()=>{
 const sample=sampleMarketRates(now);
 assert.equal(sample.sample,true);
 assert.equal(rates.sample,undefined);
 const s=pricingSnapshot('DE',sample,policy,now.getTime())!;
 assert.equal(s.dollarSource,'sample');
 assert.notEqual(s.revision,snapshot().revision);
 assert.equal(pricingSnapshot('DE',sample,{...policy,manualUsdToman:123000},now.getTime())!.dollarSource,'sample');
 const q=quoteDemo(demoCatalog,[{productId:'demo-platter',quantity:1}],{id:'test-zone',feeToman:50000},'','DE',now,s);
 assert.equal(q.pricing!.snapshot.dollarSource,'sample');
 assert.equal(pricingSnapshot('DE',sample,policy,now.getTime()+FX_MAX_AGE),null);
});

test('converter accepts Persian and Arabic digits and shares country fee math with the basket',()=>{
 assert.equal(parseTomanInput('۱٬۰۰۰٬۰۰۰'),1000000);
 assert.equal(parseTomanInput('١٠٠٠'),1000);
 assert.equal(parseTomanInput(' 1,000,000 '),1000000);
 for(const value of ['', '-10','0','1.5','1e6','Infinity','1000000001','abc'])assert.equal(parseTomanInput(value),null);
 const amount=parseTomanInput('۱٬۰۰۰٬۰۰۰')!;
 const tr=pricingSnapshot('TR',rates,policy,now.getTime())!;
 assert.deepEqual(priceTotals(amount,0,0,tr),{snapshot:tr,subtotalMinor:50000,discountMinor:0,feeMinor:5000,deliveryMinor:0,totalMinor:55000});
 const de=pricingSnapshot('DE',rates,policy,now.getTime())!;
 assert.equal(priceTotals(amount,0,0,de).totalMinor,840);
 assert.equal(priceTotals(amount,0,0,tr).totalMinor,55000);
});

test('daily observations reject old, future, impossible, missing and invalid rate data',()=>{
 const data={date:'2026-10-19',usd:{usd:1,usdt:1.01,eur:.8,gbp:.7,aed:3.6725,try:50,cad:1.4}};
 const parsed=parseDailyUsdRates(data,now.getTime());
 assert.equal(parsed.usdtPerUsdMicros,1010000);
 for(const date of ['2026-10-17','2026-10-20','2026-02-30','yesterday'])assert.throws(()=>parseDailyUsdRates({...data,date},now.getTime()));
 for(const usd of [{...data.usd,usdt:undefined},{...data.usd,eur:-1},{...data.usd,usd:2}])assert.throws(()=>parseDailyUsdRates({...data,usd},now.getTime()));
});

test('daily provenance is frozen into invoices and their lifetime ends at the data-age boundary',()=>{
 const nearEnd=new Date('2026-10-19T23:59:00Z');
 const fx=parseDailyUsdRates({date:'2026-10-18',usd:{usd:1,usdt:1.01,eur:.8,gbp:.7,aed:3.6725,try:50,cad:1.4}},nearEnd.getTime());
 const r=combineMarketRates(100000*FX_SCALE,fx,nearEnd,{provider:'currency-api',date:fx.date,mirror:'jsdelivr'});
 const s=pricingSnapshot('DE',r,policy,nearEnd.getTime())!;
 const items=[{productId:'demo-platter',quantity:1}],zone={id:'test-zone',feeToman:50000};
 const q=quoteDemo(demoCatalog,items,zone,'','DE',nearEnd,s);
 assert.equal(q.expiresAt,'2026-10-20T00:00:00.000Z');
 assert.deepEqual(q.pricing!.snapshot.fxMeta,r.fxMeta);
 assert.deepEqual(JSON.parse(JSON.stringify(q.pricing!.snapshot)).fxMeta,r.fxMeta);
 const expired=Date.parse('2026-10-20T00:00:00Z');
 assert.equal(ratesFresh({...r,fetchedAt:new Date(expired).toISOString()},expired),false);
 assert.equal(snapshotFresh({...s,asOf:new Date(expired).toISOString()},expired),false);
 assert.throws(()=>quoteDemo(demoCatalog,items,zone,'','DE',new Date(expired),{...s,asOf:new Date(expired).toISOString()}),/RATES_STALE/);
 assert.equal(snapshotFresh({...s,fxMeta:{provider:'currency-api',date:'2026-10-20',mirror:'jsdelivr'}},nearEnd.getTime()),false);
});
