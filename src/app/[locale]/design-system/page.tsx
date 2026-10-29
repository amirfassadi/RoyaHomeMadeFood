import {pageMetadata} from '@/lib/server/seo';
import Link from 'next/link';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {Leaf, Heart, Sprout, ArrowUpLeft, ArrowUpRight, Globe2, Clock3, Check} from 'lucide-react';
import {Logo} from '@/components/brand/logo';
import {Card} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {buttonClasses} from '@/components/ui/button';
import {ElementExamples, OrderRuleExample} from '@/components/design-examples';
import type {Locale} from '@/i18n/routing';

export default async function Foundation({params}: {params: Promise<{locale: Locale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Foundation'), brand = await getTranslations('Brand');
  const Arrow = locale === 'fa' ? ArrowUpLeft : ArrowUpRight;
  const swatches = [{color: '#4A7C59', label: 'green'}, {color: '#FAF6EE', label: 'cream'}, {color: '#8B5E3C', label: 'brown'}, {color: '#2B2B2B', label: 'ink'}] as const;
  return <>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:p-4">{t('skip')}</a>
    <div className="bg-roya-green-dark py-2.5 text-center text-[11px] text-white/90">{t('notice')}</div>
    <header className="sticky top-0 z-30 border-b border-roya-line bg-roya-cream/95 backdrop-blur-md">
      <div className="section-shell flex min-h-22 flex-wrap items-center justify-between gap-3 py-4">
        <Link href={`/${locale}/`} aria-label={brand('name')}><Logo/></Link>
        <nav aria-label={locale === 'fa' ? 'ناوبری اصلی' : 'Main navigation'} className="hidden items-center gap-8 text-sm text-roya-muted lg:flex"><a href="#identity" className="hover:text-roya-green">{t('navIdentity')}</a><a href="#elements" className="hover:text-roya-green">{t('navElements')}</a><a href="#rules" className="hover:text-roya-green">{t('navRules')}</a></nav>
        <Link href={`/${locale === 'fa' ? 'en' : 'fa'}/`} lang={locale === 'fa' ? 'en' : 'fa'} aria-label={t('languageLabel')} className="flex min-h-11 items-center gap-2 rounded-xl border border-roya-line bg-white px-3 text-sm"><Globe2 size={16}/>{t('switchLanguage')}</Link>
      </div>
    </header>
    <main id="main">
      <section className="section-shell grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.15fr_1fr]">
        <div><div className="mb-6 flex items-center gap-2 text-xs font-semibold text-roya-brown"><span className="h-px w-8 bg-roya-brown/40"/>{t('eyebrow')}</div>
          <h1 className="text-5xl font-extrabold leading-[1.45] tracking-tight md:text-6xl">{t('title1')}<br/><span className="text-roya-green">{t('title2')}</span></h1>
          <p className="mt-4 text-lg font-medium">{brand('slogan')}</p><p className="mt-5 max-w-lg text-sm leading-8 text-roya-muted">{t('intro')}</p>
          <div className="mt-8 flex flex-wrap gap-3"><a href="#elements" className={buttonClasses()}>{t('primary')}<Arrow size={18}/></a><a href="#rules" className={buttonClasses('secondary')}>{t('secondary')}</a></div>
          <div className="mt-9 flex flex-wrap gap-x-5 gap-y-3 text-xs text-roya-muted">{(['promise1', 'promise2', 'promise3'] as const).map(key => <span key={key} className="flex items-center gap-1.5"><Check size={14} className="text-roya-green"/>{t(key)}</span>)}</div>
        </div>
        <div className="soft-grid relative flex min-h-96 items-center justify-center overflow-hidden rounded-[2.5rem] border border-roya-line bg-[#EEF0E5] p-8 md:min-h-[470px]" aria-label={brand('name')}>
          <div className="absolute -start-24 -top-24 size-72 rounded-full border border-roya-green/10" aria-hidden="true"/><div className="absolute -bottom-24 -end-24 size-80 rounded-full border border-roya-green/10" aria-hidden="true"/>
          <div className="relative flex size-64 flex-col items-center justify-center rounded-full border-[12px] border-roya-cream bg-white shadow-[0_20px_70px_#4a7c5914] md:size-72"><Sprout className="mb-2 text-roya-green" size={54} strokeWidth={1.2} aria-hidden="true"/><span className="text-5xl font-bold text-roya-green-dark">{brand('short')}</span><span dir="ltr" className="mt-4 text-[10px] tracking-[0.22em] text-roya-brown">ROYA FOOD PRODUCTS</span><span className="mt-3 text-xs text-roya-muted">{brand('tagline')}</span></div>
          <span className="absolute bottom-5 start-5 flex items-center gap-2 rounded-xl border border-roya-line bg-white px-4 py-3 text-xs shadow-card"><Heart size={15} className="text-roya-brown"/>{t('promise3')}</span><Leaf size={65} className="absolute end-4 top-6 rotate-[-25deg] text-roya-green/20" aria-hidden="true" strokeWidth={1}/>
        </div>
      </section>
      <section id="identity" className="border-y border-roya-line bg-white/50 py-16">
        <div className="section-shell"><SectionHeading label={t('identityLabel')} title={t('identityTitle')} description={t('identityText')}/>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{swatches.map(s => <div key={s.label} className="overflow-hidden rounded-2xl border border-roya-line bg-white"><div className="h-28 md:h-36" style={{backgroundColor: s.color}} aria-hidden="true"/><div className="flex flex-wrap items-center justify-between gap-2 p-4"><span className="text-sm font-semibold">{t(s.label)}</span><span className="font-mono text-xs text-roya-muted" dir="ltr">{s.color}</span></div></div>)}</div>
          <Card className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-center"><div><p className="mb-2 text-xs text-roya-brown">{t('typeTitle')}</p><p className="text-2xl font-bold md:text-3xl">{t('typeSample')}</p><p className="mt-3 text-sm leading-7 text-roya-muted">{t('typeBody')}</p></div><span dir="ltr" className="text-5xl font-light text-roya-green/40">Aa <span className="font-bold">آ</span></span></Card>
        </div>
      </section>
      <section id="elements" className="section-shell py-16"><SectionHeading label={t('elementsLabel')} title={t('elementsTitle')} description={t('elementsText')}/><ElementExamples/></section>
      <section id="rules" className="section-shell pb-20"><SectionHeading label={t('rulesLabel')} title={t('rulesTitle')} description={t('rulesText')}/>
        <div className="grid gap-5 md:grid-cols-2"><OrderRuleExample/><Card className="bg-roya-green-dark text-white"><span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-white/10"><Clock3 size={24} strokeWidth={1.5}/></span><h3 className="text-xl font-bold">{t('etaTitle')}</h3><p className="mt-3 text-sm leading-7 text-white/75">{t('etaText')}</p><dl className="mt-7 space-y-4 text-sm"><div className="flex flex-wrap justify-between gap-3"><dt className="text-white/75">{t('prepLabel')}</dt><dd>{t('prepValue')}</dd></div><div className="flex flex-wrap justify-between gap-3"><dt className="text-white/75">{t('deliveryLabel')}</dt><dd>{t('deliveryValue')}</dd></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/20 pt-5"><dt>{t('totalLabel')}</dt><dd className="text-3xl font-bold">{t('totalValue')}</dd></div></dl></Card></div>
      </section>
    </main>
    <footer className="border-t border-roya-line bg-white/60 py-8"><div className="section-shell flex flex-col justify-between gap-6 md:flex-row md:items-center"><div><Logo compact/><p className="mt-4 max-w-md text-xs leading-7 text-roya-muted">{t('footer')}</p></div><Badge><Leaf size={14}/>{t('footerNote')}</Badge></div></footer>
  </>;
}
function SectionHeading({label, title, description}: {label: string; title: string; description: string}) {
  return <div className="mb-8"><p className="mb-3 text-xs font-semibold text-roya-brown">{label}</p><h2 className="text-2xl font-bold md:text-3xl">{title}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-roya-muted">{description}</p></div>;
}

export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'/design-system',locale==='fa'?'سیستم طراحی':'Design system',undefined,true);}
