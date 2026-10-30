import {smsEnabled} from '@/lib/server/sms-policy';
import {getZones} from '@/lib/server/delivery-zones';
import {customerAddresses} from '@/lib/server/customer-addresses';
import {connection} from 'next/server';
import {setRequestLocale} from 'next-intl/server';
import type {Locale} from '@/i18n/routing';
import {PageShell,PageHeading} from '@/components/store/page-shell';
import {CustomerAccountForm} from '@/components/store/customer-account';
import {pageMetadata} from '@/lib/server/seo';
import {isDemoCatalog} from '@/lib/server/catalog';
import {optionalCustomer} from '@/lib/server/customer-session';
import {customerLoginEnabled,customerRegistrationEnabled} from '@/lib/server/customer-otp';
import {getDb} from '@/lib/server/db';
import type {CustomerAccount} from '@/lib/customer/types';
export async function generateMetadata({params}:{params:Promise<{locale:Locale}>}){const {locale}=await params;return pageMetadata(locale,'/account',locale==='fa'?'باشگاه مشتریان':'Customer club',undefined,true);}
export default async function Page({params}:{params:Promise<{locale:Locale}>}){
 const {locale}=await params;setRequestLocale(locale);let account:CustomerAccount|null=null;
 if(!isDemoCatalog()){
  await connection();const user=await optionalCustomer();
  if(user){const now=new Date(),db=getDb();const [orders,discounts,announcements,totalOrders]=await Promise.all([
   db.order.findMany({where:{userId:user.id},select:{trackingCode:true,status:true,paymentStatus:true,totalToman:true,createdAt:true},orderBy:{createdAt:'desc'},take:20}),
   db.discountCode.findMany({where:{active:true,showInCustomerClub:true,AND:[{OR:[{startsAt:null},{startsAt:{lte:now}}]},{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}]},select:{code:true,type:true,value:true,minSubtotalToman:true,maxDiscountToman:true,expiresAt:true,usageLimit:true,usedCount:true},take:50,orderBy:{createdAt:'desc'}}),
   db.clubAnnouncement.findMany({where:{active:true,AND:[{OR:[{startsAt:null},{startsAt:{lte:now}}]},{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}]},select:{id:true,titleFa:true,titleEn:true,bodyFa:true,bodyEn:true,createdAt:true},orderBy:{createdAt:'desc'},take:10}),db.order.count({where:{userId:user.id}})
  ]);account={ordersTotalPages:Math.max(1,Math.ceil(totalOrders/20)),name:user.name,mobile:user.mobile,email:user.email!,addresses:await customerAddresses(user.id),marketingSms:user.marketingSms,announcements:announcements.map(a=>({...a,createdAt:a.createdAt.toISOString()})),orders:orders.map(o=>({...o,createdAt:o.createdAt.toISOString()})),offers:discounts.filter(d=>d.usageLimit===null||d.usedCount<d.usageLimit).map(({usageLimit,usedCount,...d})=>({...d,expiresAt:d.expiresAt?.toISOString()??null}))};}
 }
 return <PageShell><section className="section-shell py-12 md:py-16"><PageHeading title={locale==='fa'?'باشگاه مشتریان رویا':'Roya customer club'} description={locale==='fa'?'ثبت‌نام یک‌بار، سفارش‌ها و آدرس‌های شما در یک حساب':'One account for your orders and saved addresses'}/><CustomerAccountForm locale={locale} enabled={customerLoginEnabled()} registrationEnabled={(await customerRegistrationEnabled())&&await smsEnabled()} account={account} zones={await getZones()}/></section></PageShell>;
}
