import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {CatalogView} from '../src/lib/catalog/types';
import {FX_SCALE,FX_MAX_AGE,pricingSnapshot,type MarketRates,type PricingPolicy} from '../src/lib/pricing';
import {quoteDemo,quoteNeedsReview,makeDemoOrder,settleDemoOrder,parseDemoOrders,upsertDemoOrder,type DemoDetails} from '../src/lib/prototype';
import {demoPreparationMinutes,demoDeliveryChoices,earliestDemoDelivery} from '../src/lib/prototype-delivery';

// Isolated business scenario; not a current exchange-rate claim or catalog write.
const now=new Date('2026-10-22T19:00:00Z');
const catalog:CatalogView={isDemo:true,source:'database',categories:[],products:[{
 id:'fixture-chicken-mushroom',slug:'fixture-chicken-mushroom',categoryId:'fixture-cold-cuts',
 nameFa:'ژامبون مرغ و قارچ',nameEn:'Chicken and Mushroom Cold Cuts',descriptionFa:'محصول آزمایشی',descriptionEn:'Test fixture only',
 priceToman:1500000,unit:'KG',priceBasisQuantity:1,minOrderQuantity:1,orderStepQuantity:1,
 stockQuantity:null,dailyCapacity:null,preparationMinutes:2880,featured:false,media:[],
}]};
const zone={id:'fixture-zone',feeToman:50000},items=[{productId:catalog.products[0].id,quantity:1}];
const rates:MarketRates={fetchedAt:now.toISOString(),usdTomanMicros:271880*FX_SCALE,usdtTomanMicros:271880*FX_SCALE,usdtPerUsdMicros:FX_SCALE,
 unitsPerUsd:{USD:FX_SCALE,AED:3672500,EUR:900000,GBP:800000,TRY:40000000,CAD:1400000},
 fxMeta:{provider:'currency-api',date:'2026-10-22',mirror:'jsdelivr'}};
const policy:PricingPolicy={feeBps:200,countryFees:{TR:300},manualUsdToman:null,updatedAt:now.toISOString()};
const details:DemoDetails={name:'Test recipient',mobile:'09123456789',address:'Test delivery address in Tehran',notes:'Test only',buyerEmail:'test@example.com',country:'AE',zoneId:zone.id,deliveryAt:'2026-10-25T14:30:00Z',deliverySlot:'18–21',method:'PAYPAL'};
const snapshot=(country:string)=>pricingSnapshot(country,rates,policy,now.getTime())!;
const quote=(country='AE',quantity=1)=>quoteDemo(catalog,[{...items[0],quantity}],zone,'',country,now,country==='IR'?undefined:snapshot(country));

