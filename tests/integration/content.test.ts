import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '../../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {defaultContentDocument} from '../../src/lib/storefront-content';
import {CONTENT_SETTINGS_KEY,getContentDocument,saveContentDocument} from '../../src/lib/server/storefront-content';

const url=process.env.ROYA_INTEGRATION_DATABASE_URL;
if(!url||!['/roya_test','/roya_integration_test'].includes(new URL(url).pathname))throw new Error('Use an isolated integration database.');
test('PostgreSQL content saves reject concurrent first/update editors and commit one audit per winner',async()=>{
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
  const adminId='content-integration-'+randomUUID();let owned=false;
  Object.assign(process.env,{DATABASE_URL:url,ROYA_DEPLOYMENT_ROLE:'standalone',ROYA_DEMO_CATALOG:'1'});delete process.env.SITES_STATIC_PREVIEW;
  Object.assign(globalThis,{royaDb:db});
  try{
    assert.equal(await db.setting.findUnique({where:{key:CONTENT_SETTINGS_KEY}}),null,'Content fixture key must initially be empty.');
    owned=true;const original=defaultContentDocument(),a=structuredClone(original.content),b=structuredClone(original.content);
    a.fa.homeTitle1='ویرایشگر اول';b.fa.homeTitle1='ویرایشگر دوم';
    const initial=await Promise.allSettled([a,b].map(content=>saveContentDocument({content,expectedUpdatedAt:original.updatedAt},adminId)));
    assert.equal(initial.filter(result=>result.status==='fulfilled').length,1);
    assert.match(String((initial.find(result=>result.status==='rejected') as PromiseRejectedResult).reason),/CONFLICT/);
    const saved=await getContentDocument();assert.notEqual(saved.updatedAt,original.updatedAt);
    const next=await Promise.allSettled([a,b].map(content=>saveContentDocument({content,expectedUpdatedAt:saved.updatedAt},adminId)));
    assert.equal(next.filter(result=>result.status==='fulfilled').length,1);
    assert.match(String((next.find(result=>result.status==='rejected') as PromiseRejectedResult).reason),/CONFLICT/);
    assert.equal(await db.adminAudit.count({where:{adminId,action:'STOREFRONT_CONTENT'}}),2);
    const last=await getContentDocument();assert.notEqual(last.updatedAt,saved.updatedAt);
    assert.deepEqual(last.content.en,original.content.en);
  }finally{
    if(owned)await db.setting.deleteMany({where:{key:CONTENT_SETTINGS_KEY}});
    await db.adminAudit.deleteMany({where:{adminId}});await db.$disconnect();
  }
});
