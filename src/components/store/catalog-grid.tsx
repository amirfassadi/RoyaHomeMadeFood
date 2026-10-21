'use client';
import {useState} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {Search, SlidersHorizontal} from 'lucide-react';
import type {CatalogView} from '@/lib/catalog/types';
import {filterProducts} from '@/lib/catalog/filter';
import {formatNumber} from '@/lib/format';
import type {Locale} from '@/i18n/routing';
import {ProductCard} from './product-card';
import {Button} from '@/components/ui/button';
import {useCart} from './cart-provider';
export function CatalogGrid() {
  const {catalog,catalogError,catalogLoading,refreshCatalog}=useCart();
  const [category, setCategory] = useState(''), [query, setQuery] = useState('');
  const t = useTranslations('Catalog'), locale = useLocale() as Locale;
  const filtered = filterProducts(catalog.products, category, query);
  return <>{catalogError&&<p role="alert" className="mb-5 rounded-xl border border-roya-line bg-white p-4 text-sm">{locale==='fa'?'دریافت محصولات به‌روز ناموفق بود.':'Unable to refresh products.'} <button type="button" className="underline" disabled={catalogLoading} onClick={()=>void refreshCatalog().catch(()=>{})}>{locale==='fa'?'تلاش دوباره':'Retry'}</button></p>}<div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-center"><div className="flex flex-wrap items-center gap-2"><SlidersHorizontal size={18} className="me-1 text-roya-muted"/>
    {[{id: '', nameFa: t('all'), nameEn: t('all')}, ...catalog.categories].map(c => <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className={`min-h-11 rounded-full border px-4 py-2 text-sm transition-colors ${category === c.id ? 'border-roya-green bg-roya-green text-white' : 'border-roya-line bg-white hover:bg-roya-leaf'}`}>{locale === 'fa' ? c.nameFa : c.nameEn}</button>)}
    </div><div className="relative w-full md:max-w-xs"><label htmlFor="product-search" className="sr-only">{t('search')}</label><Search size={18} className="absolute start-4 top-4 text-roya-muted"/><input id="product-search" type="search" maxLength={150} value={query} onChange={e => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} className="min-h-12 w-full rounded-xl border border-roya-line bg-white pe-4 ps-11 text-sm"/></div></div>
    <p className="mb-5 text-xs text-roya-muted" aria-live="polite">{t('count', {count: formatNumber(filtered.length, locale)})}</p>
    {filtered.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(p => <ProductCard key={p.id} product={p} isDemo={catalog.isDemo&&catalog.source!=='database'}/>)}</div> : <div className="rounded-3xl border border-dashed border-roya-line bg-white p-12 text-center"><p className="mb-5 text-roya-muted">{t(catalog.products.length ? 'empty' : 'noProducts')}</p>{catalog.products.length > 0 && <Button variant="secondary" onClick={() => {setQuery(''); setCategory('');}}>{t('reset')}</Button>}</div>}
  </>;
}
