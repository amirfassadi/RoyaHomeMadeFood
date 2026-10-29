'use client';
import {useState} from 'react';
import Image from 'next/image';
import {useLocale, useTranslations} from 'next-intl';
import {ImageOff, Play} from 'lucide-react';
import type {MediaView} from '@/lib/catalog/types';
import {formatNumber} from '@/lib/format';
import type {Locale} from '@/i18n/routing';
export function ProductGallery({media}: {media: MediaView[]}) {
  const [selected, setSelected] = useState(0), locale = useLocale() as Locale, t = useTranslations('Catalog');
  const current = media[selected];
  return <section aria-label={t('gallery')}><div className="relative aspect-square overflow-hidden rounded-[2rem] border border-roya-line bg-roya-leaf">
    {!current ? <div className="flex h-full flex-col items-center justify-center gap-3 text-roya-muted"><ImageOff size={40}/>{t('noImage')}</div> : current.type === 'IMAGE' ? <Image key={current.id} src={current.url} alt={locale === 'fa' ? current.altFa : current.altEn} fill preload={selected===0} sizes="(max-width: 768px) 100vw, 50vw" className="object-cover"/> : <video key={current.id} controls playsInline preload="none" className="h-full w-full object-contain" aria-label={locale === 'fa' ? current.altFa : current.altEn}><source src={current.url}/><a href={current.url}>{t('video')}</a></video>}
    </div>{media.length > 1 && <div className="mt-4 flex gap-3 overflow-x-auto pb-2">{media.map((m, i) => <button key={m.id} aria-label={m.type === 'VIDEO' ? t('video') : t('selectPhoto', {number: formatNumber(i + 1, locale)})} aria-pressed={selected === i} onClick={() => setSelected(i)} className={`relative size-20 shrink-0 overflow-hidden rounded-xl border-2 ${selected === i ? 'border-roya-green' : 'border-transparent'}`}>{m.type === 'IMAGE' ? <Image src={m.url} alt="" fill sizes="80px" className="object-cover"/> : <span className="flex h-full items-center justify-center bg-roya-leaf text-roya-green"><Play size={22}/></span>}</button>)}</div>}
  </section>;
}
