import {customerSignupSchema} from '@/lib/customer/validation';
import {registerCustomer} from '@/lib/server/customer-otp';
import {readShopBody,json,failure} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{return json(await registerCustomer(await readShopBody(request,customerSignupSchema,'customer-signup',2048)),201);}catch(e){return failure(e);}}
