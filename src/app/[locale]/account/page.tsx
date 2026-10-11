import {connection} from 'next/server';
import {setRequestLocale} from 'next-intl/server';
import type {Locale} from '@/i18n/routing';
import {PageShell,PageHeading} from '@/components/store/page-shell';
import {CustomerAccountForm} from '@/components/store/customer-account';
import {pageMetadata} from '@/lib/seo/core';
import {isDemoCatalog} from '@/lib/server/catalog';
import {optionalCustomer} from '@/lib/server/customer-session';
import {customerLoginEnabled} from '@/lib/server/customer-otp';
import {getDb} from '@/lib/server/db';
import type {CustomerAccount} from '@/lib/customer/types';
export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'/account',locale==='fa'?'باشگاه مشتریان':'Customer club',undefined,true);}
export default async function Page({params}:{params:Promise<{locale:Locale}>}){
 const {locale}=await params;setRequestLocale(locale);let account:CustomerAccount|null=null;
 if(!isDemoCatalog()){
  await connection();const user=await optionalCustomer();
  if(user){const now=new Date(),db=getDb();const [orders,discounts,announcements]=await Promise.all([
   db.order.findMany({where:{userId:user.id},select:{trackingCode:true,status:true,totalToman:true,createdAt:true},orderBy:{createdAt:'desc'},take:20}),
   db.discountCode.findMany({where:{active:true,showInCustomerClub:true,AND:[{OR:[{startsAt:null},{startsAt:{lte:now}}]},{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}]},select:{code:true,type:true,value:true,minSubtotalToman:true,maxDiscountToman:true,expiresAt:true,usageLimit:true,usedCount:true},take:50,orderBy:{createdAt:'desc'}}),
   db.clubAnnouncement.findMany({where:{active:true,AND:[{OR:[{startsAt:null},{startsAt:{lte:now}}]},{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}]},select:{id:true,titleFa:true,titleEn:true,bodyFa:true,bodyEn:true,createdAt:true},orderBy:{createdAt:'desc'},take:10})
  ]);account={name:user.name,mobile:user.mobile,marketingSms:user.marketingSms,announcements:announcements.map(a=>({...a,createdAt:a.createdAt.toISOString()})),orders:orders.map(o=>({...o,createdAt:o.createdAt.toISOString()})),offers:discounts.filter(d=>d.usageLimit===null||d.usedCount<d.usageLimit).map(({usageLimit,usedCount,...d})=>({...d,expiresAt:d.expiresAt?.toISOString()??null}))};}
 }
 return <PageShell><section className="section-shell py-12 md:py-16"><PageHeading title={locale==='fa'?'باشگاه مشتریان رویا':'Roya customer club'} description={locale==='fa'?'عضویت اختیاری، خرید راحت، ارتباط به انتخاب شما':'Optional membership, easy shopping, updates on your terms'}/><CustomerAccountForm locale={locale} enabled={customerLoginEnabled()} account={account}/></section></PageShell>;
}
