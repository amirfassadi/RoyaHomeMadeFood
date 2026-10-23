import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ORIGIN} from '../deploy/diagnose-domain-admin.mjs';
import {inspectBusinessProduct,readOnlyStorefrontTransport,verifyDomainStorefront} from '../deploy/verify-domain-storefront.mjs';

const product={id:'fixture-product',slug:'chicken-mushroom',nameFa:'ژامبون قارچ و مرغ',categoryId:'fixture-category',unit:'KG',priceBasisQuantity:1,priceToman:1500000,stockQuantity:null,dailyCapacity:null,preparationMinutes:2880};
const catalog=()=>({scope:'private-database',catalog:{source:'database',isDemo:true,categories:[{id:'fixture-category'}],products:[structuredClone(product)]}});
const headers={'content-type':'application/json','x-roya-domain-stage':'public-preview-v1','x-robots-tag':'noindex, nofollow','cache-control':'private, no-store'};
const freshRates=()=>({schemaVersion:2,tether:{usdtTomanMicros:250000000000},fx:{fxMeta:{provider:'currency-api',date:'2026-10-24'}},rates:{},sources:{nobitex:{state:'fresh',fetchedAt:'2026-10-24T07:00:00.000Z',refreshFailed:false},fx:{state:'fresh',fetchedAt:'2026-10-24T07:00:00.000Z',refreshFailed:false}}});
function fixture({patch=()=>{},rates=freshRates(),ratesStatus=200,changeResponse}={}){
 const calls=[];
 const send=async(url,init={})=>{
  const path=new URL(url).pathname+new URL(url).search;
  calls.push({path,method:init.method,headers:init.headers,body:init.body});
  if(changeResponse){const custom=changeResponse(path);if(custom)return custom;}
  let value,status=200,type='application/json';
  if(path==='/api/health/')value={status:'ok'};
  else if(path.startsWith('/api/admin/data/')){value={error:'UNAUTHORIZED'};status=401;}
  else if(path==='/api/shop/catalog/'){value=catalog();patch(value);}
  else if(path==='/api/shop/pricing/')value={scope:'store',schemaVersion:1,policy:{feeBps:750}};
  else if(path==='/api/shop/rates/'){value=rates;status=ratesStatus;}
  else if(/^\/(fa|en)\/(catalog|products\/chicken-mushroom)\/$/.test(path)){
   const locale=path.split('/')[1];type='text/html';value='<html lang="'+locale+'" dir="'+(locale==='fa'?'rtl':'ltr')+'"><body>Fixture</body></html>';
  }else throw new Error('Unexpected fixture destination: '+path);
  return new Response(type==='application/json'?JSON.stringify(value):value,{status,headers:{...headers,'content-type':type}});
 };
 return {calls,send};
}

