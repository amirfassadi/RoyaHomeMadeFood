 'use client';
import {useEffect,useRef,useState} from 'react';
import {signIn} from 'next-auth/react';
import {Button} from '@/components/ui/button';
import type {Locale} from '@/i18n/routing';
const registrationStorageKey='roya-registration-v1';
const field='min-h-12 w-full rounded-xl border border-roya-line bg-white px-4 py-3 text-sm';
export function CustomerAuthForm({locale,enabled,registrationEnabled,returnTo}:{locale:Locale;enabled:boolean;registrationEnabled:boolean;returnTo?:string}){
 const fa=locale==='fa',submitting=useRef(false);
 const [mode,setMode]=useState<'login'|'register'>('login'),[step,setStep]=useState<'details'|'mobile'>('details');
 const [name,setName]=useState(''),[mobile,setMobile]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[identifier,setIdentifier]=useState(''),[marketingSms,setMarketing]=useState(false);
 const [challenge,setChallenge]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[wait,setWait]=useState(0),[notice,setNotice]=useState('');
 useEffect(()=>{if(wait<=0)return;const timer=setTimeout(()=>setWait(wait-1),1000);return()=>clearTimeout(timer);},[wait]);
 async function post(path:string,payload:unknown){
  const r=await fetch(`/api/customer/${path}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json();
  if(!r.ok){
   if(d.error==='RATE_LIMIT'){
    const seconds=Number(d.retryAfter??r.headers.get('Retry-After'));
    const retryAfter=Number.isFinite(seconds)&&seconds>0?Math.ceil(seconds):60;
    setWait(retryAfter);
    const minutes=Math.ceil(retryAfter/60);
    throw new Error(fa?`محدودیت ارسال کد فعال است؛ حدود ${minutes.toLocaleString('fa-IR')} دقیقه دیگر دوباره امتحان کنید. اگر کد قبلی را دارید، آن را وارد کنید.`:`Code sending limit reached. Try again in about ${minutes} minute(s). You can still enter your previous code.`);
   }
   throw new Error(d.error==='ACCOUNT_EXISTS'?(fa?'این مشخصات قبلاً ثبت شده است؛ وارد حساب شوید.':'These details are already registered. Sign in.'):d.error==='CODE_INVALID'?(fa?'کد نادرست یا منقضی است.':'Code invalid or expired.'):d.error==='SMS_UNAVAILABLE'?(fa?'ارسال پیامک تأیید نشد؛ پس از یک دقیقه دوباره تلاش کنید.':'SMS delivery could not be confirmed. Retry after one minute.'):d.error==='EMAIL_UNAVAILABLE'?(fa?'ارسال ایمیل انجام نشد؛ پس از یک دقیقه ارسال مجدد را بزنید.':'Email unavailable. Resend after one minute.'):(fa?'درخواست انجام نشد؛ دوباره تلاش کنید.':'Request unavailable. Please retry.'));
  }
  return d;
 }
 function finish(){try{sessionStorage.removeItem(registrationStorageKey);}catch{}const target=returnTo??`/${locale}/account/`;window.location.assign(target);}
 async function resend(){if(submitting.current||wait>0)return;submitting.current=true;setBusy(true);setError('');try{if(!password)throw new Error(fa?'برای دریافت کد پیامکی جدید، اطلاعات و رمز را دوباره در شروع مجدد وارد کنید.':'Restart registration and enter your password to request a new SMS code.');setWait(60);const d=await post('code',{name,mobile,email,password,marketingSms});setChallenge(d.challengeId);try{sessionStorage.setItem(registrationStorageKey,d.challengeId);}catch{}setCode('');}catch(e){setError((e as Error).message);}finally{submitting.current=false;setBusy(false);}}
 async function submit(e:React.FormEvent){e.preventDefault();if(submitting.current||mode==='register'&&step==='details'&&wait>0)return;submitting.current=true;setBusy(true);setError('');setNotice('');try{
  if(mode==='login'){const r=await signIn('customer-password',{identifier,password,redirect:false});if(!r?.ok||r.error)throw new Error(fa?'ایمیل، موبایل یا رمز عبور صحیح نیست. حساب‌های قدیمی ابتدا باید ثبت‌نام را تکمیل کنند.':'Invalid email, mobile or password. Legacy accounts must complete registration first.');finish();}
  else if(step==='details'){if(password!==confirmPassword)throw new Error(fa?'تکرار رمز عبور یکسان نیست.':'Passwords do not match.');setWait(60);const d=await post('code',{name,mobile,email,password,marketingSms});setChallenge(d.challengeId);setWait(d.resendAfter);setStep('mobile');try{sessionStorage.setItem(registrationStorageKey,d.challengeId);}catch{}}
  else {const r=await signIn('customer-registration',{challengeId:challenge,code,redirect:false});if(!r?.ok||r.error)throw new Error(fa?'کد موبایل نادرست یا منقضی است؛ پس از ۵ تلاش ناموفق ثبت‌نام را از ابتدا انجام دهید.':'Mobile code invalid or expired. Restart registration after 5 failed attempts.');finish();}
 }catch(e){setError((e as Error).message);}finally{submitting.current=false;setBusy(false);}}
 useEffect(()=>{
  let pending='';try{pending=sessionStorage.getItem(registrationStorageKey)??'';}catch{}if(!pending)return;
  const controller=new AbortController();
  fetch('/api/customer/registration/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId:pending}),signal:controller.signal}).then(async r=>{if(!r.ok){if(r.status===400){try{sessionStorage.removeItem(registrationStorageKey);}catch{}}return null;}return r.json();}).then(d=>{if(!d||controller.signal.aborted)return;setChallenge(pending);setMobile(d.mobile);setEmail(d.email);setMode('register');setStep(d.step);setWait(d.resendAfter);setNotice(fa?'ثبت‌نام نیمه‌کاره شما بازیابی شد؛ کد همین مرحله را وارد کنید.':'Your registration was restored. Enter the code for this step.');}).catch(()=>{});
  return()=>controller.abort();
 },[fa]);
 const available=mode==='login'?enabled:registrationEnabled||!!challenge&&step!=='details';
 return <section className="rounded-3xl border border-roya-line bg-white p-6 md:p-8"><h2 className="text-xl font-bold">{fa?'ورود یا ساخت حساب کاربری':'Sign in or create an account'}</h2><p className="mt-4 text-sm leading-7 text-roya-muted">{fa?'یک‌بار موبایل را تأیید کنید؛ ایمیل فعلاً بدون تأیید ذخیره می‌شود. از دفعات بعد با رمز عبور وارد شوید و سفارش‌ها و آدرس‌هایتان را ببینید.':'Verify your mobile once. Email is currently saved without verification. Then sign in with your password to access orders and saved addresses.'}</p>
 <div className="mt-5 flex gap-3"><Button type="button" variant={mode==='login'?'primary':'secondary'} disabled={busy} onClick={()=>{setMode('login');setError('');}}>{fa?'ورود':'Sign in'}</Button><Button type="button" variant={mode==='register'?'primary':'secondary'} disabled={busy} onClick={()=>{setMode('register');setError('');}}>{fa?'ثبت‌نام':'Register'}</Button></div>
 {!available&&<p role="status" className="mt-5 rounded-xl bg-roya-leaf p-4 text-sm leading-7">{fa?'این بخش فعلاً در دسترس نیست؛ لطفاً بعداً دوباره تلاش کنید.':'This feature is temporarily unavailable. Please try again later.'}</p>}
 <form className="mt-6 grid gap-4" onSubmit={submit}><fieldset disabled={busy||!available} className="grid gap-4">
 {mode==='login'?<><label className="grid gap-2 text-sm">{fa?'ایمیل یا شماره موبایل':'Email or mobile'}<input className={field} value={identifier} onChange={e=>setIdentifier(e.target.value)} autoComplete="username" required maxLength={254} dir="ltr"/></label><label className="grid gap-2 text-sm">{fa?'رمز عبور':'Password'}<input className={field} value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required minLength={12} maxLength={128} dir="ltr"/></label></>:step==='details'?<>
 <label className="grid gap-2 text-sm">{fa?'نام و نام خانوادگی':'Full name'}<input className={field} value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={100}/></label>
 <label className="grid gap-2 text-sm">{fa?'موبایل':'Mobile'}<input className={field} value={mobile} onChange={e=>setMobile(e.target.value)} autoComplete="tel" type="tel" required maxLength={32} dir="ltr" placeholder="09xxxxxxxxx"/></label>
 <label className="grid gap-2 text-sm">{fa?'ایمیل':'Email'}<input className={field} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" type="email" required maxLength={254} dir="ltr"/></label>
 <label className="grid gap-2 text-sm">{fa?'رمز عبور (حداقل ۱۲ نویسه)':'Password (at least 12 characters)'}<input className={field} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" type="password" required minLength={12} maxLength={128} dir="ltr"/></label>
 <label className="grid gap-2 text-sm">{fa?'تکرار رمز عبور':'Confirm password'}<input className={field} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" type="password" required minLength={12} maxLength={128} dir="ltr"/></label>
 <label className="flex items-start gap-3 text-sm leading-7"><input className="mt-2" checked={marketingSms} onChange={e=>setMarketing(e.target.checked)} type="checkbox"/>{fa?'مایلم خبرها و پیشنهادها را پیامکی دریافت کنم (اختیاری).':'Send me SMS news and offers (optional).'}</label>
 </>:<><p className="text-sm leading-7">{fa?`کد پیامک‌شده به ${mobile}`:`SMS code sent to ${mobile}`}</p><label className="grid gap-2 text-sm">{fa?'کد ۶ رقمی (اعتبار ۵ دقیقه)':'6-digit code (valid for 5 minutes)'}<input key={step} className={field} value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} dir="ltr"/></label></>}
 <Button disabled={busy||!available||mode==='register'&&step==='details'&&wait>0}>{busy?(fa?'در حال انجام…':'Working…'):mode==='login'?(fa?'ورود با رمز عبور':'Sign in with password'):step==='details'?(wait>0?(fa?`ارسال مجدد در ${wait.toLocaleString('fa-IR')} ثانیه`:`Retry in ${wait}s`):(fa?'ارسال کد تأیید موبایل':'Send mobile code')):(fa?'تأیید موبایل و ساخت حساب':'Verify mobile and create account')}</Button>
 {mode==='register'&&step!=='details'&&<div className="flex flex-wrap gap-3"><Button variant="secondary" type="button" disabled={wait>0||busy} onClick={resend}>{wait>0?(fa?`ارسال مجدد در ${wait} ثانیه`:`Resend in ${wait}s`):(fa?'ارسال مجدد کد':'Resend code')}</Button><Button variant="ghost" type="button" onClick={()=>{try{sessionStorage.removeItem(registrationStorageKey);}catch{}setStep('details');setChallenge('');setCode('');setPassword('');setConfirmPassword('');setError('');setNotice('');}}>{fa?'اصلاح اطلاعات / شروع مجدد':'Edit details / restart'}</Button></div>}
 </fieldset>{error&&<p role="alert" className="text-sm leading-7 text-roya-brown">{error}</p>}{notice&&<p role="status" className="text-sm leading-7 text-roya-green">{notice}</p>}</form></section>;
}
