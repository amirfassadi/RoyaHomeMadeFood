import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoCatalog} from '../src/lib/catalog/demo';
import {quoteDemo,makeDemoOrder,settleDemoOrder,advanceDemoOrder,parseDemoOrders,upsertDemoOrder,demoDetailsSchema,demoPaymentAllowed,overseas,QUOTE_TTL_MS,type DemoDetails} from '../src/lib/prototype';
const now=new Date('2026-10-18T10:00:00Z'),items=[{productId:'demo-platter',quantity:1}],zone={id:'demo-tehran-central',feeToman:50000};
const details:DemoDetails={name:'Test recipient',mobile:'09123456789',address:'Tehran sample street, test address',notes:'Test only',buyerEmail:'test@example.com',country:'DE',zoneId:zone.id,deliveryAt:'2026-10-21T10:30:00Z',deliverySlot:'14–18',method:'USDC_BSC'};
const quote=(country:string='DE',code='')=>quoteDemo(demoCatalog,items,zone,code,country,now);
const create=(d:DemoDetails=details)=>makeDemoOrder(demoCatalog,items,d,quote(d.country),now,'123e4567-e89b-42d3-a456-426614174000');
test('country preview keeps domestic methods in Iran and limits PayPal to supported test countries',()=>{
 assert(!overseas('IR'));assert(!overseas(null));assert(!overseas('XX'));assert(!overseas('ZZ'));assert(!overseas('T1'));assert(overseas('TR'));assert(overseas('OTHER'));
 for(const country of ['IR','DE','TR','AE','US','CA','OTHER']){assert.equal(demoPaymentAllowed(country,'PAYPAL'),['DE','AE','US','CA'].includes(country));assert.equal(demoPaymentAllowed(country,'CASH'),country==='IR');assert.equal(demoPaymentAllowed(country,'DOMESTIC_CARD'),country==='IR');assert.equal(demoPaymentAllowed(country,'USDC_BSC'),country!=='IR');assert.equal(demoPaymentAllowed(country,'BTC_LIGHTNING'),country!=='IR');}
});
test('quotes use sample catalog, valid quantities, discount cap and integer USD cents',()=>{
 assert.deepEqual([quote().subtotalToman,quote().totalToman,quote().amountUsdCents],[850000,900000,900]);
 assert.equal(quote('DE','roya10').discountToman,85000);assert.equal(quote('DE','ROYA10').amountUsdCents,815);
 assert.equal(quoteDemo(demoCatalog,[{productId:'demo-platter',quantity:2}],zone,'ROYA10','DE',now).discountToman,100000);
 assert.throws(()=>quoteDemo({...demoCatalog,isDemo:false},items,zone,'','DE',now),/DEMO_ONLY/);
 assert.throws(()=>quoteDemo(demoCatalog,[{productId:'demo-platter',quantity:6}],zone,'','DE',now),/QUANTITY/);
 assert.throws(()=>quoteDemo(demoCatalog,[{productId:'demo-finger-food',quantity:13}],zone,'','DE',now),/QUANTITY/);
 assert.throws(()=>quoteDemo(demoCatalog,[...items,...items],zone,'','DE',now),/CART/);
 assert.throws(()=>quote('DE','BAD'),/DISCOUNT/);
});
test('overseas guest validation requires buyer email and an Iranian recipient mobile',()=>{
 assert(demoDetailsSchema.safeParse({...details,mobile:'۰۹۱۲۳۴۵۶۷۸۹'}).success);
 assert(!demoDetailsSchema.safeParse({...details,mobile:'+49123456789'}).success);
 assert(!demoDetailsSchema.safeParse({...details,buyerEmail:''}).success);
 assert(demoDetailsSchema.safeParse({...details,method:'PAYPAL'}).success);
 assert(!demoDetailsSchema.safeParse({...details,country:'TR',method:'PAYPAL'}).success);
 assert(!demoDetailsSchema.safeParse({...details,country:'OTHER',method:'PAYPAL'}).success);
 assert.equal(demoPaymentAllowed('GB','PAYPAL'),true);
 assert.equal(demoPaymentAllowed(null,'PAYPAL'),false);
 assert(!demoDetailsSchema.safeParse({...details,country:'IR'}).success);
 assert(demoDetailsSchema.safeParse({...details,country:'IR',method:'CASH',buyerEmail:''}).success);
});
test('a stale, modified or expired quote cannot create a test invoice',()=>{
 assert.throws(()=>makeDemoOrder(demoCatalog,items,details,quote(),new Date(now.getTime()+QUOTE_TTL_MS)),/EXPIRED/);
 assert.throws(()=>makeDemoOrder(demoCatalog,items,{...details,country:'TR'},quote(),now),/QUOTE_CHANGED/);
 assert.throws(()=>makeDemoOrder(demoCatalog,[{productId:'demo-platter',quantity:2}],details,quote(),now),/QUOTE_CHANGED/);
 assert.throws(()=>makeDemoOrder(demoCatalog,items,details,{...quote(),totalToman:1},now),/QUOTE_CHANGED/);
 assert.throws(()=>makeDemoOrder(demoCatalog,items,{...details,deliveryAt:now.toISOString()},quote(),now),/DELIVERY/);
});
test('USDC, Lightning and PayPal invoices simulate outcomes without gateways or paid claims',()=>{
 for(const method of ['USDC_BSC','BTC_LIGHTNING','PAYPAL'] as const){const order=create({...details,method});assert.equal(order.paymentState,'PENDING');assert.equal(order.trackingCode,'DEMO-123E4567E89B');assert(!('paymentUrl' in order));assert(!('walletAddress' in order));
  for(const state of ['SIMULATED_PAID','FAILED','EXPIRED'] as const){const next=settleDemoOrder(order,state,now);assert.equal(next.paymentState,state);assert.equal(next.history.length,2);assert.equal(settleDemoOrder(next,'SIMULATED_PAID',now),next);}
 }
 const expired=settleDemoOrder(create(),'SIMULATED_PAID',new Date(now.getTime()+QUOTE_TTL_MS));assert.equal(expired.paymentState,'EXPIRED');
});
test('fulfilment transitions respect payment state and cannot be reordered',()=>{
 const pending=create();assert.throws(()=>advanceDemoOrder(pending,'PREPARING',now),/PAYMENT_PENDING/);
 const paid=settleDemoOrder(pending,'SIMULATED_PAID',now);assert.throws(()=>advanceDemoOrder(paid,'DELIVERED',now),/TRANSITION/);
 const preparing=advanceDemoOrder(paid,'PREPARING',now),shipped=advanceDemoOrder(preparing,'SHIPPED',now),delivered=advanceDemoOrder(shipped,'DELIVERED',now);assert.equal(delivered.history.length,5);assert.throws(()=>advanceDemoOrder(delivered,'CANCELLED',now),/TRANSITION/);
 const cancelled=advanceDemoOrder(pending,'CANCELLED',now);assert.equal(settleDemoOrder(cancelled,'SIMULATED_PAID',now),cancelled);
 const cash=create({...details,country:'IR',buyerEmail:'',method:'CASH'});assert.equal(cash.paymentState,'CASH_DUE');assert.equal(advanceDemoOrder(cash,'PREPARING',now).status,'PREPARING');
});
test('browser order storage is bounded, deduplicated, reloadable and resilient to malformed data',()=>{
 const order=create(),paid=settleDemoOrder(order,'SIMULATED_PAID',now);const saved=upsertDemoOrder([order],paid);assert.equal(saved.length,1);assert.equal(saved[0].paymentState,'SIMULATED_PAID');assert.deepEqual(parseDemoOrders(JSON.stringify(saved)),saved);assert.deepEqual(parseDemoOrders('invalid'),[]);assert.deepEqual(parseDemoOrders('{"not":"an order"}'),[]);assert.deepEqual(parseDemoOrders('[{}]'),[]);
 assert.equal(upsertDemoOrder(Array.from({length:60},(_,i)=>({...order,id:String(i)})),paid).length,50);
});