test('operator check verifies the actual catalog contract and performs GET only without login or checkout',async()=>{
 const f=fixture(),output=[];
 const result=await verifyDomainStorefront({send:f.send,emit:line=>output.push(line)});
 assert.equal(result.ratesComplete,true);assert.equal(result.product.preparationMinutes,2880);
 assert(output.some(line=>line.startsWith('STOREFRONT DATA PASS:')));
 assert(output.some(line=>line.includes('no browser cart')));
 assert(f.calls.every(call=>call.method==='GET'&&call.body===undefined&&!new Headers(call.headers).has('cookie')&&!new Headers(call.headers).has('authorization')));
 assert(!f.calls.some(call=>/checkout|callback|webhook|auth\//.test(call.path)));
 assert(f.calls.some(call=>call.path==='/en/products/chicken-mushroom/'));
});
test('both known name orders match, while missing and duplicate products fail before a page request',()=>{
 const payload=catalog();payload.catalog.products[0].nameFa='ژامبون مرغ و قارچ';assert.equal(inspectBusinessProduct(payload).id,product.id);
 payload.catalog.products=[];assert.throws(()=>inspectBusinessProduct(payload),/not found/);
 payload.catalog.products=[product,{...product,id:'duplicate'}];assert.throws(()=>inspectBusinessProduct(payload),/More than one/);
});
test('old four-hour preparation, wrong per-kg price and finite inventory cannot pass',()=>{
 for(const patch of [{preparationMinutes:240},{priceToman:150000},{unit:'GRAM'},{priceBasisQuantity:1000},{stockQuantity:0},{dailyCapacity:8}]){
  const payload=catalog();Object.assign(payload.catalog.products[0],patch);assert.throws(()=>inspectBusinessProduct(payload));
 }
});
test('sample catalog, missing categories and unsafe slugs are rejected',()=>{
 for(const change of [p=>{p.catalog.source='sample';},p=>{p.catalog.isDemo=false;},p=>{p.catalog.categories=[];},p=>{p.catalog.products[0].slug='../api/payment/callback';}]){
  const payload=catalog();change(payload);assert.throws(()=>inspectBusinessProduct(payload));
 }
});
test('a preparation mismatch stops before rates and never logs unrelated response content',async()=>{
 const output=[],f=fixture({patch:p=>{p.catalog.products[0].preparationMinutes=240;p.privateFixture='must-not-be-printed';}});
 await assert.rejects(verifyDomainStorefront({send:f.send,emit:line=>output.push(line)}),/2880/);
 assert(!f.calls.some(call=>call.path==='/api/shop/rates/'));
 assert(!output.join('\n').includes('must-not-be-printed'));
});
test('stale or unavailable rates remain incomplete even when product verification passes',async()=>{
 for(const [ratesStatus,state] of [[200,'stale'],[503,'unavailable']]){
  const rates=freshRates();rates.sources.fx.state=state;rates.fx=null;rates.rates=null;
  const output=[],f=fixture({rates,ratesStatus});
  const result=await verifyDomainStorefront({send:f.send,emit:line=>output.push(line)});
  assert.equal(result.ratesComplete,false);
  assert(output.some(line=>line.startsWith('PRODUCT DATA PASS:')));
  assert(output.some(line=>line.startsWith('RATES INCOMPLETE:')));
 }
});
test('unexpected health, open administrator API, missing noindex/no-store and wrong language fail',async()=>{
 for(const changeResponse of [
  path=>path==='/api/health/'?new Response('{"ok":true}',{headers}):null,
  path=>path.startsWith('/api/admin/data/')?new Response('{}',{headers}):null,
  path=>path==='/api/shop/catalog/'?new Response(JSON.stringify(catalog()),{headers:{...headers,'x-robots-tag':''}}):null,
  path=>path==='/api/shop/catalog/'?new Response(JSON.stringify(catalog()),{headers:{...headers,'cache-control':''}}):null,
  path=>path==='/en/catalog/'?new Response('<html lang="fa" dir="rtl">',{headers:{...headers,'content-type':'text/html'}}):null,
 ]){
  const f=fixture({changeResponse});await assert.rejects(verifyDomainStorefront({send:f.send,emit:()=>{}}));
 }
});
test('transport refuses writes, cookies, credentials, alternate hosts, paths and redirects before any network call',async()=>{
 let calls=0;const send=readOnlyStorefrontTransport(async()=>{calls++;return new Response('{}');});
 for(const [url,init] of [
  [ORIGIN+'/api/shop/catalog/',{method:'POST'}],
  [ORIGIN+'/api/shop/catalog/',{body:'anything'}],
  [ORIGIN+'/api/shop/catalog/',{headers:{cookie:'secret'}}],
  [ORIGIN+'/api/shop/catalog/',{headers:{authorization:'secret'}}],
  ['https://wrong.invalid/api/shop/catalog/',{}],
  ['https://name:secret@royahealthyfood.ir/api/shop/catalog/',{}],
  [ORIGIN+'/api/shop/checkout/',{}],
  [ORIGIN+'/api/shop/catalog/?redirect=1',{}],
  [ORIGIN+'/api/shop/catalog/#fragment',{}],
 ])await assert.rejects(send(url,init));
 assert.equal(calls,0);
 const f=fixture({changeResponse:path=>path==='/api/shop/catalog/'?new Response('',{status:302,headers:{...headers,location:'https://wrong.invalid/'}}):null});
 await assert.rejects(verifyDomainStorefront({send:f.send,emit:()=>{}}),/HTTP status/);
 assert(!f.calls.some(call=>call.path==='/api/shop/rates/'));
});
