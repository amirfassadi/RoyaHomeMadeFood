'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useLocale} from 'next-intl';
import {RefreshCw,ArrowUpRight,Coins} from 'lucide-react';
import {CountrySelect,usePrototypeRegion} from './prototype-region';
import {usePricing} from './pricing-provider';
import {FX_SCALE,FX_MAX_AGE,fxObservationFresh,currencyForCountry,pricingSnapshot,convertTomanMinor,priceTotals,formatMoney} from '@/lib/pricing';
import {parseTomanInput} from '@/lib/currency-converter';
import {formatNumber,formatToman} from '@/lib/format';
import type {Locale} from '@/i18n/routing';

export function CurrencyRates({detailed=false}:{detailed?:boolean}){
  const locale=useLocale() as Locale,fa=locale==='fa',region=usePrototypeRegion(),p=usePricing();
  const [amount,setAmount]=useState('1000000');
  if(!region.isDemo)return null;
  const currency=currencyForCountry(region.country),r=p.rates,snapshot=p.ready?pricingSnapshot(region.country,r,p.policy):null;
  const fxMeta=r?.fxMeta??p.feed?.fx?.fxMeta,daily=fxMeta?.provider==='currency-api';
  const sourceName=daily?'Currency API':'Coinbase';
  const dateLabel=daily?new Intl.DateTimeFormat(fa?'fa-IR':'en-GB',{dateStyle:'medium',timeZone:'Asia/Tehran'}).format(new Date(fxMeta.date+'T12:00:00Z')):null;
  const usdToman=p.ready?(p.policy.manualUsdToman??(r?r.usdTomanMicros/FX_SCALE:null)):null;
  const display=(n:number|null)=>n===null?'—':formatToman(Math.round(n),locale);
  const fee=region.country==='IR'?0:p.policy.countryFees[region.country]??p.policy.feeBps;
  const oneLocal=currency==='IRT'?1:r&&usdToman?usdToman*FX_SCALE/r.unitsPerUsd[currency]:null;
  const tether=r?.sample?(r.usdtTomanMicros/FX_SCALE):p.feed?.tether?p.feed.tether.usdtTomanMicros/FX_SCALE:r?r.usdtTomanMicros/FX_SCALE:null;
  const inputToman=parseTomanInput(amount),belowMinorUnit=!!(inputToman&&snapshot&&convertTomanMinor(inputToman,snapshot)===0),converted=inputToman&&snapshot&&!belowMinorUnit?priceTotals(inputToman,0,0,snapshot):null;
  const time=(value:string)=>new Intl.DateTimeFormat(fa?'fa-IR':'en-GB',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(value));
  const updated=r?new Intl.DateTimeFormat(fa?'fa-IR':'en-GB',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(r.fetchedAt)):null;
  return <section aria-label={fa?'نرخ ارز و کشور خریدار':'Exchange rates and buyer country'} className={detailed?'section-shell py-10':'section-shell my-5'}>
    <div className="rounded-3xl border border-roya-line bg-white p-5 md:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="flex items-center gap-2 font-bold"><Coins size={19}/>{fa?'نرخ ارز و قیمت خرید شما':'Exchange rates & your prices'}</h2><p className="mt-2 text-xs leading-6 text-roya-muted">{fa?'با تغییر کشور، ارز محصولات و سبد تغییر می‌کند؛ مقدار محصولات ثابت می‌ماند.':'Changing country updates product and basket currency; quantities stay the same.'}</p></div>
        <div className="flex flex-wrap items-end gap-3"><CountrySelect id={detailed?'rates-country-detail':'rates-country'}/><button type="button" onClick={()=>void p.refresh()} disabled={p.loading} aria-label={fa?'دریافت نرخ بازار':'Fetch market rates'} className="flex min-h-11 items-center gap-2 rounded-xl border border-roya-line p-3 text-sm text-roya-green disabled:opacity-50"><RefreshCw size={18} className={p.loading?'animate-spin':''}/><span>{fa?'نرخ بازار':'Market rates'}</span></button></div>
      </div>
      {daily&&!r?.sample&&<p role="status" className="mb-5 rounded-2xl bg-roya-leaf p-4 text-sm leading-8 text-roya-green">{fa?`نرخ جهانی روزانه · تاریخ داده: ${dateLabel}. منبع: Currency API. نرخ تتر نوبیتکس جداگانه دریافت می‌شود؛ این نرخ جهانی لحظه‌ای نیست.`:`Daily global rates · Data date: ${dateLabel}. Source: Currency API. Nobitex Tether is retrieved separately; these global rates are not live quotes.`}</p>}
      {(r?.sample||p.error||p.stale||(!r&&!p.loading&&p.ready))&&<div className="mb-5 rounded-2xl border border-roya-line bg-roya-cream p-4 text-sm leading-8"><p>{r?.sample?(fa?'نرخ نمونه فعال است؛ اعداد زیر ساختگی‌اند و قیمت بازار نیستند. این حالت فقط در همین صفحه فعال است؛ با بازخوانی صفحه نرخ واقعی دریافت می‌شود.':'Sample rates are active. These fictional values are not market prices. This mode applies only to this screen; reloading returns to market rates.'):(fa?'دریافت نرخ معتبر ناموفق بود. برای تلاش دوباره «نرخ بازار» را بزنید؛ ابزار نرخ ساختگی فقط برای آزمایش است.':'Valid rates could not be retrieved. Choose Market rates to retry; fictional rates are available only as a test tool.')}</p><details className="mt-3"><summary className="cursor-pointer text-sm text-roya-green">{fa?'ابزار آزمایش با نرخ ساختگی':'Test tool: fictional rates'}</summary><button type="button" className="mt-3 min-h-11 rounded-xl border border-roya-green px-4 py-2 text-roya-green disabled:opacity-50" disabled={p.loading} onClick={p.useSampleRates}>{fa?(r?.sample?'تازه‌سازی نرخ نمونه':'استفاده از نرخ نمونه برای آزمایش'):(r?.sample?'Reset sample rates':'Use sample rates for testing')}</button></details></div>}
      {p.policyError&&<p role="alert" className="mb-4 text-sm text-roya-brown">{fa?'سیاست قیمت‌گذاری فروشگاه دریافت نشد؛ قیمت خارجی موقتاً در دسترس نیست.':'Store pricing is unavailable. Overseas prices are temporarily paused.'} <button className="underline" onClick={()=>{void p.refreshPolicy();}}>{fa?'تلاش دوباره':'Retry'}</button></p>}<div className="grid gap-3 sm:grid-cols-3">
        {[
          [r?.sample?(fa?'تتر نمونه (USDT)':'Sample Tether (USDT)'):(fa?'هر تتر (USDT)':'1 Tether (USDT)'),display(tether)],
          [r?.sample?(fa?'دلار نمونهٔ آزمایشی':'Fictional sample USD'):p.policy.manualUsdToman!==null?(fa?'دلار تعیین‌شدهٔ فروشگاه':'Store-set USD rate'):(fa?'دلار محاسباتی از تتر':'USD derived from Tether'),display(usdToman)],
          [currency==='IRT'?(fa?'ارز خرید داخل ایران':'Domestic currency'):(fa?`هر واحد ${currency}`:`1 ${currency}`),currency==='IRT'?(fa?'تومان':'Toman'):display(oneLocal)],
        ].map(([label,value])=><div key={label} className="rounded-2xl bg-roya-cream p-4"><p className="text-xs leading-6 text-roya-muted">{label}</p><p className="mt-2 text-lg font-bold text-roya-green"><bdi>{value}</bdi></p></div>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs leading-6">
        <span className="rounded-full bg-roya-leaf px-3 py-1 text-roya-green">{fa?'کارمزد خدمات: ':'Service fee: '}{p.ready?`${formatNumber(fee/100,locale)}٪`:'—'}</span>
        <span role="status" className={p.error||p.stale?'text-roya-brown':'text-roya-muted'}>{p.loading?(fa?'در حال دریافت نرخ…':'Fetching rates…'):p.stale?(fa?'نرخ ذخیره‌شده قدیمی است؛ تسویه ارزی متوقف است.':'Cached rates are stale; currency checkout is paused.'):p.error?(fa?'دریافت تازه ناموفق بود؛ زمان نرخ ذخیره‌شده را بررسی کنید.':'Refresh failed; check the cached rate timestamp.'):updated?(fa?`زمان دریافت (تهران): ${updated}`:`Retrieved (Tehran): ${updated}`):(fa?'نرخی دریافت نشده است.':'No rates received.')}</span>
      </div>
      {p.feed&&!r?.sample&&<div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label={fa?'وضعیت منابع نرخ ارز':'Exchange rate source status'}>{(['nobitex','fx'] as const).map(key=>{
        const source=p.feed!.sources[key],aged=source.fetchedAt&&(Date.now()-Date.parse(source.fetchedAt)>=FX_MAX_AGE||(key==='fx'&&!fxObservationFresh(p.feed!.fx?.fxMeta)));
        const provider=p.feed!.fx?.fxMeta?.provider==='currency-api'?'Currency API':p.feed!.fx?'Coinbase':fa?'در دسترس نیست':'Unavailable';
        const label=key==='nobitex'?(fa?'تتر / نوبیتکس':'Tether / Nobitex'):(fa?`تبدیل ارز / ${provider}`:`FX / ${provider}`);
        return <div key={key} className="rounded-xl border border-roya-line p-3 text-xs leading-7"><strong>{label}</strong><p>{source.state==='unavailable'?(fa?'دریافت نشد؛ دوباره تلاش کنید.':'Unavailable; try again.'):aged||source.state==='stale'?(fa?'قدیمی؛ برای تسویه معتبر نیست.':'Stale; not valid for checkout.'):source.refreshFailed?(fa?'آخرین دریافت موفق؛ به‌روزرسانی ناموفق بود.':'Last successful retrieval; refresh failed.'):(fa?'دریافت معتبر':'Valid retrieval')}{source.fetchedAt&&<> · <bdi>{time(source.fetchedAt)}</bdi></>}</p></div>;
      })}</div>}
      <p className="mt-3 text-xs leading-7 text-roya-muted">{fa?'دلار محاسباتی، نرخ دلار نقدی بازار نیست. قیمت کالاها پایه است؛ کارمزد پس از تخفیف و جدا از ارسال در سبد محاسبه می‌شود. این نسخه هیچ پرداخت واقعی انجام نمی‌دهد.':'The derived USD rate is not a cash-dollar market quote. Product prices are base prices; the service fee applies after discount, excluding delivery. This version never processes real payments.'}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-roya-green">
        <a href="https://apidocs.nobitex.ir/" target="_blank" rel="noreferrer" className="underline">{fa?'منبع تتر: نوبیتکس':'Tether source: Nobitex'}</a>
        <a href={daily?'https://github.com/fawazahmed0/exchange-api':'https://docs.cdp.coinbase.com/coinbase-app/track-apis/exchange-rates'} target="_blank" rel="noreferrer" className="underline">{fa?`تبدیل ارز: ${sourceName}`:`FX conversion: ${sourceName}`}</a>
        {!detailed&&<Link href={`/${locale}/rates/`} className="flex items-center gap-1 underline">{fa?'جزئیات و محاسبهٔ نرخ':'Rate details & calculation'}<ArrowUpRight size={13}/></Link>}
      </div>
      {detailed&&<div className="mt-7 grid gap-6 border-t border-roya-line pt-6 md:grid-cols-2">
        <div><h3 className="mb-3 font-bold">{fa?'قیمت چگونه محاسبه می‌شود؟':'How pricing works'}</h3><ol className="list-decimal space-y-2 ps-5 text-sm leading-8 text-roya-muted"><li>{fa?'مبلغ پایه و تخفیف از قیمت‌های تومان فروشگاه محاسبه می‌شوند.':'The base subtotal and discount come from the store’s Toman prices.'}</li><li>{fa?`تتر/ریال به تومان تبدیل می‌شود؛ نرخ USDT برای هر دلار از ${sourceName}، دلار محاسباتی را می‌سازد.`:`Tether/rial is converted to Toman; the ${sourceName} USDT-per-USD cross rate gives the derived USD rate.`}</li><li>{fa?'مبلغ به ارز کشور تبدیل، سپس کارمزد تنظیم‌شده و هزینهٔ ارسال اضافه می‌شوند.':'Amounts convert to your currency; the configured fee and delivery are then added.'}</li><li>{fa?'نرخ و کارمزد در فاکتور ثبت می‌شوند. تغییر بعدی آن‌ها، سفارش ثبت‌شده را تغییر نمی‌دهد.':'The invoice saves its rates and fee. Later changes never rewrite a saved order.'}</li></ol></div>
        <div className="rounded-2xl bg-roya-leaf p-5 text-sm leading-8"><h3 className="mb-3 font-bold">{fa?'ارز انتخاب‌شده':'Selected currency'}</h3><p>{currency} · {snapshot&&r?`${formatNumber(r.unitsPerUsd[currency as keyof typeof r.unitsPerUsd]/FX_SCALE,locale)} ${currency} / USD`:fa?'نرخ معتبر برای خرید خارجی لازم است.':'A fresh rate is required for overseas checkout.'}</p><p className="my-3 text-xs">{fa?'کشور «سایر» با USD نمایش داده می‌شود. نرخ‌ها تا ۱۵ دقیقه برای این آزمایش معتبرند و قیمت تضمین‌شدهٔ صرافی نیستند.':'“Other” uses USD. Rates are accepted for up to 15 minutes in this test and are not guaranteed exchange quotes.'}</p><a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(`1 USD to ${currency==='IRT'?'EUR':currency}`)}`}>{fa?`تبدیل USD/${currency==='IRT'?'EUR':currency} در گوگل`:`Compare USD/${currency==='IRT'?'EUR':currency} on Google`}</a><span className="mx-3">·</span><a className="underline" target="_blank" rel="noreferrer" href={`https://www.xe.com/currencyconverter/convert/?Amount=1&From=USD&To=${currency==='IRT'?'EUR':currency}`}>XE</a></div>
      </div>}
      {detailed&&<div className="mt-7 border-t border-roya-line pt-6">
        <h3 className="font-bold">{fa?'مبدل مبلغ و پیش‌نمایش کارمزد':'Amount converter & fee preview'}</h3>
        <p className="mt-2 text-xs leading-7 text-roya-muted">{fa?'مبلغ پایهٔ غذا به تومان را وارد کنید. این محاسبه از همان نرخ و کارمزد سبد استفاده می‌کند؛ تخفیف و ارسال در آن صفر است.':'Enter a food amount in Toman. This uses the basket’s rate and fee, with zero discount and delivery.'}</p>
        <label htmlFor="rates-amount" className="mt-4 grid max-w-sm gap-2 text-sm"><span>{fa?'مبلغ پایه (تومان)':'Base amount (Toman)'}</span><input id="rates-amount" type="text" inputMode="numeric" value={amount} onChange={event=>setAmount(event.target.value)} maxLength={20} aria-invalid={inputToman===null} aria-describedby="rates-amount-result" className="min-h-11 rounded-xl border border-roya-line px-4 py-3"/></label>
        <div id="rates-amount-result" aria-live="polite" className="mt-4 rounded-2xl bg-roya-cream p-4 text-sm leading-8">
          {!inputToman?<p>{fa?'یک مبلغ صحیح از ۱ تا ۱٬۰۰۰٬۰۰۰٬۰۰۰ تومان وارد کنید.':'Enter a whole amount from 1 to 1,000,000,000 Toman.'}</p>:currency==='IRT'?<p>{fa?'مبلغ داخلی: ':'Domestic amount: '}<bdi>{formatMoney(inputToman,'IRT',locale)}</bdi> · {fa?'برای تبدیل ارز کشور دیگری انتخاب کنید.':'Select another country to convert currencies.'}</p>:belowMinorUnit?<p>{fa?'مبلغ پس از تبدیل از کوچک‌ترین واحد این ارز کمتر است؛ مبلغ بزرگ‌تری وارد کنید.':'The converted amount is below this currency’s smallest unit. Enter a larger amount.'}</p>:converted?<dl className="grid gap-2 sm:grid-cols-3">{[
            [fa?'مبلغ تبدیل‌شده':'Converted amount',converted.subtotalMinor],
            [fa?`کارمزد ${formatNumber(fee/100,locale)}٪`:`Fee ${fee/100}%`,converted.feeMinor],
            [fa?'جمع با کارمزد':'Total including fee',converted.totalMinor],
          ].map(([label,value])=><div key={String(label)}><dt className="text-xs text-roya-muted">{label}</dt><dd className="font-bold text-roya-green"><bdi>{formatMoney(Number(value),currency,locale)}</bdi></dd></div>)}</dl>:<p>{fa?'برای محاسبه، نرخ تازه و سیاست قیمت‌گذاری معتبر لازم است.':'Fresh rates and a valid pricing policy are required.'}</p>}
        </div>
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[420px] text-start text-sm"><caption className="pb-3 text-start font-bold">{fa?'نرخ ارزهای پشتیبانی‌شده، بدون کارمزد':'Supported currency rates, excluding fees'}</caption><thead><tr className="border-b border-roya-line text-xs text-roya-muted"><th scope="col" className="p-3 text-start">{fa?'ارز':'Currency'}</th><th scope="col" className="p-3 text-start">{fa?'۱ دلار به ارز':'1 USD in currency'}</th><th scope="col" className="p-3 text-start">{fa?'۱ واحد به تومان':'1 unit in Toman'}</th></tr></thead><tbody>{(['USD','EUR','GBP','AED','TRY','CAD'] as const).map(code=>{
          const fx=r?.unitsPerUsd??p.feed?.fx?.unitsPerUsd,unit=fx?.[code];
          return <tr key={code} className={`border-b border-roya-line ${currency===code?'bg-roya-leaf':''}`}><th scope="row" className="p-3 text-start">{code}{currency===code&&<span className="ms-2 text-xs text-roya-green">{fa?'انتخاب شما':'Selected'}</span>}</th><td className="p-3"><bdi>{unit?formatNumber(unit/FX_SCALE,locale):'—'}</bdi></td><td className="p-3"><bdi>{unit&&usdToman?display(usdToman*FX_SCALE/unit):'—'}</bdi></td></tr>;
        })}</tbody></table></div>
        <p className="mt-3 text-xs leading-7 text-roya-muted">{fa?'زمان دریافت، زمان بررسی منبع است؛ تاریخ دادهٔ نرخ روزانه جدا نمایش داده می‌شود. دادهٔ روزانهٔ دو روز قبل یا قدیمی‌تر برای محاسبه پذیرفته نمی‌شود. دریافت ناموفق، زمان ذخیره‌شده را عوض نمی‌کند. تتر، USDC و دلار سه دارایی متفاوت‌اند.':'Retrieval time shows when the source was checked; the daily observation date is shown separately. Daily data from two or more days ago is rejected for pricing. A failed refresh never changes a cached timestamp. USDT, USDC and USD are different assets.'}</p>
      </div>}
    </div>
  </section>;
}
