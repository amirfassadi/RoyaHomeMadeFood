'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
export type MobileProof={challengeId:string;token:string;expiresAt:string};
export function CheckoutMobile({mobile,fa,onVerified}:{mobile:string;fa:boolean;onVerified:(proof:MobileProof|null)=>void}){
 const [enabled,setEnabled]=useState<boolean|null>(null),[challenge,setChallenge]=useState(''),[code,setCode]=useState(''),[wait,setWait]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[verified,setVerified]=useState(false);
 const controller=useRef<AbortController|null>(null);
 const [proofExpires,setProofExpires]=useState(0);
 useEffect(()=>{const c=new AbortController();controller.current=c;fetch('/api/shop/mobile/code/',{cache:'no-store',signal:c.signal}).then(r=>r.ok?r.json():null).then(d=>setEnabled(d?.enabled===true)).catch(()=>{});return()=>c.abort();},[]);
 useEffect(()=>{if(wait<=0)return;const timer=setTimeout(()=>setWait(n=>n-1),1000);return()=>clearTimeout(timer);},[wait]);
 useEffect(()=>{if(!proofExpires)return;const timer=setTimeout(()=>{setVerified(false);setChallenge('');setCode('');setProofExpires(0);onVerified(null);},Math.max(0,proofExpires-Date.now()));return()=>clearTimeout(timer);},[proofExpires,onVerified]);
 function message(code:string){return ({SMS_TEST_BUDGET:fa?'سقف ۵ تلاش ارسال آزمایشی تمام شده است.':'The five test-send attempts have been used.',SMS_TEST_RECIPIENT:fa?'در حالت تست، ارسال فقط برای شماره‌های مجاز فعال است.':'Test SMS is limited to approved numbers.',RATE_LIMIT:fa?'تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.':'Too many attempts. Please try later.',MOBILE_CODE_INVALID:fa?'کد نادرست یا منقضی شده است.':'Code invalid or expired.'} as Record<string,string>)[code]??(fa?'ارسال یا تأیید کد انجام نشد؛ بعداً دوباره امتحان کنید.':'SMS verification unavailable. Please try later.');}
 async function post(path:string,body:unknown){const r=await fetch(`/api/shop/mobile/${path}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.current?.signal});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
 async function send(){if(busy||wait>0)return;setBusy(true);setError('');setChallenge('');setCode('');try{const d=await post('code',{mobile});setChallenge(d.challengeId);setWait(d.resendAfter);}catch(e){if(!controller.current?.signal.aborted){setError(message((e as Error).message));setWait(60);}}finally{setBusy(false);}}
 async function verify(){if(busy)return;setBusy(true);setError('');try{const proof=await post('verify',{challengeId:challenge,code});if(!controller.current?.signal.aborted){setVerified(true);setProofExpires(Date.parse(proof.expiresAt));onVerified(proof);}}catch(e){if(!controller.current?.signal.aborted)setError(message((e as Error).message));}finally{setBusy(false);}}
 return <div data-checkout-mobile className="grid gap-3 rounded-xl border border-roya-line bg-roya-leaf p-4 text-sm">
 <p>{fa?'پیش از ثبت سفارش، شماره موبایل را تأیید کنید. این کار حساب کاربری ایجاد نمی‌کند.':'Verify this mobile before ordering. This does not create an account.'}</p>
 {verified?<p role="status">{fa?'شماره موبایل تأیید شد؛ این تأیید برای یک سفارش و تا ۳۰ دقیقه معتبر است.':'Mobile verified for one order within 30 minutes.'}</p>:<>
 {enabled===false&&<p role="status">{fa?'تأیید پیامکی فعلاً در دسترس نیست؛ ثبت سفارش تا اتصال سرویس پیامک انجام نمی‌شود.':'SMS verification is unavailable. Ordering requires an available verification service.'}</p>}
 <Button type="button" variant="secondary" disabled={!enabled||busy||wait>0} onClick={send}>{wait>0?(fa?`ارسال مجدد پس از ${wait} ثانیه`:`Resend in ${wait}s`):(fa?'دریافت کد تأیید':'Send verification code')}</Button>
 {challenge&&<><label className="grid gap-2">{fa?'کد شش‌رقمی (اعتبار ۵ دقیقه)':'6-digit code (valid for 5 minutes)'}<input className="rounded-xl border border-roya-line p-3" value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void verify();}}} dir="ltr" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6}/></label><Button type="button" disabled={busy||code.length!==6} onClick={verify}>{fa?'تأیید شماره':'Verify mobile'}</Button></>}
 </>}{error&&<p role="alert" className="text-roya-brown">{error}</p>}</div>;
}
