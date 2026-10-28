import {PricingSettings} from '@/components/admin/pricing-settings';
import {PasswordSettings} from '@/components/admin/password-settings';
import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {isDemoCatalog} from '@/lib/server/catalog';
export default async function Page(){return <><PricingSettings/><AdminWorkspace section="settings" initial={await getAdminData('settings')} isDemo={isDemoCatalog()}/><div className="mt-7"><PasswordSettings isDemo={isDemoCatalog()}/></div></>;}
