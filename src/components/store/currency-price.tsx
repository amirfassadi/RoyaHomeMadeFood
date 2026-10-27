'use client';
import {useLocale} from 'next-intl';
import {usePrototypeRegion} from './prototype-region';
import {usePricing} from './pricing-provider';
import {convertTomanMinor,formatMoney,pricingSnapshot} from '@/lib/pricing';
import {formatToman} from '@/lib/format';
import type {Locale} from '@/i18n/routing';

export function CurrencyPrice({toman,enabled=true}:{toman:number;enabled?:boolean}){
  const locale=useLocale() as Locale,region=usePrototypeRegion(),p=usePricing();
  if(!enabled||!region.isDemo||region.country==='IR')return <>{formatToman(toman,locale)}</>;
  const snapshot=p.ready?pricingSnapshot(region.country,p.rates,p.policy):null;
  if(!snapshot)return <span className="text-xs text-roya-muted">{locale==='fa'?'نرخ ارز در دسترس نیست':'Exchange rate unavailable'}</span>;
  return <bdi>{formatMoney(convertTomanMinor(toman,snapshot),snapshot.currency,locale)}</bdi>;
}
