'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {formatDate,formatNumber} from '@/lib/format';
import type {DemoOrder} from '@/lib/prototype';
import {beginDemoRecovery,verifyDemoRecovery,recoveredDemoOrders,type DemoRecovery} from '@/lib/prototype-recovery';
import {mobileSchema} from '@/lib/validation/checkout';
import type {Locale} from '@/i18n/routing';
import {useDemoOrders} from './prototype-storage';

const field='min-h-12 w-full rounded-xl border border-roya-line p-3';

export function PrototypeMobileRecovery({renderOrder}:{renderOrder:(order:DemoOrder)=>ReactNode}){
 const locale=useLocale() as Locale,fa=locale==='fa',orders=useDemoOrders();
 const [mobile,setMobile]=useState(''),[code,setCode]=useState(''),[state,setState]=useState<DemoRecovery|null>(null);
 const [clock,setClock]=useState(()=>Date.now()),[error,setError]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const running=state!==null;
 useEffect(()=>{
  if(!running)return;
  const timer=setInterval(()=>setClock(Date.now()),1000);
  return()=>clearInterval(timer);
 },[running]);
 const found=recoveredDemoOrders(state,mobile,orders,clock),order=found?.find(o=>o.id===selected);
 const cooldown=state?Math.max(0,Math.ceil((state.resendAt-clock)/1000)):0;
 const expired=!!state&&state.verifiedUntil===null&&clock>=state.expiresAt;
 const accessExpired=!!state?.verifiedUntil&&clock>=state.verifiedUntil;
 const usableCode=!!state?.code&&!expired;
 function changeMobile(value:string){
  setMobile(value);setCode('');setError('');setSelected(null);
  // Editing the number immediately hides the result and consumes the old demo
  // challenge. Preserve the resend deadline, even when the number is changed.
  setState(current=>current?{...current,code:null,verifiedUntil:null}:null);
 }
 function requestCode(e:React.FormEvent){
  e.preventDefault();setError('');
  if(!mobileSchema.safeParse(mobile).success){setError(fa?'شمارهٔ موبایل ثبت‌شده در سفارش را درست وارد کنید.':'Enter the valid Iranian mobile recorded on the order.');return;}
  try{
   const next=String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,'0');
   const now=Date.now();setState(beginDemoRecovery(mobile,next,now,state));setClock(now);setCode('');setSelected(null);
  }catch{setError(fa?'نمایش کد آزمایشی فعلاً ممکن نیست؛ پس از پایان مهلت دوباره تلاش کنید.':'A test code is unavailable. Retry after the cooldown.');}
 }
 function verify(e:React.FormEvent){
  e.preventDefault();if(!state)return;
  const now=Date.now(),next=verifyDemoRecovery(state,mobile,code,now);
  setState(next.state);setClock(now);setSelected(null);
  setError(next.result==='verified'?'':next.result==='expired'?(fa?'کد منقضی شده؛ کد آزمایشی تازه بگیرید.':'The code expired. Request a fresh test code.'):next.result==='locked'?(fa?'تعداد تلاش‌ها تمام شد؛ پس از مهلت، کد تازه بگیرید.':'No attempts remain. Request another test code after the cooldown.'):(fa?'کد آزمایشی معتبر نیست.':'The test code is not valid.'));
  if(next.result==='verified')setCode('');
 }
 return <div className="grid items-start gap-8 lg:grid-cols-[360px_1fr]">
  <section className="grid gap-5 rounded-3xl border border-roya-line bg-white p-6">
   <h2 className="font-bold">{fa?'پیگیری با تأیید شماره (آزمایشی)':'Track by mobile verification (demo)'}</h2>
   <p className="rounded-xl bg-roya-leaf p-4 text-xs leading-7 text-roya-ink">{fa?'پیامک واقعی ارسال نمی‌شود. کد آزمایشی همین‌جا نمایش داده می‌شود و فقط سفارش‌های نمونهٔ این مرورگر را پیدا می‌کند؛ ثبت‌نام لازم نیست.':'No real SMS is sent. The test code is displayed here and finds only this browser’s sample orders. No registration is needed.'}</p>
   <form onSubmit={requestCode} className="grid gap-4">
    <label className="grid gap-2 text-sm">{fa?'موبایل ثبت‌شده در سفارش':'Mobile recorded on the order'}<input value={mobile} onChange={e=>changeMobile(e.target.value)} required maxLength={32} inputMode="tel" autoComplete="tel" dir="ltr" className={field} placeholder="09123456789"/></label>
    <Button type="submit" disabled={cooldown>0}>{state?(fa?'کد آزمایشی تازه':'New test code'):(fa?'نمایش کد آزمایشی':'Show test code')}</Button>
    {cooldown>0&&<p className="text-xs text-roya-muted">{fa?'دریافت مجدد پس از ':'Request again in '}{formatNumber(cooldown,locale)}{fa?' ثانیه':' seconds'}</p>}
   </form>
   {usableCode&&<div role="status" className="rounded-xl border border-roya-line bg-roya-cream p-4 text-sm leading-8">
    <p>{fa?'کد آزمایشی: ':'Test code: '}<output aria-label={fa?'کد نمایش‌داده‌شدهٔ آزمایشی':'Displayed test code'} dir="ltr" className="font-mono text-lg font-bold tracking-widest">{state!.code}</output></p>
    <p className="text-xs text-roya-muted">{fa?'اعتبار کد ۵ دقیقه است. هیچ پیامکی ارسال نشده است.':'Valid for 5 minutes. No SMS has been sent.'}</p>
   </div>}
   {usableCode&&<form onSubmit={verify} className="grid gap-4">
    <label className="grid gap-2 text-sm">{fa?'کد تأیید آزمایشی':'Test verification code'}<input value={code} onChange={e=>setCode(e.target.value)} required minLength={6} maxLength={6} inputMode="numeric" autoComplete="off" dir="ltr" className={field}/></label>
    <Button type="submit">{fa?'تأیید کد آزمایشی':'Verify test code'}</Button>
   </form>}
   {expired&&<p role="status" className="text-sm leading-7 text-roya-brown">{fa?'کد منقضی شده؛ برای ادامه کد تازه بگیرید.':'The code expired. Request a fresh code to continue.'}</p>}
   {accessExpired&&<p role="status" className="text-sm leading-7 text-roya-brown">{fa?'مهلت مشاهده تمام شد؛ شماره را دوباره تأیید کنید.':'Viewing access expired. Verify the mobile again.'}</p>}
   {error&&<p role="alert" className="text-sm leading-7 text-roya-brown">{error}</p>}
   {found!==null&&<p role="status" className="text-sm leading-7 text-roya-green">{fa?'شماره در این آزمایش تأیید شد؛ مشاهده تا ۱۰ دقیقه معتبر است.':'Mobile verified for this demo. Viewing access lasts 10 minutes.'}</p>}
  </section>
  <div className="grid min-w-0 gap-5">
   {found===null?<p className="rounded-3xl border border-dashed border-roya-line p-8 text-sm leading-8 text-roya-muted">{fa?'پس از تأیید آزمایشی شماره، سفارش‌های نمونهٔ همان شماره در این مرورگر نمایش داده می‌شوند.':'After test verification, this browser’s sample orders for that mobile appear here.'}</p>:<section className="rounded-3xl border border-roya-line bg-white p-6">
    <h2 className="font-bold">{fa?'سفارش‌های نمونهٔ این شماره':'Sample orders for this mobile'}</h2>
    <p className="mt-3 text-xs leading-7 text-roya-muted">{fa?'حداکثر ۲۰ سفارش آزمایشی اخیرِ همین مرورگر. برای دیدن جزئیات، سفارش را انتخاب کنید.':'Up to 20 recent test orders from this browser. Select an order to view details.'}</p>
    {found.length===0?<p className="mt-5 text-sm leading-7">{fa?'در این مرورگر سفارش نمونه‌ای برای این شماره پیدا نشد.':'No sample orders for this mobile were found in this browser.'}</p>:<ul className="mt-4 divide-y divide-roya-line">{found.map(o=><li key={o.id}><button type="button" onClick={()=>setSelected(o.id)} className="flex min-h-12 w-full flex-wrap items-center justify-between gap-3 py-4 text-start text-sm text-roya-green underline"><bdi className="font-mono text-xs">{o.trackingCode}</bdi><span>{formatDate(o.createdAt,locale)}</span></button></li>)}</ul>}
   </section>}
   {order&&renderOrder(order)}
  </div>
 </div>;
}
