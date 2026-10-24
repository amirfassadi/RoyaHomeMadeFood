import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Shared by the operator CLI and native HTTPS/PostgreSQL verification.
export async function probeProducts({base,origin,mobile,password,catalogTest=false,send=fetch,emit=console.log}){
const cookies=new Map();
let stage='preflight';
async function request(path,init={}){
 const headers=new Headers(init.headers);
 if(cookies.size)headers.set('cookie',[...cookies].map(([k,v])=>`${k}=${v}`).join('; '));
 const r=await send(base+path,{...init,headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
 for(const text of r.headers.getSetCookie()){
  const pair=text.split(';',1)[0],index=pair.indexOf('='),key=pair.slice(0,index),value=pair.slice(index+1);
  if(value)cookies.set(key,value);else cookies.delete(key);
 }
 return r;
}
function post(path,body){return request(path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});}
async function data(r,status=200){
 if(r.status!==status)throw new Error(`${stage}: expected HTTP ${status}, received ${r.status}; operation stopped.`);
 return r.json();
}
async function auth(action,values={}){
 const previous=stage;stage=action==='signout'?'logout-csrf':'csrf';
 const csrf=await data(await request('/api/auth/csrf/'));
 stage=previous;
 return request('/api/auth/'+action+'/',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...values,csrfToken:csrf.csrfToken,callbackUrl:origin+'/admin/',json:'true'})});
}
const slug='roya-admin-test-'+randomUUID(),name=(catalogTest?'محصول آزمایشی ویترین ':'محصول غیرفعال آزمایش مدیریت ')+slug.slice(-8);
let fixtureId,loggedIn=false,passed=false,cleanup=true,logoutVerified=false;
async function row(){const list=await data(await request('/api/admin/data/?'+new URLSearchParams({section:'products',q:name})));return list.products.find(p=>p.slug===slug);}
async function storefront(){const value=await data(await request('/api/shop/catalog/'));assert.equal(value.scope,'private-database');assert.equal(value.catalog.isDemo,true);assert.equal(value.catalog.source,'database');return value.catalog;}
try{
 stage='health';
 await data(await request('/api/health/'));
 stage='guest-guard';
 await data(await request('/api/admin/data/?section=products'),401);
 if(catalogTest){stage='catalog-mode';await storefront();}
 stage='credentials';
 await data(await auth('callback/credentials',{mobile,password}));password=undefined;
 stage='session';
 const session=await data(await request('/api/auth/session/'));assert.ok(session.adminId,'An administrator session is required.');loggedIn=true;
 stage='admin-page';
 assert.equal((await request('/admin/products/')).status,200);
 stage='admin-api';
 const catalog=await data(await request('/api/admin/data/?section=products'));
 assert.ok(catalog.categories[0],'An active product category is required.');
 const product={nameFa:name,nameEn:'Inactive administrator verification product',slug,categoryId:catalog.categories[0].id,descriptionFa:'فقط برای آزمون مدیریت؛ این محصول غیرفعال می‌ماند.',descriptionEn:'Inactive product created only to verify administrator functionality.',priceToman:123456,unit:'PACK',priceBasisQuantity:1,minOrderQuantity:1,orderStepQuantity:1,stockQuantity:12,dailyCapacity:8,preparationMinutes:60,active:false,featured:false};
 stage='product-create';fixtureId=(await data(await post('/api/admin/products/',{product,media:[]}))).id;
 stage='product-read';
 const before=await row();assert.equal(before.id,fixtureId);assert.equal(before.stockQuantity,12);
 const changed={...product,priceToman:175000,stockQuantity:24,dailyCapacity:18};
 stage='product-update';await data(await post('/api/admin/products/',{id:fixtureId,expectedUpdatedAt:before.updatedAt,product:changed,media:[]}));
 const updated=await row();assert.equal(updated.priceToman,175000);assert.equal(updated.stockQuantity,24);assert.equal(updated.dailyCapacity,18);assert.equal(updated.active,false);
 stage='stale-edit';await data(await post('/api/admin/products/',{id:fixtureId,expectedUpdatedAt:before.updatedAt,product,media:[]}),409);
 stage='invalid-stock';
 await data(await post('/api/admin/products/',{id:fixtureId,expectedUpdatedAt:updated.updatedAt,product:{...changed,stockQuantity:-1},media:[]}),400);
 stage='zero-stock';await data(await post('/api/admin/products/',{id:fixtureId,expectedUpdatedAt:updated.updatedAt,product:{...changed,stockQuantity:0,dailyCapacity:null},media:[]}));
 const empty=await row();assert.equal(empty.stockQuantity,0);assert.equal(empty.dailyCapacity,null);assert.equal(empty.active,false);
 if(catalogTest){
  stage='catalog-inactive';assert.ok(!(await storefront()).products.some(p=>p.id===fixtureId));
  stage='catalog-activate';await data(await post('/api/admin/products/',{id:fixtureId,expectedUpdatedAt:empty.updatedAt,product:{...changed,active:true},media:[]}));
  const active=await row(),shown=(await storefront()).products.find(p=>p.id===fixtureId);
  assert.equal(shown.priceToman,175000);assert.equal(shown.stockQuantity,24);assert.equal(shown.dailyCapacity,18);
  for(const [locale,label] of [['fa',name],['en',product.nameEn]]){stage='detail-'+locale;const page=await request('/'+locale+'/products/'+slug+'/');assert.equal(page.status,200);assert.ok((await page.text()).includes(label));}
  stage='catalog-update';await data(await post('/api/admin/products/',{id:fixtureId,expectedUpdatedAt:active.updatedAt,product:{...changed,active:true,priceToman:220000,stockQuantity:3,dailyCapacity:4},media:[]}));
  const updatedRow=(await storefront()).products.find(p=>p.id===fixtureId);assert.equal(updatedRow.priceToman,220000);assert.equal(updatedRow.stockQuantity,3);assert.equal(updatedRow.dailyCapacity,4);
 }
 passed=true;
}catch(error){emit(`ADMIN TEST STOPPED [${stage}]: `+error.message);}
finally{
 password=undefined;
 if(loggedIn||[...cookies.keys()].some(key=>key.includes('next-auth.session-token'))){
  try{stage='cleanup';const fixture=await row();if(fixture){assert.equal(fixture.slug,slug);await data(await post('/api/admin/products/archive/',{id:fixture.id,expectedUpdatedAt:fixture.updatedAt}));fixtureId=fixture.id;}if(catalogTest)assert.ok(!(await storefront()).products.some(p=>p.id===fixtureId));}
  catch{cleanup=false;emit('Test product needs review; it may still be active. Slug: '+slug);}
  try{stage='logout';await data(await auth('signout'));await data(await request('/api/admin/data/?section=products'),401);logoutVerified=true;}
  catch{passed=false;emit('Logout verification did not complete.');}
 }
 cookies.clear();
}
if(passed&&cleanup){
 emit('ADMIN VPS PASS: login/logout, product creation, price, inventory, daily capacity, zero stock, unlimited capacity, validation and stale-edit rejection.');
 emit('Archived test product: '+fixtureId);
 if(catalogTest)emit('DATABASE CATALOG VPS PASS: activation, updated price/stock/capacity, FA/EN product pages and archive removal verified.');
 emit('Existing products, shared pricing policy, orders, payments and messages were not changed.');
}

return {passed:passed&&cleanup,cleanupComplete:cleanup,logoutVerified,fixtureId,slug};
}
