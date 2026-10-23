import {revalidateTag} from 'next/cache';
import {withBackendTrust} from '@/lib/server/api-guard';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {requireAdmin} from '@/lib/server/auth';
import {json} from '@/lib/server/shop-http';
import {contentEditSchema} from '@/lib/storefront-content';
import {CONTENT_CACHE_TAG,getContentDocument,saveContentDocument} from '@/lib/server/storefront-content';

export const runtime='nodejs';
export const maxDuration=60;
async function handleGET(){
  try{await requireAdmin();return json({document:await getContentDocument()});}
  catch(error){return adminFailure(error);}
}
async function handlePOST(request:Request){
  try{
    const {user,body}=await adminBody(request,contentEditSchema);
    const document=await saveContentDocument(body,user.id);
    revalidateTag(CONTENT_CACHE_TAG,{expire:0});
    return json({document});
  }catch(error){return adminFailure(error);}
}
export const GET=withBackendTrust(handleGET);
export const POST=withBackendTrust(handlePOST);
