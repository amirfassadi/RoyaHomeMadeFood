import {withBackendTrust} from '@/lib/server/api-guard';
import {requestCodeSchema} from '@/lib/customer/validation';
import {requestCustomerCode} from '@/lib/server/customer-otp';
import {readShopBody,json,failure} from '@/lib/server/shop-http';
export const runtime='nodejs';
async function handlePOST(request:Request){try{return json(await requestCustomerCode(await readShopBody(request,requestCodeSchema,'customer-code',2048)));}catch(e){return failure(e);}}

export const POST=withBackendTrust(handlePOST);
