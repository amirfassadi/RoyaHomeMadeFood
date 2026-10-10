import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quoteSchema,checkoutSchema,trackingSchema} from '../src/lib/validation/checkout';
import {capacityDay,discountAmount,tomanToRial,checkedMoney} from '../src/lib/domain/checkout';
const item={productId:'product-1',quantity:750};
const quote={items:[item],zoneId:'zone-1',discountCode:' welcome '};
const checkout={...quote,name:'Test Customer',mobile:'۰۹۱۲۳۴۵۶۷۸۹',address:'A complete delivery address',notes:'',locale:'fa',paymentMethod:'CASH_ON_DELIVERY',idempotencyKey:'123e4567-e89b-42d3-a456-426614174000',expectedTotal:120000};
test('checkout accepts Persian mobile digits and normalizes discount code',()=>{
 const parsed=checkoutSchema.parse(checkout);assert.equal(parsed.mobile,'09123456789');assert.equal(parsed.discountCode,'WELCOME');
});
test('client price injection, duplicate items and invalid precision are rejected',()=>{
 assert.equal(quoteSchema.safeParse({...quote,priceToman:1}).success,false);
 assert.equal(quoteSchema.safeParse({...quote,items:[item,item]}).success,false);
 assert.equal(quoteSchema.safeParse({...quote,items:[{...item,quantity:0.0001}]}).success,false);
 assert.equal(checkoutSchema.safeParse({...checkout,expectedTotal:-1}).success,false);
 assert.equal(checkoutSchema.safeParse({...checkout,paymentMethod:'FREE'}).success,false);
 assert.equal(checkoutSchema.safeParse({...checkout,mobile:'12345'}).success,false);
});
test('tracking requires random code and mobile; normalizes case',()=>{
 const code='roya-0123456789abcdef01234567';
 assert.equal(trackingSchema.parse({trackingCode:code,mobile:'09123456789'}).trackingCode,code.toUpperCase());
 assert.equal(trackingSchema.safeParse({trackingCode:'123',mobile:'09123456789'}).success,false);
});
test('discounts round down, obey caps and never exceed subtotal',()=>{
 assert.equal(discountAmount(101,{type:'PERCENT',value:10,maxDiscountToman:null}),10);
 assert.equal(discountAmount(100000,{type:'PERCENT',value:30,maxDiscountToman:20000}),20000);
 assert.equal(discountAmount(100,{type:'FIXED',value:500,maxDiscountToman:null}),100);
});
test('gateway uses explicit Riyal conversion without integer overflow',()=>{
 assert.equal(tomanToRial(120000),1200000);assert.equal(tomanToRial(2147483647),21474836470);
 assert.throws(()=>checkedMoney(2147483648));assert.throws(()=>tomanToRial(-1));
});
test('capacity date rolls over in Tehran, not server UTC',()=>{
 assert.equal(capacityDay(new Date('2026-10-10T21:00:00Z')),'2026-10-11');
 assert.equal(capacityDay(new Date('2026-10-10T19:00:00Z')),'2026-10-10');
});
