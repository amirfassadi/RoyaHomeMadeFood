import {CommunicationsPanel} from '@/components/admin/communications-panel';
import {getCommunications} from '@/lib/server/communications';
import {isDemoCatalog} from '@/lib/server/catalog';
export default async function Page(){return <CommunicationsPanel initial={await getCommunications()} isDemo={isDemoCatalog()}/>;}
