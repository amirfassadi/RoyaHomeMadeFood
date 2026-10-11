'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import {useCart} from './cart-provider';
import {Button,buttonClasses} from '@/components/ui/button';
import type {ZoneView} from '@/lib/server/delivery-zones';
import {formatDate,formatToman} from '@/lib/format';
import type {Locale} from '@/i18n/routing';
import {checkoutSchema,type CheckoutInput} from '@/lib/validation/checkout';
import {calculateLineTotal,estimateDelivery} from '@/lib/domain/order';
type Quote={subtotalToman:number;discountToman:number;deliveryFeeToman:number;totalToman:number;estimatedDeliveryAt:string};
export type Receipt={trackingCode:string;totalToman:number;estimatedDeliveryAt:string;paymentMethod:string;paymentStatus:string;paymentUrl:string|null};
const inputClass='min-h-12 w-full rounded-xl border border-roya-line bg-white px-4 py-3 text-sm focus:border-roya-green focus:outline-none focus:ring-2 focus:ring-roya-leaf';
export function CheckoutForm({zones}:{zones:ZoneView[]}){
 const c=useCart(),t=useTranslations('Shop'),locale=useLocale() as Locale;
 const [zoneId,setZoneId]=useState(''),[quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<Receipt|null>(null),[attempted,setAttempted]=useState(false);
 const retryData=useRef<CheckoutInput|null>(null);
 const key=useRef<string|null>(null),form=useRef<HTMLFormElement>(null);
 const known=['INVALID','UNAVAILABLE','RATE_LIMIT','PRODUCT_CHANGED','QUANTITY_CHANGED','ZONE_CHANGED','DISCOUNT_INVALID','PRICE_CHANGED','PAYMENT_UNAVAILABLE','IDEMPOTENCY_CONFLICT','PAYMENT_AMOUNT'];
 const message=(code:string)=>t(known.includes(code)?code:'UNAVAILABLE');
 function payload(){const f=new FormData(form.current!);return {items:c.items,zoneId,discountCode:String(f.get('discountCode')??''),name:String(f.get('name')??''),mobile:String(f.get('mobile')??''),address:String(f.get('address')??''),notes:String(f.get('notes')??''),locale,paymentMethod:String(f.get('paymentMethod')??'CASH_ON_DELIVERY')};}
 async function request(path:string,body:unknown){const r=await fetch(`/api/shop/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error??'UNAVAILABLE');return data;}
 async function check(){
  if(!zoneId){setError(message('ZONE_CHANGED'));return;}
  setBusy(true);setError('');
  try{
   const p=payload();
   if(c.catalog.isDemo){const zone=zones.find(z=>z.id===zoneId)!;const products=c.items.map(i=>({i,p:c.catalog.products.find(p=>p.id===i.productId)!}));const subtotal=products.reduce((sum,{i,p})=>sum+calculateLineTotal(p.priceToman,i.quantity,p.priceBasisQuantity),0);setQuote({subtotalToman:subtotal,discountToman:0,deliveryFeeToman:zone.feeToman,totalToman:subtotal+zone.feeToman,estimatedDeliveryAt:estimateDelivery(new Date(),products.map(({p})=>p.preparationMinutes),zone.deliveryMinutes).toISOString()});}
   else setQuote(await request('quote',{items:p.items,zoneId:p.zoneId,discountCode:p.discountCode}));
   key.current=crypto.randomUUID();
  }catch(e){setError(message(e instanceof Error?e.message:'UNAVAILABLE'));setQuote(null);}finally{setBusy(false);}
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!quote || c.catalog.isDemo)return;
  const result=checkoutSchema.safeParse(attempted && retryData.current ? retryData.current : {...payload(),expectedTotal:quote.totalToman,idempotencyKey:key.current});
  if(!result.success){setError(message('INVALID'));return;}
  retryData.current=result.data;
  setBusy(true);setAttempted(true);setError('');
  try{
   const r:Receipt=await request('checkout',result.data);setReceipt(r);c.clear();
   try{sessionStorage.setItem('roya-receipt',JSON.stringify(r));}catch{}
   if(r.paymentUrl)window.location.assign(r.paymentUrl);
  }catch(e){const code=e instanceof Error?e.message:'UNAVAILABLE';setError(message(code));if(['PRICE_CHANGED','QUANTITY_CHANGED','PRODUCT_CHANGED','DISCOUNT_INVALID','ZONE_CHANGED','IDEMPOTENCY_CONFLICT'].includes(code)){setQuote(null);key.current=null;retryData.current=null;setAttempted(false);}}finally{setBusy(false);}
 }
 if(receipt)return <ReceiptCard receipt={receipt}/>;
 if(!c.ready)return <p role="status">{t('loading')}</p>;
 if(!c.items.length)return <><p className="mb-6">{t('empty')}</p><Link className={buttonClasses()} href={`/${locale}/catalog/`}>{t('shop')}</Link></>;
 return <form ref={form} onSubmit={submit} onChange={()=>{setQuote(null);key.current=null;setError('');}} className="grid gap-8 lg:grid-cols-[1fr_360px]">
  <fieldset disabled={busy || attempted} className="grid content-start gap-5 rounded-3xl border border-roya-line bg-white p-6 md:p-8">
   <p className="text-xs leading-7 text-roya-muted">{locale==='fa'?'بدون ثبت‌نام سفارش بدهید؛ عضویت در باشگاه اختیاری است.':'Place your order as a guest; joining our club is optional.'} <Link href={`/${locale}/account/`} className="text-roya-green underline">{locale==='fa'?'ورود / عضویت':'Sign in / join'}</Link></p>
   {c.catalog.isDemo && <p className="rounded-xl bg-roya-leaf p-4 text-sm leading-7">{t('demo')}</p>}
   <div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-2 text-sm">{t('name')}<input className={inputClass} name="name" required minLength={2} maxLength={100} autoComplete="name"/></label><label className="grid gap-2 text-sm">{t('mobile')}<input className={inputClass} name="mobile" required maxLength={32} inputMode="tel" autoComplete="tel" dir="ltr" placeholder="09123456789"/></label></div>
   <label className="grid gap-2 text-sm">{t('zone')}<select className={inputClass} value={zoneId} onChange={e=>setZoneId(e.target.value)} required><option value="">{t('chooseZone')}</option>{zones.map(z=><option key={z.id} value={z.id}>{locale==='fa'?`${z.cityFa} — ${z.nameFa}`:`${z.cityEn} — ${z.nameEn}`} ({formatToman(z.feeToman,locale)})</option>)}</select></label>
   {!zones.length && <p role="status">{t('noZones')}</p>}
   <label className="grid gap-2 text-sm">{t('address')}<textarea className={inputClass} name="address" required minLength={10} maxLength={1000} rows={3} autoComplete="street-address"/></label>
   <label className="grid gap-2 text-sm">{t('notes')}<textarea className={inputClass} name="notes" maxLength={1000} rows={2}/></label>
   <label className="grid gap-2 text-sm">{t('code')}<input className={inputClass} name="discountCode" maxLength={40} dir="ltr" disabled={c.catalog.isDemo}/></label>
   <fieldset className="grid gap-3"><legend className="mb-3 text-sm font-bold">{t('payment')}</legend>{(['CASH_ON_DELIVERY','ZARINPAL'] as const).map((method,index)=><label className="flex gap-3 rounded-xl border border-roya-line p-4 text-sm" key={method}><input type="radio" name="paymentMethod" value={method} defaultChecked={index===0}/>{t(method)}</label>)}</fieldset>
  </fieldset>
  <aside className="h-fit rounded-3xl border border-roya-line bg-white p-6"><h2 className="mb-6 text-xl font-bold">{t('total')}</h2>{quote?<><dl className="grid gap-4 text-sm">{(['subtotalToman','discountToman','deliveryFeeToman','totalToman'] as const).map((k,i)=><div className="flex justify-between gap-2" key={k}><dt>{t(['subtotal','discount','fee','total'][i])}</dt><dd className={i===3?'font-bold text-roya-green':''}>{formatToman(quote[k],locale)}</dd></div>)}</dl><p className="mt-6 text-sm font-bold">{t('eta')}</p><p className="mt-2 text-sm">{formatDate(quote.estimatedDeliveryAt,locale)}</p></>:<p className="text-sm text-roya-muted">{t('editQuote')}</p>}
   <p className="my-5 text-xs leading-6 text-roya-muted">{t('etaNote')}</p>
   {attempted && !busy && <p className="mb-4 text-xs leading-6">{t('retrySame')}</p>}{error && <p role="alert" className="mb-4 text-sm text-roya-brown">{error}</p>}
   <Button type="button" variant="secondary" className="mb-3 w-full" onClick={check} disabled={busy || attempted || !zones.length}>{busy?t('loading'):t('quote')}</Button>
   <Button type="submit" className="w-full" disabled={busy || !quote || c.catalog.isDemo}>{t('submit')}</Button>
  </aside>
 </form>;
}
export function ReceiptCard({receipt:r}:{receipt:Receipt}){
 const t=useTranslations('Shop'),locale=useLocale() as Locale;
 return <div className="mx-auto max-w-xl rounded-3xl border border-roya-line bg-white p-8"><h2 className="text-2xl font-bold text-roya-green">{t('saved')}</h2><p className="mt-5 text-sm">{t('trackingCode')}</p><p dir="ltr" className="my-3 break-all rounded-xl bg-roya-leaf p-4 text-center font-mono text-lg select-all">{r.trackingCode}</p><p className="text-sm leading-7">{t('saveCode')}</p><p className="my-4 font-bold">{formatToman(r.totalToman,locale)}</p><p className="text-sm">{t('eta')}: {formatDate(r.estimatedDeliveryAt,locale)}</p>{r.paymentMethod==='ZARINPAL' && r.paymentStatus!=='PAID' && <p className="mt-4 text-sm text-roya-brown">{t('pendingPayment')}</p>}<Link href={`/${locale}/tracking/`} className={`${buttonClasses()} mt-6`}>{t('tracking')}</Link></div>;
}
