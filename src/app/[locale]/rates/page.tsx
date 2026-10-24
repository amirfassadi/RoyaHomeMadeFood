import {setRequestLocale} from 'next-intl/server';
import {PageShell} from '@/components/store/page-shell';
import {CurrencyRates} from '@/components/store/currency-rates';
import {pageMetadata} from '@/lib/seo/core';
import type {Locale} from '@/i18n/routing';
export default async function Page({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;setRequestLocale(locale);return <PageShell><CurrencyRates detailed/></PageShell>;}
export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'/rates',locale==='fa'?'نرخ ارز و قیمت‌گذاری':'Exchange rates & pricing',undefined,true);}
