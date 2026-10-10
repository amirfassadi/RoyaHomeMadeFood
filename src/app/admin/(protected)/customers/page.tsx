import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoCatalog} from '@/lib/server/catalog';
export default async function Page(){return <AdminWorkspace section="customers" initial={await getAdminData('customers')} isDemo={isDemoCatalog()}/>;}
