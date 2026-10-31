import {test} from 'node:test';
import assert from 'node:assert/strict';
import {failure,ShopError} from '../../src/lib/server/shop-http';

test('rate limit response includes retry duration in JSON and Retry-After header',async()=>{
 const response=failure(new ShopError('RATE_LIMIT',429,420));
 assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'420');
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(await response.json(),{error:'RATE_LIMIT',retryAfter:420});
 const unavailable=failure(new Error('private provider data'));
 assert.equal(unavailable.headers.get('Retry-After'),null);
 assert.deepEqual(await unavailable.json(),{error:'UNAVAILABLE'});
});
