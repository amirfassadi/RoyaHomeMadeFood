'use client';
import {CurrencyPrice} from '@/components/store/currency-price';
import Link from 'next/link';
import Image from 'next/image';
import {useLocale,useTranslations} from 'next-intl';
import {useCart} from './cart-provider';
import {Button,buttonClasses} from '@/components/ui/button';
import {QuantitySelector} from '@/components/ui/quantity-selector';
import {calculateLineTotal,validateQuantity} from '@/lib/domain/order';
import {formatToman} from '@/lib/format';
import type {Locale} from '@/i18n/routing';
import {usePrototypeRegion} from './prototype-region';
import {usePricing} from './pricing-provider';
import {formatMoney,pricingSnapshot,priceTotals} from '@/lib/pricing';
import {overseas} from '@/lib/prototype';
export function CartPage(){
 const c=useCart(),t=useTranslations('Shop'),units=useTranslations('Catalog'),locale=useLocale() as Locale,region=usePrototypeRegion(),pricing=usePricing();
 const foreign=c.catalog.isDemo&&overseas(region.country),snapshot=pricing.ready?pricingSnapshot(region.country,pricing.rates,pricing.policy):null;
 if(!c.ready)return <p role="status">{t('loading')}</p>;
 if(!c.items.length)return <div className="rounded-3xl bg-white p-8 text-center"><p className="mb-6">{t('empty')}</p><Link href={`/${locale}/catalog/`} className={buttonClasses()}>{t('shop')}</Link></div>;
 let subtotal=0,valid=true;
 const rows=c.items.map(i=>{
   const p=c.catalog.products.find(p=>p.id===i.productId);
   const limits=[p?.stockQuantity,p?.dailyCapacity].filter((n):n is number=>n!=null),max=limits.length?Math.min(...limits):undefined;
   const ok=p && validateQuantity(i.quantity,p.minOrderQuantity,p.orderStepQuantity,max);
   if(!ok)valid=false;
   let amount=0;try{if(p)amount=calculateLineTotal(p.priceToman,i.quantity,p.priceBasisQuantity);}catch{valid=false;}
   subtotal+=amount;
   return <article key={i.productId} className="flex flex-wrap items-center gap-5 rounded-2xl border border-roya-line bg-white p-5">
    {p?.media[0] && <Image src={p.media[0].url} alt={locale==='fa'?p.nameFa:p.nameEn} width={96} height={96} className="size-24 rounded-xl object-cover"/>}
    <div className="min-w-40 flex-1"><h2 className="mb-3 font-bold">{p?(locale==='fa'?p.nameFa:p.nameEn):t('PRODUCT_CHANGED')}</h2>{p && <QuantitySelector value={i.quantity} minimum={p.minOrderQuantity} step={p.orderStepQuantity} maximum={max} unit={units(p.unit)} onChange={q=>c.setQuantity(i.productId,q)}/>}<p className="mt-3 text-sm">{<CurrencyPrice toman={amount}/>}</p>{!ok && <p role="alert" className="mt-3 text-sm text-roya-brown">{t('itemChanged')}</p>}</div>
    {!ok && p && (max==null || max>=p.minOrderQuantity) && <Button variant="secondary" onClick={()=>c.setQuantity(i.productId,p.minOrderQuantity)}>{t('resetQuantity')}</Button>}<Button variant="ghost" onClick={()=>c.remove(i.productId)}>{t('remove')}</Button>
   </article>;
 });
 const totals=snapshot&&subtotal>0?priceTotals(subtotal,0,0,snapshot):null;
 return <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]"><div className="grid gap-4">{rows}</div><aside className="rounded-3xl border border-roya-line bg-white p-6"><p className="mb-2 text-sm">{t('subtotal')}</p><p className="text-2xl font-bold">{<CurrencyPrice toman={subtotal}/>}</p>{totals&&<dl className="mt-5 grid gap-3 text-sm"><div className="flex justify-between gap-3"><dt>{locale==='fa'?`کارمزد خدمات (${snapshot!.feeBps/100}٪)`:`Service fee (${snapshot!.feeBps/100}%)`}</dt><dd><bdi>{formatMoney(totals.feeMinor,snapshot!.currency,locale)}</bdi></dd></div><div className="flex justify-between gap-3 border-t border-roya-line pt-3 font-bold text-roya-green"><dt>{locale==='fa'?'جمع با کارمزد':'Total with fee'}</dt><dd><bdi>{formatMoney(totals.totalMinor,snapshot!.currency,locale)}</bdi></dd></div></dl>}<p className="my-5 text-xs leading-6 text-roya-muted">{t('previewSubtotal')}</p>{valid&&(!foreign||!!snapshot)?<Link href={`/${locale}/${c.catalog.isDemo&&overseas(region.country)?'international':'checkout'}/`} className={`${buttonClasses()} w-full`}>{t('continue')}</Link>:<p role="alert" className="text-sm leading-7 text-roya-brown">{foreign&&!snapshot?<>{locale==='fa'?'برای ادامهٔ خرید خارجی، نرخ ارز معتبر دریافت کنید.':'Refresh exchange rates to continue overseas checkout.'} <Link className="underline" href={`/${locale}/rates/`}>{locale==='fa'?'بررسی نرخ ارز':'Check exchange rates'}</Link></>:t('itemChanged')}</p>}{c.catalog.isDemo && <p className="mt-5 text-xs leading-6 text-roya-brown">{t('demo')}</p>}</aside></div>;
}
