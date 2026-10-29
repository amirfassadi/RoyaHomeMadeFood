'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {bankTransferSettingsSchema,emptyBankTransferSettings,type BankTransferSettings} from '@/lib/validation/bank-transfer';
import {Panel,Field,Notice,mutate} from './shared';

export function BankTransferSettingsEditor({initial,isDemo,refresh}:{initial?:{settings:BankTransferSettings;updatedAt:string|null};isDemo:boolean;refresh:()=>void}){
 const [settings,setSettings]=useState(()=>initial?.settings??emptyBankTransferSettings());
 const [version,setVersion]=useState(initial?.updatedAt??null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 function update(id:string,field:'holder'|'card'|'iban'|'active',value:string|boolean){setSaved(false);setSettings(previous=>({...previous,accounts:previous.accounts.map(account=>account.id===id?{...account,[field]:value}:account)}));}
 async function save(event:React.FormEvent){
  event.preventDefault();if(isDemo||busy)return;
  const result=bankTransferSettingsSchema.safeParse(settings);
  if(!result.success){setError(result.error.issues[0]?.message??'اطلاعات حساب‌ها را بررسی کنید.');return;}
  setBusy(true);setError('');setSaved(false);
  try{const response=await mutate('settings/bank-transfer',{settings:result.data,expectedUpdatedAt:version});setSettings(result.data);setVersion(response.updatedAt);setSaved(true);refresh();}
  catch(error){setError((error as Error).message);}finally{setBusy(false);}
 }
 return <Panel title="حساب‌های بانکی و کارت‌به‌کارت"><form onSubmit={save}>
  <Notice error={error} isDemo={isDemo}/>
  {saved&&<p role="status" className="mb-4 text-sm text-roya-green">حساب‌های بانکی ذخیره شدند.</p>}
  <p className="mb-5 text-sm leading-7 text-roya-muted">حساب‌های فعال پس از ثبت سفارش به خریدار نمایش داده می‌شوند. برای هر حساب شماره کارت، شبا یا هر دو را وارد کنید. دریافت وجه باید در جزئیات سفارش توسط مدیر تأیید شود.</p>
  <fieldset disabled={busy||isDemo} className="grid gap-5">
   <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={settings.enabled} onChange={event=>{setSaved(false);setSettings(previous=>({...previous,enabled:event.target.checked}));}}/>فعال‌بودن پرداخت کارت‌به‌کارت / پایا / پل</label>
   {settings.accounts.map((account,index)=><fieldset key={account.id} className="grid gap-4 rounded-xl border border-roya-line p-4">
    <legend className="px-2 text-sm font-bold">حساب {index+1}</legend>
    <Field label="نام صاحب حساب" required minLength={2} maxLength={150} value={account.holder} onChange={event=>update(account.id,'holder',event.target.value)}/>
    <Field label="شماره کارت (۱۶ رقم؛ اختیاری در صورت ثبت شبا)" dir="ltr" inputMode="numeric" maxLength={24} value={account.card} onChange={event=>update(account.id,'card',event.target.value)}/>
    <Field label="شماره شبا (IR و ۲۴ رقم؛ اختیاری در صورت ثبت کارت)" dir="ltr" maxLength={40} value={account.iban} onChange={event=>update(account.id,'iban',event.target.value)}/>
    <div className="flex flex-wrap items-center justify-between gap-4"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={account.active} onChange={event=>update(account.id,'active',event.target.checked)}/>حساب فعال</label><Button type="button" variant="ghost" onClick={()=>{setSaved(false);setSettings(previous=>({...previous,accounts:previous.accounts.filter(value=>value.id!==account.id)}));}}>حذف حساب از فهرست</Button></div>
   </fieldset>)}
   <Button type="button" variant="secondary" disabled={settings.accounts.length>=10} onClick={()=>{setSaved(false);setSettings(previous=>({...previous,accounts:[...previous.accounts,{id:crypto.randomUUID(),holder:'',card:'',iban:'',active:true}]}));}}>افزودن حساب بانکی</Button>
   <Button type="submit">{busy?'در حال ذخیره…':'ذخیره حساب‌های بانکی'}</Button>
  </fieldset>
 </form></Panel>;
}
