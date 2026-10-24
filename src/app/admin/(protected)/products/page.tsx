import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoAdmin} from '@/lib/server/admin-mode';
export default async function Page(){return <AdminWorkspace section="products" initial={await getAdminData('products')} isDemo={isDemoAdmin()}/>;}
