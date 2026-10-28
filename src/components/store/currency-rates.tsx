'use client';
import Link from 'next/link';
import {useLocale} from 'next-intl';
import {RefreshCw,ArrowUpRight,Coins} from 'lucide-react';
import {CountrySelect,usePrototypeRegion} from './prototype-region';
import {usePricing} from './pricing-provider';
import {FX_SCALE,currencyForCountry,pricingSnapshot} from '@/lib/pricing';
import {formatNumber,formatToman} from '@/lib/format';
import type {Locale} from '@/i18n/routing';

export function CurrencyRates({detailed=false}:{detailed?:boolean}){
  const locale=useLocale() as Locale,fa=locale==='fa',region=usePrototypeRegion(),p=usePricing();
  if(!region.isDemo)return null;
  const currency=currencyForCountry(region.country),r=p.rates,snapshot=pricingSnapshot(region.country,r,p.policy);
  const usdToman=p.policy.manualUsdToman??(r?r.usdTomanMicros/FX_SCALE:null);
  const display=(n:number|null)=>n===null?'—':formatToman(Math.round(n),locale);
  const fee=region.country==='IR'?0:p.policy.countryFees[region.country]??p.policy.feeBps;
  const oneLocal=currency==='IRT'?1:r&&usdToman?usdToman*FX_SCALE/r.unitsPerUsd[currency]:null;
  const updated=r?new Intl.DateTimeFormat(fa?'fa-IR':'en-GB',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(r.fetchedAt)):null;
  return <section aria-label={fa?'نرخ ارز و کشور خریدار':'Exchange rates and buyer country'} className={detailed?'section-shell py-10':'section-shell my-5'}>
    <div className="rounded-3xl border border-roya-line bg-white p-5 md:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="flex items-center gap-2 font-bold"><Coins size={19}/>{fa?'نرخ ارز و قیمت خرید شما':'Exchange rates & your prices'}</h2><p className="mt-2 text-xs leading-6 text-roya-muted">{fa?'با تغییر کشور، ارز محصولات و سبد تغییر می‌کند؛ مقدار محصولات ثابت می‌ماند.':'Changing country updates product and basket currency; quantities stay the same.'}</p></div>
        <div className="flex items-end gap-3"><CountrySelect id={detailed?'rates-country-detail':'rates-country'}/><button type="button" onClick={()=>void p.refresh()} disabled={p.loading} aria-label={fa?'به‌روزرسانی نرخ‌ها':'Refresh exchange rates'} className="min-h-11 rounded-xl border border-roya-line p-3 text-roya-green disabled:opacity-50"><RefreshCw size={18} className={p.loading?'animate-spin':''}/></button></div>
      </div>
      {(r?.sample||p.error||p.stale||(!r&&!p.loading&&p.ready))&&<div className="mb-5 rounded-2xl border border-roya-line bg-roya-cream p-4 text-sm leading-8"><p>{r?.sample?(fa?'نرخ نمونه فعال است؛ اعداد زیر ساختگی‌اند و قیمت بازار نیستند. فقط تبدیل ارز و تسویهٔ آزمایشی را تست کنید.':'Sample rates are active. These fictional values are not market prices; use them only to test currency conversion and simulated checkout.'):(fa?'اگر دریافت نرخ زنده ممکن نیست، می‌توانید با نرخ‌های مشخصاً نمونه جریان خرید را آزمایش کنید.':'If live rates are unavailable, you can test the shopping flow using explicitly fictional sample rates.')}</p><button type="button" className="mt-3 min-h-11 rounded-xl border border-roya-green px-4 py-2 text-roya-green disabled:opacity-50" disabled={p.loading} onClick={p.useSampleRates}>{fa?(r?.sample?'تازه‌سازی نرخ نمونه':'استفاده از نرخ نمونه برای آزمایش'):(r?.sample?'Reset sample rates':'Use sample rates for testing')}</button></div>}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [r?.sample?(fa?'تتر نمونه (USDT)':'Sample Tether (USDT)'):(fa?'هر تتر (USDT)':'1 Tether (USDT)'),display(r?r.usdtTomanMicros/FX_SCALE:null)],
          [r?.sample?(fa?'دلار نمونهٔ آزمایشی':'Fictional sample USD'):p.policy.manualUsdToman!==null?(fa?'دلار تعیین‌شدهٔ فروشگاه':'Store-set USD rate'):(fa?'دلار محاسباتی از تتر':'USD derived from Tether'),display(usdToman)],
          [currency==='IRT'?(fa?'ارز خرید داخل ایران':'Domestic currency'):(fa?`هر واحد ${currency}`:`1 ${currency}`),currency==='IRT'?(fa?'تومان':'Toman'):display(oneLocal)],
        ].map(([label,value])=><div key={label} className="rounded-2xl bg-roya-cream p-4"><p className="text-xs leading-6 text-roya-muted">{label}</p><p className="mt-2 text-lg font-bold text-roya-green"><bdi>{value}</bdi></p></div>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs leading-6">
        <span className="rounded-full bg-roya-leaf px-3 py-1 text-roya-green">{fa?'کارمزد خدمات: ':'Service fee: '}{formatNumber(fee/100,locale)}٪</span>
        <span role="status" className={p.error||p.stale?'text-roya-brown':'text-roya-muted'}>{p.loading?(fa?'در حال دریافت نرخ…':'Fetching rates…'):p.stale?(fa?'نرخ ذخیره‌شده قدیمی است؛ تسویه ارزی متوقف است.':'Cached rates are stale; currency checkout is paused.'):p.error?(fa?'دریافت تازه ناموفق بود؛ زمان نرخ ذخیره‌شده را بررسی کنید.':'Refresh failed; check the cached rate timestamp.'):updated?(fa?`زمان دریافت (تهران): ${updated}`:`Retrieved (Tehran): ${updated}`):(fa?'نرخی دریافت نشده است.':'No rates received.')}</span>
      </div>
      <p className="mt-3 text-xs leading-7 text-roya-muted">{fa?'دلار محاسباتی، نرخ دلار نقدی بازار نیست. قیمت کالاها پایه است؛ کارمزد پس از تخفیف و جدا از ارسال در سبد محاسبه می‌شود. این نسخه هیچ پرداخت واقعی انجام نمی‌دهد.':'The derived USD rate is not a cash-dollar market quote. Product prices are base prices; the service fee applies after discount, excluding delivery. This version never processes real payments.'}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-roya-green">
        <a href="https://apidocs.nobitex.ir/" target="_blank" rel="noreferrer" className="underline">{fa?'منبع تتر: نوبیتکس':'Tether source: Nobitex'}</a>
        <a href="https://docs.cdp.coinbase.com/coinbase-app/track-apis/exchange-rates" target="_blank" rel="noreferrer" className="underline">{fa?'تبدیل ارز: Coinbase':'FX conversion: Coinbase'}</a>
        {!detailed&&<Link href={`/${locale}/rates/`} className="flex items-center gap-1 underline">{fa?'جزئیات و محاسبهٔ نرخ':'Rate details & calculation'}<ArrowUpRight size={13}/></Link>}
      </div>
      {detailed&&<div className="mt-7 grid gap-6 border-t border-roya-line pt-6 md:grid-cols-2">
        <div><h3 className="mb-3 font-bold">{fa?'قیمت چگونه محاسبه می‌شود؟':'How pricing works'}</h3><ol className="list-decimal space-y-2 ps-5 text-sm leading-8 text-roya-muted"><li>{fa?'مبلغ پایه و تخفیف از قیمت‌های تومان فروشگاه محاسبه می‌شوند.':'The base subtotal and discount come from the store’s Toman prices.'}</li><li>{fa?'تتر/ریال به تومان تبدیل می‌شود؛ نرخ USDT برای هر دلار از Coinbase، دلار محاسباتی را می‌سازد.':'Tether/rial is converted to Toman; Coinbase’s USDT-per-USD cross rate gives the derived USD rate.'}</li><li>{fa?'مبلغ به ارز کشور تبدیل، سپس کارمزد تنظیم‌شده و هزینهٔ ارسال اضافه می‌شوند.':'Amounts convert to your currency; the configured fee and delivery are then added.'}</li><li>{fa?'نرخ و کارمزد در فاکتور ثبت می‌شوند. تغییر بعدی آن‌ها، سفارش ثبت‌شده را تغییر نمی‌دهد.':'The invoice saves its rates and fee. Later changes never rewrite a saved order.'}</li></ol></div>
        <div className="rounded-2xl bg-roya-leaf p-5 text-sm leading-8"><h3 className="mb-3 font-bold">{fa?'ارز انتخاب‌شده':'Selected currency'}</h3><p>{currency} · {snapshot&&r?`${formatNumber(r.unitsPerUsd[currency as keyof typeof r.unitsPerUsd]/FX_SCALE,locale)} ${currency} / USD`:fa?'نرخ معتبر برای خرید خارجی لازم است.':'A fresh rate is required for overseas checkout.'}</p><p className="my-3 text-xs">{fa?'کشور «سایر» با USD نمایش داده می‌شود. نرخ‌ها تا ۱۵ دقیقه برای این آزمایش معتبرند و قیمت تضمین‌شدهٔ صرافی نیستند.':'“Other” uses USD. Rates are accepted for up to 15 minutes in this test and are not guaranteed exchange quotes.'}</p><a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(`1 USD to ${currency==='IRT'?'EUR':currency}`)}`}>{fa?`تبدیل USD/${currency==='IRT'?'EUR':currency} در گوگل`:`Compare USD/${currency==='IRT'?'EUR':currency} on Google`}</a><span className="mx-3">·</span><a className="underline" target="_blank" rel="noreferrer" href={`https://www.xe.com/currencyconverter/convert/?Amount=1&From=USD&To=${currency==='IRT'?'EUR':currency}`}>XE</a></div>
      </div>}
    </div>
  </section>;
}
