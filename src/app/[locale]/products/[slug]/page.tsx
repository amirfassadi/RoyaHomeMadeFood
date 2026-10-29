import {CurrencyPrice} from '@/components/store/currency-price';
import {pageMetadata,productStructuredData,searchIndexingEnabled} from '@/lib/server/seo';
import {jsonLd,breadcrumbStructuredData} from '@/lib/seo/core';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {Clock3, AlertCircle, ArrowLeft, ArrowRight} from 'lucide-react';
import {getCatalog, isDemoCatalog} from '@/lib/server/catalog';
import {PageShell} from '@/components/store/page-shell';
import {ProductGallery} from '@/components/store/product-gallery';
import {ProductQuantity} from '@/components/store/product-quantity';
import {ProductCard} from '@/components/store/product-card';
import {Badge} from '@/components/ui/badge';
import {formatNumber, formatToman} from '@/lib/format';
import type {Locale} from '@/i18n/routing';
export const revalidate = 60;
// Product slugs are generated on demand with ISR. Runtime SEO reads must not
// switch an already-static fallback route into dynamic rendering on first use.
export const dynamic = 'force-static';
// Runtime slugs remain available in Next.js; the static preview includes only explicit demo slugs.
export async function generateStaticParams() {
  if (!isDemoCatalog()) return [];
  const catalog = await getCatalog();
  return catalog.products.map(p => ({slug: p.slug}));
}
export default async function Product({params}: {params: Promise<{locale: Locale; slug: string}>}) {
  const {locale, slug} = await params; setRequestLocale(locale);
  const catalog = await getCatalog(), p = catalog.products.find(p => p.slug === slug);
  if (!p) notFound();
  const t = await getTranslations('Catalog');
  const Back = locale === 'fa' ? ArrowRight : ArrowLeft;
  const available = (p.stockQuantity == null || p.stockQuantity >= p.minOrderQuantity) && (p.dailyCapacity == null || p.dailyCapacity >= p.minOrderQuantity);
  const related = catalog.products.filter(item => item.id !== p.id).slice(0, 3);
  const structuredData=catalog.isDemo?null:await productStructuredData(p,locale);
  const breadcrumbs=await searchIndexingEnabled()?breadcrumbStructuredData(locale,p):null;
  return <PageShell>{breadcrumbs&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(breadcrumbs)}}/>}{structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(structuredData)}}/>}<div className="section-shell py-10 md:py-14"><nav aria-label={locale==='fa'?'مسیر صفحه':'Breadcrumb'} className="mb-4 flex flex-wrap items-center gap-2 text-xs text-roya-muted"><Link href={`/${locale}/`}>{locale==='fa'?'خانه':'Home'}</Link><span aria-hidden="true">/</span><Link href={`/${locale}/catalog/`}>{locale==='fa'?'محصولات':'Products'}</Link><span aria-hidden="true">/</span><span aria-current="page">{locale==='fa'?p.nameFa:p.nameEn}</span></nav><Link href={`/${locale}/catalog/`} className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-roya-green"><Back size={17}/>{t('back')}</Link>
    <div className="grid items-start gap-9 lg:grid-cols-2"><ProductGallery media={p.media}/><div><div className="mb-4 flex gap-2">{catalog.isDemo && <Badge tone="brown">{t('sample')}</Badge>}<Badge tone={available ? 'green' : 'neutral'}>{t(available ? 'available' : 'unavailable')}</Badge></div><h1 className="text-3xl font-extrabold leading-relaxed">{locale === 'fa' ? p.nameFa : p.nameEn}</h1><p className="mt-3 text-sm text-roya-muted">{t('per', {quantity: formatNumber(p.priceBasisQuantity, locale), unit: t(p.unit)})}</p><p className="mt-4 text-2xl font-bold text-roya-green-dark">{<CurrencyPrice toman={p.priceToman}/>}</p>
      <dl className="my-6 grid grid-cols-2 gap-4 rounded-2xl bg-roya-leaf p-5 text-sm"><div><dt className="mb-2 text-xs text-roya-muted">{t('minimum')}</dt><dd className="font-semibold">{formatNumber(p.minOrderQuantity, locale)} {t(p.unit)}</dd></div><div><dt className="mb-2 text-xs text-roya-muted">{t('step')}</dt><dd className="font-semibold">{formatNumber(p.orderStepQuantity, locale)} {t(p.unit)}</dd></div><div className="col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-roya-green/10 pt-4"><dt className="flex items-center gap-2 text-roya-muted"><Clock3 size={17}/>{t('preparation')}</dt><dd className="font-semibold">{t('minutes', {count: formatNumber(p.preparationMinutes, locale)})}</dd></div></dl>
      <ProductQuantity key={p.id} product={p}/>{catalog.isDemo && <p className="mt-4 flex gap-2 text-xs leading-6 text-roya-brown"><AlertCircle size={16} className="mt-1 shrink-0"/>{t('demoNote')}</p>}
    </div></div>
    <section className="mt-12 max-w-3xl"><h2 className="text-xl font-bold">{t('details')}</h2><p className="mt-5 whitespace-pre-line text-sm leading-8 text-roya-muted">{locale === 'fa' ? p.descriptionFa : p.descriptionEn}</p><p className="mt-6 rounded-xl border border-roya-line bg-white p-4 text-xs leading-7 text-roya-brown">{t('allergy')}</p><Link href={`/${locale}/contact/`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-roya-green">{t('ask')} {t('contact')}</Link></section>
    {related.length > 0 && <section className="mt-14"><h2 className="mb-7 text-2xl font-bold">{t('related')}</h2><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map(item => <ProductCard key={item.id} product={item} isDemo={catalog.isDemo}/>)}</div></section>}
  </div></PageShell>;
}

export async function generateMetadata({params}:{params:Promise<{locale:Locale;slug:string}>}){
 const {locale,slug}=await params,catalog=await getCatalog(),p=catalog.products.find(p=>p.slug===slug);if(!p)notFound();
 return pageMetadata(locale,`/products/${p.slug}`,locale==='fa'?p.nameFa:p.nameEn,(locale==='fa'?p.descriptionFa:p.descriptionEn).slice(0,160),false,p.media.find(m=>m.type==='IMAGE')?.url);
}
