import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shippingTotal} from '../src/lib/domain/shipping';
import {shippingSettingsSchema} from '../src/lib/validation/shipping';
test('shipping markup uses courier fare, supports zero and decimals, rounds up to a toman',()=>{
 assert.equal(shippingTotal(100000,1).deliveryFeeToman,101000);
 assert.equal(shippingTotal(100000,2.5).shippingMarkupToman,2500);
 assert.equal(shippingTotal(999,0).deliveryFeeToman,999);
 assert.equal(shippingTotal(101,1).shippingMarkupToman,2);
 for(const percent of [-1,101,NaN,Infinity,0.001])assert.throws(()=>shippingTotal(100,percent));
 assert.throws(()=>shippingTotal(2147483647,100));
});
test('settings reject client-supplied tokens and invalid coordinates',()=>{
 const valid={enabled:true,markupPercent:1,origin:{lat:35.7,lng:51.4}};
 assert.ok(shippingSettingsSchema.safeParse(valid).success);
 assert.ok(!shippingSettingsSchema.safeParse({...valid,token:'secret'}).success);
 assert.ok(!shippingSettingsSchema.safeParse({...valid,origin:{lat:91,lng:51}}).success);
});
