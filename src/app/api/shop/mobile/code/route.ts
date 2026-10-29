import {checkoutCodeSchema} from '@/lib/validation/checkout-mobile';
import {requestCheckoutCode,checkoutMobileEnabled} from '@/lib/server/checkout-mobile';
import {readShopBody,json,failure} from '@/lib/server/shop-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){return json({enabled:checkoutMobileEnabled()});}
export async function POST(request:Request){try{const input=await readShopBody(request,checkoutCodeSchema,'checkout-mobile-code',1024);return json(await requestCheckoutCode(input.mobile));}catch(e){return failure(e);}}
