import {requireAdmin} from '@/lib/server/auth';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {emailSettingsView} from '@/lib/server/email';
import {saveEmailSettings,requestEmailTest,verifyEmailTest} from '@/lib/server/admin-email';
import {emailSettingsEditSchema,emailTestSchema,emailTestVerifySchema} from '@/lib/validation/email-settings';
import {json} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function GET(){try{await requireAdmin('admins');return json({settings:await emailSettingsView()});}catch(e){return adminFailure(e);}}
export async function POST(request:Request){try{const {user,body}=await adminBody(request,emailSettingsEditSchema,'admins');return json({settings:await saveEmailSettings(body,user.id)});}catch(e){return adminFailure(e);}}
export async function PUT(request:Request){try{const {user,body}=await adminBody(request,emailTestSchema,'admins');return json(await requestEmailTest(body,user.id));}catch(e){return adminFailure(e);}}
export async function PATCH(request:Request){try{const {user,body}=await adminBody(request,emailTestVerifySchema,'admins');return json({settings:await verifyEmailTest(body,user.id)});}catch(e){return adminFailure(e);}}
