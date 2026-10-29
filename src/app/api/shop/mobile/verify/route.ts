import {checkoutVerifySchema} from '@/lib/validation/checkout-mobile';
import {verifyCheckoutCode} from '@/lib/server/checkout-mobile';
import {readShopBody,json,failure} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{const input=await readShopBody(request,checkoutVerifySchema,'checkout-mobile-verify',1024);return json(await verifyCheckoutCode(input.challengeId,input.code));}catch(e){return failure(e);}}
