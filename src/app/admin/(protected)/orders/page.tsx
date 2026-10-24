import {PrototypeOrders} from '@/components/admin/prototype-orders';
import {isDemoCatalog} from '@/lib/server/catalog';
import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoAdmin} from '@/lib/server/admin-mode';
export default async function Page(){const data=await getAdminData('orders');return <>{isDemoCatalog()&&!isDemoAdmin()&&<PrototypeOrders/>}<AdminWorkspace section="orders" initial={data} isDemo={isDemoAdmin()}/></>;}
