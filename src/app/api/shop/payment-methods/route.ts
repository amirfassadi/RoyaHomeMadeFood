import {bankTransferDetails} from '@/lib/server/manual-payment';
import {gatewayConfiguration} from '@/lib/server/zarinpal';
import {json,failure,ShopError} from '@/lib/server/shop-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{
 let bankTransfer=false,zarinpal=false;
 try{await bankTransferDetails();bankTransfer=true;}catch(error){if(!(error instanceof ShopError)||error.code!=='BANK_TRANSFER_UNAVAILABLE')throw error;}
 try{gatewayConfiguration();zarinpal=true;}catch(error){if(!(error instanceof ShopError)||error.code!=='PAYMENT_UNAVAILABLE')throw error;}
 return json({BANK_TRANSFER:bankTransfer,ZARINPAL:zarinpal});
}catch(error){return failure(error);}}
