import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {FX_SCALE,pricingSnapshot,priceTotals,type MarketRates,type PricingPolicy} from '../src/lib/pricing';
import {storePolicyResponseSchema} from '../src/lib/pricing-store';
import {demoCatalog} from '../src/lib/catalog/demo';
import {quoteDemo,makeDemoOrder,parseDemoOrders} from '../src/lib/prototype';

export type HttpClient={request:(path:string,init?:RequestInit)=>Promise<Response>;post:(path:string,body:unknown)=>Promise<Response>};
export type PricingCheckpoint={phase:string;original:PricingPolicy;desired?:Omit<PricingPolicy,'updatedAt'>;owned?:PricingPolicy};
export class PricingTestError extends Error{}
export async function checkedJson(response:Response,stage:string,status=200){
 if(response.status!==status)throw new PricingTestError(`${stage}: expected HTTP ${status}, received ${response.status}.`);
 try{return await response.json();}catch{throw new PricingTestError(`${stage}: invalid JSON response.`);}
}
export function editable(p:PricingPolicy){return {feeBps:p.feeBps,countryFees:{...p.countryFees},manualUsdToman:p.manualUsdToman};}

export class PrivateAdminClient implements HttpClient{
 cookies=new Map<string,string>();
 constructor(readonly base:string,readonly origin:string){
  const b=new URL(base),o=new URL(origin);
  if(b.protocol!=='http:'||b.hostname!=='127.0.0.1'||!['3311','4313'].includes(b.port)||o.origin!==`http://localhost:${b.port}`)throw new PricingTestError('Only the private loopback preview or isolated test server is supported.');
 }
 async request(path:string,init:RequestInit={}){
  const headers=new Headers(init.headers);
  if(this.cookies.size)headers.set('cookie',[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '));
  let r:Response;
  try{r=await fetch(this.base+path,{...init,headers,redirect:'manual',signal:AbortSignal.timeout(15000)});}
  catch{throw new PricingTestError('HTTP request failed or timed out; no credentials were printed.');}
  for(const cookie of r.headers.getSetCookie()){
   const pair=cookie.split(';',1)[0],i=pair.indexOf('=');if(i<1)continue;
   const k=pair.slice(0,i),v=pair.slice(i+1);if(v)this.cookies.set(k,v);else this.cookies.delete(k);
  }
  return r;
 }
 post(path:string,body:unknown){return this.request(path,{method:'POST',headers:{origin:this.origin,'content-type':'application/json'},body:JSON.stringify(body)});}
 async auth(action:string,values:Record<string,string>={}){
  const csrf=await checkedJson(await this.request('/api/auth/csrf/'),'csrf');
  if(typeof csrf.csrfToken!=='string')throw new PricingTestError('CSRF token missing.');
  return this.request('/api/auth/'+action+'/',{method:'POST',headers:{origin:this.origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...values,csrfToken:csrf.csrfToken,callbackUrl:this.origin+'/admin/',json:'true'})});
 }
}

export async function runPricingAdminTest({admin,guest,checkpoint,report=console.log}:{admin:HttpClient;guest:HttpClient;checkpoint:(value:PricingCheckpoint)=>Promise<void>|void;report?:(line:string)=>void}){
 async function read(){return storePolicyResponseSchema.parse(await checkedJson(await guest.request('/api/shop/pricing/'),'guest-pricing')).policy;}
 const original=await read();let owned:PricingPolicy|undefined,attempted=false,restored=false;
 let desired:Omit<PricingPolicy,'updatedAt'>|undefined;
 const mark=(phase:string)=>checkpoint({phase,original,...(desired?{desired}:{}),...(owned?{owned}:{})});
 async function save(policy:Omit<PricingPolicy,'updatedAt'>,version:string,stage:string){
  desired=policy;await mark(stage+'-pending');attempted=true;
  const response=await admin.post('/api/admin/settings/pricing/',{policy,expectedUpdatedAt:version});
  const result=storePolicyResponseSchema.parse(await checkedJson(response,stage)).policy;
  assert.ok(Date.parse(result.updatedAt)>Date.parse(version),stage+': version must advance.');
  assert.deepEqual(editable(result),policy,stage+': returned policy differs.');
  owned=result;await mark(stage+'-saved');return result;
 }
 await mark('prepared');
 try{
  await checkedJson(await guest.post('/api/admin/settings/pricing/',{policy:editable(original),expectedUpdatedAt:original.updatedAt}),'guest-write',401);
  const fees:Record<string,number>={...original.countryFees,TR:300};delete fees.DE;delete fees.US;
  const automatic={feeBps:750,countryFees:fees,manualUsdToman:null};
  const a=await save(automatic,original.updatedAt,'automatic');
  assert.deepEqual(await read(),a,'Independent guest did not receive the saved policy.');
  report('PRICING shared store read: PASS; default 7.5%, Türkiye 3%.');

  // Deterministic calculation fixtures only; these do not replace or cache market feeds.
  const now=new Date(),rates:MarketRates={fetchedAt:now.toISOString(),usdTomanMicros:100000*FX_SCALE,usdtTomanMicros:100000*FX_SCALE,usdtPerUsdMicros:FX_SCALE,unitsPerUsd:{USD:FX_SCALE,EUR:800000,GBP:700000,AED:3672500,TRY:50000000,CAD:1400000}};
  const items=[{productId:'demo-platter',quantity:1}],zone={id:'pricing-test-zone',feeToman:50000};
  const autoSnapshot=pricingSnapshot('DE',rates,a,now.getTime())!;
  assert.equal(autoSnapshot.dollarSource,'tether-cross');
  const quote=quoteDemo(demoCatalog,items,zone,'ROYA10','DE',now,autoSnapshot);
  assert.deepEqual([quote.pricing!.subtotalMinor,quote.pricing!.discountMinor,quote.pricing!.feeMinor,quote.pricing!.deliveryMinor,quote.pricing!.totalMinor],[680,68,46,40,698]);
  const invoice=makeDemoOrder(demoCatalog,items,{name:'Pricing test recipient',mobile:'09120000000',address:'A complete controlled test address',notes:'',buyerEmail:'pricing@example.com',country:'DE',zoneId:zone.id,deliveryAt:new Date(now.getTime()+3*86400000).toISOString(),deliverySlot:'14–18',method:'PAYPAL'},quote,now);
  const frozen=JSON.stringify(invoice);

  const b=await save({...automatic,manualUsdToman:200000},a.updatedAt,'manual');
  assert.deepEqual(await read(),b,'Independent guest did not receive the manual rate.');
  const de=pricingSnapshot('DE',rates,b,now.getTime())!,tr=pricingSnapshot('TR',rates,b,now.getTime())!,us=pricingSnapshot('US',rates,b,now.getTime())!;
  assert.equal(de.dollarSource,'manual');assert.equal(de.feeBps,750);assert.equal(tr.feeBps,300);assert.equal(us.feeBps,750);
  const totals=priceTotals(850000,85000,50000,de);
  assert.deepEqual([totals.subtotalMinor,totals.discountMinor,totals.feeMinor,totals.deliveryMinor,totals.totalMinor],[340,34,23,20,349]);
  assert.equal(priceTotals(850000,85000,50000,tr).totalMinor,20949);
  assert.equal(priceTotals(850000,85000,50000,us).totalMinor,436);
  assert.equal(pricingSnapshot('IR',rates,b,now.getTime()),null);
  assert.equal(quoteDemo(demoCatalog,items,zone,'ROYA10','IR',now).totalToman,815000);
  assert.equal(JSON.stringify(invoice),frozen);assert.deepEqual(parseDemoOrders(JSON.stringify([invoice]))[0].quote,quote);
  assert.notEqual(quoteDemo(demoCatalog,items,zone,'ROYA10','DE',now,de).fingerprint,quote.fingerprint);
  report('PRICING calculation fixtures: PASS; manual USD, country fees, discount, shipping, rounding and frozen invoice. Market feeds untouched.');

  await checkedJson(await admin.post('/api/admin/settings/pricing/',{policy:{...automatic,feeBps:900},expectedUpdatedAt:a.updatedAt}),'stale-policy',409);
  await checkedJson(await admin.post('/api/admin/settings/pricing/',{policy:{...automatic,feeBps:10001},expectedUpdatedAt:b.updatedAt}),'invalid-policy',400);
  assert.deepEqual(await read(),b,'Rejected edits changed the policy.');
  report('PRICING stale and invalid edits: PASS.');
 }finally{
  if(attempted){
   const current=await read();
   if(owned&&current.updatedAt===owned.updatedAt&&isDeepStrictEqual(editable(current),editable(owned))){
    try{
     const result=await save(editable(original),current.updatedAt,'restore');
     assert.deepEqual(await read(),result,'Restored values were not visible to the independent guest.');
     restored=true;await mark('restored');
     report('PRICING original values restored and verified; version and audit history advance normally.');
    }catch{
     await mark('restore-review-required');
     throw new PricingTestError('RESTORE_REVIEW: restoration could not be confirmed. No blind retry was made; review the private recovery record.');
    }
   }else if(!owned&&isDeepStrictEqual(current,original)){
    restored=true;await mark('unchanged');
   }else{
    await mark('review-required');
    throw new PricingTestError('RESTORE_REVIEW: policy version changed or a write response was lost. No newer policy was overwritten; use the private recovery record for review.');
   }
  }
 }
 assert.ok(restored,'Restoration was not verified.');
 report('PRICING FLOW PASS: authenticated persistence, independent guest reads, default/country fees, manual USD, calculations, immutable test invoice, edit validation and restoration.');
}
