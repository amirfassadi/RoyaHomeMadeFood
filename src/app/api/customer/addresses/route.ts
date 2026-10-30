import {optionalCustomer} from '@/lib/server/customer-session';
import {customerAddresses,saveCustomerAddress,deleteCustomerAddress} from '@/lib/server/customer-addresses';
import {addressSchema,deleteAddressSchema} from '@/lib/customer/validation';
import {readShopBody,json,failure,ShopError} from '@/lib/server/shop-http';
export const runtime='nodejs';
export async function GET(){try{const user=await optionalCustomer();if(!user)throw new ShopError('UNAUTHORIZED',401);return json({addresses:await customerAddresses(user.id)});}catch(e){return failure(e);}}
export async function POST(request:Request){try{const user=await optionalCustomer();if(!user)throw new ShopError('UNAUTHORIZED',401);await saveCustomerAddress(user.id,await readShopBody(request,addressSchema,'customer-address',4096));return json({addresses:await customerAddresses(user.id)});}catch(e){return failure(e);}}
export async function DELETE(request:Request){try{const user=await optionalCustomer();if(!user)throw new ShopError('UNAUTHORIZED',401);await deleteCustomerAddress(user.id,await readShopBody(request,deleteAddressSchema,'customer-address-delete',1024));return json({addresses:await customerAddresses(user.id)});}catch(e){return failure(e);}}
