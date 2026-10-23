#!/usr/bin/env node
// Read-only operator check: no login, credentials, database writes or checkout.
import {pathToFileURL} from 'node:url';
import {ORIGIN,domainTransport,domainAccessMode,inspectRuntime} from './diagnose-domain-admin.mjs';

export class StorefrontCheckError extends Error {}
const requireCheck=(condition,message)=>{if(!condition)throw new StorefrontCheckError(message);};
const normalizeName=value=>typeof value==='string'?value.normalize('NFKC').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\s\u200c]+/g,' ').trim():'';
const productNames=new Set(['ژامبون مرغ و قارچ','ژامبون قارچ و مرغ']);
const publicPaths=new Set(['/api/health/','/fa/catalog/','/en/catalog/','/api/admin/data/?section=settings','/api/shop/catalog/','/api/shop/pricing/','/api/shop/rates/']);
const productPath=/^\/(?:fa|en)\/products\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;

// The allowlist is enforced before transport, including calls made by access detection.
export function readOnlyStorefrontTransport(send){
 return async(address,init={})=>{
  let url;try{url=new URL(address);}catch{throw new StorefrontCheckError('Unexpected diagnostic destination.');}
  requireCheck(url.origin===ORIGIN&&!url.username&&!url.password&&!url.hash,'Unexpected diagnostic destination.');
  requireCheck((init.method??'GET')==='GET'&&init.body===undefined,'Only read-only GET requests are allowed.');
  requireCheck(!new Headers(init.headers).has('authorization')&&!new Headers(init.headers).has('cookie'),'Authentication is not part of this check.');
  const path=url.pathname+url.search;
  requireCheck(publicPaths.has(path)||productPath.test(path),'Unexpected diagnostic path.');
  return send(address,{...init,method:'GET',signal:AbortSignal.timeout(15000)});
 };
}

export function inspectBusinessProduct(payload){
 requireCheck(payload?.scope==='private-database'&&payload.catalog?.source==='database'&&payload.catalog.isDemo===true,'Expected the database catalog with simulated checkout.');
 const {products,categories}=payload.catalog;
 requireCheck(Array.isArray(products)&&Array.isArray(categories),'Catalog response is incomplete.');
 const matches=products.filter(p=>productNames.has(normalizeName(p?.nameFa)));
 requireCheck(matches.length===1,matches.length?'More than one matching product; inspect Products before retrying.':'Chicken and mushroom product was not found in the active storefront.');
 const product=matches[0];
 requireCheck(typeof product.id==='string'&&product.id.length>0&&typeof product.slug==='string'&&product.slug.length<=150&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug),'Product identifier is invalid.');
 requireCheck(categories.some(c=>c?.id===product.categoryId),'Product category is missing from the storefront.');
 requireCheck(product.unit==='KG'&&product.priceBasisQuantity===1,'Expected pricing per one kilogram.');
 requireCheck(product.priceToman===1500000,'Expected 1,500,000 Toman per kilogram; review the product price.');
 requireCheck(product.stockQuantity===null&&product.dailyCapacity===null,'Expected unlimited stock and daily capacity.');
 requireCheck(product.preparationMinutes===2880,'Expected two days / 2880 minutes; review product preparation.');
 return {id:product.id,slug:product.slug,nameFa:product.nameFa,unit:product.unit,priceToman:product.priceToman,priceBasisQuantity:product.priceBasisQuantity,stockQuantity:product.stockQuantity,dailyCapacity:product.dailyCapacity,preparationMinutes:product.preparationMinutes};
}

