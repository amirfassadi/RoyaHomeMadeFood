import 'server-only';
import {cache} from 'react';
import {connection} from 'next/server';
import {unstable_cache} from 'next/cache';
import {getDb} from './db';
import {isDemoCatalog} from './catalog';
import {seoSettingsSchema} from '@/lib/validation/seo';
import {indexable,pageMetadata as metadata,productStructuredData as productData} from '@/lib/seo/core';
import type {Locale} from '@/i18n/routing';
import type {ProductView} from '@/lib/catalog/types';

const readSeo=unstable_cache(async()=>{
 const value=await getDb().setting.findUnique({where:{key:'seo'}});
 return seoSettingsSchema.safeParse(value?.value).data??{enabled:process.env.ROYA_INDEXABLE==='1',googleVerification:''};
},['roya-seo-v1'],{revalidate:60,tags:['seo']});
export const getSeo=cache(async()=>{
 if(isDemoCatalog()||!process.env.DATABASE_URL)return {enabled:false,googleVerification:''};
 await connection();
 return readSeo();
});
export const searchIndexingEnabled=cache(async()=>indexable((await getSeo()).enabled));
export async function pageMetadata(locale:Locale,path:string,title:string,description?:string,privatePage=false,image?:string){
 const settings=await getSeo();
 return {...metadata(locale,path,title,description,privatePage,image,settings.enabled),...(settings.googleVerification?{verification:{google:settings.googleVerification}}:{})};
}
export async function productStructuredData(product:ProductView,locale:Locale){return productData(product,locale,await searchIndexingEnabled());}
