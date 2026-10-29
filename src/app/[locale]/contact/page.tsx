import {pageMetadata} from '@/lib/server/seo';
import Link from 'next/link';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {Phone, Mail, MapPin, Clock3} from 'lucide-react';
import {PageShell, PageHeading} from '@/components/store/page-shell';
import {ContactForm} from '@/components/store/contact-form';
import {getContactSettings} from '@/lib/server/contact-settings';
import {isDemoCatalog} from '@/lib/server/catalog';
import type {Locale} from '@/i18n/routing';
export const revalidate = 60;
export default async function Contact({params}: {params: Promise<{locale: Locale}>}) {
  const {locale} = await params; setRequestLocale(locale); const t = await getTranslations('Contact'), contact = await getContactSettings();
  const address = locale === 'fa' ? contact.addressFa : contact.addressEn, hours = locale === 'fa' ? contact.hoursFa : contact.hoursEn;
  const disabledReason = isDemoCatalog() ? 'preview' : !process.env.DATABASE_URL ? 'unavailable' : undefined;
  return <PageShell><section className="section-shell py-12 md:py-16"><PageHeading title={t('title')} description={t('intro')} eyebrow={t('eyebrow')}/><div className="grid items-start gap-8 lg:grid-cols-[1.2fr_0.8fr]"><ContactForm disabledReason={disabledReason}/><aside className="rounded-3xl bg-roya-leaf p-7"><h2 className="mb-6 text-xl font-bold">{t('info')}</h2><div className="grid gap-5 text-sm">{contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-3"><Phone size={18} className="text-roya-green"/><bdi>{contact.phone}</bdi></a>}{contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-3"><Mail size={18} className="text-roya-green"/><bdi className="break-all">{contact.email}</bdi></a>}{address && <p className="flex items-start gap-3 leading-7"><MapPin size={18} className="mt-1 shrink-0 text-roya-green"/>{address}</p>}{hours && <p className="flex items-start gap-3 leading-7"><Clock3 size={18} className="mt-1 shrink-0 text-roya-green"/>{hours}</p>}{!contact.phone && !contact.email && !address && !hours && <p className="leading-7 text-roya-muted">{t('pending')}</p>}</div><div className="mt-8 border-t border-roya-green/15 pt-6"><p className="text-sm">{t('faqLink')}</p><Link href={`/${locale}/faq/`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-roya-green">{t('faq')}</Link></div></aside></div></section></PageShell>;
}

export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'/contact',locale==='fa'?'تماس با رویا':'Contact Roya',undefined,false);}
