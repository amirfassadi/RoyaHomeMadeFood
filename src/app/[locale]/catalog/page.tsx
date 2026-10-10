import {getTranslations, setRequestLocale} from 'next-intl/server';
import {PageShell, PageHeading} from '@/components/store/page-shell';
import {CatalogGrid} from '@/components/store/catalog-grid';
import {getCatalog} from '@/lib/server/catalog';
import type {Locale} from '@/i18n/routing';
export const revalidate = 60;
export default async function Catalog({params}: {params: Promise<{locale: Locale}>}) {
  const {locale} = await params; setRequestLocale(locale);
  const t = await getTranslations('Catalog'), catalog = await getCatalog();
  return <PageShell><section id="products" className="section-shell py-12 md:py-16"><PageHeading title={t('title')} description={t('intro')}/><CatalogGrid catalog={catalog}/></section></PageShell>;
}
