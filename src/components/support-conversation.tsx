'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import type {Locale} from '@/i18n/routing';
import type {SupportHistory,SupportMessageView} from '@/lib/support';
import {Button} from '@/components/ui/button';

export async function supportRequest<T>(endpoint:string,body?:unknown):Promise<T>{
 const response=await fetch(endpoint,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error??'UNAVAILABLE');}
 return response.json();
}
function mergeMessages(previous:SupportMessageView[],incoming:SupportMessageView[]){
 const map=new Map(previous.map(m=>[m.sequence,m]));for(const m of incoming)map.set(m.sequence,m);
 return [...map.values()].sort((a,b)=>a.sequence-b.sequence);
}

export function SupportConversation({endpoint,locale='fa',fromAdmin=false}:{endpoint:string;locale?:Locale;fromAdmin?:boolean}){
 const fa=locale==='fa';
 const [history,setHistory]=useState<SupportHistory|null>(null),[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loadingOlder,setLoadingOlder]=useState(false),[atBottom,setAtBottom]=useState(true);
 const pending=useRef<{body:string;clientId:string}|null>(null),inFlight=useRef(false),mounted=useRef(true),list=useRef<HTMLDivElement>(null),stickToBottom=useRef(true),readSequence=useRef(0);
 const refresh=useCallback(async()=>{
  if(inFlight.current)return;inFlight.current=true;
  try{
   const next=await supportRequest<SupportHistory>(endpoint);if(!mounted.current)return;
   setHistory(old=>{
    // After a long absence there can be more than one page of new messages.
    // Reset to the latest page so earlier pages remain reachable without gaps.
    if(old?.messages.length&&next.messages.length&&next.messages[0].sequence>old.messages.at(-1)!.sequence+1)return next;
    return {...next,messages:mergeMessages(old?.messages??[],next.messages),hasOlder:old?.messages.length&&old.messages[0].sequence<(next.messages[0]?.sequence??Infinity)?old.hasOlder:next.hasOlder};
   });setError('');
  }catch(e){if(mounted.current){const code=(e as Error).message;if(code==='UNAUTHORIZED'||code==='FORBIDDEN')setHistory(null);setError(code);}}
  finally{inFlight.current=false;}
 },[endpoint]);
 useEffect(()=>{
  mounted.current=true;void refresh();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},6000);
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};document.addEventListener('visibilitychange',visible);
  return ()=>{mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[refresh]);
 const last=history?.messages.at(-1)?.sequence??0;
 useEffect(()=>{if(stickToBottom.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[last]);
 useEffect(()=>{
  if(!last||error||!atBottom||document.visibilityState!=='visible'||last<=readSequence.current)return;
  let cancelled=false;
  void supportRequest(endpoint,{action:'read',throughSequence:last}).then(()=>{if(!cancelled)readSequence.current=Math.max(readSequence.current,last);}).catch(()=>{});
  return ()=>{cancelled=true;};
 },[endpoint,last,error,history,atBottom]);
 async function older(){
  if(!history?.messages.length||loadingOlder)return;setLoadingOlder(true);
  const el=list.current,oldHeight=el?.scrollHeight??0,oldTop=el?.scrollTop??0;
  try{const next=await supportRequest<SupportHistory>(`${endpoint}?before=${history.messages[0].sequence}`);if(!mounted.current)return;stickToBottom.current=false;setHistory(old=>old?{...old,messages:mergeMessages(old.messages,next.messages),hasOlder:next.hasOlder}:old);requestAnimationFrame(()=>{if(el)el.scrollTop=oldTop+el.scrollHeight-oldHeight;});}
  catch(e){if(mounted.current)setError((e as Error).message);}finally{if(mounted.current)setLoadingOlder(false);}
 }
 async function send(e:FormEvent){
  e.preventDefault();const body=draft.trim();if(!body||busy)return;setBusy(true);setError('');
  if(pending.current?.body!==body)pending.current={body,clientId:crypto.randomUUID()};
  try{await supportRequest(endpoint,{action:'send',...pending.current});if(!mounted.current)return;pending.current=null;setDraft('');stickToBottom.current=true;await refresh();}
  catch(e){if(mounted.current)setError((e as Error).message);}finally{if(mounted.current)setBusy(false);}
 }
 const unauthorized=error==='UNAUTHORIZED'||error==='FORBIDDEN';
 const errorText=error==='RATE_LIMIT'?(fa?'تعداد پیام‌ها زیاد است؛ کمی بعد تلاش کنید.':'Too many messages. Please wait a moment.'):
  unauthorized?(fa?'نشست یا دسترسی شما معتبر نیست؛ دوباره وارد شوید.':'Please sign in again to continue.'):
  fa?'ارتباط برقرار نشد. متن پیام شما حفظ شده؛ دوباره تلاش کنید.':'Connection failed. Your message is kept here; please retry.';
 return <section className="min-w-0 rounded-3xl border border-roya-line bg-white p-5 shadow-card md:p-7" aria-label={fa?'گفتگو با پشتیبانی':'Support conversation'}>
  <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{fa?'گفتگو با پشتیبانی':'Support conversation'}</h2><p className="mt-2 text-xs leading-6 text-roya-muted">{fa?'پاسخ‌ها و پیام‌های جدید به‌صورت خودکار دریافت می‌شوند.':'New messages and replies refresh automatically.'}</p></div><Button variant="ghost" onClick={()=>void refresh()}>{fa?'تازه‌سازی':'Refresh'}</Button></div>
  {error&&<div role="alert" className="mt-4 rounded-xl bg-roya-cream p-3 text-sm leading-7">{errorText}{unauthorized&&<Link className="ms-2 underline" href={fromAdmin?'/admin/login/':`/${locale}/account/`}>{fa?'ورود':'Sign in'}</Link>}</div>}
   <div ref={list} onScroll={()=>{const el=list.current;if(el){stickToBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;setAtBottom(stickToBottom.current);}}} role="log" aria-label={fa?'پیام‌ها':'Messages'} aria-live="polite" aria-relevant="additions" tabIndex={0} className="mt-5 flex h-[min(55vh,480px)] min-h-64 flex-col gap-4 overflow-y-auto rounded-2xl bg-roya-cream/50 p-4">
   {history?.hasOlder&&<Button variant="ghost" disabled={loadingOlder} onClick={older}>{fa?'پیام‌های قدیمی‌تر':'Earlier messages'}</Button>}
   {!history&&!error&&<p role="status" className="text-sm text-roya-muted">{fa?'در حال دریافت گفتگو…':'Loading conversation…'}</p>}
   {history&&!history.messages.length&&<p className="my-auto text-center text-sm leading-8 text-roya-muted">{fa?'سوالتان را بنویسید؛ پشتیبانی در همین گفتگو پاسخ می‌دهد.':'Write your question. Support will reply in this conversation.'}</p>}
   {history?.messages.map(m=>{const own=m.fromAdmin===fromAdmin;return <article key={m.id} className={`max-w-[90%] rounded-2xl px-4 py-3 ${own?'self-end bg-roya-green text-white':'self-start border border-roya-line bg-white'}`}><p className="mb-2 text-xs opacity-75">{m.fromAdmin?(fa?'پشتیبانی رویا':'Roya support'):(fa?'مشتری':'Customer')}</p><p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{m.body}</p><p className="mt-2 text-[11px] opacity-75"><time dateTime={m.createdAt}>{new Intl.DateTimeFormat(fa?'fa-IR':'en-GB',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(m.createdAt))}</time>{own&&m.sequence<=(history.otherReadSequence??0)?(fa?' · خوانده شد':' · Read'):''}</p></article>;})}
  </div>
  <form onSubmit={send} className="mt-5 grid gap-3"><label className="grid gap-2 text-sm">{fa?'پیام شما':'Your message'}<textarea value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy||unauthorized} maxLength={2000} rows={3} required className="w-full resize-y rounded-xl border border-roya-line p-3 text-sm leading-7"/></label><div className="flex items-center justify-between gap-3"><span className="text-xs text-roya-muted">{draft.length} / 2000</span><Button disabled={busy||!draft.trim()||unauthorized||!history}>{busy?(fa?'در حال ارسال…':'Sending…'):(fa?'ارسال پیام':'Send message')}</Button></div></form>
 </section>;
}
