import {PricingSettings} from '@/components/admin/pricing-settings';
import {PasswordSettings} from '@/components/admin/password-settings';
import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {getPricingPolicy} from '@/lib/server/pricing-settings';
import {connection} from 'next/server';
import {isDemoAdmin} from '@/lib/server/admin-mode';
export default async function Page(){await connection();return <><PricingSettings mode="store" initialPolicy={await getPricingPolicy()}/><AdminWorkspace section="settings" initial={await getAdminData('settings')} isDemo={isDemoAdmin()}/><div className="mt-7"><PasswordSettings isDemo={isDemoAdmin()}/></div></>;}
