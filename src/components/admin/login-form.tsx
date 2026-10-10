'use client';
import {useState} from 'react';
import Link from 'next/link';
import {signIn} from 'next-auth/react';
import {Button,buttonClasses} from '@/components/ui/button';
import {Field} from './shared';
export function AdminLogin({isDemo}:{isDemo:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(isDemo)return;const f=new FormData(e.currentTarget);setBusy(true);setError('');try{const r=await signIn('credentials',{mobile:String(f.get('mobile')),password:String(f.get('password')),redirect:false,callbackUrl:'/admin/'});if(!r?.ok){setError('ورود انجام نشد. اطلاعات یا محدودیت تلاش را بررسی کنید.');return;}window.location.assign('/admin/');}catch{setError('سرویس ورود در دسترس نیست.');}finally{setBusy(false);}}
 return <div className="flex min-h-screen items-center justify-center p-5"><section className="w-full max-w-md rounded-3xl border border-roya-line bg-white p-8 shadow-card"><Link href="/fa/" className="text-sm text-roya-green">محصولات غذایی رویا</Link><h1 className="mb-3 mt-6 text-2xl font-bold">ورود مدیر</h1><p className="mb-7 text-sm leading-7 text-roya-muted">مدیریت سفارش‌ها و طعم‌های خانگی رویا</p>{isDemo?<><p className="mb-6 text-sm leading-7">در پیش‌نمایش، ورود واقعی غیرفعال است. می‌توانید ظاهر پنل را با اطلاعات نمونه ببینید.</p><Link href="/admin/" className={`${buttonClasses()} w-full`}>مشاهده پنل نمونه</Link></>:<form onSubmit={submit} className="grid gap-5"><Field label="شماره موبایل" name="mobile" required inputMode="tel" autoComplete="username" dir="ltr" maxLength={32}/><Field label="رمز عبور" name="password" type="password" required autoComplete="current-password" maxLength={128}/>{error && <p role="alert" className="text-sm text-roya-brown">{error}</p>}<Button disabled={busy}>{busy?'در حال بررسی…':'ورود به پنل'}</Button></form>}</section></div>;
}
