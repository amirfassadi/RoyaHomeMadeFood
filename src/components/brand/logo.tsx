import {Leaf} from 'lucide-react';
import {useTranslations} from 'next-intl';
export function Logo({compact = false}: {compact?: boolean}) {
  const t = useTranslations('Brand');
  return <span className={`inline-flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
    <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-roya-green text-roya-cream"><Leaf size={25} strokeWidth={1.5}/></span>
    <span><span className="block text-lg font-bold leading-7">{compact ? t('short') : t('name')}</span>{!compact && <span className="block text-[9px] tracking-[0.14em] text-roya-muted" dir="ltr">ROYA FOOD PRODUCTS</span>}</span>
  </span>;
}
