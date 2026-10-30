import {redirect} from 'next/navigation';
import {requireAdmin} from '@/lib/server/auth';
import {isDemoCatalog} from '@/lib/server/catalog';
import {PasswordSettings} from '@/components/admin/password-settings';
import {ShopError} from '@/lib/server/shop-http';
export default async function Page(){const demo=isDemoCatalog();if(!demo){try{await requireAdmin();}catch(e){if(e instanceof ShopError&&e.status===401)redirect('/admin/login/');throw e;}}return <main className="mx-auto max-w-4xl p-6" dir="rtl"><h1 className="mb-5 text-2xl font-bold">تعیین رمز شخصی مدیر</h1><p className="mb-6 text-sm leading-8">رمز موقت را تغییر دهید؛ سپس با رمز شخصی وارد پنل شوید.</p><PasswordSettings isDemo={demo}/></main>;}
