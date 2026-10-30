import {hasAdminPermission} from '@/lib/admin/permissions';
import {PricingSettings} from '@/components/admin/pricing-settings';
import {PasswordSettings} from '@/components/admin/password-settings';
import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoCatalog} from '@/lib/server/catalog';
export default async function Page(){const demo=isDemoCatalog(),data=await getAdminData('settings');return <>{(demo||data.access&&hasAdminPermission(data.access,'settings'))&&<PricingSettings/>}<AdminWorkspace section="settings" initial={data} isDemo={isDemoCatalog()}/><div className="mt-7"><PasswordSettings isDemo={isDemoCatalog()}/></div></>;}
