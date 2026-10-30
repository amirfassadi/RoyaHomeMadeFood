import {connection} from 'next/server';
import {SupportPanel} from '@/components/admin/support-panel';
import {requireAdmin} from '@/lib/server/auth';
import {isDemoCatalog} from '@/lib/server/catalog';
export default async function Page(){const demo=isDemoCatalog();if(!demo){await connection();await requireAdmin('support');}return <SupportPanel isDemo={demo}/>;}
