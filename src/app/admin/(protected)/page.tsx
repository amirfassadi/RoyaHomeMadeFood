import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoCatalog} from '@/lib/server/catalog';
export default async function Page(){return <AdminWorkspace section="dashboard" initial={await getAdminData('dashboard')} isDemo={isDemoCatalog()}/>;}
