import {withBackendTrust} from '@/lib/server/api-guard';
import {getCatalog} from '@/lib/server/catalog';
import {privateDatabaseCatalogEnabled} from '@/lib/storefront-mode';
export const dynamic='force-dynamic';
async function handleGET(){
 try{
  if(!privateDatabaseCatalogEnabled())return Response.json({error:'STAGING_ONLY'},{status:503,headers:{'Cache-Control':'no-store'}});
  return Response.json({catalog:await getCatalog(),scope:'private-database'},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const GET=withBackendTrust(handleGET);
