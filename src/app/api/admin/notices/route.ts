import {z} from 'zod';
import {releaseHeldNotice} from '@/lib/server/customer-messages';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json} from '@/lib/server/shop-http';
const schema=z.object({id:z.string().min(1).max(100),expectedUpdatedAt:z.iso.datetime()}).strict();
export const runtime='nodejs';
export async function POST(request:Request){try{const {user,body}=await adminBody(request,schema,'communications');await releaseHeldNotice(body.id,body.expectedUpdatedAt,user.id);return json({queued:true});}catch(e){return adminFailure(e);}}
