'use client';
import {useState} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import type {ProductView} from '@/lib/catalog/types';
import type {Locale} from '@/i18n/routing';
import {QuantitySelector} from '@/components/ui/quantity-selector';
import {formatToman} from '@/lib/format';
import {calculateLineTotal} from '@/lib/domain/order';
import {Button} from '@/components/ui/button';
export function ProductQuantity({product: p}: {product: ProductView}) {
  const [quantity, setQuantity] = useState(p.minOrderQuantity), t = useTranslations('Catalog'), locale = useLocale() as Locale;
  const limits = [p.stockQuantity, p.dailyCapacity].filter((n): n is number => n != null);
  const maximum = limits.length ? Math.min(...limits) : undefined;
  const available = maximum == null || maximum >= p.minOrderQuantity;
  return <div className="rounded-2xl border border-roya-line bg-white p-5"><p className="mb-3 text-sm font-semibold">{t('quantity')}</p>
    {available ? <QuantitySelector value={quantity} minimum={p.minOrderQuantity} step={p.orderStepQuantity} maximum={maximum} unit={t(p.unit)} onChange={setQuantity}/> : <p className="text-sm text-roya-muted">{t('outOfStock')}</p>}
    <div className="my-5 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-roya-muted">{t('total')}</span><output aria-live="polite" className="text-xl font-bold text-roya-green-dark">{formatToman(calculateLineTotal(p.priceToman, quantity, p.priceBasisQuantity), locale)}</output></div>
    <Button disabled className="w-full">{t('buyLater')}</Button><p className="mt-3 text-xs leading-6 text-roya-muted">{t('buyNote')}</p>
  </div>;
}
