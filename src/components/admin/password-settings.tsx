'use client';
import {useState} from 'react';
import {signOut} from 'next-auth/react';
import {Button} from '@/components/ui/button';
import {Field,Panel,Notice,mutate} from './shared';
export function PasswordSettings({isDemo}:{isDemo:boolean}){
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();if(isDemo)return;setError('');if(password!==confirm){setError('تکرار رمز یکسان نیست.');return;}setBusy(true);try{await mutate('security/password',{currentPassword:current,newPassword:password});setCurrent('');setPassword('');setConfirm('');await signOut({callbackUrl:'/admin/login/'});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Panel title="امنیت حساب مدیر"><p className="mb-5 text-sm leading-7 text-roya-muted">با تغییر رمز، نشست‌های فعلی مدیر باطل می‌شوند و باید دوباره وارد شوید.</p><Notice error={error}/><form onSubmit={submit}><fieldset className="grid gap-5 sm:grid-cols-3" disabled={busy||isDemo}><Field label="رمز فعلی" type="password" dir="ltr" autoComplete="current-password" required maxLength={128} value={current} onChange={e=>setCurrent(e.target.value)}/><Field label="رمز جدید (حداقل ۱۲ کاراکتر)" type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/><Field label="تکرار رمز جدید" type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></fieldset><Button className="mt-6" disabled={busy||isDemo}>تغییر رمز و خروج</Button></form></Panel>;
}
