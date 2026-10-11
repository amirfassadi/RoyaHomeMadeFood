import type {MetadataRoute} from 'next';
import {indexable,siteOrigin} from '@/lib/seo/core';
export default function robots():MetadataRoute.Robots{return indexable()?{rules:{userAgent:'*',allow:'/',disallow:['/*/account/','/admin/','/api/','/*/cart/','/*/checkout/','/*/tracking/','/*/payment-result/','/*/design-system/']},sitemap:`${siteOrigin()}/sitemap.xml`}:{rules:{userAgent:'*',disallow:'/'}};}
