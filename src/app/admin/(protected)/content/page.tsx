import {connection} from 'next/server';
import {ContentEditor} from '@/components/admin/content-editor';
import {getContentDocument} from '@/lib/server/storefront-content';
import {isDemoAdmin} from '@/lib/server/admin-mode';
import {requireAdmin} from '@/lib/server/auth';

export default async function Page(){
  const isDemo=isDemoAdmin();
  if(!isDemo){await connection();await requireAdmin();}
  return <ContentEditor initial={await getContentDocument()} isDemo={isDemo}/>;
}
