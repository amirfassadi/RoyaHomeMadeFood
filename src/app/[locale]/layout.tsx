import {pageMetadata} from '@/lib/server/seo';
import type {Locale} from '@/i18n/routing';
import {NextIntlClientProvider, hasLocale} from 'next-intl';
import {getMessages, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {routing} from '@/i18n/routing';
import '../globals.css';
export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'',locale==='fa'?'فینگر فود و طعم‌های خانگی':'Fresh homemade food');}
export function generateStaticParams() {return routing.locales.map(locale => ({locale}));}
export default async function LocaleLayout({children, params}: {children: React.ReactNode; params: Promise<{locale: string}>}) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return <html lang={locale} dir={locale === 'fa' ? 'rtl' : 'ltr'}><body className="antialiased"><NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Tehran">{children}</NextIntlClientProvider></body></html>;
}
