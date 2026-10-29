import {pageMetadata} from '@/lib/server/seo';
import {getTranslations,setRequestLocale} from 'next-intl/server';
import {PageShell,PageHeading} from '@/components/store/page-shell';
import {TrackingForm} from '@/components/store/tracking-form';
import type {Locale} from '@/i18n/routing';
import {isDemoCatalog} from '@/lib/server/catalog';
export const revalidate=60;
export default async function Page({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;setRequestLocale(locale);const t=await getTranslations('Shop');return <PageShell><section className="section-shell py-12 md:py-16"><PageHeading title={t('tracking')} description={t('trackIntro')}/><TrackingForm isDemo={isDemoCatalog()}/></section></PageShell>;}

export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'/tracking',locale==='fa'?'پیگیری سفارش':'Track order',undefined,true);}
