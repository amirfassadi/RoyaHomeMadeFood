import {campaignWorkspace,manageCampaign} from '@/lib/server/customer-messages';
import {campaignActionSchema} from '@/lib/validation/customer-messages';
import {requireAdmin} from '@/lib/server/auth';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function GET(){try{await requireAdmin('communications');return json(await campaignWorkspace());}catch(e){return adminFailure(e);}}
export async function POST(request:Request){try{const {user,body}=await adminBody(request,campaignActionSchema,'communications');return json(await manageCampaign(body,user.id));}catch(e){return adminFailure(e);}}
