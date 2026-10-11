import type {MetadataRoute} from 'next';
import {getCatalog} from '@/lib/server/catalog';
import {indexable,siteOrigin} from '@/lib/seo/core';
export const revalidate=60;
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 if(!indexable())return [];
 const origin=siteOrigin()!,catalog=await getCatalog();
 const paths=['','/catalog','/about','/contact','/faq',...catalog.products.map(p=>`/products/${p.slug}`)];
 return paths.flatMap(path=>(['fa','en'] as const).map(locale=>({url:`${origin}/${locale}${path}/`,alternates:{languages:{fa:`${origin}/fa${path}/`,en:`${origin}/en${path}/`}},changeFrequency:'weekly' as const,priority:path===''?1:0.7})));
}
