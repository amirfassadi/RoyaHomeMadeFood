import {pageMetadata} from '@/lib/server/seo';
import {getTranslations,setRequestLocale} from 'next-intl/server';
import {PageShell,PageHeading} from '@/components/store/page-shell';
import {CheckoutForm} from '@/components/store/checkout-form';
import type {Locale} from '@/i18n/routing';
import {getZones} from '@/lib/server/delivery-zones';
export const revalidate=60;
export default async function Page({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;setRequestLocale(locale);const t=await getTranslations('Shop');return <PageShell><section className="section-shell py-12 md:py-16"><PageHeading title={t('checkout')} description={t('intro')}/><CheckoutForm zones={await getZones()}/></section></PageShell>;}

export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'/checkout',locale==='fa'?'ثبت سفارش':'Checkout',undefined,true);}
