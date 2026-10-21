// Integration-only: real HTTP authentication and real PostgreSQL, no external services.
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Prisma,PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {hashPassword} from '../src/lib/admin/password';
import {spawnSync} from 'node:child_process';

async function main(){
const url=process.env.ROYA_INTEGRATION_DATABASE_URL;
if(!url||!['/roya_test','/roya_integration_test'].includes(new URL(url).pathname))throw new Error('Use an isolated integration database.');
const base='http://127.0.0.1:4313';
const origin='http://localhost:4313';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
const suffix=randomUUID(),mobile=`09${String(randomBytes(4).readUInt32BE()%1e9).padStart(9,'0')}`,password=randomBytes(24).toString('base64url');
const products:string[]=[];let adminId:string|undefined,categoryId:string|undefined;
const oldPolicy=await db.setting.findUnique({where:{key:'international-pricing'}});
const orderCount=await db.order.count();
class Client{
 cookies=new Map<string,string>();
 async request(path:string,init:RequestInit={}){
  const headers=new Headers(init.headers);
  if(this.cookies.size)headers.set('cookie',[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '));
  const r=await fetch(base+path,{...init,headers,redirect:'manual'});
  for(const cookie of r.headers.getSetCookie()){
   const pair=cookie.split(';',1)[0],index=pair.indexOf('='),key=pair.slice(0,index),value=pair.slice(index+1);
   if(value)this.cookies.set(key,value);else this.cookies.delete(key);
  }
  return r;
 }
 post(path:string,body:unknown,requestOrigin=origin){return this.request(path,{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json'},body:JSON.stringify(body)});}
 async auth(action:string,data:Record<string,string>={}){
  const csrf=await (await this.request('/api/auth/csrf/')).json();
  return this.request(`/api/auth/${action}/`,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...data,csrfToken:csrf.csrfToken,callbackUrl:origin+'/admin/',json:'true'})});
 }
}
const client=new Client(),guest=new Client();
function recover(mode:'cancel'|'mismatch'|'recover',newPassword:string){
 const result=spawnSync('python3',['scripts/test-admin-recovery-cli.py'],{input:JSON.stringify({mode,mobile,password:newPassword}),encoding:'utf8',timeout:35000});
 assert.equal(result.status,0,'Recovery CLI failed; hidden input and terminal output omitted.');
 console.log(result.stdout.trim());
}
async function ok(r:Response,status=200){assert.equal(r.status,status,`HTTP ${r.status}: ${await r.clone().text()}`);return r.json();}
async function productRow(id:string){return (await ok(await client.request('/api/admin/data/?section=products'))).products.find((p:{id:string})=>p.id===id);}
try{
 const admin=await db.user.create({data:{name:'HTTP integration administrator',mobile,passwordHash:await hashPassword(password),role:'ADMIN'}});adminId=admin.id;
 const category=await db.category.create({data:{slug:'http-'+suffix,nameFa:'دستهٔ آزمایشی HTTP',nameEn:'HTTP integration category'}});categoryId=category.id;
 assert.equal((await guest.request('/admin/products/')).status,307);
 await ok(await guest.request('/api/admin/data/?section=products'),401);
 await ok(await guest.post('/api/admin/products/',{}),401);
 await ok(await client.auth('callback/credentials',{mobile,password:'deliberately-wrong-test-password'}),401);
 await ok(await client.auth('callback/credentials',{mobile,password}));
 assert.equal((await ok(await client.request('/api/auth/session/'))).adminId,admin.id);
 assert.equal((await client.request('/admin/products/')).status,200);
 // Exercise the actual operator CLI, including hidden input and session revocation.
 const replacement=randomBytes(24).toString('base64url');
 const original=await db.user.findUniqueOrThrow({where:{id:admin.id}});
 for(const mode of ['cancel','mismatch'] as const){
  recover(mode,replacement);
  const unchanged=await db.user.findUniqueOrThrow({where:{id:admin.id}});
  assert.equal(unchanged.passwordHash,original.passwordHash);assert.equal(unchanged.sessionVersion,original.sessionVersion);
  assert.equal(await db.adminAudit.count({where:{adminId:admin.id,action:'ADMIN_PASSWORD_RECOVERED'}}),0);
 }
 recover('recover',replacement);
 const recovered=await db.user.findUniqueOrThrow({where:{id:admin.id}});
 assert.equal(recovered.sessionVersion,original.sessionVersion+1);assert.equal(recovered.role,'ADMIN');assert.equal(recovered.active,true);assert.equal(recovered.twoFactorEnabled,false);
 assert.equal(await db.adminAudit.count({where:{adminId:admin.id,action:'ADMIN_PASSWORD_RECOVERED'}}),1);
 await ok(await client.request('/api/admin/data/?section=products'),401);
 await ok(await client.auth('callback/credentials',{mobile,password}),401);
 await ok(await client.auth('callback/credentials',{mobile,password:replacement}));
 assert.equal((await ok(await client.request('/api/auth/session/'))).adminId,admin.id);
 const input={nameFa:'محصول آزمایشی HTTP',nameEn:'HTTP test product',slug:'http-'+suffix,categoryId:category.id,descriptionFa:'این محصول فقط برای آزمون یکپارچه است.',descriptionEn:'This product exists only in an isolated integration database.',priceToman:123456,unit:'PACK',priceBasisQuantity:1,minOrderQuantity:1,orderStepQuantity:1,stockQuantity:12,dailyCapacity:8,preparationMinutes:60,active:false,featured:false};
 const saved=await ok(await client.post('/api/admin/products/',{product:input,media:[]}));products.push(saved.id);
 const before=await productRow(saved.id);assert.equal(before.priceToman,123456);assert.equal(before.stockQuantity,12);assert.equal(before.dailyCapacity,8);
 const changed={...input,priceToman:175000,stockQuantity:24,dailyCapacity:18,active:true};
 await ok(await client.post('/api/admin/products/',{id:saved.id,expectedUpdatedAt:before.updatedAt,product:changed,media:[]}));
 const after=await productRow(saved.id);assert.equal(after.priceToman,175000);assert.equal(after.stockQuantity,24);assert.equal(after.active,true);
 const audits=await db.adminAudit.count({where:{adminId:admin.id}});
 await ok(await client.post('/api/admin/products/',{id:saved.id,expectedUpdatedAt:before.updatedAt,product:input,media:[]}),409);
 for(const invalid of [{stockQuantity:-1},{stockQuantity:1.5},{priceToman:1.5}])await ok(await client.post('/api/admin/products/',{id:saved.id,expectedUpdatedAt:after.updatedAt,product:{...changed,...invalid},media:[]}),400);
 await ok(await client.post('/api/admin/products/',{product:changed,media:[]},'https://untrusted.example'),403);
 await ok(await client.post('/api/admin/products/',{product:changed,media:[]}),409);
 assert.equal(await db.adminAudit.count({where:{adminId:admin.id}}),audits);
 assert.equal((await productRow(saved.id)).priceToman,175000);
 const grams={...input,slug:'grams-'+suffix,unit:'GRAM',priceToman:600000,priceBasisQuantity:1000,minOrderQuantity:250,orderStepQuantity:50,stockQuantity:5000,dailyCapacity:2500};
 const weighted=await ok(await client.post('/api/admin/products/',{product:grams,media:[]}));products.push(weighted.id);
 const gramRow=await productRow(weighted.id);assert.equal(gramRow.priceBasisQuantity,1000);assert.equal(gramRow.minOrderQuantity,250);
 await ok(await client.post('/api/admin/products/',{id:weighted.id,expectedUpdatedAt:gramRow.updatedAt,product:{...grams,stockQuantity:0,dailyCapacity:null},media:[]}));
 const empty=await productRow(weighted.id);assert.equal(empty.stockQuantity,0);assert.equal(empty.dailyCapacity,null);
 await ok(await client.post('/api/admin/products/archive/',{id:saved.id,expectedUpdatedAt:after.updatedAt}));
 assert.equal((await productRow(saved.id)).active,false);
 const initial=await ok(await guest.request('/api/shop/pricing/'));
 const policy={feeBps:750,countryFees:{TR:300},manualUsdToman:null};
 const updated=await ok(await client.post('/api/admin/settings/pricing/',{policy,expectedUpdatedAt:initial.policy.updatedAt}));
 assert.equal((await ok(await guest.request('/api/shop/pricing/'))).policy.updatedAt,updated.policy.updatedAt);
 assert.equal((await ok(await guest.request('/api/shop/pricing/'))).policy.countryFees.TR,300);
 await ok(await client.post('/api/admin/settings/pricing/',{policy:{...policy,feeBps:900},expectedUpdatedAt:initial.policy.updatedAt}),409);
 assert.equal((await ok(await guest.request('/api/shop/pricing/'))).policy.feeBps,750);
 for(const path of ['/api/shop/checkout/','/api/international/checkout/','/api/payment/crypto/webhook/','/api/customer/code/'])assert.equal((await ok(await guest.post(path,{}),503)).error,'STAGING_ONLY');
 assert.equal(await db.order.count(),orderCount);
 await ok(await client.auth('signout'));
 await ok(await client.request('/api/admin/data/?section=products'),401);
 console.log('ADMIN HTTP PASS: real login/logout, hidden-password recovery CLI, cancelled/mismatched recovery, old-session revocation, old-password rejection, new-password login, guest access controls, create/read/edit/archive, prices, stock, capacity, weighted units, zero stock, unlimited capacity, stale edits, invalid input, origin protection, shared pricing and live-effect guards.');
}finally{
 await db.productMedia.deleteMany({where:{productId:{in:products}}});
 await db.product.deleteMany({where:{id:{in:products}}});
 if(adminId)await db.adminAudit.deleteMany({where:{adminId}});
 if(categoryId)await db.category.delete({where:{id:categoryId}});
 if(adminId)await db.user.delete({where:{id:adminId}});
 await db.rateLimitBucket.deleteMany({where:{key:'admin-login:'+createHash('sha256').update(mobile).digest('hex')}});
 if(oldPolicy){const value=oldPolicy.value===null?Prisma.JsonNull:oldPolicy.value;await db.setting.upsert({where:{key:oldPolicy.key},create:{key:oldPolicy.key,value,updatedAt:oldPolicy.updatedAt},update:{value,updatedAt:oldPolicy.updatedAt}});}
 else await db.setting.deleteMany({where:{key:'international-pricing'}});
 await db.$disconnect();
}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
