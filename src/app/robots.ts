import type {MetadataRoute} from 'next';
import {siteOrigin} from '@/lib/seo/core';
import {searchIndexingEnabled} from '@/lib/server/seo';
export const dynamic='force-dynamic';
export default async function robots():Promise<MetadataRoute.Robots>{
 return await searchIndexingEnabled()?{rules:{userAgent:'*',allow:'/',disallow:['/admin/','/api/']},sitemap:`${siteOrigin()}/sitemap.xml`}:{rules:{userAgent:'*',disallow:'/'}};
}
