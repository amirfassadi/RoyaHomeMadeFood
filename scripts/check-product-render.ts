import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';

async function main(){
 const url=process.env.ROYA_INTEGRATION_DATABASE_URL;
 if(!url||!/^\/(roya_test|roya_integration_test)$/.test(new URL(url).pathname))throw new Error('Product render check requires an isolated integration database.');
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
 const slug=`render-check-${randomUUID()}`;
 let categoryId:string|undefined,productId:string|undefined,logs='',spawnError:Error|undefined;
 const port=3417;
 // The product is deliberately created after next build: its slug must work
 // on the first request without having been included in generateStaticParams.
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NODE_ENV:'production',DATABASE_URL:url,DIRECT_URL:url,ROYA_DEMO_CATALOG:'0',SITES_STATIC_PREVIEW:'0',NEXT_PUBLIC_SITE_URL:'https://shop.example'},stdio:['ignore','pipe','pipe']});
 server.on('error',error=>{spawnError=error;});
 const capture=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-20000);};
 server.stdout.on('data',capture);server.stderr.on('data',capture);
 try{
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){
   if(spawnError)throw spawnError;
   if(server.exitCode!==null)throw new Error('Production server exited before readiness.');
   try{const response=await fetch(`http://127.0.0.1:${port}/api/health/`,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
   await delay(250);
  }
  assert(ready,'Production server did not become ready.');
  const category=await db.category.create({data:{slug,nameFa:'دسته آزمون رندر',nameEn:'Render test category'}});categoryId=category.id;
  const product=await db.product.create({data:{slug,categoryId,nameFa:'محصول آزمون رندر',nameEn:'Product render verification',descriptionFa:'محصول موقت برای بررسی اجرای صفحه محصول',descriptionEn:'Temporary product for verifying production page rendering.',priceToman:100000,unit:'PACK',priceBasisQuantity:1,minOrderQuantity:1,orderStepQuantity:1,preparationMinutes:60}});productId=product.id;
  for(const locale of ['fa','en']){
   const response=await fetch(`http://127.0.0.1:${port}/${locale}/products/${slug}/`,{headers:{'User-Agent':'Googlebot'},signal:AbortSignal.timeout(20000)});
   const html=await response.text();
   assert.equal(response.status,200,`${locale} product failed: ${html.slice(0,500)}`);
   assert(html.includes(locale==='fa'?product.nameFa:product.nameEn),'Product content missing.');
   assert.equal((html.match(/<h1\b/g)??[]).length,1,'Expected one visible product heading.');
   console.log(`Production product render OK: ${locale}, new runtime slug, HTTP 200.`);
  }
  const missing=await fetch(`http://127.0.0.1:${port}/fa/products/missing-${randomUUID()}/`,{headers:{'User-Agent':'Googlebot'},signal:AbortSignal.timeout(20000)});
  assert.equal(missing.status,404,'Missing products must return a real 404.');
  console.log('Missing product correctly returns HTTP 404.');
 }catch(error){console.error(logs);throw error;}
 finally{
  server.kill('SIGTERM');
  await Promise.race([new Promise<void>(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',()=>resolve());}),delay(5000)]);
  if(server.exitCode===null)server.kill('SIGKILL');
  if(productId)await db.product.deleteMany({where:{id:productId}});
  if(categoryId)await db.category.deleteMany({where:{id:categoryId}});
  await db.$disconnect();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
