import {optionalCustomer} from '@/lib/server/customer-session';
import {customerSupportHistory,supportAction} from '@/lib/server/support';
import {supportActionSchema,supportQuerySchema} from '@/lib/support';
import {json,failure,ShopError,readShopBody} from '@/lib/server/shop-http';

export async function GET(request:Request){try{
 const user=await optionalCustomer();if(!user)throw new ShopError('UNAUTHORIZED',401);
 const query=supportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!query.success)throw new ShopError('INVALID');
 return json(await customerSupportHistory(user.id,query.data.before));
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const user=await optionalCustomer();if(!user)throw new ShopError('UNAUTHORIZED',401);
 const body=await readShopBody(request,supportActionSchema,'customer-support',12288);
 return json(await supportAction({id:user.id,sessionVersion:user.sessionVersion,fromAdmin:false},body));
}catch(e){return failure(e);}}
