import {adminBody,adminFailure} from '@/lib/server/admin-http';
import {json,ShopError} from '@/lib/server/shop-http';
import {productEditSchema} from '@/lib/validation/admin';
import {saveProduct} from '@/lib/server/admin-products';
import {revalidateTag} from 'next/cache';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
const {user,body}=await adminBody(request,productEditSchema,'products');const id=await saveProduct(body,user.id);revalidateTag('catalog',{expire:0});return json({id});
}catch(e){return adminFailure(e);}}
