'use client';
import {useRef,useState,useEffect} from 'react';
import {CheckoutMobile,type MobileProof} from './checkout-mobile';
import {mobileSchema} from '@/lib/validation/checkout';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import {useCart} from './cart-provider';
import {Button,buttonClasses} from '@/components/ui/button';
import type {ZoneView} from '@/lib/server/delivery-zones';
import {formatDate,formatToman} from '@/lib/format';
import type {Locale} from '@/i18n/routing';
import {internationalCheckoutSchema,domesticCheckoutSchema,type CheckoutInput} from '@/lib/validation/checkout';
import {formatUsd} from '@/lib/international';
import {calculateLineTotal,estimateDelivery} from '@/lib/domain/order';
import {LocationPicker,type MapLocation} from '@/components/ui/location-picker';
import {PrototypeCheckout} from './prototype-checkout';
import type {BankTransferDetails} from '@/lib/validation/bank-transfer';
import {CheckoutRequestError,canEditAfterCheckoutFailure} from '@/lib/domain/checkout-request';
type Quote={deliveryProvider?:string;deliveryTestMode?:boolean;amountUsdCents?:number;tomanPerUsd?:number;rateExpiresAt?:string;subtotalToman:number;discountToman:number;deliveryFeeToman:number;totalToman:number;estimatedDeliveryAt:string};
export type Receipt={status?:string;reservationExpiresAt?:string|null;reservationExpiredAt?:string|null;refundRequired?:boolean;invoiceNumber?:string|null;paymentReference?:string|null;bankTransfer?:(Omit<BankTransferDetails,'accounts'>&{accounts?:BankTransferDetails['accounts']})|null;amountUsdCents?:number;trackingCode:string;totalToman:number;estimatedDeliveryAt:string|null;paymentMethod:string;paymentStatus:string;paymentUrl:string|null};
const inputClass='min-h-12 w-full rounded-xl border border-roya-line bg-white px-4 py-3 text-sm focus:border-roya-green focus:outline-none focus:ring-2 focus:ring-roya-leaf';
export function CheckoutForm({zones,international=false}:{zones:ZoneView[];international?:boolean}){
 const c=useCart();
 return c.catalog.isDemo?<PrototypeCheckout international={international}/>:<LiveCheckoutForm zones={zones} international={international}/>;
}
function LiveCheckoutForm({zones,international=false}:{zones:ZoneView[];international?:boolean}){
 const c=useCart(),t=useTranslations('Shop'),locale=useLocale() as Locale;
 const [zoneId,setZoneId]=useState(''),[quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<Receipt|null>(null),[attempted,setAttempted]=useState(false);
 const [mobile,setMobile]=useState(''),[mobileProof,setMobileProof]=useState<MobileProof|null>(null);
 const normalizedMobile=mobileSchema.safeParse(mobile);
 const [destination,setDestination]=useState<MapLocation|null>(null);
 const [shippingEnabled,setShippingEnabled]=useState<boolean|null>(null);
 useEffect(()=>{const controller=new AbortController();fetch('/api/shop/shipping/',{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>setShippingEnabled(d.enabled===true)).catch(()=>{});return()=>controller.abort();},[]);
 const [choosingPayment,setChoosingPayment]=useState(false);
 const [paymentMethods,setPaymentMethods]=useState<{BANK_TRANSFER:boolean;ZARINPAL:boolean}|null>(null);
 const [paymentMethod,setPaymentMethod]=useState<'BANK_TRANSFER'|'ZARINPAL'>('BANK_TRANSFER');
 useEffect(()=>{if(international)return;const controller=new AbortController();fetch('/api/shop/payment-methods/',{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(value=>{const methods={BANK_TRANSFER:value.BANK_TRANSFER===true,ZARINPAL:value.ZARINPAL===true};setPaymentMethods(methods);setPaymentMethod(methods.BANK_TRANSFER?'BANK_TRANSFER':'ZARINPAL');}).catch(()=>{});return()=>controller.abort();},[international]);
 const [foreignReady,setForeignReady]=useState(false);
 useEffect(()=>{if(!international||c.catalog.isDemo)return;const controller=new AbortController();fetch('/api/international/availability/',{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).then(d=>setForeignReady(d?.ready===true)).catch(()=>{});return()=>controller.abort();},[international,c.catalog.isDemo]);
 const retryData=useRef<CheckoutInput|null>(null);
 const key=useRef<string|null>(null),form=useRef<HTMLFormElement>(null);
 useEffect(()=>{if(choosingPayment)form.current?.querySelector<HTMLInputElement>('input[name=paymentMethod]')?.focus();},[choosingPayment]);
 const known=['INVALID','UNAVAILABLE','RATE_LIMIT','PRODUCT_CHANGED','QUANTITY_CHANGED','ZONE_CHANGED','DISCOUNT_INVALID','PRICE_CHANGED','PAYMENT_UNAVAILABLE','IDEMPOTENCY_CONFLICT','PAYMENT_AMOUNT'];
 const message=(code:string)=>code==='MOBILE_VERIFICATION_REQUIRED'?(locale==='fa'?'تأیید شماره موبایل لازم است؛ کد تازه بگیرید.':'Verify your mobile with a fresh SMS code.'):code==='MOBILE_VERIFICATION_UNAVAILABLE'?(locale==='fa'?'تأیید پیامکی فعلاً در دسترس نیست.':'SMS verification is unavailable.'):code==='BANK_TRANSFER_UNAVAILABLE'?(locale==='fa'?'پرداخت کارت‌به‌کارت هنوز فعال نیست؛ مدیر باید حساب بانکی فعال ثبت کند.':'Bank transfer is unavailable; the store must configure an active bank account.'):code==='DELIVERY_LOCATION_REQUIRED'?(locale==='fa'?'برای استعلام الوپیک، موقعیت مقصد را مشخص کنید.':'Select destination coordinates for Alopeyk.'):code==='DELIVERY_UNAVAILABLE'?(locale==='fa'?'استعلام کرایه الوپیک در دسترس نیست؛ دوباره تلاش کنید.':'Alopeyk quote unavailable; please retry.'):t(known.includes(code)?code:'UNAVAILABLE');
 function payload(){const f=new FormData(form.current!);return {items:c.items,zoneId,discountCode:String(f.get('discountCode')??''),name:String(f.get('name')??''),mobile:String(f.get('mobile')??''),address:String(f.get('address')??''),...(destination?{destination}:{}),notes:String(f.get('notes')??''),locale,paymentMethod:international?'BTCPAY':paymentMethod,...(international?{buyerEmail:String(f.get('buyerEmail')??'')}:{})};}
 async function request(path:string,body:unknown){const r=await fetch(`/api/${international?'international':'shop'}/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new CheckoutRequestError(data.error??'UNAVAILABLE',data.checkoutNotStarted===true);return data;}
 async function check(){
  if(international&&!foreignReady){setError(message('PAYMENT_UNAVAILABLE'));return;}
  if(shippingEnabled===null){setError(message('DELIVERY_UNAVAILABLE'));return;}
  if(shippingEnabled&&!destination){setError(message('DELIVERY_LOCATION_REQUIRED'));return;}
  if(!zoneId){setError(message('ZONE_CHANGED'));return;}
  setBusy(true);setError('');
  try{
   const p=payload();
   if(c.catalog.isDemo){const zone=zones.find(z=>z.id===zoneId)!;const products=c.items.map(i=>({i,p:c.catalog.products.find(p=>p.id===i.productId)!}));const subtotal=products.reduce((sum,{i,p})=>sum+calculateLineTotal(p.priceToman,i.quantity,p.priceBasisQuantity),0);setQuote({subtotalToman:subtotal,discountToman:0,deliveryFeeToman:zone.feeToman,totalToman:subtotal+zone.feeToman,estimatedDeliveryAt:estimateDelivery(new Date(),products.map(({p})=>p.preparationMinutes),zone.deliveryMinutes).toISOString()});}
   else setQuote(await request('quote',{items:p.items,zoneId:p.zoneId,discountCode:p.discountCode,destination:p.destination}));
   key.current=crypto.randomUUID();
  }catch(e){setError(message(e instanceof Error?e.message:'UNAVAILABLE'));setQuote(null);}finally{setBusy(false);}
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;if(!international&&!choosingPayment){if(quote)setChoosingPayment(true);return;}if(!quote || c.catalog.isDemo || (international&&!foreignReady)||(!international&&!paymentMethods?.[paymentMethod]))return;
  const result=(international?internationalCheckoutSchema:domesticCheckoutSchema).safeParse(attempted && retryData.current ? retryData.current : {...payload(),expectedTotal:quote.totalToman,idempotencyKey:key.current,...(mobileProof?{mobileProof:{challengeId:mobileProof.challengeId,token:mobileProof.token}}:{}),...(international?{expectedUsdCents:quote.amountUsdCents}:{})});
  if(!result.success){setError(message('INVALID'));return;}
  if(!attempted&&(!mobileProof||Date.parse(mobileProof.expiresAt)<=Date.now())){setMobileProof(null);setError(locale==='fa'?'ابتدا شماره موبایل را با کد پیامک تأیید کنید.':'Verify your mobile by SMS before ordering.');return;}
  retryData.current=result.data;
  setBusy(true);setAttempted(true);setError('');
  try{
   const r:Receipt=await request('checkout',result.data);setReceipt(r);c.clear();
   try{sessionStorage.setItem('roya-receipt',JSON.stringify(r));}catch{}
   if(r.paymentUrl)window.location.assign(r.paymentUrl);
  }catch(e){const code=e instanceof Error?e.message:'UNAVAILABLE';setError(message(code));if(canEditAfterCheckoutFailure(e)||['PRICE_CHANGED','QUANTITY_CHANGED','PRODUCT_CHANGED','DISCOUNT_INVALID','ZONE_CHANGED','IDEMPOTENCY_CONFLICT','DELIVERY_UNAVAILABLE','DELIVERY_LOCATION_REQUIRED'].includes(code)){setQuote(null);key.current=null;retryData.current=null;setAttempted(false);}}finally{setBusy(false);}
 }
 if(receipt)return <ReceiptCard receipt={receipt}/>;
 if(!c.ready)return <p role="status">{t('loading')}</p>;
 if(!c.items.length)return <><p className="mb-6">{t('empty')}</p><Link className={buttonClasses()} href={`/${locale}/catalog/`}>{t('shop')}</Link></>;
 return <form ref={form} onSubmit={submit} onChange={e=>{if(e.target instanceof Element&&e.target.closest('[data-checkout-mobile]'))return;if(e.target instanceof HTMLInputElement && e.target.name==='paymentMethod')return;setChoosingPayment(false);setQuote(null);key.current=null;setError('');}} className="grid gap-8 lg:grid-cols-[1fr_360px]">
  <fieldset disabled={busy || attempted} className="grid content-start gap-5 rounded-3xl border border-roya-line bg-white p-6 md:p-8">
   <p className="text-xs leading-7 text-roya-muted">{locale==='fa'?'خرید بدون عضویت امکان‌پذیر است؛ تأیید شماره موبایل با پیامک الزامی است.':'Guest checkout is available; SMS mobile verification is required.'} <Link href={`/${locale}/account/`} className="text-roya-green underline">{locale==='fa'?'ورود / عضویت':'Sign in / join'}</Link></p>
   {c.catalog.isDemo && <p className="rounded-xl bg-roya-leaf p-4 text-sm leading-7">{t('demo')}</p>}
   {international&&<div className="grid gap-4"><p className="rounded-xl bg-roya-leaf p-4 text-sm leading-7">{locale==='fa'?'مشخصات زیر متعلق به گیرنده در ایران است. برای پیگیری، کد سفارش و موبایل گیرنده را نگه دارید.':'The details below belong to your recipient in Iran. Save the tracking code and recipient mobile to track the order.'}</p>{!foreignReady&&!c.catalog.isDemo&&<p role="status" className="text-sm leading-7 text-roya-brown">{locale==='fa'?'پرداخت ارزی هنوز در دسترس نیست؛ اتصال درگاه، نرخ معتبر و تشخیص معتبر کشور خارج ایران لازم است.':'International payment is currently unavailable. A configured gateway, valid exchange rate and verified overseas connection are required.'}</p>}<label className="grid gap-2 text-sm">{locale==='fa'?'ایمیل شما (خریدار)':'Your email (buyer)'}<input className={inputClass} type="email" name="buyerEmail" required maxLength={254} dir="ltr" autoComplete="email"/></label></div>}
   <div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-2 text-sm">{t('name')}<input className={inputClass} name="name" required minLength={2} maxLength={100} autoComplete="name"/></label><label className="grid gap-2 text-sm">{t('mobile')}<input className={inputClass} name="mobile" value={mobile} onChange={e=>{const next=mobileSchema.safeParse(e.target.value);if(!next.success||!normalizedMobile.success||next.data!==normalizedMobile.data)setMobileProof(null);setMobile(e.target.value);}} required maxLength={32} inputMode="tel" autoComplete="tel" dir="ltr" placeholder="09123456789"/></label></div>
   {normalizedMobile.success&&<CheckoutMobile key={normalizedMobile.data} mobile={normalizedMobile.data} fa={locale==='fa'} onVerified={setMobileProof}/>}
   <label className="grid gap-2 text-sm">{t('zone')}<select className={inputClass} value={zoneId} onChange={e=>setZoneId(e.target.value)} required><option value="">{t('chooseZone')}</option>{zones.map(z=><option key={z.id} value={z.id}>{locale==='fa'?`${z.cityFa} — ${z.nameFa}`:`${z.cityEn} — ${z.nameEn}`}{shippingEnabled?'':` (${formatToman(z.feeToman,locale)})`}</option>)}</select></label>
   {!zones.length && <p role="status">{t('noZones')}</p>}
   <label className="grid gap-2 text-sm">{t('address')}<textarea className={inputClass} name="address" required minLength={10} maxLength={1000} rows={3} autoComplete="street-address"/></label>
   {shippingEnabled&&<LocationPicker value={destination} disabled={busy||attempted} locale={locale} onChange={point=>{setDestination(point);setQuote(null);setChoosingPayment(false);key.current=null;setError('');}}/>}
   {shippingEnabled===null&&<p role="status" className="text-sm">{locale==='fa'?'در حال دریافت تنظیمات ارسال؛ اگر ادامه پیدا کرد صفحه را تازه کنید.':'Loading delivery settings; refresh if this continues.'}</p>}
   <label className="grid gap-2 text-sm">{t('notes')}<textarea className={inputClass} name="notes" maxLength={1000} rows={2}/></label>
   <label className="grid gap-2 text-sm">{t('code')}<input className={inputClass} name="discountCode" maxLength={40} dir="ltr" disabled={c.catalog.isDemo}/></label>
   <fieldset hidden={!international&&!choosingPayment} className="gap-3"><legend className="mb-3 text-sm font-bold">{t('payment')}</legend>{(international?['BTCPAY'] as const:['ZARINPAL','BANK_TRANSFER'] as const).map((method)=><label className="flex gap-3 rounded-xl border border-roya-line p-4 text-sm" key={method}><input type="radio" name="paymentMethod" value={method} checked={method==='BTCPAY'||paymentMethod===method} disabled={method!=='BTCPAY'&&!paymentMethods?.[method]} onChange={()=>{if(method!=='BTCPAY')setPaymentMethod(method);}}/>{method==='BTCPAY'?(locale==='fa'?'کریپتو از طریق BTCPay':'Crypto via BTCPay'):method==='BANK_TRANSFER'?(locale==='fa'?'کارت به کارت / پایا / پل':'Card transfer / Paya / Pol'):(locale==='fa'?'پرداخت آنلاین با زرین‌پال':'Online payment with Zarinpal')}</label>)}{!international&&<p role="status" className="mt-3 text-sm leading-7 text-roya-muted">{paymentMethods===null?(locale==='fa'?'در حال بررسی روش‌های پرداخت؛ اگر ادامه پیدا کرد صفحه را تازه کنید.':'Checking payment methods; refresh if this continues.'):!paymentMethods.BANK_TRANSFER&&!paymentMethods.ZARINPAL?(locale==='fa'?'هنوز روش پرداخت فعالی تنظیم نشده است. مدیر باید حساب بانکی را در تنظیمات فروشگاه ثبت و فعال کند.':'No payment method is available. The store must configure a bank account.'):locale==='fa'?'روش‌های غیرفعال هنوز تنظیم نشده‌اند. واریز بانکی پس از تأیید مدیر قطعی می‌شود.':'Unavailable methods are not configured. Bank transfers require store confirmation.'}</p>}</fieldset>
  </fieldset>
  <aside className="h-fit rounded-3xl border border-roya-line bg-white p-6"><h2 className="mb-6 text-xl font-bold">{t('total')}</h2>{quote?<><dl className="grid gap-4 text-sm">{(['subtotalToman','discountToman','deliveryFeeToman','totalToman'] as const).map((k,i)=><div className="flex justify-between gap-2" key={k}><dt>{t(['subtotal','discount','fee','total'][i])}</dt><dd className={i===3?'font-bold text-roya-green':''}>{formatToman(quote[k],locale)}</dd></div>)}</dl>{quote.deliveryProvider==='ALOPEYK'&&<div className="mt-4 grid gap-2 text-sm"><p>{quote.deliveryTestMode?(locale==='fa'?'استعلام آزمایشی؛ ثبت سفارش غیرفعال است.':'Test quote; checkout disabled.'):(locale==='fa'?'کرایه در زمان ثبت سفارش دوباره بررسی می‌شود.':'Fare is checked again at checkout.')}</p></div>}{international&&quote.amountUsdCents!==undefined&&<div className="mt-5 grid gap-3 rounded-xl bg-roya-leaf p-4 text-sm"><strong>{formatUsd(quote.amountUsdCents,locale)}</strong><p>{locale==='fa'?'هر دلار: ':'Per USD: '}{formatToman(quote.tomanPerUsd!,locale)}</p><p>{locale==='fa'?'اعتبار نرخ تا: ':'Rate valid until: '}{formatDate(quote.rateExpiresAt!,locale)}</p></div>}<p className="mt-6 text-sm font-bold">{t('eta')}</p><p className="mt-2 text-sm">{locale==='fa'?'زمان تحویل پس از تأیید واریز، بر اساس مدت آماده‌سازی محصولات و ارسال محاسبه می‌شود.':'Delivery is calculated from payment confirmation using product preparation and shipping times.'}</p></>:<p className="text-sm text-roya-muted">{t('editQuote')}</p>}
   <p className="my-5 text-xs leading-6 text-roya-muted">{t('etaNote')}</p>
   {attempted && !busy && <p className="mb-4 text-xs leading-6">{t('retrySame')}</p>}{error && <p role="alert" className="mb-4 text-sm text-roya-brown">{error}</p>}
   <Button type="button" variant="secondary" className="mb-3 w-full" onClick={check} disabled={busy || attempted || shippingEnabled===null || !zones.length || (international&&!foreignReady)}>{busy?t('loading'):t('quote')}</Button>
   <Button type="submit" className="w-full" disabled={busy || (!international&&choosingPayment&&!paymentMethods?.[paymentMethod]) || !quote || quote.deliveryTestMode || c.catalog.isDemo || (international&&!foreignReady)}>{locale==='fa'?(choosingPayment?'پرداخت و ایجاد درخواست سفارش':'تأیید فاکتور و ورود به پرداخت'):(choosingPayment?'Proceed with payment':'Confirm invoice and choose payment')}</Button>
  </aside>
 </form>;
}
export function ReceiptCard({receipt:r}:{receipt:Receipt}){
 const t=useTranslations('Shop'),locale=useLocale() as Locale;
 return <div className="mx-auto max-w-xl rounded-3xl border border-roya-line bg-white p-8"><h2 className="text-2xl font-bold text-roya-green">{r.status==='CANCELLED'?(locale==='fa'?'سفارش لغو شده است':'Order cancelled'):r.paymentStatus==='PAID'?t('saved'):(locale==='fa'?'درخواست سفارش؛ در انتظار تأیید پرداخت':'Order request awaiting payment confirmation')}</h2><p className="mt-5 text-sm">{t('trackingCode')}</p><p dir="ltr" className="my-3 break-all rounded-xl bg-roya-leaf p-4 text-center font-mono text-lg select-all">{r.trackingCode}</p><p className="text-sm leading-7">{t('saveCode')}</p>{r.status!=='CANCELLED'&&r.paymentStatus!=='PAID'&&<TransferInstructions payment={r}/>}<ReservationNotice payment={r} locale={locale}/><p className="my-4 font-bold">{formatToman(r.totalToman,locale)}</p><p className="text-sm">{t('eta')}: {r.estimatedDeliveryAt?formatDate(r.estimatedDeliveryAt,locale):(locale==='fa'?'پس از تأیید واریز مشخص می‌شود؛ زمان آماده‌سازی از همان لحظه شروع خواهد شد.':'Calculated after payment confirmation; preparation starts then.')}</p>{r.amountUsdCents!==undefined&&<p className="mb-4 font-bold">{formatUsd(r.amountUsdCents,locale)}</p>}{r.paymentMethod!=='CASH_ON_DELIVERY' && r.paymentStatus!=='PAID' && <p className="mt-4 text-sm text-roya-brown">{t('pendingPayment')}</p>}{r.status!=='CANCELLED'&&r.paymentUrl&&r.paymentStatus!=='PAID'&&<a href={r.paymentUrl} className={`${buttonClasses()} mt-5`}>{locale==='fa'?'ادامه پرداخت آنلاین':'Continue online payment'}</a>}<Link href={`/${locale}/tracking/`} className={`${buttonClasses()} mt-6`}>{t('tracking')}</Link></div>;
}

export function TransferInstructions({payment:r}:{payment:Pick<Receipt,'invoiceNumber'|'paymentReference'|'bankTransfer'>}){
 const locale=useLocale(),fa=locale==='fa';
 return <div className="my-5 grid gap-3 text-sm">{r.invoiceNumber&&<p>{fa?'شماره فاکتور: ':'Invoice: '}<bdi className="select-all font-mono">{r.invoiceNumber}</bdi></p>}{r.paymentReference&&<p>{fa?'شناسه پیگیری پرداخت: ':'Payment reference: '}<bdi className="select-all font-mono">{r.paymentReference}</bdi></p>}{r.bankTransfer&&<>{(r.bankTransfer.accounts??[{id:'legacy',holder:r.bankTransfer.holder,card:r.bankTransfer.card,iban:r.bankTransfer.iban}]).map(account=><div key={account.id} className="grid gap-3 rounded-xl border border-roya-line p-4"><p>{fa?'نام صاحب حساب: ':'Account holder: '}{account.holder}</p>{account.card&&<p>{fa?'شماره کارت: ':'Card: '}<bdi className="select-all font-mono">{account.card}</bdi></p>}{account.iban&&<p>{fa?'شبا: ':'IBAN: '}<bdi className="select-all break-all font-mono">{account.iban}</bdi></p>}</div>)}<p>{fa?'مبلغ کامل را فقط به یکی از حساب‌های بالا واریز کنید.':'Transfer the full amount to only one account listed above.'}</p><p className="leading-7">{fa?'شناسه پیگیری را در شرح انتقال ثبت کنید، اگر بانک اجازه می‌دهد. این شناسه، شناسه واریز بانکی نیست. رسید و شماره پیگیری بانک را نگه دارید؛ سفارش پس از تطبیق و تأیید واریز نهایی می‌شود.':'Include the payment reference in the transfer description if supported. This is not a bank deposit identifier. Keep your receipt and bank reference; the order is finalized after the funds are matched and confirmed.'}</p></>}</div>;
}

export function ReservationNotice({payment:r,locale}:{payment:Pick<Receipt,'reservationExpiresAt'|'reservationExpiredAt'|'refundRequired'|'paymentStatus'>;locale:Locale}){
 const fa=locale==='fa';
 return r.refundRequired?<p role="status" className="my-4 text-sm text-roya-brown">{fa?'وجه دریافت شده ولی سفارش لغو شده است؛ برای بررسی استرداد با فروشگاه تماس بگیرید.':'Payment received on a cancelled order. Contact the store for refund review.'}</p>:r.reservationExpiredAt?<p role="status" className="my-4 text-sm text-roya-brown">{fa?'مهلت رزرو تمام و سفارش لغو شده است. پرداخت نکنید؛ اگر قبلاً واریز کرده‌اید برای تطبیق و استرداد با فروشگاه تماس بگیرید.':'Reservation expired and order cancelled. Do not pay. If already paid, contact the store for payment and refund review.'}</p>:r.reservationExpiresAt&&r.paymentStatus!=='PAID'?<p className="my-4 text-sm leading-7 text-roya-brown">{fa?'مهلت رزرو و تأیید پرداخت: ':'Reservation and payment-confirmation deadline: '}{formatDate(r.reservationExpiresAt,locale)}. {fa?'در کارت‌به‌کارت، تأیید واریز توسط فروشگاه باید پیش از این مهلت انجام شود. پس از انقضا موجودی آزاد می‌شود؛ پرداخت دیرهنگام موجب ارسال خودکار نمی‌شود.':'For bank transfers, store confirmation must occur before this deadline. Stock is released on expiry; late payment does not trigger fulfilment.'}</p>:null;
}
