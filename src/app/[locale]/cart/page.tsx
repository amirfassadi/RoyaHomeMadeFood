import {pageMetadata} from '@/lib/seo/core';
import {getTranslations,setRequestLocale} from 'next-intl/server';
import {PageShell,PageHeading} from '@/components/store/page-shell';
import {CartPage} from '@/components/store/cart-page';
import type {Locale} from '@/i18n/routing';
export const revalidate=60;
export default async function Page({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;setRequestLocale(locale);const t=await getTranslations('Shop');return <PageShell><section className="section-shell py-12 md:py-16"><PageHeading title={t('cart')} description={t('intro')}/><CartPage/></section></PageShell>;}

export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'/cart',locale==='fa'?'سبد خرید':'Shopping bag',undefined,true);}
