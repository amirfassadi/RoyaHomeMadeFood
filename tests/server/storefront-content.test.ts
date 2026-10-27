import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '../../src/generated/prisma/client';
import {CONTENT_INITIAL_VERSION,defaultContentDocument} from '../../src/lib/storefront-content';
import {CONTENT_SETTINGS_KEY,getContentDocument,saveContentDocument} from '../../src/lib/server/storefront-content';

const original={...process.env};
after(()=>{process.env=original;Object.assign(globalThis,{royaDb:undefined});});
test('private administrator content reads the database even with the sample storefront flag',async()=>{
  Object.assign(process.env,{ROYA_DEPLOYMENT_ROLE:'standalone',ROYA_DEMO_CATALOG:'1'});delete process.env.SITES_STATIC_PREVIEW;
  const document=defaultContentDocument();document.content.fa.homeTitle1='متن ذخیره‌شده';
  Object.assign(globalThis,{royaDb:{setting:{findUnique:async({where}:any)=>{assert.equal(where.key,CONTENT_SETTINGS_KEY);return {value:document.content,updatedAt:new Date('2026-10-23T09:00:00.000Z')};}}}});
  assert.equal((await getContentDocument()).content.fa.homeTitle1,'متن ذخیره‌شده');
  assert.equal((await getContentDocument()).updatedAt,'2026-10-23T09:00:00.000Z');
});
test('missing content uses existing copy but malformed stored content fails explicitly',async()=>{
  Object.assign(globalThis,{royaDb:{setting:{findUnique:async()=>null}}});
  assert.deepEqual(await getContentDocument(),defaultContentDocument());
  Object.assign(globalThis,{royaDb:{setting:{findUnique:async()=>({value:{invalid:true},updatedAt:new Date()})}}});
  await assert.rejects(()=>getContentDocument(),/CONTENT_UNAVAILABLE/);
});
test('stale content edits and concurrent first saves are rejected without an audit',async()=>{
  const document=defaultContentDocument();let audits=0;
  const tx={setting:{updateMany:async()=>({count:0}),create:async()=>{throw new Prisma.PrismaClientKnownRequestError('duplicate',{code:'P2002',clientVersion:'test'});}},adminAudit:{create:async()=>{audits++;}}};
  Object.assign(globalThis,{royaDb:{$transaction:async(fn:any)=>fn(tx)}});
  await assert.rejects(()=>saveContentDocument({content:document.content,expectedUpdatedAt:'2026-10-23T09:00:00.000Z'},'test-admin'),/CONFLICT/);
  await assert.rejects(()=>saveContentDocument({content:document.content,expectedUpdatedAt:CONTENT_INITIAL_VERSION},'test-admin'),/CONFLICT/);
  assert.equal(audits,0);
});
test('valid content save writes both languages and its audit in the same transaction',async()=>{
  const document=defaultContentDocument();let transactions=0,audits=0;
  const tx={setting:{create:async({data}:any)=>{assert.equal(data.key,CONTENT_SETTINGS_KEY);assert.deepEqual(data.value,document.content);}},adminAudit:{create:async({data}:any)=>{assert.equal(data.action,'STOREFRONT_CONTENT');assert.equal(data.adminId,'test-admin');audits++;}}};
  Object.assign(globalThis,{royaDb:{$transaction:async(fn:any)=>{transactions++;return fn(tx);}}});
  const saved=await saveContentDocument({content:document.content,expectedUpdatedAt:document.updatedAt},'test-admin');
  assert.deepEqual(saved.content,document.content);assert.notEqual(saved.updatedAt,document.updatedAt);assert.equal(transactions,1);assert.equal(audits,1);
  const invalid={...document.content,en:{...document.content.en,aboutStory:''}};
  await assert.rejects(()=>saveContentDocument({content:invalid,expectedUpdatedAt:saved.updatedAt},'test-admin'));
  assert.equal(transactions,1);
});
