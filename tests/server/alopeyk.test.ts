import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alopeykQuote} from '../../src/lib/server/alopeyk';
const settings={enabled:true,markupPercent:2.5,origin:{lat:35.7,lng:51.4}};
test('Alopeyk quote uses approved host and server token; fails closed on malformed and failed replies',async()=>{
 const original=globalThis.fetch;
 process.env.ALOPEYK_ACCESS_TOKEN='test-only';process.env.ALOPEYK_ENVIRONMENT='sandbox';
 try{
  globalThis.fetch=async(url,init)=>{
   assert.equal(String(url),'https://sandbox-api.alopeyk.com/api/v2/orders/price/calc');
   assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-only');
   const body=JSON.parse(init?.body as string);assert.equal(body.transport_type,'motorbike');assert.equal(body.addresses[1].lat,35.8);
   return Response.json({status:'success',object:{status:'OK',price:100000}});
  };
  const q=await alopeykQuote(settings,{lat:35.8,lng:51.5});assert.equal(q.deliveryFeeToman,102500);assert.equal(q.deliveryTestMode,true);
  await assert.rejects(()=>alopeykQuote(settings,undefined),/DELIVERY_LOCATION_REQUIRED/);
  for(const reply of [{status:'fail'},{status:'success',object:{status:'OK',price:-1}},{status:'success',object:{status:'OK',price:'1000'}}]){
   globalThis.fetch=async()=>Response.json(reply);await assert.rejects(()=>alopeykQuote(settings,{lat:35.8,lng:51.5}),/DELIVERY_UNAVAILABLE/);
  }
  globalThis.fetch=async()=>{throw new Error('network');};await assert.rejects(()=>alopeykQuote(settings,{lat:35.8,lng:51.5}),/DELIVERY_UNAVAILABLE/);
 }finally{globalThis.fetch=original;delete process.env.ALOPEYK_ACCESS_TOKEN;delete process.env.ALOPEYK_ENVIRONMENT;}
});
