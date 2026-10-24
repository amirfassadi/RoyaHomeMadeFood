import {withBackendTrust} from '@/lib/server/api-guard';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {pricingPolicyEditSchema} from '@/lib/pricing';
import {savePricingPolicy} from '@/lib/server/pricing-settings';
import {json} from '@/lib/server/shop-http';
export const runtime='nodejs';
export const maxDuration=60;
async function handlePOST(request:Request){
  try{
    const {user,body}=await adminBody(request,pricingPolicyEditSchema);
    return json({policy:await savePricingPolicy(body,user.id),scope:'store',schemaVersion:1});
  }catch(error){return adminFailure(error);}
}
export const POST=withBackendTrust(handlePOST);
