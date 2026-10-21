#!/usr/bin/env node
// Interactive, loopback-only test. Never accept a password through arguments or env.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';

const base='http://127.0.0.1:3311',origin='http://localhost:3311';
if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Run interactively in your SSH terminal.');
const receipt=JSON.parse(execFileSync('sudo',['-n','cat','/var/lib/roya/admin-backup-receipt.json'],{encoding:'utf8'}));
const current=execFileSync('sudo',['-n','cat','/opt/roya/preview-current/.roya-release'],{encoding:'utf8'}).trim();
const envDigest=execFileSync('sudo',['-n','sha256sum','/etc/roya/preview.env'],{encoding:'utf8'}).split(/\s/)[0];
const databaseDigest=execFileSync('sudo',['-n','sha256sum','/etc/roya/database.env'],{encoding:'utf8'}).split(/\s/)[0];
const age=Date.now()-Date.parse(receipt.createdAt);
if(receipt.database!=='roya_store'||receipt.restoreVerified!==true||receipt.release!==current||receipt.previewEnvSha256!==envDigest||receipt.databaseEnvSha256!==databaseDigest||!Number.isFinite(age)||age< -60000||age>2*3600000)throw new Error('A fresh verified backup for this exact private preview is required.');
let muted=false;
const output=new Writable({write(chunk,_encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
const terminal=createInterface({input:process.stdin,output,terminal:true});
let mobile,password;
try{
 mobile=(await terminal.question('موبایل مدیر: ')).trim().replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x6f0));
 process.stdout.write('رمز عبور مدیر (پنهان): ');muted=true;
 password=await terminal.question('');
}finally{muted=false;terminal.close();process.stdout.write('\n');}
if(!/^09\d{9}$/.test(mobile)||!password)throw new Error('Administrator credentials were not entered correctly.');
const cookies=new Map();
let stage='preflight';
async function request(path,init={}){
 const headers=new Headers(init.headers);
 if(cookies.size)headers.set('cookie',[...cookies].map(([k,v])=>`${k}=${v}`).join('; '));
 const r=await fetch(base+path,{...init,headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
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
const slug='roya-admin-test-'+randomUUID(),name='محصول غیرفعال آزمایش مدیریت '+slug.slice(-8);
let fixtureId,loggedIn=false,passed=false,cleanup=true;
async function row(){const list=await data(await request('/api/admin/data/?'+new URLSearchParams({section:'products',q:name})));return list.products.find(p=>p.slug===slug);}
try{
 stage='health';
 await data(await request('/api/health/'));
 stage='guest-guard';
 await data(await request('/api/admin/data/?section=products'),401);
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
 passed=true;
}catch(error){console.error(`ADMIN TEST STOPPED [${stage}]: `+error.message);process.exitCode=1;}
finally{
 password=undefined;
 if(loggedIn){
  try{stage='cleanup';const fixture=await row();if(fixture){assert.equal(fixture.slug,slug);await data(await post('/api/admin/products/archive/',{id:fixture.id,expectedUpdatedAt:fixture.updatedAt}));fixtureId=fixture.id;}}
  catch{cleanup=false;console.error('Test product needs review; it was created inactive. Slug: '+slug);process.exitCode=1;}
  try{stage='logout';await data(await auth('signout'));await data(await request('/api/admin/data/?section=products'),401);}
  catch{passed=false;console.error('Logout verification did not complete.');process.exitCode=1;}
 }
 cookies.clear();
}
if(passed&&cleanup){
 console.log('ADMIN VPS PASS: login/logout, product creation, price, inventory, daily capacity, zero stock, unlimited capacity, validation and stale-edit rejection.');
 console.log('Archived test product: '+fixtureId);
 console.log('Existing products, shared pricing policy, orders, payments and messages were not changed.');
}
