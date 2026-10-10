'use client';
export default function Error({reset}:{reset:()=>void}){return <div className="p-10"><h1 className="mb-5 text-xl font-bold">پنل در دسترس نیست</h1><p className="mb-5 text-sm">اتصال سرویس‌ها یا نشست ورود را بررسی کنید.</p><button onClick={reset} className="rounded-xl bg-roya-green px-5 py-3 text-white">تلاش مجدد</button></div>;}
