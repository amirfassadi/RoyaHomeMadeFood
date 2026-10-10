import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoCatalog} from '@/lib/server/catalog';
export default async function Page(){return <AdminWorkspace section="settings" initial={await getAdminData('settings')} isDemo={isDemoCatalog()}/>;}
