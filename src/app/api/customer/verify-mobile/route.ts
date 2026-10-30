import {verifyCodeSchema} from '@/lib/customer/validation';
import {verifyCustomerMobile} from '@/lib/server/customer-otp';
import {readShopBody,json,failure} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{return json(await verifyCustomerMobile(await readShopBody(request,verifyCodeSchema,'customer-verify-mobile',2048)));}catch(e){return failure(e);}}
