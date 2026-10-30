import {test} from 'node:test';
import assert from 'node:assert/strict';
import {POST as domestic} from '../../src/app/api/shop/checkout/route';
import {POST as international} from '../../src/app/api/international/checkout/route';
test('both checkout endpoints reject guests before quoting, reserving stock or starting payment',async()=>{
 process.env.ROYA_DEMO_CATALOG='1';
 for(const checkout of [domestic,international]){const response=await checkout(new Request('https://example.com/api/checkout/',{method:'POST'}));assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'UNAUTHORIZED'});}
});
