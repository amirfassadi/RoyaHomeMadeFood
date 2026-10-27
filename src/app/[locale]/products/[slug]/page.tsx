import {CurrencyPrice} from '@/components/store/currency-price';
import {pageMetadata,productStructuredData,jsonLd} from '@/lib/seo/core';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {Clock3, AlertCircle, ArrowLeft, ArrowRight} from 'lucide-react';
import {getCatalog, isDemoCatalog} from '@/lib/server/catalog';
import {privateDatabaseCatalogEnabled} from '@/lib/storefront-mode';
import {PageShell} from '@/components/store/page-shell';
import {ProductGallery} from '@/components/store/product-gallery';
import {ProductQuantity} from '@/components/store/product-quantity';
import {ProductCard} from '@/components/store/product-card';
import {Badge} from '@/components/ui/badge';
import {formatNumber, formatToman} from '@/lib/format';
import type {Locale} from '@/i18n/routing';
export const revalidate = 60;
// An empty generator would classify new database slugs as static ISR pages.
// Request-time catalog reads require a dynamic route; only samples are generated.
export const generateStaticParams = isDemoCatalog() && !privateDatabaseCatalogEnabled() ? async () => {
  const catalog = await getCatalog();
  return catalog.products.map(p => ({slug: p.slug}));
} : undefined;
export default async function Product({params}: {params: Promise<{locale: Locale; slug: string}>}) {
  const {locale, slug} = await params; setRequestLocale(locale);
  const catalog = await getCatalog(), p = catalog.products.find(p => p.slug === slug);
  if (!p) notFound();
  const t = await getTranslations('Catalog');
  const Back = locale === 'fa' ? ArrowRight : ArrowLeft;
  const available = (p.stockQuantity == null || p.stockQuantity >= p.minOrderQuantity) && (p.dailyCapacity == null || p.dailyCapacity >= p.minOrderQuantity);
  const related = catalog.products.filter(item => item.id !== p.id).slice(0, 3);
  const structuredData=catalog.isDemo?null:productStructuredData(p,locale);
  return <PageShell>{structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(structuredData)}}/>}<div className="section-shell py-10 md:py-14"><Link href={`/${locale}/catalog/`} className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-roya-green"><Back size={17}/>{t('back')}</Link>
    <div className="grid items-start gap-9 lg:grid-cols-2"><ProductGallery media={p.media}/><div><div className="mb-4 flex gap-2">{catalog.isDemo&&catalog.source!=='database' && <Badge tone="brown">{t('sample')}</Badge>}<Badge tone={available ? 'green' : 'neutral'}>{t(available ? 'available' : 'unavailable')}</Badge></div><h1 className="text-3xl font-extrabold leading-relaxed">{locale === 'fa' ? p.nameFa : p.nameEn}</h1><p className="mt-3 text-sm text-roya-muted">{t('per', {quantity: formatNumber(p.priceBasisQuantity, locale), unit: t(p.unit)})}</p><p className="mt-4 text-2xl font-bold text-roya-green-dark">{<CurrencyPrice toman={p.priceToman}/>}</p>
      <dl className="my-6 grid grid-cols-2 gap-4 rounded-2xl bg-roya-leaf p-5 text-sm"><div><dt className="mb-2 text-xs text-roya-muted">{t('minimum')}</dt><dd className="font-semibold">{formatNumber(p.minOrderQuantity, locale)} {t(p.unit)}</dd></div><div><dt className="mb-2 text-xs text-roya-muted">{t('step')}</dt><dd className="font-semibold">{formatNumber(p.orderStepQuantity, locale)} {t(p.unit)}</dd></div><div className="col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-roya-green/10 pt-4"><dt className="flex items-center gap-2 text-roya-muted"><Clock3 size={17}/>{t('preparation')}</dt><dd className="font-semibold">{t('minutes', {count: formatNumber(p.preparationMinutes, locale)})}</dd></div></dl>
      <ProductQuantity key={p.id} product={p}/>{catalog.isDemo&&catalog.source!=='database' && <p className="mt-4 flex gap-2 text-xs leading-6 text-roya-brown"><AlertCircle size={16} className="mt-1 shrink-0"/>{t('demoNote')}</p>}
    </div></div>
    <section className="mt-12 max-w-3xl"><h2 className="text-xl font-bold">{t('details')}</h2><p className="mt-5 whitespace-pre-line text-sm leading-8 text-roya-muted">{locale === 'fa' ? p.descriptionFa : p.descriptionEn}</p><p className="mt-6 rounded-xl border border-roya-line bg-white p-4 text-xs leading-7 text-roya-brown">{t('allergy')}</p><Link href={`/${locale}/contact/`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-roya-green">{t('ask')} {t('contact')}</Link></section>
    {related.length > 0 && <section className="mt-14"><h2 className="mb-7 text-2xl font-bold">{t('related')}</h2><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map(item => <ProductCard key={item.id} product={item} isDemo={catalog.isDemo&&catalog.source!=='database'}/>)}</div></section>}
  </div></PageShell>;
}

export async function generateMetadata({params}:{params:Promise<{locale:Locale;slug:string}>}){
 const {locale,slug}=await params,catalog=await getCatalog(),p=catalog.products.find(p=>p.slug===slug);if(!p)notFound();
 return pageMetadata(locale,`/products/${p.slug}`,locale==='fa'?p.nameFa:p.nameEn,(locale==='fa'?p.descriptionFa:p.descriptionEn).slice(0,160),false,p.media.find(m=>m.type==='IMAGE')?.url);
}
