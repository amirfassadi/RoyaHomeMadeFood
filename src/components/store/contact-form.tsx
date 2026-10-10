'use client';
import {useState, type FormEvent} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {Send} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {contactSchema} from '@/lib/validation/contact';
export function ContactForm({disabledReason}: {disabledReason?: 'preview' | 'unavailable'}) {
  const locale = useLocale(), t = useTranslations('Contact');
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<'success' | 'error' | 'invalid' | 'rateLimit' | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy || disabledReason) return;
    const form = e.currentTarget, data = new FormData(form);
    const parsed = contactSchema.safeParse({name: data.get('name'), mobile: data.get('mobile'), message: data.get('message'), website: data.get('website') ?? '', locale});
    if (!parsed.success) {setStatus('invalid'); return;}
    setBusy(true); setStatus(null);
    try {
      const response = await fetch('/api/contact/', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(parsed.data)});
      if (response.ok) {setStatus('success'); form.reset();}
      else setStatus(response.status === 429 ? 'rateLimit' : response.status === 400 ? 'invalid' : 'error');
    } catch {setStatus('error');} finally {setBusy(false);}
  }
  const inputClass = 'mt-2 min-h-12 w-full rounded-xl border border-roya-line bg-roya-cream px-4 text-sm disabled:opacity-60';
  return <form onSubmit={submit} className="rounded-3xl border border-roya-line bg-white p-6 shadow-card md:p-8" aria-busy={busy}>
    <fieldset disabled={!!disabledReason || busy} className="grid gap-5">
      <div><label htmlFor="contact-name" className="text-sm font-semibold">{t('name')}</label><input id="contact-name" name="name" required minLength={2} maxLength={100} autoComplete="name" placeholder={t('namePlaceholder')} className={inputClass}/></div>
      <div><label htmlFor="contact-mobile" className="text-sm font-semibold">{t('mobile')}</label><input id="contact-mobile" name="mobile" type="tel" inputMode="tel" required maxLength={20} autoComplete="tel" placeholder={t('mobilePlaceholder')} className={inputClass} dir="ltr"/></div>
      <div><label htmlFor="contact-message" className="text-sm font-semibold">{t('message')}</label><textarea id="contact-message" name="message" required minLength={10} maxLength={3000} rows={6} placeholder={t('messagePlaceholder')} className={`${inputClass} py-3 leading-7`}/></div>
      <div className="hidden" aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off"/></div>
      <p id="contact-privacy" className="text-xs leading-6 text-roya-muted">{t('privacy')}</p><Button type="submit" aria-describedby="contact-privacy">{t(busy ? 'sending' : 'send')}<Send size={17}/></Button>
    </fieldset>
    {disabledReason && <p className="mt-4 text-sm leading-7 text-roya-brown">{t(disabledReason)}</p>}
    <p role="status" className={`mt-4 min-h-6 text-sm leading-7 ${status === 'success' ? 'text-roya-green-dark' : 'text-roya-brown'}`}>{status ? t(status) : ''}</p>
  </form>;
}
