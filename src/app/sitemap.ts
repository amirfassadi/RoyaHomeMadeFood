import type {MetadataRoute} from 'next';
import {searchIndexingEnabled} from '@/lib/server/seo';
import {getCatalog} from '@/lib/server/catalog';
import {siteOrigin} from '@/lib/seo/core';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 if(!await searchIndexingEnabled())return [];
 const origin=siteOrigin()!,catalog=await getCatalog();
 const paths=['','/catalog','/about','/contact','/faq',...catalog.products.map(p=>`/products/${p.slug}`)];
 return paths.flatMap(path=>(['fa','en'] as const).map(locale=>({url:`${origin}/${locale}${path}/`,alternates:{languages:{fa:`${origin}/fa${path}/`,en:`${origin}/en${path}/`,'x-default':`${origin}/fa${path}/`}},changeFrequency:'weekly' as const,priority:path===''?1:0.7})));
}
