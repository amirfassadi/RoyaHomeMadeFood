import Image from 'next/image';
import Link from 'next/link';
import {ArrowUpLeft, ArrowUpRight, ImageOff} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import type {Locale} from '@/i18n/routing';
import type {ProductView} from '@/lib/catalog/types';
import {formatNumber, formatToman} from '@/lib/format';
import {Badge} from '@/components/ui/badge';
export function ProductCard({product: p, isDemo}: {product: ProductView; isDemo: boolean}) {
  const locale = useLocale() as Locale, t = useTranslations('Catalog');
  const image = p.media.find(m => m.type === 'IMAGE'), Arrow = locale === 'fa' ? ArrowUpLeft : ArrowUpRight;
  const available = (p.stockQuantity == null || p.stockQuantity >= p.minOrderQuantity) && (p.dailyCapacity == null || p.dailyCapacity >= p.minOrderQuantity);
  return <article className="group overflow-hidden rounded-3xl border border-roya-line bg-white shadow-card"><Link href={`/${locale}/products/${p.slug}/`} className="block">
    <div className="relative aspect-[4/3] overflow-hidden bg-roya-leaf">{image ? <Image src={image.url} alt={locale === 'fa' ? image.altFa : image.altEn} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"/> : <div className="flex h-full flex-col items-center justify-center gap-2 text-roya-muted"><ImageOff size={30}/><span className="text-xs">{t('noImage')}</span></div>}
      <div className="absolute start-4 top-4 flex gap-2">{isDemo && <Badge tone="brown">{t('sample')}</Badge>}<Badge tone={available ? 'green' : 'neutral'}>{t(available ? 'available' : 'unavailable')}</Badge></div>
    </div><div className="p-5"><h2 className="text-lg font-bold">{locale === 'fa' ? p.nameFa : p.nameEn}</h2><p className="mt-2 text-xs text-roya-muted">{t('per', {quantity: formatNumber(p.priceBasisQuantity, locale), unit: t(p.unit)})}</p><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="font-bold text-roya-green-dark">{formatToman(p.priceToman, locale)}</span><span className="flex items-center gap-1 text-xs text-roya-brown">{t('view')}<Arrow size={15}/></span></div></div>
  </Link></article>;
}
