import {requireAdmin} from '@/lib/server/auth';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {createAdminSchema,updateAdminSchema} from '@/lib/validation/admin-users';
import {listAdminUsers,createAdminUser,updateAdminUser} from '@/lib/server/admin-users';
import {json} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function GET(){try{await requireAdmin('admins');return json({admins:await listAdminUsers()});}catch(e){return adminFailure(e);}}
export async function POST(request:Request){try{const {user,body}=await adminBody(request,createAdminSchema,'admins');return json({admin:await createAdminUser(user.id,user.sessionVersion,body)},201);}catch(e){return adminFailure(e);}}
export async function PATCH(request:Request){try{const {user,body}=await adminBody(request,updateAdminSchema,'admins');return json({admin:await updateAdminUser(user.id,user.sessionVersion,body)});}catch(e){return adminFailure(e);}}
