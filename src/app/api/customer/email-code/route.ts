import {resendEmailSchema} from '@/lib/customer/validation';
import {requestCustomerEmailCode} from '@/lib/server/customer-otp';
import {readShopBody,json,failure} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{return json(await requestCustomerEmailCode(await readShopBody(request,resendEmailSchema,'customer-email-code',2048)));}catch(e){return failure(e);}}
