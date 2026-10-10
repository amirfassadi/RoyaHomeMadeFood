import {AdminLogin} from '@/components/admin/login-form';
import {isDemoCatalog} from '@/lib/server/catalog';
export default function Page(){return <AdminLogin isDemo={isDemoCatalog()}/>;}
