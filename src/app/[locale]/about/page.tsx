import Link from 'next/link';
import Image from 'next/image';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {Leaf, Heart, Sprout} from 'lucide-react';
import {PageShell, PageHeading} from '@/components/store/page-shell';
import {buttonClasses} from '@/components/ui/button';
import type {Locale} from '@/i18n/routing';
export const revalidate = 60;
export default async function About({params}: {params: Promise<{locale: Locale}>}) {
  const {locale} = await params; setRequestLocale(locale); const t = await getTranslations('About'), home = await getTranslations('Home');
  return <PageShell><section className="section-shell py-12 md:py-16"><div className="grid items-center gap-10 md:grid-cols-2"><div><PageHeading title={t('title')} description={t('intro')} eyebrow={t('eyebrow')}/><Link href={`/${locale}/catalog/`} className={buttonClasses()}>{t('cta')}</Link></div><div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-roya-leaf"><Image src="/images/roya-party-spread.webp" alt={home('photo')} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover"/></div></div><section className="mt-14 max-w-3xl"><h2 className="text-2xl font-bold">{t('storyTitle')}</h2><p className="mt-5 text-sm leading-8 text-roya-muted">{t('story')}</p></section><div className="mt-10 grid gap-5 md:grid-cols-3">{[Leaf, Heart, Sprout].map((Icon, i) => <div key={i} className="rounded-2xl border border-roya-line bg-white p-6"><Icon size={28} strokeWidth={1.4} className="mb-5 text-roya-green"/><h2 className="font-bold">{t(`v${i + 1}`)}</h2><p className="mt-3 text-sm leading-7 text-roya-muted">{t(`v${i + 1}Text`)}</p></div>)}</div><p className="mt-8 rounded-2xl bg-roya-leaf p-5 text-sm leading-8 text-roya-green-dark">{t('note')}</p></section></PageShell>;
}
