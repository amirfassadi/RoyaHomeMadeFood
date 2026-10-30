'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {SupportConversation,supportRequest} from '@/components/support-conversation';
import {Button} from '@/components/ui/button';
import {statusLabels,Panel} from './shared';
import {useAdminAccess} from './access';
import {canViewAdminSection} from '@/lib/admin/permissions';
import {formatDate,formatToman} from '@/lib/format';
import type {SupportCustomerContext,SupportInbox} from '@/lib/support';

function CustomerContext({id}:{id:string}){
 const [context,setContext]=useState<SupportCustomerContext|null>(null),[error,setError]=useState(false),[version,setVersion]=useState(0);
 const access=useAdminAccess();
 useEffect(()=>{let active=true;setError(false);
  void supportRequest<{context:SupportCustomerContext}>(`/api/admin/support/${id}/`).then(data=>{if(active)setContext(data.context);}).catch(()=>{if(active)setError(true);});
  return ()=>{active=false;};
 },[id,version]);
 if(error)return <Panel><p role="alert" className="text-sm">دریافت مشخصات انجام نشد.</p><Button variant="ghost" onClick={()=>setVersion(v=>v+1)}>تلاش مجدد</Button></Panel>;
 if(!context)return <Panel><p role="status" className="text-sm">در حال دریافت مشخصات مشتری…</p></Panel>;
 const {customer,orders}=context;
 return <Panel title="مشخصات و سوابق مشتری"><dl className="grid gap-3 text-sm"><div><dt className="text-xs text-roya-muted">نام</dt><dd className="mt-1 font-semibold">{customer.name}</dd></div><div><dt className="text-xs text-roya-muted">موبایل</dt><dd dir="ltr" className="mt-1 text-start">{customer.mobile??'—'}</dd></div><div><dt className="text-xs text-roya-muted">ایمیل</dt><dd className="mt-1 break-all"><bdi>{customer.email??'—'}</bdi></dd></div><div><dt className="text-xs text-roya-muted">عضویت</dt><dd className="mt-1">{formatDate(customer.createdAt)} · {customer.active?'حساب فعال':'حساب غیرفعال'}</dd></div><div><dt className="text-xs text-roya-muted">تعداد سفارش / مجموع پرداخت تأییدشده</dt><dd className="mt-1">{context.orderCount} / {formatToman(context.paidTotalToman)}</dd></div></dl>
 <div className="mt-5 flex items-center justify-between gap-2"><h3 className="text-sm font-bold">۲۰ سفارش آخر این حساب</h3><Button variant="ghost" onClick={()=>setVersion(v=>v+1)}>تازه‌سازی</Button></div>
 {!orders.length&&<p className="mt-3 text-sm text-roya-muted">سفارشی برای این حساب ثبت نشده است.</p>}
 <div className="mt-4 max-h-[36rem] space-y-4 overflow-y-auto">{orders.map(o=><article key={o.id} className="rounded-xl border border-roya-line p-4 text-xs leading-7"><p className="break-all font-semibold"><bdi>{o.invoiceNumber??o.trackingCode}</bdi></p><p>{formatDate(o.createdAt)}</p><p>{formatToman(o.totalToman)}</p><p>{statusLabels[o.status]??o.status} · {statusLabels[o.paymentStatus]??o.paymentStatus}</p><p>روش پرداخت: {({BANK_TRANSFER:'کارت‌به‌کارت',BTCPAY:'ارز دیجیتال',ZARINPAL:'زرین‌پال',CASH_ON_DELIVERY:'هنگام تحویل'} as Record<string,string>)[o.paymentMethod]??o.paymentMethod}</p>{o.paymentReference&&<p className="break-all">مرجع پرداخت: <bdi>{o.paymentReference}</bdi></p>}{o.transferReference&&<p className="break-all">پیگیری واریز: <bdi>{o.transferReference}</bdi></p>}{canViewAdminSection(access,'order')&&<Link href={`/admin/orders/${o.id}/`} className="mt-2 inline-block text-roya-green underline">جزئیات سفارش و پرداخت</Link>}</article>)}</div></Panel>;
}

