import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indexable,pageMetadata,productStructuredData,breadcrumbStructuredData,websiteStructuredData,jsonLd} from '../src/lib/seo/core';
import {seoSettingsSchema} from '../src/lib/validation/seo';
import {demoCatalog} from '../src/lib/catalog/demo';

test('runtime indexing overrides build flags while preserving preview and private-page restrictions',()=>{
 const saved={...process.env};
 try{
  Object.assign(process.env,{NEXT_PUBLIC_SITE_URL:'https://example.com',ROYA_INDEXABLE:'0',ROYA_DEMO_CATALOG:'0',SITES_STATIC_PREVIEW:'0'});
  assert.equal(indexable(true),true);assert.equal(indexable(false),false);
  assert.deepEqual(pageMetadata('fa','/catalog','Catalog',undefined,false,undefined,true).robots,{index:true,follow:true});
  assert.deepEqual(pageMetadata('fa','/checkout','Checkout',undefined,true,undefined,true).robots,{index:false,follow:false});
  process.env.ROYA_DEMO_CATALOG='1';assert.equal(indexable(true),false);
  process.env.ROYA_DEMO_CATALOG='0';process.env.SITES_STATIC_PREVIEW='1';assert.equal(indexable(true),false);
  process.env.SITES_STATIC_PREVIEW='0';process.env.NEXT_PUBLIC_SITE_URL='http://example.com';assert.equal(indexable(true),false);
 }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test('public pages have distinct descriptions, canonical languages and a social preview',()=>{
 const saved=process.env.NEXT_PUBLIC_SITE_URL;process.env.NEXT_PUBLIC_SITE_URL='https://example.com';
 try{
  const pages=['','/catalog','/about','/contact','/faq'].map(path=>pageMetadata('fa',path,'Fallback'));
  assert.equal(new Set(pages.map(page=>page.description)).size,5);
  assert.equal(pages[0].alternates?.canonical,'https://example.com/fa/');
  assert.equal(pages[0].alternates?.languages?.['x-default'],'https://example.com/fa/');
  const twitter=pages[0].twitter;assert(twitter&&'card' in twitter);assert.equal(twitter.card,'summary_large_image');
 }finally{if(saved===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=saved;}
});
test('structured data uses real product URLs and does not invent ratings or business addresses',()=>{
 const saved=process.env.NEXT_PUBLIC_SITE_URL;process.env.NEXT_PUBLIC_SITE_URL='https://example.com';
 try{
  const product=demoCatalog.products[0],breadcrumbs=breadcrumbStructuredData('fa',product)!;
  assert.deepEqual(breadcrumbs.itemListElement.map(item=>item.position),[1,2,3]);
  assert.equal(breadcrumbs.itemListElement[2].item,`https://example.com/fa/products/${product.slug}/`);
  const data=productStructuredData(product,'fa',true)!;
  assert.equal(data.offers.priceCurrency,'IRR');assert.equal(data.offers.price,product.priceToman*10);
  const serialized=jsonLd(websiteStructuredData());assert(!serialized.includes('aggregateRating'));assert(!serialized.includes('PostalAddress'));
 }finally{if(saved===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=saved;}
});
test('search verification accepts a token but refuses pasted markup or extra fields',()=>{
 assert.equal(seoSettingsSchema.safeParse({enabled:true,googleVerification:'token_123-ABC'}).success,true);
 assert.equal(seoSettingsSchema.safeParse({enabled:true,googleVerification:'<meta content="token" />'}).success,false);
 assert.equal(seoSettingsSchema.safeParse({enabled:true,googleVerification:'',robotsOverride:'index'}).success,false);
});
