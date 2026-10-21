'use client';
import {InternationalBanner} from './international-banner';
import {PrototypeToolbar} from './prototype-region';
import {useCart} from './cart-provider';
import {formatNumber} from '@/lib/format';
import type {Locale} from '@/i18n/routing';
import {useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useLocale, useTranslations} from 'next-intl';
import {Globe2, Menu, X, ArrowUpLeft, ArrowUpRight} from 'lucide-react';
import {Logo} from '@/components/brand/logo';
import {buttonClasses} from '@/components/ui/button';
export function StoreHeader({isDemo}: {isDemo: boolean}) {
  const cart=useCart();
  const [open, setOpen] = useState(false);
  const locale = useLocale(), t = useTranslations('Nav'), pathname = usePathname();
  const other = locale === 'fa' ? 'en' : 'fa';
  const translated = pathname.replace(/^\/(fa|en)(?=\/|$)/, `/${other}`);
  const links = [['home', ''], ['catalog', '/catalog'], ['about', '/about'], ['faq', '/faq'], ['contact', '/contact'], ['tracking', '/tracking'], ['account', '/account']] as const;
  const Arrow = locale === 'fa' ? ArrowUpLeft : ArrowUpRight;
  return <>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:p-4">{t('skip')}</a>
    {isDemo && <div className="bg-roya-green-dark px-5 py-2.5 text-center text-[11px] leading-5 text-white">{t('demo')}</div>}
    <PrototypeToolbar/>
    <InternationalBanner isDemo={isDemo}/>
    <header className="sticky top-0 z-30 border-b border-roya-line bg-roya-cream/95 backdrop-blur-md"><div className="section-shell flex min-h-22 items-center justify-between gap-3 py-4">
      <Link href={`/${locale}/`} onClick={() => setOpen(false)}><Logo/></Link>
      <nav aria-label={t('menu')} className="hidden items-center gap-6 text-sm xl:flex">{links.map(([key, path]) => <Link key={key} href={`/${locale}${path}/`} className={`transition-colors hover:text-roya-green ${pathname.replace(/\/$/, '') === `/${locale}${path}` ? 'font-semibold text-roya-green' : 'text-roya-muted'}`} aria-current={pathname.replace(/\/$/, '') === `/${locale}${path}` ? 'page' : undefined}>{t(key)}</Link>)}</nav>
      <div className="flex items-center gap-2"><Link href={`/${locale}/cart/`} aria-label={t('cart')} className="flex min-h-11 items-center gap-2 rounded-xl border border-roya-line px-3 text-sm">{t('cart')}<span className="rounded-full bg-roya-leaf px-2">{formatNumber(cart.ready?cart.items.length:0,locale as Locale)}</span></Link><Link href={translated} lang={other} aria-label={t('language')} className="flex min-h-11 items-center gap-2 rounded-xl border border-roya-line px-3 text-sm"><Globe2 size={16}/><span>{other === 'en' ? 'EN' : 'فا'}</span></Link>
        <div className="hidden 2xl:block"><Link href={`/${locale}/catalog/`} className={buttonClasses()}>{t('shop')}<Arrow size={16}/></Link></div>
        <button className="flex size-11 items-center justify-center rounded-xl border border-roya-line xl:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? t('close') : t('menu')}>{open ? <X size={22}/> : <Menu size={22}/>}</button>
      </div></div>
      {open && <nav id="mobile-nav" className="section-shell grid gap-1 border-t border-roya-line py-3 xl:hidden">{links.map(([key, path]) => <Link key={key} href={`/${locale}${path}/`} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm hover:bg-roya-leaf">{t(key)}</Link>)}</nav>}
    </header>
  </>;
}
