import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json} from '@/lib/server/shop-http';
import {confirmTransfer,confirmTransferSchema} from '@/lib/server/manual-payment';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const {user,body}=await adminBody(request,confirmTransferSchema);
 await confirmTransfer(body,user.id);
 return json({ok:true});
}catch(e){return adminFailure(e);}}
