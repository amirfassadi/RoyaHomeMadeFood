import {z} from 'zod';
import {getAdminData} from '@/lib/server/admin-data';
import {requireAdmin} from '@/lib/server/auth';
import {json,ShopError} from '@/lib/server/shop-http';
import {adminFailure} from '@/lib/server/admin-http';
const schema=z.object({section:z.enum(['dashboard','products','orders','customers','settings','order','customer']),review:z.enum(['pending']).optional(),page:z.coerce.number().int().min(1).max(10000).default(1),q:z.string().max(100).optional(),status:z.string().max(20).optional(),id:z.string().max(100).optional(),mobile:z.string().regex(/^09\d{9}$/).optional()});
export const runtime='nodejs';
export async function GET(request:Request){try{await requireAdmin();const p=schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!p.success)throw new ShopError('INVALID');const {section,...options}=p.data;return json(await getAdminData(section,options));}catch(e){return adminFailure(e);}}
