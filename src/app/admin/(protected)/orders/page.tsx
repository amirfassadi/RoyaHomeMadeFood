import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoCatalog} from '@/lib/server/catalog';
export default async function Page({searchParams}:{searchParams:Promise<{review?:string}>}){const {review}=await searchParams;return <AdminWorkspace section="orders" initial={await getAdminData('orders',{review:review==='pending'?review:undefined})} isDemo={isDemoCatalog()}/>;}
