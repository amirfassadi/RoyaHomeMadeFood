import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {rejectTransferSchema} from '@/lib/validation/transfer-report';
import {rejectTransfer} from '@/lib/server/manual-payment';
import {json} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{const {user,body}=await adminBody(request,rejectTransferSchema,'payments');await rejectTransfer(body,user.id);return json({ok:true});}catch(e){return adminFailure(e);}}
