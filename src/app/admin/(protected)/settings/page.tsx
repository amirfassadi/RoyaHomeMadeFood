import {PricingSettings} from '@/components/admin/pricing-settings';
import {PasswordSettings} from '@/components/admin/password-settings';
import {AdminWorkspace} from '@/components/admin/workspace';
import {getAdminData} from '@/lib/server/admin-data';
import {getPricingPolicy} from '@/lib/server/pricing-settings';
import {connection} from 'next/server';
import {isDemoAdmin} from '@/lib/server/admin-mode';
export default async function Page(){const isDemo=isDemoAdmin();if(!isDemo)await connection();return <><PricingSettings mode={isDemo?'local':'store'} initialPolicy={await getPricingPolicy()}/><AdminWorkspace section="settings" initial={await getAdminData('settings')} isDemo={isDemo}/><div className="mt-7"><PasswordSettings isDemo={isDemo}/></div></>;}
