'use client';
import {useRef,useState} from 'react';
import {signIn} from 'next-auth/react';
import {Button} from '@/components/ui/button';
import type {Locale} from '@/i18n/routing';
const field='min-h-12 w-full rounded-xl border border-roya-line bg-white px-4 py-3 text-sm';
export function CustomerAuthForm({locale,enabled,registrationEnabled,returnTo}:{locale:Locale;enabled:boolean;registrationEnabled:boolean;returnTo?:string}){
 const fa=locale==='fa',submitting=useRef(false);
 const [mode,setMode]=useState<'login'|'register'>('login');
 const [name,setName]=useState(''),[mobile,setMobile]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[identifier,setIdentifier]=useState(''),[marketingSms,setMarketing]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const available=mode==='login'?enabled:registrationEnabled;
 function finish(){window.location.assign(returnTo??`/${locale}/account/`);}
 function signupError(code:string){
  if(code==='ACCOUNT_EXISTS')return fa?'این ایمیل یا شماره موبایل قبلاً ثبت شده است؛ وارد حساب شوید.':'That email or mobile number is already registered. Sign in.';
  if(code==='INVALID')return fa?'نام، ایمیل، موبایل یا رمز عبور را بررسی کنید؛ ایمیل یا موبایل معتبر لازم است.':'Check your name, email, mobile and password. A valid email or mobile is required.';
  if(code==='RATE_LIMIT')return fa?'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.':'Too many requests. Please try again later.';
  return fa?'ثبت‌نام انجام نشد؛ دوباره تلاش کنید.':'Registration failed. Please try again.';
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();if(submitting.current||!available)return;
  submitting.current=true;setBusy(true);setError('');setNotice('');
  try{
   if(mode==='login'){
    const r=await signIn('customer-password',{identifier,password,redirect:false});
    if(!r?.ok||r.error)throw new Error(fa?'ایمیل، موبایل یا رمز عبور صحیح نیست.':'Invalid email, mobile or password.');
    finish();
   }else{
    if(!email.trim()&&!mobile.trim())throw new Error(fa?'ایمیل یا شماره موبایل معتبر وارد کنید.':'Enter a valid email address or mobile number.');
    if(password!==confirmPassword)throw new Error(fa?'تکرار رمز عبور یکسان نیست.':'Passwords do not match.');
    const response=await fetch('/api/customer/signup/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mobile,email,password,marketingSms})});
    const data=await response.json() as {error?:string};
    if(!response.ok)throw new Error(signupError(data.error??'UNAVAILABLE'));
    const loginIdentifier=email.trim()||mobile.trim();
    const r=await signIn('customer-password',{identifier:loginIdentifier,password,redirect:false});
    if(!r?.ok||r.error){
     setMode('login');setIdentifier(loginIdentifier);
     setNotice(fa?'حساب ساخته شد؛ ورود خودکار انجام نشد. با رمز عبور وارد شوید.':'Your account was created, but automatic sign-in failed. Sign in with your password.');
     return;
    }
    finish();
   }
  }catch(e){setError((e as Error).message);}finally{submitting.current=false;setBusy(false);}
 }
 return <section className="rounded-3xl border border-roya-line bg-white p-6 md:p-8"><h2 className="text-xl font-bold">{fa?'ورود یا ساخت حساب کاربری':'Sign in or create an account'}</h2><p className="mt-4 text-sm leading-7 text-roya-muted">{fa?'با ایمیل یا شماره موبایل و رمز عبور ثبت‌نام کنید؛ تأیید مالکیت و ورود کد لازم نیست. اطلاعات تماس تأییدنشده باقی می‌ماند.':'Register with an email or mobile number and password. No ownership verification or code is required; contact details remain unverified.'}</p>
 <div className="mt-5 flex gap-3"><Button type="button" variant={mode==='login'?'primary':'secondary'} disabled={busy} onClick={()=>{setMode('login');setError('');setNotice('');}}>{fa?'ورود':'Sign in'}</Button><Button type="button" variant={mode==='register'?'primary':'secondary'} disabled={busy} onClick={()=>{setMode('register');setError('');setNotice('');}}>{fa?'ثبت‌نام':'Register'}</Button></div>
 {!available&&<p role="status" className="mt-5 rounded-xl bg-roya-leaf p-4 text-sm leading-7">{fa?'این بخش فعلاً در دسترس نیست؛ لطفاً بعداً دوباره تلاش کنید.':'This feature is temporarily unavailable. Please try again later.'}</p>}
 <form className="mt-6 grid gap-4" onSubmit={submit}><fieldset disabled={busy||!available} className="grid gap-4">
 {mode==='login'?<><label className="grid gap-2 text-sm">{fa?'ایمیل یا شماره موبایل':'Email or mobile'}<input className={field} value={identifier} onChange={e=>setIdentifier(e.target.value)} autoComplete="username" required maxLength={254} dir="ltr"/></label><label className="grid gap-2 text-sm">{fa?'رمز عبور':'Password'}<input className={field} value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required minLength={12} maxLength={128} dir="ltr"/></label></>:<>
 <label className="grid gap-2 text-sm">{fa?'نام و نام خانوادگی':'Full name'}<input className={field} value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={100}/></label>
 <p className="text-sm text-roya-muted">{fa?'ایمیل یا موبایل را وارد کنید؛ واردکردن هر دو اختیاری است.':'Enter an email or mobile number. Providing both is optional.'}</p>
 <label className="grid gap-2 text-sm">{fa?'موبایل (اختیاری)':'Mobile (optional)'}<input className={field} value={mobile} onChange={e=>{setMobile(e.target.value);if(!e.target.value.trim())setMarketing(false);}} autoComplete="tel" type="tel" maxLength={32} dir="ltr" placeholder="09xxxxxxxxx"/></label>
 <label className="grid gap-2 text-sm">{fa?'ایمیل (اختیاری)':'Email (optional)'}<input className={field} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" type="email" maxLength={254} dir="ltr"/></label>
 <label className="grid gap-2 text-sm">{fa?'رمز عبور (حداقل ۱۲ نویسه)':'Password (at least 12 characters)'}<input className={field} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" type="password" required minLength={12} maxLength={128} dir="ltr"/></label>
 <label className="grid gap-2 text-sm">{fa?'تکرار رمز عبور':'Confirm password'}<input className={field} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" type="password" required minLength={12} maxLength={128} dir="ltr"/></label>
 {mobile.trim()&&<label className="flex items-start gap-3 text-sm leading-7"><input className="mt-2" checked={marketingSms} onChange={e=>setMarketing(e.target.checked)} type="checkbox"/>{fa?'مایلم خبرها و پیشنهادها را پیامکی دریافت کنم (اختیاری).':'Send me SMS news and offers (optional).'}</label>}
 </>}
 <Button disabled={busy||!available}>{busy?(fa?'در حال انجام…':'Working…'):mode==='login'?(fa?'ورود با رمز عبور':'Sign in with password'):(fa?'ساخت حساب':'Create account')}</Button>
 </fieldset>{error&&<p role="alert" className="text-sm leading-7 text-roya-brown">{error}</p>}{notice&&<p role="status" className="text-sm leading-7 text-roya-green">{notice}</p>}</form></section>;
}
