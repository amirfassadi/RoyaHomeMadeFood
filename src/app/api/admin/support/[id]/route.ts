import {requireAdmin} from '@/lib/server/auth';
import {supportHistory,supportCustomerContext,supportAction} from '@/lib/server/support';
import {supportActionSchema,supportQuerySchema} from '@/lib/support';
import {json,failure,ShopError,readShopBody} from '@/lib/server/shop-http';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){try{
 await requireAdmin('support');const {id}=await params;
 const query=supportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!query.success)throw new ShopError('INVALID');
 const [history,context]=await Promise.all([supportHistory(id,true,query.data.before),supportCustomerContext(id)]);
 return json({...history,context});
}catch(e){return failure(e);}}
export async function POST(request:Request,{params}:Context){try{
 const user=await requireAdmin('support'),{id}=await params;
 const body=await readShopBody(request,supportActionSchema,'admin-support',12288);
 return json(await supportAction({id:user.id,sessionVersion:user.sessionVersion,fromAdmin:true},body,id));
}catch(e){return failure(e);}}
