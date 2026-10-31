 'use client';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {formatDate} from '@/lib/format';
import type {ContactInbox} from '@/lib/admin/communications';
import {fieldClass} from './shared';
type Contact=ContactInbox['messages'][number];
const labels:Record<string,string>={PANEL:'پنل مشتری',EMAIL:'ایمیل',SMS:'پیامک',IN_APP:'در پنل مشتری ثبت شد',ACCEPTED:'پذیرفته‌شده توسط سرویس ارسال',SENDING:'در حال ارسال؛ دوباره ارسال نکنید',UNKNOWN:'نتیجه ارسال نامعلوم؛ پیش از ارسال تازه سرویس را بررسی کنید',CANCELLED:'ارسال متوقف شد'};
const errors:Record<string,string>={UNAUTHORIZED:'نشست پایان یافته است؛ دوباره وارد پنل شوید.',FORBIDDEN:'مجوز پاسخ‌گویی به پیام‌های تماس را ندارید.',INVALID:'روش پاسخ و متن را بررسی کنید.',NOT_FOUND:'پیام تماس یافت نشد.',CONTACT_USE_PANEL:'این شماره حساب مشتری دارد؛ صفحه را تازه کنید و پاسخ را در پنل مشتری ثبت کنید.',CONTACT_NO_ACCOUNT:'حساب مشتری قابل دسترسی نیست؛ صفحه را تازه کنید.',DELIVERY_DISABLED:'ارسال خدماتی غیرفعال است؛ مدیر اصلی باید ارسال بیرونی و اعلان خدماتی را در بالای همین صفحه فعال کند.',EMAIL_UNAVAILABLE:'ایمیل مقصد یا سرویس ایمیل آماده نیست.',SMS_UNAVAILABLE:'سرویس پیامک غیرفعال یا پیکربندی نشده است.',CONFLICT:'اطلاعات درخواست تغییر کرده است؛ پیش از ارسال تازه وضعیت پاسخ قبلی را بررسی کنید.',RATE_LIMIT:'محدودیت ارسال فعال است؛ بعداً دوباره امتحان کنید.'};
export function ContactReplyBox({contact,delivery,isDemo,refresh}:{contact:Contact;delivery:ContactInbox['replyDelivery'];isDemo:boolean;refresh:()=>Promise<void>}){
 const [body,setBody]=useState(''),[channel,setChannel]=useState<'PANEL'|'SMS'|'EMAIL'>(contact.canPanelReply?'PANEL':'SMS'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState('');
 const request=useRef<{requestKey:string;contactMessageId:string;channel:string;body:string}|null>(null),sending=useRef(false);
 const member=!!contact.canPanelReply,external=channel!=='PANEL';
 const blocked=external&&(!delivery?.enabled||channel==='EMAIL'&&!delivery.email||channel==='SMS'&&!delivery.sms);
 async function submit(event:React.FormEvent){event.preventDefault();if(isDemo||sending.current||!request.current&&(blocked||body.trim().length<2))return;sending.current=true;setBusy(true);setError('');try{
  request.current??={requestKey:crypto.randomUUID(),contactMessageId:contact.id,channel,body:body.trim()};
  const http=await fetch('/api/admin/communications/reply/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.current)}),response=await http.json();
  if(!http.ok){if(['DELIVERY_DISABLED','EMAIL_UNAVAILABLE','SMS_UNAVAILABLE','CONTACT_USE_PANEL','CONTACT_NO_ACCOUNT','RATE_LIMIT','INVALID','UNAUTHORIZED','FORBIDDEN','NOT_FOUND'].includes(response.error))request.current=null;throw new Error(response.error??'درخواست انجام نشد.');}
  const status=String(response.reply.status);
  setResult(labels[status]??status);
  if(['IN_APP','ACCEPTED','CANCELLED'].includes(status)){request.current=null;setBody('');}
  await refresh();
 }catch(e){const message=(e as Error).message;setError(errors[message]??message);}finally{sending.current=false;setBusy(false);}}
 return <div className="mt-5 border-t border-roya-line pt-5"><h3 className="text-sm font-bold">پاسخ به این پیام</h3><p className="mt-2 text-xs leading-7 text-roya-muted">{member?'حساب فعال با همین شمارهٔ تأییدشده یافت شد؛ پاسخ در «پیام‌های من» پنل مشتری قرار می‌گیرد. شمارهٔ فرم تماس به‌تنهایی هویت فرستنده را تأیید نمی‌کند.':'حساب مشتری با این شماره یافت نشد؛ می‌توانید به شماره یا ایمیل ثبت‌شده در همین فرم پاسخ خدماتی بدهید.'}</p>
 <div className="mt-3 grid gap-3">{contact.replies?.map(reply=><div key={reply.id} className="rounded-xl bg-roya-cream p-4"><p className="whitespace-pre-wrap break-words text-sm leading-7">{reply.body}</p><p className="mt-2 text-xs text-roya-muted">{labels[reply.channel]??reply.channel} · {labels[reply.status]??reply.status} · {formatDate(reply.createdAt)}</p></div>)}</div>
 <form onSubmit={submit} className="mt-4 grid gap-3"><fieldset disabled={busy||!!request.current||isDemo} className="grid gap-3"><label className="grid gap-2 text-sm">روش پاسخ<select className={fieldClass} value={channel} onChange={e=>setChannel(e.target.value as typeof channel)}>{member?<option value="PANEL">ثبت در پنل مشتری</option>:<><option value="SMS">پیامک به شماره فرستنده</option>{contact.email&&<option value="EMAIL">ایمیل به نشانی فرستنده</option>}</>}</select></label><label className="grid gap-2 text-sm">متن پاسخ<textarea className={fieldClass} rows={4} minLength={2} maxLength={2000} required value={body} onChange={e=>{setBody(e.target.value);setResult('');}}/></label></fieldset>
 {blocked&&<p className="text-xs leading-7 text-roya-brown">{!delivery?.enabled?'ارسال بیرونی و خدماتی فعلاً غیرفعال است؛ تنظیمات ارسال در بالای صفحه قرار دارد.':'سرویس این روش ارسال آماده نیست. تنظیمات ایمیل یا پیامک را بررسی کنید.'}</p>}
 <Button disabled={busy||isDemo||!request.current&&(blocked||body.trim().length<2)}>{busy?'در حال انجام…':request.current?'بررسی نتیجهٔ همان درخواست':member?'ثبت پاسخ در پنل مشتری':channel==='SMS'?'ارسال پاسخ با پیامک':'ارسال پاسخ با ایمیل'}</Button>
 {error&&<p role="alert" className="text-sm leading-7 text-roya-brown">{error}</p>}{result&&<p role="status" className="text-sm leading-7 text-roya-green">{result}</p>}{request.current&&<p className="text-xs leading-7 text-roya-muted">برای جلوگیری از پیام تکراری، متن این درخواست ثابت می‌ماند؛ بررسی وضعیت، پیام تازه‌ای ارسال نمی‌کند.</p>}</form></div>;
}
