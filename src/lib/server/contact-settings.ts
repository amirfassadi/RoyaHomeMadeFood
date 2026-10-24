import 'server-only';
import {unstable_cache} from 'next/cache';
import {connection} from 'next/server';
import {privateDatabaseCatalogEnabled} from '@/lib/storefront-mode';
import {getDb} from './db';
import {contactSettingsSchema, type ContactSettings} from '@/lib/validation/contact';
import {isDemoCatalog} from './catalog';
const readContactSettings = unstable_cache(async (): Promise<ContactSettings> => {
  const setting = await getDb().setting.findUnique({where: {key: 'contact'}});
  const parsed = contactSettingsSchema.safeParse(setting?.value ?? {});
  return parsed.success ? parsed.data : {};
}, ['roya-contact-settings'], {revalidate: 60, tags: ['settings']});
export async function getContactSettings() {
  if(privateDatabaseCatalogEnabled()){
    await connection();
    if(!process.env.DATABASE_URL)throw new Error('PRIVATE_CONTACT_UNAVAILABLE');
  }else if(isDemoCatalog() || !process.env.DATABASE_URL) return {} as ContactSettings;
  return readContactSettings();
}
