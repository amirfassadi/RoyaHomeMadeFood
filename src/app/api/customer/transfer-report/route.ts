import {optionalCustomer} from '@/lib/server/customer-session';
import {reportCustomerTransfer} from '@/lib/server/transfer-report';
import {submitTransferReportSchema} from '@/lib/validation/transfer-report';
import {readShopBody,json,failure,ShopError} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function POST(request:Request){try{const user=await optionalCustomer();if(!user)throw new ShopError('UNAUTHORIZED',401);const input=await readShopBody(request,submitTransferReportSchema,'transfer-report',4096);return json(await reportCustomerTransfer(user,input));}catch(e){return failure(e);}}