test('kilogram pricing: one/two kg preserve base Toman prices and add delivery once',()=>{
 assert.deepEqual([quote('IR').subtotalToman,quote('IR').totalToman],[1500000,1550000]);
 assert.deepEqual([quote('IR',2).subtotalToman,quote('IR',2).totalToman],[3000000,3050000]);
 assert.throws(()=>quote('IR',.5),/QUANTITY/);
 assert.equal(quote('IR',10).subtotalToman,15000000);
 const p=quote().pricing!;
 assert.deepEqual([p.subtotalMinor,p.feeMinor,p.deliveryMinor,p.totalMinor],[2026,41,68,2135]);
 assert.deepEqual([quote('AE',2).pricing!.subtotalMinor,quote('AE',2).pricing!.deliveryMinor],[4052,68]);
});
test('country switch rebuilds currency and fees and rejects the previous invoice/payment selection',()=>{
 for(const [country,currency,fee] of [['AE','AED',200],['TR','TRY',300],['DE','EUR',200],['GB','GBP',200],['US','USD',200],['CA','CAD',200],['OTHER','USD',200]] as const){
  const q=quote(country),p=q.pricing!;
  assert.equal(p.snapshot.currency,currency);assert.equal(p.snapshot.feeBps,fee);
  assert.equal(p.totalMinor,p.subtotalMinor-p.discountMinor+p.feeMinor+p.deliveryMinor);
  if(country!=='AE')assert(quoteNeedsReview(quote(),q));
 }
 assert.throws(()=>makeDemoOrder(catalog,items,{...details,country:'TR'},quote('TR'),now));
 assert.throws(()=>makeDemoOrder(catalog,items,{...details,country:'TR',method:'BTC_LIGHTNING'},quote(),now),/QUOTE_CHANGED/);
 const domestic=makeDemoOrder(catalog,items,{...details,country:'IR',buyerEmail:'',method:'CASH'},quote('IR'),now);
 assert.equal(domestic.paymentState,'CASH_DUE');assert.equal(domestic.quote.pricing,undefined);
});
test('guest invoices simulate foreign payment outcomes and survive serialization without a live adapter',()=>{
 for(const method of ['PAYPAL','USDC_BSC','BTC_LIGHTNING'] as const){
  const order=makeDemoOrder(catalog,items,{...details,method},quote(),now,'123e4567-e89b-42d3-a456-426614174000');
  assert.equal(order.paymentState,'PENDING');assert.equal(order.items[0].unit,'KG');
  for(const outcome of ['SIMULATED_PAID','FAILED','EXPIRED'] as const){
   const result=settleDemoOrder(order,outcome,now),saved=upsertDemoOrder([order],result);
   assert.equal(saved.length,1);assert.deepEqual(parseDemoOrders(JSON.stringify(saved)),saved);
   assert.equal(saved[0].paymentState,outcome);assert.equal(saved[0].quote.pricing!.totalMinor,2135);
   assert.equal(settleDemoOrder(result,'SIMULATED_PAID',now),result);
  }
  assert(!('paymentUrl' in order));assert(!('walletAddress' in order));
 }
});
test('saved invoice is isolated from later catalog, rate and policy changes',()=>{
 const source=structuredClone(catalog),q=quote(),order=makeDemoOrder(source,items,details,q,now);
 const saved=JSON.stringify([settleDemoOrder(order,'SIMULATED_PAID',now)]);
 source.products[0].priceToman=2000000;source.products[0].nameFa='Changed later';
 q.pricing!.snapshot.feeBps=900;
 assert.equal(order.quote.pricing!.snapshot.feeBps,200);
 const newer=pricingSnapshot('AE',{...rates,usdTomanMicros:300000*FX_SCALE},{...policy,feeBps:500},now.getTime())!;
 assert(quoteNeedsReview(order.quote,quoteDemo(source,items,zone,'','AE',now,newer)));
 assert.throws(()=>makeDemoOrder(source,items,details,order.quote,now),/QUOTE_CHANGED/);
 const restored=parseDemoOrders(saved)[0];
 assert.equal(restored.items[0].lineTotalToman,1500000);assert.equal(restored.items[0].nameFa,'ژامبون مرغ و قارچ');
 assert.equal(restored.quote.pricing!.totalMinor,2135);assert.equal(restored.quote.pricing!.snapshot.usdTomanMicros,271880*FX_SCALE);
});
test('stale rates, expired quotes and changed availability cannot silently complete checkout',()=>{
 const late=new Date(now.getTime()+FX_MAX_AGE);
 assert.equal(pricingSnapshot('AE',rates,policy,late.getTime()),null);
 assert.throws(()=>quoteDemo(catalog,items,zone,'','AE',late,snapshot('AE')),/RATES_STALE/);
 assert.throws(()=>makeDemoOrder(catalog,items,details,quote(),late),/EXPIRED/);
 for(const patch of [{stockQuantity:0},{dailyCapacity:0}])assert.throws(()=>makeDemoOrder({...catalog,products:[{...catalog.products[0],...patch}]},items,details,quote(),now),/QUANTITY/);
 assert.throws(()=>makeDemoOrder({...catalog,products:[]},items,details,quote(),now),/QUANTITY/);
});
test('two-day preparation rejects a delivery only 24 hours away',()=>{
 assert.throws(()=>makeDemoOrder(catalog,items,{...details,deliveryAt:new Date(now.getTime()+86400000).toISOString()},quote(),now),/DELIVERY/);
 assert.equal(makeDemoOrder(catalog,items,details,quote(),now).status,'PENDING');
});
test('delivery choices respect preparation, Tehran window starts and exact time boundaries',()=>{
 assert.deepEqual(demoDeliveryChoices(now.getTime(),2880,'14–18'),['2026-10-25T10:30:00.000Z','2026-10-26T10:30:00.000Z','2026-10-27T10:30:00.000Z']);
 const between=Date.parse('2026-10-22T12:00:00Z');
 assert.equal(demoDeliveryChoices(between,2880,'14–18')[0],'2026-10-25T10:30:00.000Z');
 assert.equal(demoDeliveryChoices(between,2880,'18–21')[0],'2026-10-24T14:30:00.000Z');
 const boundary=Date.parse('2026-10-22T10:30:00Z');
 assert.equal(demoDeliveryChoices(boundary,2880,'14–18')[0],'2026-10-24T10:30:00.000Z');
 assert.equal(demoDeliveryChoices(boundary+1,2880,'14–18')[0],'2026-10-25T10:30:00.000Z');
 for(const minutes of [0,2880,10080])for(const slot of ['14–18','18–21'] as const){
  const choices=demoDeliveryChoices(now.getTime(),minutes,slot);
  assert.equal(new Set(choices).size,3);assert(choices.every(d=>Date.parse(d)>=earliestDemoDelivery(now,minutes).getTime()));
 }
});
test('longest preparation controls mixed baskets and refreshed preparation is rechecked at order creation',()=>{
 const slower={...catalog.products[0],id:'fixture-slow',preparationMinutes:10080};
 const mixed={...catalog,products:[...catalog.products,slower]};
 assert.equal(demoPreparationMinutes(mixed,[...items,{productId:slower.id}]),10080);
 assert.equal(demoPreparationMinutes(mixed,items),2880);
 assert.throws(()=>makeDemoOrder({...catalog,products:[{...catalog.products[0],preparationMinutes:10080}]},items,details,quote(),now),/DELIVERY/);
});
