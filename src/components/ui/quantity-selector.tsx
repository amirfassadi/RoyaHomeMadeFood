'use client';
import {Minus, Plus} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import type {Locale} from '@/i18n/routing';
import {formatNumber} from '@/lib/format';
export function QuantitySelector({value, minimum, step, maximum, onChange}: {
  value: number; minimum: number; step: number; maximum?: number; onChange: (value: number) => void;
}) {
  const t = useTranslations('Foundation');
  const locale = useLocale() as Locale;
  const adjust = (delta: number) => onChange(Math.round((value + delta) * 1000) / 1000);
  return <div className="inline-flex items-center gap-3 rounded-xl border border-roya-line bg-roya-cream p-1.5">
    <button type="button" aria-label={t('minus')} disabled={value - step < minimum} onClick={() => adjust(-step)} className="flex size-11 items-center justify-center rounded-lg bg-white text-roya-green transition-colors hover:bg-roya-leaf disabled:cursor-not-allowed disabled:opacity-40"><Minus size={18}/></button>
    <output aria-live="polite" className="min-w-24 text-center text-sm font-semibold">{formatNumber(value, locale)} {t('unit')}</output>
    <button type="button" aria-label={t('plus')} disabled={maximum != null && value + step > maximum} onClick={() => adjust(step)} className="flex size-11 items-center justify-center rounded-lg bg-roya-green text-white transition-colors hover:bg-roya-green-dark disabled:cursor-not-allowed disabled:opacity-40"><Plus size={18}/></button>
  </div>;
}
