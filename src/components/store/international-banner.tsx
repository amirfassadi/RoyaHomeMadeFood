'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useLocale} from 'next-intl';
export function InternationalBanner({isDemo}:{isDemo:boolean}){
 const locale=useLocale(),[visible,setVisible]=useState(false);
 useEffect(()=>{if(isDemo)return;const controller=new AbortController();fetch('/api/international/availability/',{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).then(d=>setVisible(d?.eligible===true)).catch(()=>{});return()=>controller.abort();},[isDemo]);
 if(!visible)return null;
 return <div className="border-b border-roya-line bg-roya-leaf px-5 py-3 text-center text-sm leading-7"><Link href={`/${locale}/international/`} className="font-semibold text-roya-green underline underline-offset-4">{locale==='fa'?'خارج از ایران هستید؟ برای عزیزانتان در ایران سفارش بدهید ←':'Ordering from abroad? Send homemade food to loved ones in Iran →'}</Link></div>;
}