async function jsonBody(response,label){
 requireCheck(response.headers.get('content-type')?.includes('application/json'),label+': expected JSON.');
 try{return await response.json();}catch{throw new StorefrontCheckError(label+': invalid JSON.');}
}
function previewHeaders(response){
 requireCheck(response.headers.get('x-roya-domain-stage')==='public-preview-v1'&&!response.headers.has('www-authenticate'),'Public preview headers differ.');
 requireCheck(/\bnoindex\b/.test(response.headers.get('x-robots-tag')??''),'Expected noindex on the test preview.');
 requireCheck(/\bno-store\b/.test(response.headers.get('cache-control')??''),'Expected no-store on the test preview.');
}
function checkHtml(html,locale){
 const root=html.match(/<html\b[^>]*>/i)?.[0]??'';
 requireCheck(new RegExp('\\blang=["\\\']'+locale+'["\\\']','i').test(root),'HTML language differs for '+locale+'.');
 requireCheck(new RegExp('\\bdir=["\\\']'+(locale==='fa'?'rtl':'ltr')+'["\\\']','i').test(root),'HTML direction differs for '+locale+'.');
}

export async function verifyDomainStorefront({send=domainTransport(),emit=console.log}={}){
 const read=readOnlyStorefrontTransport(send);
 const mode=await domainAccessMode(read);
 requireCheck(mode==='public-preview','This check expects the already-open test preview; no password is requested.');
 emit('ACCESS public-preview and independent administrator guard: PASS');
 async function get(path,status=200){
  const response=await read(ORIGIN+path);
  requireCheck(response.status===status,'Unexpected HTTP status for '+path+'.');
  previewHeaders(response);return response;
 }
 const payload=await jsonBody(await get('/api/shop/catalog/'),'Catalog');
 const product=inspectBusinessProduct(payload);
 emit('PRODUCT '+JSON.stringify(product));
 emit('PRODUCT DATA PASS: KG, 1,500,000 Toman, unlimited stock/capacity, preparation 2880 minutes.');
 for(const locale of ['fa','en']){
  for(const path of ['/'+locale+'/catalog/','/'+locale+'/products/'+product.slug+'/']){
   checkHtml(await (await get(path)).text(),locale);
   emit('HTML '+path+': PASS');
  }
 }
 const pricing=await jsonBody(await get('/api/shop/pricing/'),'Pricing');
 requireCheck(pricing?.scope==='store'&&pricing.schemaVersion===1&&Number.isInteger(pricing.policy?.feeBps)&&pricing.policy.feeBps>=0&&pricing.policy.feeBps<=10000,'Shared pricing policy response is invalid.');
 emit('PRICING shared policy read: PASS');
 const ratesResponse=await read(ORIGIN+'/api/shop/rates/');
 requireCheck([200,503].includes(ratesResponse.status),'Unexpected HTTP status for rates.');
 previewHeaders(ratesResponse);
 const rates=await jsonBody(ratesResponse,'Rates');
 requireCheck(rates?.schemaVersion===2&&['nobitex','fx'].every(key=>['fresh','stale','unavailable'].includes(rates.sources?.[key]?.state)),'Rates response is invalid.');
 const rateStatus=Object.fromEntries(['nobitex','fx'].map(key=>[key,{state:rates.sources[key].state,fetchedAt:rates.sources[key].fetchedAt??null,refreshFailed:rates.sources[key].refreshFailed===true}]));
 const ratesComplete=ratesResponse.status===200&&rates.sources.nobitex.state==='fresh'&&rates.sources.fx.state==='fresh'&&!!rates.tether&&!!rates.fx&&!!rates.rates;
 emit('RATES '+JSON.stringify({sources:rateStatus,provider:rates.fx?.fxMeta?.provider??null,dataDate:rates.fx?.fxMeta?.date??null}));
 emit(ratesComplete?'RATES both sources reported fresh by the application.':'RATES INCOMPLETE: product checks passed; live-rate freshness needs separate review. No sample rate was substituted.');
 emit('STOREFRONT DATA PASS: read-only HTTPS product and public pages verified locally on the VPS.');
 emit('SCOPE: no browser cart, delivery-slot selection, payment selection or external connectivity test; no real order/payment/SMS or database write.');
 return {product,ratesComplete};
}

async function main(){
 requireCheck(process.argv.length===2,'No arguments, credentials or destination overrides are accepted.');
 inspectRuntime();
 const result=await verifyDomainStorefront();
 if(!result.ratesComplete)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{console.error('STOREFRONT CHECK STOPPED: '+(error instanceof StorefrontCheckError?error.message:'Check failed; private details omitted.'));process.exitCode=1;});
}
