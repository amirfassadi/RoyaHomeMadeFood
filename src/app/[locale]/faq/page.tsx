import {pageMetadata} from '@/lib/server/seo';
import Link from 'next/link';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {Plus} from 'lucide-react';
import {PageShell, PageHeading} from '@/components/store/page-shell';
import {buttonClasses} from '@/components/ui/button';
import type {Locale} from '@/i18n/routing';
export const revalidate = 60;
export default async function FAQ({params}: {params: Promise<{locale: Locale}>}) {
  const {locale} = await params; setRequestLocale(locale); const t = await getTranslations('FAQ');
  return <PageShell><section className="section-shell py-12 md:py-16"><div className="mx-auto max-w-3xl"><PageHeading title={t('title')} description={t('intro')}/><div className="grid gap-4">{[1, 2, 3, 4, 5, 6, 7].map(n => <details key={n} className="group rounded-2xl border border-roya-line bg-white"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 px-6 py-5 text-sm font-semibold"><span>{t(`q${n}`)}</span><Plus size={18} className="shrink-0 text-roya-green transition-transform group-open:rotate-45" aria-hidden="true"/></summary><p className="px-6 pb-6 text-sm leading-8 text-roya-muted">{t(`a${n}`)}</p></details>)}</div><div className="mt-9 rounded-2xl bg-roya-leaf p-7"><h2 className="mb-4 text-lg font-bold">{t('more')}</h2><Link href={`/${locale}/contact/`} className={buttonClasses()}>{t('contact')}</Link></div></div></section></PageShell>;
}

export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'/faq',locale==='fa'?'پرسش‌های متداول':'Frequently asked questions',undefined,false);}
