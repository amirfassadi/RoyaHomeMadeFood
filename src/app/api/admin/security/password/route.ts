import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {passwordChangeSchema} from '@/lib/validation/communications';
import {changeAdminPassword} from '@/lib/server/admin-security';
import {json} from '@/lib/server/shop-http';
export async function POST(request:Request){try{const {user,body}=await adminBody(request,passwordChangeSchema);await changeAdminPassword(user.id,body.currentPassword,body.newPassword,user.sessionVersion);return json({saved:true});}catch(e){return adminFailure(e);}}
