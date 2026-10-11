import {z} from 'zod';
import {requireAdmin} from '@/lib/server/auth';
import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {communicationActionSchema} from '@/lib/validation/communications';
import {getCommunications,saveCommunication} from '@/lib/server/communications';
import {json,ShopError} from '@/lib/server/shop-http';
const query=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),filter:z.enum(['all','read','unread']).default('all')}).strict();
export async function GET(request:Request){try{await requireAdmin();const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)throw new ShopError('INVALID');return json(await getCommunications(parsed.data.page,parsed.data.filter));}catch(e){return adminFailure(e);}}
export async function POST(request:Request){try{const {user,body}=await adminBody(request,communicationActionSchema);await saveCommunication(body,user.id);return json({saved:true});}catch(e){return adminFailure(e);}}
