import {resendEmailSchema} from '@/lib/customer/validation';
import {registrationProgress} from '@/lib/server/customer-otp';
import {readShopBody,json,failure} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{const input=await readShopBody(request,resendEmailSchema,'customer-registration-progress',1024);return json(await registrationProgress(input.challengeId));}catch(e){return failure(e);}}
