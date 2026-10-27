import {AdminLogin} from '@/components/admin/login-form';
import {isDemoAdmin} from '@/lib/server/admin-mode';
export default function Page(){return <AdminLogin isDemo={isDemoAdmin()}/>;}
