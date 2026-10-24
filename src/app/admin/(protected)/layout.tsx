import {redirect} from 'next/navigation';
import {connection} from 'next/server';
import {isDemoCatalog} from '@/lib/server/catalog';
import {isDemoAdmin} from '@/lib/server/admin-mode';
import {requireAdmin} from '@/lib/server/auth';
import {ShopError} from '@/lib/server/shop-http';
import {AdminShell} from '@/components/admin/shell';
export default async function Layout({children}:{children:React.ReactNode}){
 const isDemo=isDemoAdmin();let name='نمایش نمونه';
 if(!isDemo){await connection();try{name=(await requireAdmin()).name;}catch(e){if(e instanceof ShopError && e.status===401)redirect('/admin/login/');throw e;}}
 return <AdminShell isDemo={isDemo} name={name}>{!isDemo&&isDemoCatalog()&&<p className="mb-6 rounded-xl bg-roya-leaf p-4 text-sm leading-7">فروشگاه از محصولات نمونه استفاده می‌کند؛ مدیریت و تنظیمات قیمت‌گذاری به دیتابیس واقعی متصل‌اند.</p>}{children}</AdminShell>;
}
