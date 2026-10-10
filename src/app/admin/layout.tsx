import type {Metadata} from 'next';
import {setRequestLocale} from 'next-intl/server';
import {NextIntlClientProvider} from 'next-intl';
import messages from '../../../messages/fa.json';
import '../globals.css';
export const metadata:Metadata={title:'مدیریت | محصولات غذایی رویا',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){setRequestLocale('fa');return <html lang="fa" dir="rtl"><body><NextIntlClientProvider locale="fa" messages={messages} timeZone="Asia/Tehran">{children}</NextIntlClientProvider></body></html>;}
