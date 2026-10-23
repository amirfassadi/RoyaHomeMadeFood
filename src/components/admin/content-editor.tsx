'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {contentDocumentSchema,contentEditSchema,contentFields,type ContentDocument,type ContentLocale,type LocalizedContent} from '@/lib/storefront-content';
import {fieldClass,mutate,Notice,Panel} from './shared';

export function ContentEditor({initial,isDemo}:{initial:ContentDocument;isDemo:boolean}){
  const [draft,setDraft]=useState(initial.content),[version,setVersion]=useState(initial.updatedAt);
  const [locale,setLocale]=useState<ContentLocale>('fa'),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
  const [error,setError]=useState(''),[saved,setSaved]=useState(false),[needsReload,setNeedsReload]=useState(false);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  function update(key:keyof LocalizedContent,value:string){
    setDraft(previous=>({...previous,[locale]:{...previous[locale],[key]:value}}));
    setDirty(true);setSaved(false);setError('');
  }
  function adopt(value:unknown){
    const document=contentDocumentSchema.parse(value);
    setDraft(document.content);setVersion(document.updatedAt);setDirty(false);setNeedsReload(false);
  }
  async function save(event:React.FormEvent){
    event.preventDefault();if(busy||isDemo||!dirty||needsReload)return;setError('');setSaved(false);
    const parsed=contentEditSchema.safeParse({content:draft,expectedUpdatedAt:version});
    if(!parsed.success){setError('متن‌های فارسی و انگلیسی نباید خالی یا طولانی‌تر از حد مجاز باشند.');return;}
    setBusy(true);
    try{const result=await mutate('settings/content/',parsed.data);adopt(result.document);setSaved(true);}
    catch(error){setNeedsReload(true);setError(`${error instanceof Error?error.message:'ذخیره تأیید نشد.'} متن واردشده در فرم باقی است؛ پیش از تکرار، نسخهٔ سرور را بارگیری کنید.`);}
    finally{setBusy(false);}
  }
  async function reload(){
    setBusy(true);setError('');setSaved(false);
    try{
      const response=await fetch('/api/admin/settings/content/',{cache:'no-store'});
      if(!response.ok)throw new Error('نسخهٔ سرور دریافت نشد؛ نشست و اتصال را بررسی کنید.');
      const result=await response.json();adopt(result.document);
    }catch(error){setError(error instanceof Error?error.message:'اطلاعات دریافت نشد.');}
    finally{setBusy(false);}
  }
  const copy=draft[locale];
  return <div className="grid min-w-0 gap-6">
    <header><h1 className="text-2xl font-extrabold">متن‌های سایت</h1><p className="mt-3 text-sm leading-8 text-roya-muted">شعار، معرفی و داستان رویا را برای هر دو زبان ویرایش کنید. با ذخیره، متن‌ها در فروشگاه نمایش داده می‌شوند.</p></header>
    <Notice error={error} isDemo={isDemo}/>
    <div className="flex flex-wrap gap-3" aria-label="زبان متن‌ها">
      {(['fa','en'] as const).map(language=><Button key={language} type="button" variant={locale===language?'primary':'secondary'} aria-pressed={locale===language} disabled={busy} onClick={()=>setLocale(language)}>{language==='fa'?'فارسی':'English'}</Button>)}
    </div>
    {dirty&&<p role="status" className="rounded-xl bg-roya-leaf p-4 text-sm leading-7">تغییرات ذخیره‌نشده دارید. جابه‌جایی زبان، متن واردشده را نگه می‌دارد؛ پیش از رفتن به صفحهٔ دیگر ذخیره کنید.</p>}
    <form onSubmit={save} className="grid min-w-0 gap-6">
      <fieldset disabled={busy} className="grid min-w-0 gap-6">
        {([['home','صفحهٔ اصلی'],['about','دربارهٔ ما'],['footer','پایین صفحه']] as const).map(([group,title])=><Panel key={group} title={title}>
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            {contentFields.filter(field=>field.group===group).map(field=><label key={field.key} className={`grid min-w-0 grid-cols-1 gap-2 text-sm ${field.rows?'sm:col-span-2':''}`}>
              <span>{field.label}</span>
              {field.rows?<textarea className={fieldClass} dir={locale==='fa'?'rtl':'ltr'} lang={locale} required maxLength={field.max} rows={field.rows} value={copy[field.key]} onChange={event=>update(field.key,event.target.value)}/>:<input className={fieldClass} dir={locale==='fa'?'rtl':'ltr'} lang={locale} required maxLength={field.max} value={copy[field.key]} onChange={event=>update(field.key,event.target.value)}/>}
            </label>)}
          </div>
        </Panel>)}
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={busy||isDemo||!dirty||needsReload}>{busy?'در حال بررسی…':'ذخیرهٔ متن‌های هر دو زبان'}</Button>
        {!isDemo&&<Button type="button" variant="secondary" disabled={busy} onClick={reload}>بارگیری نسخهٔ سرور و کنارگذاشتن تغییرات</Button>}
      </div>
      {saved&&<p role="status" className="text-sm text-roya-green">متن‌های هر دو زبان ذخیره شدند.</p>}
    </form>
    <Panel title="پیش‌نمایش متن‌های همین فرم">
      <div lang={locale} dir={locale==='fa'?'rtl':'ltr'} className="grid min-w-0 gap-4 break-words">
        <p className="text-xs text-roya-brown">{copy.homeEyebrow}</p>
        <h2 className="whitespace-pre-line text-2xl font-bold">{copy.homeTitle1}<br/><span className="text-roya-green">{copy.homeTitle2}</span></h2>
        <p className="font-medium">{copy.slogan}</p><p className="whitespace-pre-line text-sm leading-8">{copy.homeIntro}</p>
        <h3 className="font-bold">{copy.homeAboutTitle}</h3><p className="whitespace-pre-line text-sm leading-8">{copy.homeAboutText}</p>
        <h3 className="font-bold">{copy.aboutTitle}</h3><p className="whitespace-pre-line text-sm leading-8">{copy.aboutIntro}</p>
        <h3 className="font-bold">{copy.aboutStoryTitle}</h3><p className="whitespace-pre-line text-sm leading-8">{copy.aboutStory}</p>
        <p className="whitespace-pre-line border-t border-roya-line pt-4 text-sm leading-7">{copy.footerText}</p>
      </div>
    </Panel>
    <div className="flex flex-wrap gap-5 text-sm text-roya-green"><Link href={`/${locale}/`}>مشاهدهٔ صفحهٔ اصلی</Link><Link href={`/${locale}/about/`}>مشاهدهٔ دربارهٔ ما</Link></div>
  </div>;
}
