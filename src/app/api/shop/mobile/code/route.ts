import {smsEnabled} from '@/lib/server/sms-policy';
import {checkoutCodeSchema} from '@/lib/validation/checkout-mobile';
import {requestCheckoutCode,checkoutMobileEnabled} from '@/lib/server/checkout-mobile';
import {readShopBody,json,failure} from '@/lib/server/shop-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{const required=await smsEnabled();return json({enabled:required&&checkoutMobileEnabled(),required});}catch(e){return failure(e);}}
export async function POST(request:Request){try{const input=await readShopBody(request,checkoutCodeSchema,'checkout-mobile-code',1024);return json(await requestCheckoutCode(input.mobile));}catch(e){return failure(e);}}
