import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateDatabaseCatalogEnabled} from '../src/lib/storefront-mode';
import {privateCatalogResponseSchema,cartStorageKey} from '../src/lib/catalog/snapshot';
import {demoCatalog} from '../src/lib/catalog/demo';
import {quoteDemo,quoteNeedsReview} from '../src/lib/prototype';
const env={ROYA_PRIVATE_DB_CATALOG:'1',ROYA_DEPLOYMENT_ROLE:'standalone',ROYA_DEMO_CATALOG:'1',ROYA_LIVE_PAYMENTS:'0',ROYA_ACCEPT_ORDERS:'0',ROYA_SEND_SMS:'0',ROYA_INDEXABLE:'0'};
test('database preview requires standalone and every live-effect guard to be off',()=>{
 assert.equal(privateDatabaseCatalogEnabled({}),false);assert.equal(privateDatabaseCatalogEnabled(env),true);
 for(const key of ['ROYA_LIVE_PAYMENTS','ROYA_ACCEPT_ORDERS','ROYA_SEND_SMS','ROYA_INDEXABLE'])assert.throws(()=>privateDatabaseCatalogEnabled({...env,[key]:'1'}),/PRIVATE_CATALOG_CONFIGURATION/);
 for(const patch of [{ROYA_DEPLOYMENT_ROLE:'frontend'},{ROYA_DEMO_CATALOG:'0'},{SITES_STATIC_PREVIEW:'1'}])assert.throws(()=>privateDatabaseCatalogEnabled({...env,...patch}),/PRIVATE_CATALOG_CONFIGURATION/);
});
test('database preview has its own cart and requires a simulation-scoped catalog response',()=>{
 const database={...demoCatalog,source:'database' as const,products:demoCatalog.products.map(p=>({...p,media:[]}))};
 assert.notEqual(cartStorageKey(database),cartStorageKey(demoCatalog));assert.notEqual(cartStorageKey(database),cartStorageKey({...database,isDemo:false}));
 assert.equal(privateCatalogResponseSchema.safeParse({scope:'private-database',catalog:database}).success,true);
 assert.equal(privateCatalogResponseSchema.safeParse({scope:'private-database',catalog:{...database,isDemo:false}}).success,false);
 assert.equal(privateCatalogResponseSchema.safeParse({scope:'private-database',catalog:{...database,products:[{...database.products[0],stockQuantity:-1}]}}).success,false);
});
test('rechecking catalog prices requires renewed review while invoice expiry alone does not',()=>{
 const now=new Date(),items=[{productId:'demo-platter',quantity:1}],zone={id:'test',feeToman:50000};
 const a=quoteDemo(demoCatalog,items,zone,'','IR',now);
 const later=quoteDemo(demoCatalog,items,zone,'','IR',new Date(now.getTime()+1000));
 assert.equal(quoteNeedsReview(a,later),false);
 const changed={...demoCatalog,source:'database' as const,products:demoCatalog.products.map(p=>p.id==='demo-platter'?{...p,priceToman:p.priceToman+50000}:p)};
 const b=quoteDemo(changed,items,zone,'','IR',now);
 assert.equal(a.fingerprint,b.fingerprint);assert.equal(quoteNeedsReview(a,b),true);
 assert.throws(()=>quoteDemo({...changed,products:changed.products.map(p=>({...p,stockQuantity:0}))},items,zone,'','IR',now),/QUANTITY/);
});
