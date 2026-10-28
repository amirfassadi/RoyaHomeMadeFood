'use client';
import {useLocale} from 'next-intl';
import {FX_SCALE,formatMoney,type PricedTotals} from '@/lib/pricing';
import {formatToman} from '@/lib/format';
import type {Locale} from '@/i18n/routing';

export function PricingSummary({totals}:{totals:PricedTotals}){
  const locale=useLocale() as Locale,fa=locale==='fa',s=totals.snapshot;
  const rows:[string,number][]=[
    [fa?'جمع پایهٔ محصولات':'Base subtotal',totals.subtotalMinor],
    [fa?'تخفیف':'Discount',-totals.discountMinor],
    [fa?`کارمزد خدمات (${s.feeBps/100}٪)`:`Service fee (${s.feeBps/100}%)`,totals.feeMinor],
    [fa?'ارسال':'Delivery',totals.deliveryMinor],
    [fa?'مبلغ کل':'Total',totals.totalMinor],
  ];
  return <div><dl className="grid gap-3 text-sm">{rows.map(([label,amount],index)=><div key={label} className={`flex justify-between gap-3 ${index===4?'border-t border-roya-line pt-3 font-bold text-roya-green':''}`}><dt>{label}</dt><dd><bdi>{formatMoney(amount,s.currency,locale)}</bdi></dd></div>)}</dl><p className="mt-4 text-xs leading-7 text-roya-muted">{fa?'نرخ دلار ثبت‌شده: ':'Saved USD rate: '}{formatToman(Math.round(s.usdTomanMicros/FX_SCALE),locale)} · {s.dollarSource==='sample'?(fa?'نمونهٔ ساختگی؛ قیمت بازار نیست':'fictional sample; not a market price'):s.dollarSource==='manual'?(fa?'دستی':'manual'):(fa?'محاسباتی از تتر':'derived from Tether')}</p><p className="text-xs leading-7 text-roya-muted">{fa?'زمان دریافت نرخ: ':'Rate retrieval time: '}{new Intl.DateTimeFormat(fa?'fa-IR':'en-GB',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(s.asOf))}</p></div>;
}
