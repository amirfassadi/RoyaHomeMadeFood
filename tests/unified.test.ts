import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stagingBlockedPath} from '../src/lib/staging-policy';
import {newerPolicy,storePolicyResponseSchema} from '../src/lib/pricing-store';
import {defaultPricingPolicy,pricingPolicyEditSchema} from '../src/lib/pricing';
test('private staging blocks live payment, checkout, reconciliation and SMS paths',()=>{
  for(const path of ['/api/shop/checkout','/api/international/checkout/','/api/payment/callback/','/api/payment/crypto/webhook/','/api/admin/orders/reconcile/','/api/admin/orders/cod-paid/','/api/customer/code/'])assert.equal(stagingBlockedPath(path,{}),true,path);
  for(const path of ['/api/auth/csrf/','/api/health/','/api/shop/pricing/','/api/admin/settings/pricing/'])assert.equal(stagingBlockedPath(path,{}),false,path);
});
test('a late policy response cannot roll back a newer store policy',()=>{
  const recent={...defaultPricingPolicy,feeBps:200,updatedAt:'2026-10-21T12:00:00.000Z'};
  assert.equal(newerPolicy(recent,defaultPricingPolicy),recent);
  assert.equal(newerPolicy(defaultPricingPolicy,recent),recent);
  assert.equal(storePolicyResponseSchema.safeParse({policy:recent,scope:'browser',schemaVersion:1}).success,false);
  assert.equal(storePolicyResponseSchema.safeParse({policy:recent,scope:'store',schemaVersion:1}).success,true);
});
test('pricing edits require a version and reject injected timestamps or fields',()=>{
  const {updatedAt,...policy}=defaultPricingPolicy;
  assert.equal(pricingPolicyEditSchema.safeParse({policy,expectedUpdatedAt:updatedAt}).success,true);
  assert.equal(pricingPolicyEditSchema.safeParse({policy}).success,false);
  assert.equal(pricingPolicyEditSchema.safeParse({policy:{...policy,updatedAt},expectedUpdatedAt:updatedAt}).success,false);
  assert.equal(pricingPolicyEditSchema.safeParse({policy,expectedUpdatedAt:updatedAt,adminId:'injected'}).success,false);
});
