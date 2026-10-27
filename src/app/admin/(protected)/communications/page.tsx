import {CommunicationsPanel} from '@/components/admin/communications-panel';
import {getCommunications} from '@/lib/server/communications';
import {isDemoAdmin} from '@/lib/server/admin-mode';
export default async function Page(){return <CommunicationsPanel initial={await getCommunications()} isDemo={isDemoAdmin()}/>;}
