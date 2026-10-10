import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword} from '../src/lib/admin/password';
import {allowedTransition,canReleaseCancellation} from '../src/lib/admin/order-rules';
import {discountSchema,zoneSchema,productEditSchema} from '../src/lib/validation/admin';
import {jalaliInput,parseJalaliInput} from '../src/lib/admin/jalali-input';
test('admin password hashes are salted, bounded and never accept wrong passwords',async()=>{
 const a=await hashPassword('Strong password 123'),b=await hashPassword('Strong password 123');assert.notEqual(a,b);
 assert.equal(await verifyPassword('Strong password 123',a),true);assert.equal(await verifyPassword('incorrect',a),false);assert.equal(await verifyPassword('anything',null),false);await assert.rejects(()=>hashPassword('short'));
});
test('order transitions are forward-only and terminal orders cannot reopen',()=>{
 assert.equal(allowedTransition('PENDING','PREPARING'),true);assert.equal(allowedTransition('PREPARING','SHIPPED'),true);assert.equal(allowedTransition('SHIPPED','DELIVERED'),true);assert.equal(allowedTransition('PREPARING','PENDING'),false);assert.equal(allowedTransition('CANCELLED','PREPARING'),false);assert.equal(allowedTransition('SHIPPED','CANCELLED'),false);
});
test('uncertain gateway payments retain their stock reservation',()=>{
 for(const s of ['REQUESTING','READY','UNKNOWN'])assert.equal(canReleaseCancellation('ZARINPAL','PENDING',s),false);
 assert.equal(canReleaseCancellation('ZARINPAL','PENDING','NEW'),true);assert.equal(canReleaseCancellation('ZARINPAL','PENDING','REJECTED'),true);assert.equal(canReleaseCancellation('ZARINPAL','PAID','READY'),true);assert.equal(canReleaseCancellation('CASH_ON_DELIVERY','UNPAID',null),true);
});
test('discounts reject excessive percentages, reversed dates and edits without version',()=>{
 const d={code:'WELCOME',type:'PERCENT',value:10,minSubtotalToman:0,maxDiscountToman:null,usageLimit:null,startsAt:null,expiresAt:null,active:true};assert.equal(discountSchema.safeParse(d).success,true);assert.equal(discountSchema.safeParse({...d,value:101}).success,false);assert.equal(discountSchema.safeParse({...d,id:'id'}).success,false);assert.equal(discountSchema.safeParse({...d,startsAt:'2026-10-12T10:00:00Z',expiresAt:'2026-10-11T10:00:00Z'}).success,false);
 assert.equal(zoneSchema.safeParse({cityFa:'تهران',cityEn:'Tehran',nameFa:'مرکز',nameEn:'Center',feeToman:-1,deliveryMinutes:60,active:true}).success,false);
});
test('Jalali editor uses Persian digits and round-trips timezone and leap days',()=>{
 const iso='2026-10-10T07:00:00.000Z';const text=jalaliInput(iso);assert.match(text,/۱۴۰۵/);assert.equal(parseJalaliInput(text),iso);assert.equal(parseJalaliInput(''),null);assert.throws(()=>parseJalaliInput('۱۴۰۴/۱۲/۳۰ ۱۰:۰۰'));assert.throws(()=>parseJalaliInput('۱۴۰۵/۱۳/۰۱ ۱۰:۰۰'));
});
