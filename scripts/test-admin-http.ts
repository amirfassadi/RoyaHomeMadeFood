// Integration-only: real HTTP authentication and real PostgreSQL, no external services.
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Prisma,PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {hashPassword} from '../src/lib/admin/password';
import {spawnSync} from 'node:child_process';
import {editable,PrivateAdminClient,runPricingAdminTest,type PricingCheckpoint} from '../deploy/private-pricing-test';
import {privateCatalogResponseSchema} from '../src/lib/catalog/snapshot';
import {quoteDemo,makeDemoOrder,quoteNeedsReview} from '../src/lib/prototype';
import {defaultPricingPolicy,pricingSnapshot,sampleMarketRates} from '../src/lib/pricing';
import {contentDocumentSchema} from '../src/lib/storefront-content';

async function main(){
const url=process.env.ROYA_INTEGRATION_DATABASE_URL;
if(!url||!['/roya_test','/roya_integration_test'].includes(new URL(url).pathname))throw new Error('Use an isolated integration database.');
const base='http://127.0.0.1:4313';
const origin='http://localhost:4313';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
const suffix=randomUUID(),mobile=`09${String(randomBytes(4).readUInt32BE()%1e9).padStart(9,'0')}`,password=randomBytes(24).toString('base64url');
const products:string[]=[];let adminId:string|undefined,categoryId:string|undefined;
const oldPolicy=await db.setting.findUnique({where:{key:'international-pricing'}});
const oldContent=await db.setting.findUnique({where:{key:'storefront-content'}});
const oldContact=await db.setting.findUnique({where:{key:'contact'}});
const orderCount=await db.order.count();
class Client extends PrivateAdminClient{
 constructor(){super(base,origin);}
 post(path:string,body:unknown,requestOrigin=origin){return this.request(path,{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json'},body:JSON.stringify(body)});}
}
const client=new Client(),guest=new Client();
function recover(mode:'cancel'|'mismatch'|'recover',newPassword:string){
 const result=spawnSync('python3',['scripts/test-admin-recovery-cli.py'],{input:JSON.stringify({mode,mobile,password:newPassword}),encoding:'utf8',timeout:35000});
 assert.equal(result.status,0,'Recovery CLI failed; hidden input and terminal output omitted.');
 console.log(result.stdout.trim());
}
async function ok(r:Response,status=200){assert.equal(r.status,status,`HTTP ${r.status}: ${await r.clone().text()}`);return r.json();}
async function productRow(id:string){return (await ok(await client.request('/api/admin/data/?section=products'))).products.find((p:{id:string})=>p.id===id);}
async function storefront(){return privateCatalogResponseSchema.parse(await ok(await guest.request('/api/shop/catalog/'))).catalog;}
try{
 const admin=await db.user.create({data:{name:'HTTP integration administrator',mobile,passwordHash:await hashPassword(password),role:'ADMIN'}});adminId=admin.id;
 const category=await db.category.create({data:{slug:'http-'+suffix,nameFa:'دستهٔ آزمایشی HTTP',nameEn:'HTTP integration category'}});categoryId=category.id;
 assert.equal((await guest.request('/admin/products/')).status,307);
 await ok(await guest.request('/api/admin/data/?section=products'),401);
 await ok(await guest.post('/api/admin/products/',{}),401);
 await ok(await guest.request('/api/admin/settings/content/'),401);
 await ok(await guest.post('/api/admin/settings/content/',{}),401);
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
 assert.ok(!(await storefront()).products.some(p=>p.id===saved.id));
 const before=await productRow(saved.id);assert.equal(before.priceToman,123456);assert.equal(before.stockQuantity,12);assert.equal(before.dailyCapacity,8);
 const changed={...input,priceToman:175000,stockQuantity:24,dailyCapacity:18,active:true};
 await ok(await client.post('/api/admin/products/',{id:saved.id,expectedUpdatedAt:before.updatedAt,product:changed,media:[]}));
 const after=await productRow(saved.id);assert.equal(after.priceToman,175000);assert.equal(after.stockQuantity,24);assert.equal(after.active,true);
 const visible=await storefront(),shown=visible.products.find(p=>p.id===saved.id)!;
 assert.equal(shown.priceToman,175000);assert.equal(shown.stockQuantity,24);assert.equal(shown.dailyCapacity,18);
 for(const [locale,name] of [['fa',input.nameFa],['en',input.nameEn]]){
  const response=await guest.request(`/${locale}/products/${input.slug}/`);assert.equal(response.status,200);assert.ok((await response.text()).includes(name));
 }
 const time=new Date(),basket=[{productId:saved.id,quantity:1}],zone={id:'test',feeToman:50000};
 const previewQuote=quoteDemo(visible,basket,zone,'','IR',time);
 assert.equal(previewQuote.subtotalToman,175000);
 const previewOrder=makeDemoOrder(visible,basket,{name:'Test recipient',mobile:'09120000000',buyerEmail:'',address:'Only a controlled test address',notes:'',country:'IR',zoneId:zone.id,deliveryAt:new Date(time.getTime()+3*86400000).toISOString(),deliverySlot:'14–18',method:'CASH'},previewQuote,time);
 assert.equal(previewOrder.items[0].productId,saved.id);assert.equal(await db.order.count(),orderCount);
 const overseas=pricingSnapshot('DE',sampleMarketRates(time),defaultPricingPolicy,time.getTime())!;
 const overseasQuote=quoteDemo(visible,basket,zone,'','DE',time,overseas);
 for(const method of ['USDC_BSC','BTC_LIGHTNING','PAYPAL'] as const){
  const order=makeDemoOrder(visible,basket,{...previewOrder.details,country:'DE',buyerEmail:'test@example.com',method},overseasQuote,time);
  assert.equal(order.paymentState,'PENDING');assert.ok(!('paymentUrl' in order));assert.ok(!('walletAddress' in order));
 }
 assert.equal(await db.order.count(),orderCount);
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
 assert.ok(!(await storefront()).products.some(p=>p.id===saved.id));
 assert.throws(()=>quoteDemo({...visible,products:[]},basket,zone,'','IR',time),/QUANTITY/);
 console.log('DATABASE STOREFRONT PASS: inactive hidden, active product/price/stock/capacity visible, FA/EN detail rendering, simulated guest order with no database order, archived product removed.');
 const initial=(await ok(await guest.request('/api/shop/pricing/'))).policy;
 const checkpoints:PricingCheckpoint[]=[];
 await runPricingAdminTest({admin:client,guest,checkpoint:value=>{checkpoints.push(structuredClone(value));}});
 assert.equal(checkpoints.at(-1)!.phase,'restored');
 assert.deepEqual(editable((await ok(await guest.request('/api/shop/pricing/'))).policy),editable(initial));
 const stored=await db.setting.findUniqueOrThrow({where:{key:'international-pricing'}});
 assert.deepEqual(editable(stored.value as any),editable(initial));
 // A simultaneous editor owns its later version: cleanup must not overwrite it.
 let concurrentVersion='';
 await assert.rejects(()=>runPricingAdminTest({admin:client,guest,report:()=>{},checkpoint:async value=>{
  if(value.phase==='manual-saved'){
   const changed=await ok(await client.post('/api/admin/settings/pricing/',{policy:{...editable(value.owned!),feeBps:1111},expectedUpdatedAt:value.owned!.updatedAt}));concurrentVersion=changed.policy.updatedAt;
  }
 }}),/RESTORE_REVIEW/);
 const concurrent=(await ok(await guest.request('/api/shop/pricing/'))).policy;
 assert.equal(concurrent.updatedAt,concurrentVersion);assert.equal(concurrent.feeBps,1111);
 await ok(await client.post('/api/admin/settings/pricing/',{policy:editable(initial),expectedUpdatedAt:concurrentVersion}));
 // A committed write with a lost response requires review, never a blind restore.
 let dropped=false;
 const uncertain={request:client.request.bind(client),post:async(path:string,body:unknown)=>{
  const r=await client.post(path,body);if(!dropped){dropped=true;await r.text();throw new Error('Simulated lost response.');}return r;
 }};
 await assert.rejects(()=>runPricingAdminTest({admin:uncertain,guest,report:()=>{},checkpoint:()=>{}}),/RESTORE_REVIEW/);
 const unknown=(await ok(await guest.request('/api/shop/pricing/'))).policy;
 assert.equal(unknown.feeBps,750);
 await ok(await client.post('/api/admin/settings/pricing/',{policy:editable(initial),expectedUpdatedAt:unknown.updatedAt}));
 console.log('PRICING RESTORATION PASS: normal restoration, concurrent editor preserved and lost-response write not blindly overwritten.');
 // Read the current public cache before editing, then verify immediate invalidation.
 for(const path of ['/fa/','/en/','/fa/about/','/en/about/'])assert.equal((await guest.request(path)).status,200);
 const contactBefore=(await ok(await client.request('/api/admin/data/?section=settings'))).contact;
 const contactFixture={phone:'+982112345678',email:'fixture@example.com',addressFa:'نشانی آزمایشی '+suffix,addressEn:'Test address '+suffix,hoursFa:'ساعات آزمایشی '+suffix,hoursEn:'Test hours '+suffix};
 await ok(await client.post('/api/admin/settings/contact/',contactFixture));
 for(const locale of ['fa','en'] as const){
  const page=await guest.request('/'+locale+'/contact/');assert.equal(page.status,200);const html=await page.text();
  assert(html.includes(locale==='fa'?contactFixture.addressFa:contactFixture.addressEn));
  assert(html.includes(locale==='fa'?contactFixture.hoursFa:contactFixture.hoursEn));assert(html.includes('tel:'+contactFixture.phone));
 }
 await ok(await client.post('/api/admin/settings/contact/',contactBefore));
 console.log('CONTACT HTTP PASS: private database preview displays saved FA/EN contact details and response hours, then restores original values.');
 const contentBefore=contentDocumentSchema.parse((await ok(await client.request('/api/admin/settings/content/'))).document);
 assert.equal((await client.request('/admin/content/')).status,200);
 const contentChange=structuredClone(contentBefore.content);
 Object.assign(contentChange.fa,{homeTitle1:'عنوان آزمون '+suffix,aboutTitle:'دربارهٔ آزمون '+suffix,aboutStory:'داستان {رویا} <b>متن ساده</b>',footerText:'پایین صفحهٔ آزمون '+suffix});
 Object.assign(contentChange.en,{homeTitle1:'Test headline '+suffix,aboutTitle:'Test about '+suffix,footerText:'Test footer '+suffix});
 const contentSaved=contentDocumentSchema.parse((await ok(await client.post('/api/admin/settings/content/',{content:contentChange,expectedUpdatedAt:contentBefore.updatedAt}))).document);
 assert.notEqual(contentSaved.updatedAt,contentBefore.updatedAt);
 assert.deepEqual((await db.setting.findUniqueOrThrow({where:{key:'storefront-content'}})).value,contentChange);
 for(const locale of ['fa','en'] as const){
  const home=await guest.request('/'+locale+'/');assert.equal(home.status,200);const homeHtml=await home.text();
  assert(homeHtml.includes(contentChange[locale].homeTitle1));assert(homeHtml.includes(contentChange[locale].footerText));
  const about=await guest.request('/'+locale+'/about/');assert.equal(about.status,200);const aboutHtml=await about.text();
  assert(aboutHtml.includes(contentChange[locale].aboutTitle));
  if(locale==='fa'){assert(aboutHtml.includes('&lt;b&gt;متن ساده&lt;/b&gt;'));assert(!aboutHtml.includes('<b>متن ساده</b>'));}
 }
 const contentAudits=await db.adminAudit.count({where:{adminId:admin.id,action:'STOREFRONT_CONTENT'}});
 assert.equal(contentAudits,1);
 await ok(await client.post('/api/admin/settings/content/',{content:contentBefore.content,expectedUpdatedAt:contentBefore.updatedAt}),409);
 await ok(await client.post('/api/admin/settings/content/',{content:{...contentChange,en:{...contentChange.en,aboutTitle:''}},expectedUpdatedAt:contentSaved.updatedAt}),400);
 await ok(await client.post('/api/admin/settings/content/',{content:contentChange,expectedUpdatedAt:contentSaved.updatedAt},'https://untrusted.example'),403);
 assert.equal(await db.adminAudit.count({where:{adminId:admin.id,action:'STOREFRONT_CONTENT'}}),contentAudits);
 await ok(await client.post('/api/admin/settings/content/',{content:contentBefore.content,expectedUpdatedAt:contentSaved.updatedAt}));
 console.log('CONTENT HTTP PASS: authenticated bilingual persistence, public FA/EN home/about/footer rendering, cache invalidation, escaped literal markup, audit, stale/invalid/Origin rejection and restoration.');
 for(const path of ['/api/shop/checkout/','/api/international/checkout/','/api/payment/crypto/webhook/','/api/customer/code/'])assert.equal((await ok(await guest.post(path,{}),503)).error,'STAGING_ONLY');
 assert.equal(await db.order.count(),orderCount);
 await ok(await client.auth('signout'));
 await ok(await client.request('/api/admin/data/?section=products'),401);
 await ok(await client.request('/api/admin/settings/content/'),401);
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
 if(oldContent){const value=oldContent.value===null?Prisma.JsonNull:oldContent.value;await db.setting.upsert({where:{key:oldContent.key},create:{key:oldContent.key,value,updatedAt:oldContent.updatedAt},update:{value,updatedAt:oldContent.updatedAt}});}
 else await db.setting.deleteMany({where:{key:'storefront-content'}});
 if(oldContact){const value=oldContact.value===null?Prisma.JsonNull:oldContact.value;await db.setting.upsert({where:{key:oldContact.key},create:{key:oldContact.key,value,updatedAt:oldContact.updatedAt},update:{value,updatedAt:oldContact.updatedAt}});}
 else await db.setting.deleteMany({where:{key:'contact'}});
 await db.$disconnect();
}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
