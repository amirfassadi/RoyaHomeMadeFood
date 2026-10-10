import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoCatalog} from '@/lib/server/catalog';
export default async function Page(){return <AdminWorkspace section="orders" initial={await getAdminData('orders')} isDemo={isDemoCatalog()}/>;}
