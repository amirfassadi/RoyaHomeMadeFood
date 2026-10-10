import Link from 'next/link';
import {getLocale, getTranslations} from 'next-intl/server';
import {Leaf, Phone, Mail} from 'lucide-react';
import {Logo} from '@/components/brand/logo';
import {getContactSettings} from '@/lib/server/contact-settings';
export async function StoreFooter() {
  const locale = await getLocale(), t = await getTranslations('Nav'), contact = await getContactSettings();
  return <footer className="border-t border-roya-line bg-[#F0EEE4] pt-12"><div className="section-shell grid gap-9 pb-10 md:grid-cols-[1.4fr_1fr_1fr]">
    <div><Logo/><p className="mt-5 max-w-xs text-sm leading-7 text-roya-muted">{t('footer')}</p><span className="mt-4 inline-flex items-center gap-2 text-roya-green"><Leaf size={18}/><span className="text-xs">{locale === 'fa' ? 'خانگی • تازه • ساده' : 'Homemade • Fresh • Simple'}</span></span></div>
    <div><h2 className="mb-4 text-sm font-bold">{t('footerLinks')}</h2><div className="grid gap-3 text-sm text-roya-muted">{(['catalog', 'about', 'faq', 'contact'] as const).map(key => <Link key={key} href={`/${locale}/${key}/`} className="hover:text-roya-green">{t(key)}</Link>)}</div></div>
    <div><h2 className="mb-4 text-sm font-bold">{t('contactTitle')}</h2>{!contact.phone && !contact.email && <p className="text-sm leading-7 text-roya-muted">{t('noContact')}</p>}{contact.phone && <a href={`tel:${contact.phone}`} className="mb-3 flex items-center gap-2 text-sm"><Phone size={16}/><bdi>{contact.phone}</bdi></a>}{contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm"><Mail size={16}/><bdi>{contact.email}</bdi></a>}</div>
  </div><div className="section-shell border-t border-roya-line py-5 text-xs text-roya-muted">{t('copyright')}</div></footer>;
}
