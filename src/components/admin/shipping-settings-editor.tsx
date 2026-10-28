'use client';
import {useEffect,useState} from 'react';
import {LocationPicker} from '@/components/ui/location-picker';
import {Button} from '@/components/ui/button';
import {toLatinDigits} from '@/lib/format';
import {defaultShippingSettings,shippingEditSchema,shippingSettingsSchema,type ShippingSettings} from '@/lib/validation/shipping';
import {Field,mutate,Notice,Panel} from './shared';
const storageKey='roya-demo-shipping-settings-v1';
export function ShippingSettingsEditor({initial,isDemo,refresh}:{initial?:ShippingSettings;isDemo:boolean;refresh:()=>void}){
 const [value,setValue]=useState(initial??defaultShippingSettings),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 useEffect(()=>{
  if(!isDemo){setValue(initial??defaultShippingSettings);return;}
  try{const raw=localStorage.getItem(storageKey);if(raw){const result=shippingSettingsSchema.safeParse(JSON.parse(raw));if(result.success)setValue(result.data);else setError('تنظیمات آزمایشی ذخیره‌شده معتبر نیست؛ دوباره وارد و ذخیره کنید.');}}
  catch{setError('خواندن تنظیمات آزمایشی از مرورگر ممکن نشد؛ دسترسی ذخیره‌سازی مرورگر را بررسی کنید.');}
 },[initial,isDemo]);
 function update<K extends keyof ShippingSettings>(key:K,next:ShippingSettings[K]){setValue(old=>({...old,[key]:next}));setSaved('');setError('');setErrors(old=>{const copy={...old};delete copy[key];return copy;});}
 async function save(event:React.FormEvent){
  event.preventDefault();if(busy)return;setError('');setSaved('');
  const result=shippingEditSchema.safeParse(value);
  if(!result.success){
   const next:Record<string,string>={};
   for(const issue of result.error.issues){const key=String(issue.path[0]);next[key]=issue.code==='custom'?issue.message:({markupPercent:'درصد باید بین صفر و صد با حداکثر دو رقم اعشار باشد.',origin:'موقعیت مبدأ معتبر نیست؛ نقطه را دوباره روی نقشه انتخاب کنید.',originAddress:'آدرس مبدأ نباید بیشتر از ۵۰۰ حرف باشد.',senderName:'نام تحویل‌دهنده نباید بیشتر از ۱۰۰ حرف باشد.',senderPhone:'موبایل تحویل‌دهنده باید ۱۱ رقم و با ۰۹ شروع شود.'} as Record<string,string>)[key]??'این مقدار معتبر نیست.';}
   setErrors(next);setError('ذخیره انجام نشد؛ موارد مشخص‌شده را اصلاح کنید.');return;
  }
  setErrors({});setBusy(true);
  try{
   if(isDemo){
    try{localStorage.setItem(storageKey,JSON.stringify(result.data));}
    catch{throw new Error('ذخیره در مرورگر ممکن نشد؛ فضای ذخیره‌سازی یا مجوز مرورگر را بررسی کنید.');}
    setSaved('تنظیمات آزمایشی فقط در همین مرورگر ذخیره شد؛ اتصال واقعی به الوپیک فعال نشده است.');
   }else{await mutate('settings/shipping',result.data);setSaved('تنظیمات ارسال روی سرور ذخیره شد.');refresh();}
  }catch(e){setError(e instanceof Error?e.message:'ذخیره تنظیمات ارسال انجام نشد.');}
  finally{setBusy(false);}
 }
 return <Panel title="ارسال با الوپیک"><form onSubmit={save} aria-label="تنظیمات ارسال الوپیک" noValidate className="grid gap-5">{isDemo&&<p className="rounded-xl bg-roya-leaf p-4 text-sm leading-7">این صفحه پیش‌نمایش است. مبدأ و تنظیمات ارسال را می‌توانید تغییر دهید و برای آزمایش در همین مرورگر ذخیره کنید. قیمت‌گیری و درخواست واقعی پیک به نسخه سروری و توکن الوپیک نیاز دارد.</p>}<Notice error={error}/><fieldset disabled={busy} className="grid gap-5"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={value.enabled} onChange={e=>update('enabled',e.target.checked)}/>فعال‌سازی ارسال با الوپیک</label><Field label="درصد افزوده کرایه برای ذخیره نوسان (پیش‌فرض ۱)" error={errors.markupPercent} name="markupPercent" type="number" min="0" max="100" step="0.01" value={Number.isNaN(value.markupPercent)?'':value.markupPercent} onChange={e=>update('markupPercent',e.target.value===''?NaN:Number(e.target.value))}/><LocationPicker label="مبدأ واقعی فروشگاه روی نقشه" value={value.origin} disabled={busy} onChange={origin=>update('origin',origin)}/>{errors.origin&&<p role="alert" className="text-sm text-roya-brown">{errors.origin}</p>}<Field label="آدرس مبدأ، پلاک و واحد" error={errors.originAddress} name="originAddress" value={value.originAddress} required={value.enabled} maxLength={500} onChange={e=>update('originAddress',e.target.value)}/><Field label="نام تحویل‌دهنده به پیک" error={errors.senderName} name="senderName" value={value.senderName} required={value.enabled} maxLength={100} onChange={e=>update('senderName',e.target.value)}/><Field label="موبایل تحویل‌دهنده" error={errors.senderPhone} name="senderPhone" value={value.senderPhone} required={value.enabled} inputMode="tel" dir="ltr" maxLength={11} placeholder="09123456789" onChange={e=>update('senderPhone',toLatinDigits(e.target.value).replace(/[\s-]/g,''))}/></fieldset><p className="text-sm leading-7">درصد افزوده فقط روی کرایه پیک اعمال می‌شود. پس از پرداخت و آماده‌سازی سفارش، مدیر با دکمه «آماده ارسال و درخواست پیک» درخواست را ارسال می‌کند.</p><Button disabled={busy}>{busy?'در حال ذخیره…':isDemo?'ذخیره آزمایشی در این مرورگر':'ذخیره تنظیمات ارسال'}</Button>{saved&&<p role="status" className="text-sm leading-7 text-roya-green">{saved}</p>}</form></Panel>;
}
