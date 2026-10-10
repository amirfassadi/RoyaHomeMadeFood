'use client';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
export default function ErrorPage({reset}: {reset: () => void}) {
  const t = useTranslations('Common');
  return <main className="section-shell py-20"><h1 className="mb-6 text-xl font-bold">{t('loadError')}</h1><Button onClick={reset}>{t('retry')}</Button></main>;
}
