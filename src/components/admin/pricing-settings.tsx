'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {PricingProvider,usePricing} from '@/components/store/pricing-provider';
import {defaultPricingPolicy,pricingPolicySchema,type PricingPolicy} from '@/lib/pricing';
import {PricingSaveError} from '@/lib/pricing-store';
import {countries} from '@/lib/prototype';
import {Button} from '@/components/ui/button';

export function PricingSettings({mode='local',initialPolicy}:{mode?:'local'|'store';initialPolicy?:PricingPolicy}){return <PricingProvider mode={mode} initialPolicy={initialPolicy}><Editor store={mode==='store'}/></PricingProvider>;}
function Editor({store}:{store:boolean}){
  const p=usePricing(),[draft,setDraft]=useState<PricingPolicy>(defaultPricingPolicy),[message,setMessage]=useState(''),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false);
  useEffect(()=>{if(!dirty)setDraft(p.policy);},[p.policy,dirty]);
  async function save(event:React.FormEvent){
    event.preventDefault();if(saving||!p.ready)return;setMessage('');
    const parsed=pricingPolicySchema.safeParse(draft);
    if(!parsed.success){setMessage('نرخ دلار باید مثبت و کارمزد بین صفر تا ۱۰۰ درصد باشد.');return;}
    setSaving(true);
    try{await p.savePolicy(parsed.data,draft.updatedAt);setDirty(false);setMessage(store?'سیاست قیمت‌گذاری فروشگاه ذخیره شد.':'تنظیمات آزمایشی در همین مرورگر ذخیره شد.');}
    catch(error){setMessage(error instanceof PricingSaveError&&error.code==='CONFLICT'?'تنظیمات هم‌زمان تغییر کرده است؛ نسخهٔ سرور را بارگیری و تغییرات را دوباره وارد کنید.':error instanceof PricingSaveError&&error.code==='UNAUTHORIZED'?'نشست ادمین پایان یافته؛ دوباره وارد شوید.':'نتیجهٔ ذخیره قطعی نیست؛ پیش از تکرار، نسخهٔ سرور را بارگیری کنید.');}
    finally{setSaving(false);}
  }

  const field='min-h-11 w-full rounded-xl border border-roya-line bg-white px-3 py-2';
  return <section className="mt-7 rounded-3xl border border-roya-line bg-white p-6 md:p-8"><h2 className="text-xl font-bold">ارز و کارمزد فروش بین‌المللی</h2><p className="my-4 text-sm leading-8 text-roya-muted">{store?'این تنظیمات در دیتابیس فروشگاه ذخیره می‌شوند و برای همهٔ خریداران اعمال می‌شوند.':'این تنظیمات آزمایشی فقط در همین مرورگر ذخیره می‌شوند.'} نرخ عمومی ارز از اینترنت خوانده می‌شود؛ این درصدها کارمزد خدمات فروشگاه‌اند.</p><form onSubmit={save} onChange={()=>setDirty(true)} className="grid gap-5"><div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-2 text-sm">کارمزد پیش‌فرض خرید خارجی (درصد)<input disabled={saving} type="number" min="0" max="100" step="0.01" required dir="ltr" className={field} value={draft.feeBps/100} onChange={e=>setDraft({...draft,feeBps:Math.round(Number(e.target.value)*100)})}/></label><label className="grid gap-2 text-sm">نرخ دلار فروشگاه به تومان (خالی = محاسبه از تتر)<input disabled={saving} type="number" min="1" max="1000000000" step="0.01" dir="ltr" className={field} value={draft.manualUsdToman??''} placeholder="محاسبهٔ خودکار" onChange={e=>setDraft({...draft,manualUsdToman:e.target.value===''?null:Number(e.target.value)})}/></label></div><p className="text-xs leading-7 text-roya-muted">کارمزد روی مبلغ کالاها پس از تخفیف اعمال می‌شود؛ ارسال شامل آن نیست. خرید داخل ایران بدون این کارمزد و به تومان می‌ماند. نرخ دستی دلار با همین عنوان به خریدار نشان داده می‌شود.</p><fieldset><legend className="mb-4 font-semibold">کارمزد ویژهٔ کشور (خالی = درصد پیش‌فرض)</legend><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{countries.filter(c=>c[0]!=='IR').map(([code,name])=><label key={code} className="grid gap-2 text-sm">{name}<input disabled={saving} type="number" min="0" max="100" step="0.01" dir="ltr" className={field} value={draft.countryFees[code]===undefined?'':draft.countryFees[code]/100} placeholder={`${draft.feeBps/100}%`} onChange={e=>{const fees={...draft.countryFees};if(e.target.value==='')delete fees[code];else fees[code]=Math.round(Number(e.target.value)*100);setDraft({...draft,countryFees:fees});}}/></label>)}</div></fieldset>{p.policyError&&<p role="alert" className="text-sm text-roya-brown">سیاست قیمت‌گذاری فروشگاه در دسترس نیست؛ بارگیری نسخهٔ سرور را بزنید.</p>}{message&&<p role="status" className="text-sm leading-7 text-roya-green">{message}</p>}<div className="flex flex-wrap items-center gap-4"><Button disabled={!p.ready||saving}>{saving?'در حال ذخیره…':store?'ذخیرهٔ تنظیمات فروشگاه':'ذخیرهٔ تنظیمات آزمایشی'}</Button>{store&&<button type="button" disabled={saving} className="text-sm underline" onClick={()=>{setDirty(false);setMessage('');void p.refreshPolicy();}}>بارگیری نسخهٔ سرور و کنارگذاشتن تغییرات فرم</button>}<Link href="/fa/rates/" className="text-sm text-roya-green underline">دیدن نرخ‌ها و آزمایش کشور</Link></div></form></section>;
}
