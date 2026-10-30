import {connection} from 'next/server';
import {setRequestLocale} from 'next-intl/server';
import type {Locale} from '@/i18n/routing';
import {PageShell,PageHeading} from '@/components/store/page-shell';
import {CustomerAuthForm} from '@/components/store/customer-auth';
import {SupportConversation} from '@/components/support-conversation';
import {optionalCustomer} from '@/lib/server/customer-session';
import {customerLoginEnabled,customerRegistrationEnabled} from '@/lib/server/customer-otp';
import {smsEnabled} from '@/lib/server/sms-policy';
import {isDemoCatalog} from '@/lib/server/catalog';
import {pageMetadata} from '@/lib/server/seo';
export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'/support',locale==='fa'?'چت پشتیبانی':'Support chat',undefined,true);}
export default async function Page({params}:{params:Promise<{locale:Locale}>}){
 const {locale}=await params;setRequestLocale(locale);const fa=locale==='fa',demo=isDemoCatalog();
 if(!demo)await connection();const customer=await optionalCustomer();
 return <PageShell><section className="section-shell max-w-4xl py-12 md:py-16"><PageHeading title={fa?'پشتیبانی رویا':'Roya support'} description={fa?'برای پیگیری سفارش یا پرسیدن سوال، با پشتیبانی گفتگو کنید.':'Chat with support about your orders or questions.'}/>
 {demo?<p className="rounded-2xl bg-roya-leaf p-6 text-sm leading-8">{fa?'چت پشتیبانی در نسخه اصلی، پس از ورود به حساب در دسترس است.':'Support chat is available after sign-in on the live store.'}</p>:
 customer?<><p className="mb-5 text-sm leading-8 text-roya-muted">{fa?'پشتیبانی برای پاسخ‌گویی، مشخصات حساب و سوابق سفارش و پرداخت شما را می‌بیند.':'Support can see your account details and order and payment history to help you.'}</p><SupportConversation endpoint="/api/customer/support/" locale={locale}/></>:
 <div className="mx-auto max-w-xl"><p className="mb-5 text-sm leading-8">{fa?'برای شروع گفتگو ابتدا وارد حساب خود شوید.':'Sign in to start your support conversation.'}</p><CustomerAuthForm returnTo={`/${locale}/support/`} locale={locale} enabled={customerLoginEnabled()} registrationEnabled={(await customerRegistrationEnabled())&&await smsEnabled()}/></div>}
 </section></PageShell>;
}
