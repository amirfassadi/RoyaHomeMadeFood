import 'server-only';
import {cache} from 'react';
import {connection} from 'next/server';
import {unstable_cache} from 'next/cache';
import {Prisma} from '@/generated/prisma/client';
import {CONTENT_INITIAL_VERSION,defaultContentDocument,contentEditSchema,storefrontContentSchema,
  type ContentDocument,type ContentEdit,type ContentLocale} from '@/lib/storefront-content';
import {privateDatabaseCatalogEnabled} from '@/lib/storefront-mode';
import {getDb} from './db';
import {isDemoAdmin} from './admin-mode';
import {isDemoCatalog} from './catalog';
import {ShopError} from './shop-http';

export const CONTENT_SETTINGS_KEY='storefront-content';
export const CONTENT_CACHE_TAG='storefront-content';

// Administrator reads are uncached so the editor always receives the current version.
export async function getContentDocument():Promise<ContentDocument>{
  if(isDemoAdmin())return defaultContentDocument();
  const row=await getDb().setting.findUnique({where:{key:CONTENT_SETTINGS_KEY}});
  if(!row)return defaultContentDocument();
  const parsed=storefrontContentSchema.safeParse(row.value);
  if(!parsed.success)throw new ShopError('CONTENT_UNAVAILABLE',503);
  return {content:parsed.data,updatedAt:row.updatedAt.toISOString()};
}
const readPublicContent=unstable_cache(getContentDocument,['roya-storefront-content-v1'],{revalidate:60,tags:[CONTENT_CACHE_TAG]});
export const getLocalizedContent=cache(async(locale:ContentLocale)=>{
  if(privateDatabaseCatalogEnabled()){
    await connection();
    if(!process.env.DATABASE_URL)throw new ShopError('CONTENT_UNAVAILABLE',503);
  }else if(isDemoCatalog()||!process.env.DATABASE_URL){
    return defaultContentDocument().content[locale];
  }
  return (await readPublicContent()).content[locale];
});

export async function saveContentDocument(raw:ContentEdit,adminId:string):Promise<ContentDocument>{
  const input=contentEditSchema.parse(raw);
  const previous=new Date(input.expectedUpdatedAt);
  const updatedAt=new Date(Math.max(Date.now(),previous.getTime()+1));
  try{
    return await getDb().$transaction(async tx=>{
      if(input.expectedUpdatedAt===CONTENT_INITIAL_VERSION){
        await tx.setting.create({data:{key:CONTENT_SETTINGS_KEY,value:input.content,updatedAt}});
      }else{
        const changed=await tx.setting.updateMany({where:{key:CONTENT_SETTINGS_KEY,updatedAt:previous},data:{value:input.content,updatedAt}});
        if(changed.count!==1)throw new ShopError('CONFLICT',409);
      }
      await tx.adminAudit.create({data:{adminId,action:'STOREFRONT_CONTENT',targetId:CONTENT_SETTINGS_KEY}});
      return {content:input.content,updatedAt:updatedAt.toISOString()};
    });
  }catch(error){
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ShopError('CONFLICT',409);
    throw error;
  }
}
