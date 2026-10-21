import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isDemoAdmin} from '../../src/lib/server/admin-mode';
import {POST as checkout} from '../../src/app/api/shop/checkout/route';
import {POST as sms} from '../../src/app/api/customer/code/route';
import {POST as payment} from '../../src/app/api/payment/crypto/webhook/route';
import {getPricingPolicy,savePricingPolicy} from '../../src/lib/server/pricing-settings';
import {defaultPricingPolicy} from '../../src/lib/pricing';
test('sample catalog cannot bypass real admin authentication in standalone mode',()=>{
  process.env.ROYA_DEPLOYMENT_ROLE='standalone';process.env.ROYA_DEMO_CATALOG='1';process.env.SITES_STATIC_PREVIEW='1';assert.equal(isDemoAdmin(),false);delete process.env.SITES_STATIC_PREVIEW;
});
test('handlers reject live effects even when invoked without the network proxy',async()=>{
  process.env.ROYA_DEPLOYMENT_ROLE='standalone';process.env.ROYA_ACCEPT_ORDERS='0';process.env.ROYA_SEND_SMS='0';process.env.ROYA_LIVE_PAYMENTS='0';
  for(const [handler,path] of [[checkout,'shop/checkout'],[sms,'customer/code'],[payment,'payment/crypto/webhook']] as const){const r=await handler(new Request('http://localhost:3311/api/'+path+'/',{method:'POST'}));assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'STAGING_ONLY'});}
});
test('store pricing reads DB despite sample catalog, and rejects stale edits without audit',async()=>{
  process.env.ROYA_DEMO_CATALOG='1';delete process.env.SITES_STATIC_PREVIEW;
  let writes=0,audits=0;
  const date=new Date('2026-10-21T11:00:00.000Z');
  const tx={setting:{updateMany:async()=>({count:0})},adminAudit:{create:async()=>{audits++;}}};
  Object.assign(globalThis,{royaDb:{setting:{findUnique:async()=>({value:{...defaultPricingPolicy,feeBps:125},updatedAt:date})},$transaction:async(fn:any)=>{writes++;return fn(tx);}}});
  assert.equal((await getPricingPolicy()).feeBps,125);assert.equal((await getPricingPolicy()).updatedAt,date.toISOString());
  const {updatedAt,...policy}=defaultPricingPolicy;
  await assert.rejects(()=>savePricingPolicy({policy,expectedUpdatedAt:date.toISOString()},'admin'),/CONFLICT/);assert.equal(writes,1);assert.equal(audits,0);
});
