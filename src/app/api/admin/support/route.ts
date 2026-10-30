import {z} from 'zod';
import {requireAdmin} from '@/lib/server/auth';
import {supportInbox} from '@/lib/server/support';
import {json,failure,ShopError} from '@/lib/server/shop-http';
const querySchema=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),unread:z.enum(['0','1']).default('0')}).strict();
export async function GET(request:Request){try{
 await requireAdmin('support');
 const query=querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!query.success)throw new ShopError('INVALID');
 return json(await supportInbox(query.data.page,query.data.unread==='1'));
}catch(e){return failure(e);}}
