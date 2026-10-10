'use client';
import {useState} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {Check, Clock3, Package, Leaf, ArrowUpRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {QuantitySelector} from '@/components/ui/quantity-selector';
import {calculateLineTotal} from '@/lib/domain/order';
import {formatToman} from '@/lib/format';
import type {Locale} from '@/i18n/routing';

export function ElementExamples() {
  const t = useTranslations('Foundation');
  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState(false);
  return <div className="grid gap-5 md:grid-cols-3">
    <Card><h3 className="mb-6 font-bold">{t('buttons')}</h3><div className="flex flex-col items-stretch gap-3">
      <Button onClick={() => setFeedback(true)}>{t('buttonPrimary')}<ArrowUpRight size={17}/></Button>
      <Button variant="secondary" onClick={() => setFeedback(true)}>{t('buttonSecondary')}</Button>
      <Button disabled>{t('buttonDisabled')}</Button>
    </div><p role="status" className="mt-3 min-h-6 text-xs text-roya-green-dark">{feedback ? t('buttonFeedback') : ''}</p></Card>
    <Card><h3 className="mb-6 font-bold">{t('fields')}</h3><label htmlFor="demo-name" className="mb-2 block text-sm">{t('fieldLabel')}</label>
      <input id="demo-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder={t('fieldPlaceholder')} aria-describedby="name-help" autoComplete="given-name" className="min-h-12 w-full rounded-xl border border-roya-line bg-roya-cream px-4 text-sm placeholder:text-stone-500"/>
      <p id="name-help" className="mt-3 text-xs leading-6 text-roya-muted">{t('fieldHelp')}</p><p aria-live="polite" className="mt-3 text-sm text-roya-green-dark">{name.trim() ? t('hello', {name: name.trim()}) : ''}</p>
    </Card>
    <Card><h3 className="mb-6 font-bold">{t('badges')}</h3><div className="flex flex-wrap gap-3">
      <Badge><Check size={13}/>{t('available')}</Badge><Badge tone="brown"><Clock3 size={13}/>{t('preparing')}</Badge>
      <Badge tone="neutral"><Package size={13}/>{t('soldOut')}</Badge><Badge><Leaf size={13}/>{t('fresh')}</Badge>
    </div></Card>
  </div>;
}
export function OrderRuleExample() {
  const t = useTranslations('Foundation');
  const locale = useLocale() as Locale;
  const [quantity, setQuantity] = useState(500);
  return <Card className="relative overflow-hidden"><div className="absolute -end-10 -top-10 size-40 rounded-full bg-roya-leaf/60" aria-hidden="true"/>
    <div className="relative"><span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-roya-leaf text-roya-green"><Package size={24} strokeWidth={1.5}/></span>
      <h3 className="text-xl font-bold">{t('sample')}</h3><p className="mt-2 text-sm text-roya-muted">{t('sampleDescription')}</p>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4"><span className="text-sm text-roya-muted">{t('priceBasis')}</span><span className="font-semibold">{formatToman(120000, locale)}</span></div>
      <div className="my-6"><QuantitySelector value={quantity} minimum={500} step={250} maximum={5000} onChange={setQuantity}/></div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-roya-line pt-5"><span className="text-sm">{t('price')}</span><output aria-live="polite" className="text-xl font-bold text-roya-green-dark">{formatToman(calculateLineTotal(120000, quantity, 1000), locale)}</output></div>
    </div>
  </Card>;
}
