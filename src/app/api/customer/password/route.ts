import {optionalCustomer} from '@/lib/server/customer-session';
import {changeCustomerPassword} from '@/lib/server/customer-account';
import {customerPasswordChangeSchema} from '@/lib/customer/validation';
import {readShopBody,json,failure,ShopError} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{const user=await optionalCustomer();if(!user)throw new ShopError('UNAUTHORIZED',401);const input=await readShopBody(request,customerPasswordChangeSchema,'customer-password-change',2048);await changeCustomerPassword(user.id,user.sessionVersion,input.currentPassword,input.newPassword);return json({saved:true});}catch(e){return failure(e);}}
