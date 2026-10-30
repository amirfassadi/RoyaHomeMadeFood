import {connection} from 'next/server';
import {requireAdmin} from '@/lib/server/auth';
import {isDemoCatalog} from '@/lib/server/catalog';
import {listAdminUsers} from '@/lib/server/admin-users';
import {AdminUsers} from '@/components/admin/admin-users';
export default async function Page(){const demo=isDemoCatalog();if(!demo){await connection();await requireAdmin('admins');}return <AdminUsers initial={demo?[]:await listAdminUsers()} isDemo={demo}/>;}
