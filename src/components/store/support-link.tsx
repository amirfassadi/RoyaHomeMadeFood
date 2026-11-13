'use client';
import Link from 'next/link';
import {useLocale} from 'next-intl';
import {MessageCircle} from 'lucide-react';
export function SupportLink(){const locale=useLocale();return <Link href={`/${locale}/support/`} aria-label={locale==='fa'?'چت پشتیبانی':'Support chat'} className="support-link no-print fixed bottom-5 end-5 z-40 flex min-h-12 items-center gap-2 rounded-full bg-roya-green px-5 py-3 text-sm font-semibold text-white shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4"><MessageCircle size={21}/><span className="hidden sm:inline">{locale==='fa'?'چت پشتیبانی':'Support chat'}</span></Link>;}
