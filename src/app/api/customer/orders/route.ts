import {optionalCustomer} from '@/lib/server/customer-session';
import {customerOrderHistory,customerOrderTracking} from '@/lib/server/customer-account';
import {customerOrdersQuerySchema} from '@/lib/customer/validation';
import {consumeRateLimit} from '@/lib/server/rate-limit';
import {json,failure,ShopError} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function GET(request:Request){try{const user=await optionalCustomer();if(!user)throw new ShopError('UNAUTHORIZED',401);if(!await consumeRateLimit(`customer-orders:${user.id}`,60,60))throw new ShopError('RATE_LIMIT',429);const parsed=customerOrdersQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)throw new ShopError('INVALID');return json(parsed.data.trackingCode?await customerOrderTracking(user.id,parsed.data.trackingCode):await customerOrderHistory(user.id,parsed.data.page));}catch(e){return failure(e);}}