export function SupportPanel({isDemo}:{isDemo:boolean}){
 const [inbox,setInbox]=useState<SupportInbox|null>(null),[page,setPage]=useState(1),[unread,setUnread]=useState(false),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{
  if(isDemo)return;let active=true,inFlight=false;
  setInbox(null);
  const load=async()=>{if(inFlight)return;inFlight=true;try{const next=await supportRequest<SupportInbox>(`/api/admin/support/?page=${page}&unread=${unread?'1':'0'}`);if(active){setInbox(next);setError('');}}catch(e){if(active){const code=(e as Error).message;if(code==='UNAUTHORIZED'||code==='FORBIDDEN'){setInbox(null);setSelected(null);}setError(code==='UNAUTHORIZED'||code==='FORBIDDEN'?'نشست یا دسترسی شما معتبر نیست؛ دوباره وارد شوید.':'دریافت گفتگوها انجام نشد؛ دوباره تلاش کنید.');}}finally{inFlight=false;}};
  void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},6000);
  return ()=>{active=false;clearInterval(timer);};
 },[isDemo,page,unread,version]);
 if(isDemo)return <Panel title="چت پشتیبانی"><p className="text-sm leading-8">گفتگوهای واقعی پس از اتصال پایگاه داده و ورود کاربران در این قسمت نمایش داده می‌شوند.</p></Panel>;
 return <><div className="mb-6"><h1 className="text-2xl font-bold">چت پشتیبانی</h1><p className="mt-3 text-sm leading-7 text-roya-muted">گفتگو با مشتری، همراه با مشخصات حساب و سوابق سفارش و پرداخت.</p></div>
 <div className="grid items-start gap-5 xl:grid-cols-[260px_1fr]"><Panel title="گفتگوها"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unread} onChange={e=>{setUnread(e.target.checked);setPage(1);}}/>فقط خوانده‌نشده‌ها</label>{error&&<p role="alert" className="mt-4 text-sm leading-7 text-roya-brown">{error}</p>}<Button variant="ghost" onClick={()=>setVersion(v=>v+1)}>تازه‌سازی</Button>
 {!inbox&&!error&&<p role="status" className="mt-4 text-sm">در حال دریافت…</p>}
 <div className="mt-3 grid gap-2">{inbox?.threads.map(t=><button key={t.id} aria-pressed={t.id===selected} onClick={()=>setSelected(t.id)} className={`min-w-0 rounded-xl border p-3 text-start ${t.id===selected?'border-roya-green bg-roya-leaf':'border-roya-line'}`}><span className="flex items-center justify-between gap-2 text-sm font-semibold">{t.customer.name}{t.unread&&<span className="rounded-full bg-roya-green px-2 py-1 text-[10px] text-white">جدید</span>}</span><bdi className="mt-2 block text-xs text-roya-muted">{t.customer.mobile}</bdi><span className="mt-2 block truncate text-xs text-roya-muted">{t.preview}</span></button>)}</div>
 {inbox&&!inbox.threads.length&&<p className="mt-4 text-sm leading-7 text-roya-muted">{unread?'پیام خوانده‌نشده‌ای وجود ندارد.':'هنوز گفتگویی شروع نشده است.'}</p>}
 <div className="mt-5 flex items-center justify-between gap-2"><Button variant="ghost" disabled={page===1} onClick={()=>setPage(p=>p-1)}>قبلی</Button><span className="text-xs">{page}</span><Button variant="ghost" disabled={!inbox?.hasMore} onClick={()=>setPage(p=>p+1)}>بعدی</Button></div></Panel>
 {selected?<div className="grid min-w-0 gap-5"><SupportConversation key={selected} endpoint={`/api/admin/support/${selected}/`} fromAdmin/><CustomerContext key={`context-${selected}`} id={selected}/></div>:<Panel><p className="text-sm leading-8 text-roya-muted">یک گفتگو را انتخاب کنید تا پیام‌ها و اطلاعات مشتری نمایش داده شود.</p></Panel>}</div></>;
}
