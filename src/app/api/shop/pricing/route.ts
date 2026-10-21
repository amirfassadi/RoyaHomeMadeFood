import {withBackendTrust} from '@/lib/server/api-guard';
import {getPricingPolicy} from '@/lib/server/pricing-settings';
import {failure,json} from '@/lib/server/shop-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handleGET(){
  try{return json({policy:await getPricingPolicy(),scope:'store',schemaVersion:1});}
  catch(error){return failure(error);}
}
export const GET=withBackendTrust(handleGET);
